// Mirrors the Go structs in store.go / app.go. Kept hand-written (instead of
// the generated wailsjs/go/models classes) so plain objects can be used.

export interface SSHOptions {
  user?: string;
  port?: number;
  identityFile?: string;
  proxyJump?: string;
  serverAliveInterval?: number;
  serverAliveCountMax?: number;
  connectTimeout?: number;
  strictHostKeyChecking?: string;
  compression?: boolean;
  forwardAgent?: boolean;
  identitiesOnly?: boolean;
  localForwards?: string[];
  remoteForwards?: string[];
  dynamicForwards?: string[];
  options?: string[];
  extraArgs?: string;
}

export interface Profile {
  id: string;
  name: string;
  folderId?: string;
  host: string;
  color?: string;
  notes?: string;
  theme?: string;
  remoteCommand?: string;
  ssh: SSHOptions;
  createdAt: number;
  lastUsedAt?: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: number;
}

export type CursorStyle = 'block' | 'underline' | 'bar';

export interface ThemeColors {
  foreground: string;
  background: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground?: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface TerminalSettings {
  theme: string; // preset id or "custom"
  customTheme?: ThemeColors;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  boldFonts: boolean;
  boldIsBright: boolean;
  minimumContrastRatio: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  scrollback: number;
  padding: number;
  bell: 'visual' | 'none';
  copyOnSelect: boolean;
  ctrlCCopies: boolean;
  ctrlVPastes: boolean;
  rightClick: 'menu' | 'paste';
  gpu: boolean;
}

export type SortMode = 'name-asc' | 'name-desc' | 'host' | 'recent' | 'created';

export interface UISettings {
  sidebarWidth: number;
  sidebarHidden: boolean;
  sort: SortMode;
  collapsed: string[]; // collapsed folder ids
  showHost: boolean;
}

export interface Settings {
  sshPath?: string;
  confirmCloseActive: boolean;
  closeOnCleanExit: boolean;
  ssh: SSHOptions;
  terminal: TerminalSettings;
  ui: UISettings;
}

export interface AppData {
  version: number;
  settings: Settings;
  folders: Folder[];
  profiles: Profile[];
}

export interface EnvInfo {
  os: string;
  sshPath: string;
  detectedSshPath: string;
  sshVersion: string;
  dataPath: string;
  sshConfigPath: string;
}

export interface ConnectResult {
  sessionId: string;
  command: string;
  lastUsedAt: number;
}

export interface ImportResult {
  path: string;
  count: number;
  data: AppData;
}

export type TabStatus = 'connecting' | 'running' | 'exited' | 'error';

export interface Tab {
  id: string;
  title: string;
  profileId?: string;
  quickTarget?: string; // for unsaved quick-connect tabs
  color?: string;
  sessionId?: string;
  status: TabStatus;
  exitCode?: number;
  command?: string;
  remoteTitle?: string;
}
