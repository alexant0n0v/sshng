import type { AppData, Settings, TerminalSettings, UISettings } from './types';
import { DEFAULT_THEME } from './themes';

export const DEFAULT_TERMINAL: TerminalSettings = {
  theme: DEFAULT_THEME,
  fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace',
  fontSize: 14,
  lineHeight: 1.15,
  letterSpacing: 0,
  boldFonts: true,
  boldIsBright: true,
  minimumContrastRatio: 1,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  padding: 8,
  bell: 'visual',
  copyOnSelect: false,
  ctrlCCopies: true,
  ctrlVPastes: true,
  rightClick: 'menu',
  gpu: true,
};

export const DEFAULT_UI: UISettings = {
  sidebarWidth: 280,
  sidebarHidden: false,
  sort: 'name-asc',
  collapsed: [],
  showHost: true,
};

export const FONT_SUGGESTIONS = [
  'Cascadia Mono', 'Cascadia Code', 'Consolas', 'JetBrains Mono', 'Fira Code',
  'Source Code Pro', 'Hack', 'Lucida Console', 'Courier New',
];

/** Fills in any settings missing from older or hand-edited data files. */
export function normalizeData(d: AppData): AppData {
  const s = (d.settings ?? {}) as Partial<Settings>;
  return {
    ...d,
    folders: d.folders ?? [],
    profiles: (d.profiles ?? []).map((p) => ({ ...p, ssh: p.ssh ?? {} })),
    settings: {
      sshPath: s.sshPath ?? '',
      confirmCloseActive: s.confirmCloseActive ?? true,
      closeOnCleanExit: s.closeOnCleanExit ?? false,
      ssh: s.ssh ?? { port: 22 },
      terminal: { ...DEFAULT_TERMINAL, ...(s.terminal ?? {}) },
      ui: { ...DEFAULT_UI, ...(s.ui ?? {}) },
    },
  };
}

export const PROFILE_COLORS = [
  '', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#94a3b8',
];
