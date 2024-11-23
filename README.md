# Glancr 🔍

A terminal-based file preview and search tool inspired by Telescope.nvim, built with React Ink. Glancr provides fast file searching with fuzzy finding capabilities and syntax-highlighted previews right in your terminal.

## Features

- 🔎 Fuzzy file search powered by `fzf`
- 📄 Content search powered by `ripgrep`
- 📄 Syntax-highlighted file previews
- ⌨️ Keyboard navigation
- 🎨 Terminal UI built with React Ink
- 🚀 Fast and lightweight
- 📁 Respects `.gitignore`

## Prerequisites

- Node.js >= 18
- `fzf` installed on your system
- `ripgrep` installed on your system (for content search)
- Cursor editor (optional, for file opening functionality)

## Installation

Install globally

```bash
git clone https://github.com/yourusername/glancr.git
cd glancr
npm install
npm run build
npm link
```

### Keyboard Controls

- Type to search files
- `↑` / `↓` to navigate through results
- `Enter` to open selected file in Cursor editor
- `Ctrl+N` to switch to filename search mode
- `Ctrl+F` to switch to content search mode
- `Ctrl+C` to exit

## Development

```bash
npm install
npm run dev
```
