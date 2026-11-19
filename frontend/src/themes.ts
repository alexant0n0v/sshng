import type { ThemeColors } from './types';

export interface ThemePreset {
  id: string;
  name: string;
  colors: ThemeColors;
}

type Ansi = [string, string, string, string, string, string, string, string];

function make(
  fg: string, bg: string, cursor: string, selection: string,
  normal: Ansi, bright: Ansi, cursorAccent = bg, selectionFg?: string,
): ThemeColors {
  const [black, red, green, yellow, blue, magenta, cyan, white] = normal;
  const [brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite] = bright;
  return {
    foreground: fg, background: bg, cursor, cursorAccent, selectionBackground: selection, selectionForeground: selectionFg,
    black, red, green, yellow, blue, magenta, cyan, white,
    brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite,
  };
}

// Colour values follow the well-known public palettes of each scheme.
export const THEMES: ThemePreset[] = [
  {
    id: 'iterm-dark', name: 'Dark Background',
    colors: make('#c7c7c7', '#000000', '#c7c7c7', '#3a5a8c',
      ['#000000', '#c91b00', '#00c200', '#c7c400', '#2225c4', '#ca30c7', '#00c5c7', '#c7c7c7'],
      ['#686868', '#ff6e67', '#5ffa68', '#fffc67', '#6871ff', '#ff77ff', '#60fdff', '#ffffff'], '#000000', '#ffffff'),
  },
  {
    id: 'iterm-light', name: 'Light Background',
    colors: make('#000000', '#ffffff', '#000000', '#b5d5ff',
      ['#000000', '#c91b00', '#00c200', '#c7c400', '#2225c4', '#ca30c7', '#00c5c7', '#c7c7c7'],
      ['#686868', '#ff6e67', '#5ffa68', '#fffc67', '#6871ff', '#ff77ff', '#60fdff', '#ffffff'], '#ffffff', '#000000'),
  },
  {
    id: 'pastel', name: 'Pastel (Dark)',
    colors: make('#c7c7c7', '#000000', '#ffb473', '#454d96',
      ['#626262', '#ff8373', '#b4fb73', '#fffdc3', '#a5d5fe', '#ff90fe', '#d1d1fe', '#f1f1f1'],
      ['#8f8f8f', '#ffc4be', '#d6fcba', '#fffed5', '#c2e3ff', '#ffb2fe', '#e6e7fe', '#ffffff']),
  },
  {
    id: 'solarized-dark', name: 'Solarized Dark',
    colors: make('#839496', '#002b36', '#93a1a1', '#073642',
      ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'],
      ['#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'], '#002b36', '#93a1a1'),
  },
  {
    id: 'solarized-light', name: 'Solarized Light',
    colors: make('#657b83', '#fdf6e3', '#586e75', '#eee8d5',
      ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'],
      ['#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'], '#fdf6e3', '#586e75'),
  },
  {
    id: 'tango-dark', name: 'Tango Dark',
    colors: make('#d3d7cf', '#2e3436', '#d3d7cf', '#4a5559',
      ['#2e3436', '#cc0000', '#4e9a06', '#c4a000', '#3465a4', '#75507b', '#06989a', '#d3d7cf'],
      ['#555753', '#ef2929', '#8ae234', '#fce94f', '#729fcf', '#ad7fa8', '#34e2e2', '#eeeeec']),
  },
  {
    id: 'dracula', name: 'Dracula',
    colors: make('#f8f8f2', '#282a36', '#f8f8f2', '#44475a',
      ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2'],
      ['#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']),
  },
  {
    id: 'nord', name: 'Nord',
    colors: make('#d8dee9', '#2e3440', '#d8dee9', '#434c5e',
      ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0'],
      ['#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4']),
  },
  {
    id: 'one-dark', name: 'One Dark',
    colors: make('#abb2bf', '#282c34', '#528bff', '#3e4451',
      ['#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf'],
      ['#5c6370', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#ffffff']),
  },
  {
    id: 'gruvbox-dark', name: 'Gruvbox Dark',
    colors: make('#ebdbb2', '#282828', '#ebdbb2', '#504945',
      ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984'],
      ['#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2']),
  },
  {
    id: 'tomorrow-night', name: 'Tomorrow Night',
    colors: make('#c5c8c6', '#1d1f21', '#c5c8c6', '#373b41',
      ['#1d1f21', '#cc6666', '#b5bd68', '#f0c674', '#81a2be', '#b294bb', '#8abeb7', '#c5c8c6'],
      ['#969896', '#cc6666', '#b5bd68', '#f0c674', '#81a2be', '#b294bb', '#8abeb7', '#ffffff']),
  },
  {
    id: 'snazzy', name: 'Snazzy',
    colors: make('#eff0eb', '#282a36', '#97979b', '#3e4452',
      ['#282a36', '#ff5c57', '#5af78e', '#f3f99d', '#57c7ff', '#ff6ac1', '#9aedfe', '#f1f1f0'],
      ['#686868', '#ff5c57', '#5af78e', '#f3f99d', '#57c7ff', '#ff6ac1', '#9aedfe', '#eff0eb']),
  },
  {
    id: 'github-dark', name: 'GitHub Dark',
    colors: make('#c9d1d9', '#0d1117', '#c9d1d9', '#264f78',
      ['#484f58', '#ff7b72', '#3fb950', '#d29922', '#58a6ff', '#bc8cff', '#39c5cf', '#b1bac4'],
      ['#6e7681', '#ffa198', '#56d364', '#e3b341', '#79c0ff', '#d2a8ff', '#56d4dd', '#f0f6fc']),
  },
];

export const DEFAULT_THEME = 'iterm-dark';

export function resolveTheme(id: string | undefined, custom?: ThemeColors): ThemeColors {
  if (id === 'custom' && custom) return custom;
  return (THEMES.find((t) => t.id === id) ?? THEMES[0]).colors;
}

export const ANSI_KEYS: (keyof ThemeColors)[] = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
];
export const BRIGHT_KEYS: (keyof ThemeColors)[] = [
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
];
