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

// Add new prop type for search term
const FilePreview: FC<{ filePath: string; searchTerm?: string }> = ({
  filePath,
  searchTerm,
}) => {
  const [content, setContent] = useState<string>('');
  const [matchingLineIndex, setMatchingLineIndex] = useState<number | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;
    const lines: string[] = [];
    let firstMatchIndex: number | null = null;

    const readStream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
      input: readStream,
      crlfDelay: Infinity,
    });

    let lineNumber = 0;
    rl.on('line', (line) => {
      // If we have a search term and haven't found a match yet, check this line
      if (
        searchTerm &&
        firstMatchIndex === null &&
        line.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        firstMatchIndex = lineNumber;
      }

      // Always keep track of line number
      lineNumber++;

      // Only store lines around the match if we have one
      if (firstMatchIndex !== null) {
        const contextLines = 20;
        if (Math.abs(lineNumber - firstMatchIndex) <= contextLines) {
          lines.push(line);
        }
      } else if (lines.length < MAX_LINES) {
        // If no match yet, store up to MAX_LINES
        lines.push(line);
      }
    });

    rl.on('close', () => {
      if (!isMounted) return;

      const fileContent = lines.join('\n');
      try {
        let highlighted = highlight(fileContent, {
          language: path.extname(filePath).slice(1),
          theme: {
            keyword: chalk.blue,
            string: chalk.green,
            function: chalk.yellow,
          },
        });

        // If we have a search term, add additional highlighting
        if (searchTerm) {
          const searchRegex = new RegExp(searchTerm, 'gi');
          highlighted = highlighted.replace(searchRegex, (match) =>
            chalk.bgYellow(match),
          );
        }

        setContent(highlighted + (lines.length >= MAX_LINES ? '\n...' : ''));
        setMatchingLineIndex(firstMatchIndex);
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
  }, [filePath, searchTerm]);

  // Calculate visible content based on matching line
  const getVisibleContent = (
    fullContent: string,
    matchIndex: number | null,
  ): string => {
    if (matchIndex === null) return fullContent;

    const lines = fullContent.split('\n');
    const visibleLines = 40;

    // Ensure our line numbers are within bounds
    const safeMatchIndex = Math.min(matchIndex, lines.length - 1);

    // Calculate window around match
    const startLine = Math.max(
      0,
      safeMatchIndex - Math.floor(visibleLines / 2),
    );
    const endLine = Math.min(lines.length, startLine + visibleLines);

    const visibleContent = lines.slice(startLine, endLine).join('\n');

    // Only add ellipsis if we're actually truncating
    const prefix = startLine > 0 ? '...\n' : '';
    const suffix = endLine < lines.length ? '\n...' : '';

    return prefix + visibleContent + suffix;
  };

  return (
    <Box
      height={42}
      borderStyle="round"
      borderColor="gray"
      overflowY="hidden"
      flexDirection="column"
    >
      <Text>
        {matchingLineIndex !== null && (
          <Text dimColor>{`Match found on line ${
            matchingLineIndex + 1
          }\n`}</Text>
        )}
        {getVisibleContent(content, matchingLineIndex)}
      </Text>
    </Box>
  );
};

// Main app component
const App: FC = () => {
  const [query, setQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [matchingFiles, setMatchingFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchMode, setSearchMode] = useState<SearchMode>('content');
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

  const keybindingHint =
    searchMode === 'content'
      ? 'Ctrl+N for filename search'
      : 'Ctrl+F for content search';

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
          {selectedFile && (
            <FilePreview
              filePath={selectedFile}
              searchTerm={searchMode === 'content' ? query : undefined}
            />
          )}
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
              placeholder="Search file contents..."
            />
          </Box>
          <Text dimColor italic>
            {keybindingHint}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

render(<App />);
