import React, { FC, useState, useEffect } from 'react';
import { render, Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { spawn } from 'child_process';
import { glob } from 'glob';
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

  const handleInput = async (input: string) => {
    setQuery(input);

    // Spawn fzf process with file list
    const fzf = spawn('fzf', ['--filter', input]);

    // Get all files in current directory recursively
    const files = await glob('**/*', { nodir: true });

    // Pipe file list to fzf
    fzf.stdin.write(files.join('\n'));
    fzf.stdin.end();

    // Handle fzf output
    let output = '';
    fzf.stdout.on('data', (data) => {
      output += data;
    });

    fzf.on('close', () => {
      const matches = output.split('\n').filter(Boolean);
      if (matches.length > 0) {
        setSelectedFile(matches[0]);
      }
    });
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>Search files: </Text>
        <TextInput value={query} onChange={handleInput} />
      </Box>
      {selectedFile && <FilePreview filePath={selectedFile} />}
    </Box>
  );
};

render(<App />);
