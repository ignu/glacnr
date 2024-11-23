import { FC, useState, useEffect } from 'react';
import { render, Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { spawn } from 'child_process';
import { globby } from 'globby';
import path from 'path';
import chalk from 'chalk';
import { highlight } from 'cli-highlight';
import { createReadStream } from 'fs';
import readline from 'readline';

const MAX_LINES = 100;

// Add new type for search mode
type SearchMode = 'filename' | 'content';

const FilePreview: FC<{ filePath: string }> = ({ filePath }) => {
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const lines: string[] = [];

    const readStream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
      input: readStream,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      if (lines.length < MAX_LINES) {
        lines.push(line);
      } else {
        rl.close();
      }
    });

    rl.on('close', () => {
      if (!isMounted) return;

      const fileContent = lines.join('\n');
      try {
        const highlighted = highlight(fileContent, {
          language: path.extname(filePath).slice(1),
          theme: {
            keyword: chalk.blue,
            string: chalk.green,
            function: chalk.yellow,
          },
        });
        setContent(highlighted + (lines.length >= MAX_LINES ? '\n...' : ''));
      } catch (err) {
        console.log('❌ Error highlighting:', err);
        setContent(fileContent + (lines.length >= MAX_LINES ? '\n...' : ''));
      }
    });

    readStream.on('error', (err) => {
      if (!isMounted) return;
      console.log('❌ Error reading file:', err);
      setContent('Unable to read file');
    });

    return () => {
      isMounted = false;
      rl.close();
      readStream.destroy();
    };
  }, [filePath]);

  return (
    <Box
      height={42}
      borderStyle="round"
      borderColor="gray"
      overflowY="hidden"
      flexDirection="column"
    >
      <Text>{content}</Text>
    </Box>
  );
};

// Main app component
const App: FC = () => {
  const [query, setQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [matchingFiles, setMatchingFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchMode, setSearchMode] = useState<SearchMode>('filename');
  const [isFocused, setIsFocused] = useState(true);

  useInput((input, key) => {
    if (key.ctrl && input === 'n') {
      setSearchMode('filename');
      setQuery('');
      setMatchingFiles([]);
      setIsFocused(true);
    } else if (key.ctrl && input === 'f') {
      setSearchMode('content');
      setQuery('');
      setMatchingFiles([]);
      setIsFocused(true);
    } else if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(matchingFiles.length - 1, prev + 1));
    } else if (key.return && selectedFile) {
      const cursor = spawn('cursor', [selectedFile], {
        stdio: 'inherit',
        detached: true,
      });

      cursor.on('error', (err) => {
        console.log('❌ Error opening Cursor:', err);
      });

      cursor.unref(); // Detach the process so it doesn't block our app
    }
  });

  useEffect(() => {
    if (matchingFiles[selectedIndex]) {
      setSelectedFile(matchingFiles[selectedIndex]);
    }
  }, [selectedIndex, matchingFiles]);

  const handleInput = async (input: string) => {
    setQuery(input);

    if (searchMode === 'filename') {
      const fzf = spawn('fzf', ['--filter', input]);
      const files = await globby(['**/*'], {
        gitignore: true,
        ignore: ['.git/**'],
        dot: false,
      });

      fzf.stdin.write(files.join('\n'));
      fzf.stdin.end();

      let output = '';
      fzf.stdout.on('data', (data) => {
        output += data;
      });

      fzf.on('close', () => {
        const matches = output.split('\n').filter(Boolean);
        setMatchingFiles(matches);
        setSelectedIndex(0); // Reset selection when results change
        if (matches.length > 0) {
          setSelectedFile(matches[0]);
        }
      });
    } else {
      const rgArgs = ['--no-heading', '-g', '!.git', input || '.', '.'];

      const rg = spawn('rg', rgArgs);

      let output = '';
      rg.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
      });

      rg.stderr.on('data', (data) => {
        console.log('⚠️ rg stderr:', data.toString());
      });

      rg.on('close', (code) => {
        const matches = output
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [file] = line.split(':');
            return file;
          })
          .filter((file, index, self) => self.indexOf(file) === index); // Remove duplicates

        setMatchingFiles(matches);
        setSelectedIndex(0);
        if (matches.length > 0) {
          setSelectedFile(matches[0]);
        } else {
          setSelectedFile(null);
        }
      });

      rg.on('error', (error) => {
        console.log('❌ rg spawn error:', error);
      });
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="row" flexGrow={1} height="100%">
        <Box
          flexDirection="column"
          width="20%"
          borderStyle="single"
          borderColor="gray"
          height="100%"
        >
          <Box flexDirection="column" height="100%" overflowY="hidden">
            {matchingFiles.map((file, index) => (
              <Text
                key={file}
                color={index === selectedIndex ? 'blue' : undefined}
                bold={index === selectedIndex}
                wrap="truncate-end"
              >
                {file}
              </Text>
            ))}
          </Box>
        </Box>
        <Box
          flexDirection="column"
          width="80%"
          height="100%"
          overflowY="hidden"
          padding={1}
        >
          {selectedFile && <FilePreview filePath={selectedFile} />}
        </Box>
      </Box>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="blue"
        padding={1}
      >
        <Box flexDirection="column" gap={1}>
          <Box>
            <Text>
              {searchMode === 'filename'
                ? 'Search filenames: '
                : 'Search content: '}
            </Text>
            <TextInput
              value={query}
              onChange={handleInput}
              focus={isFocused}
              onSubmit={() => setIsFocused(false)}
            />
          </Box>
          <Text dimColor italic>
            Press Ctrl+N for filename search, Ctrl+F for content search
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

render(<App />);
