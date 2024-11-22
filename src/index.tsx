import React, { FC, useState, useEffect } from 'react';
import { render, Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { spawn } from 'child_process';
import { globby } from 'globby';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { highlight } from 'cli-highlight';

// Component for file preview
const FilePreview: FC<{ filePath: string }> = ({ filePath }) => {
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const highlighted = highlight(fileContent, {
        language: path.extname(filePath).slice(1),
        theme: {
          keyword: chalk.blue,
          string: chalk.green,
          function: chalk.yellow,
        },
      });
      setContent(highlighted);
    } catch (err) {
      setContent('Unable to read file');
    }
  }, [filePath]);

  return (
    <Box flexDirection="column" padding={1}>
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

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(matchingFiles.length - 1, prev + 1));
    }
  });

  useEffect(() => {
    if (matchingFiles[selectedIndex]) {
      setSelectedFile(matchingFiles[selectedIndex]);
    }
  }, [selectedIndex, matchingFiles]);

  const handleInput = async (input: string) => {
    setQuery(input);

    const fzf = spawn('fzf', ['--filter', input]);
    const files = await globby(['**/*'], {
      gitignore: true,
      ignore: ['.git/**'],
      dot: false,
    });

    console.log('🔍 Found files:', files.length);

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
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="row" flexGrow={1} height="100%">
        <Box
          flexDirection="column"
          width="30%"
          borderStyle="single"
          borderColor="gray"
          height="100%"
        >
          <Box flexDirection="column" height="100%" overflowY="visible">
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
          flexGrow={1}
          height="100%"
          overflowY="visible"
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
        <Box>
          <Text>Search files: </Text>
          <TextInput value={query} onChange={handleInput} />
        </Box>
      </Box>
    </Box>
  );
};

render(<App />);
