// Typed wrapper around the generated Wails bindings.
import * as Go from '../wailsjs/go/main/App';
import * as RT from '../wailsjs/runtime/runtime';
import type { AppData, ConnectResult, EnvInfo, ImportResult, Profile } from './types';

const any = (x: unknown) => x as any;

export const api = {
  getData: () => Go.GetData() as unknown as Promise<AppData>,
  saveData: (d: AppData) => Go.SaveData(any(d)),
  env: () => Go.GetEnvironment() as unknown as Promise<EnvInfo>,
  checkSSH: (path: string) => Go.CheckSSH(path),
  preview: (p: Profile) => Go.CommandPreview(any(p)),
  connect: (profileId: string, cols: number, rows: number) =>
    Go.Connect(profileId, cols, rows) as unknown as Promise<ConnectResult>,
  quickConnect: (target: string, cols: number, rows: number) =>
    Go.QuickConnect(target, cols, rows) as unknown as Promise<ConnectResult>,
  parseQuick: (target: string) => Go.ParseQuickConnect(target) as unknown as Promise<Profile>,
  write: (id: string, data: string) => Go.Write(id, data),
  writeB64: (id: string, b64: string) => Go.WriteBase64(id, b64),
  resize: (id: string, cols: number, rows: number) => Go.Resize(id, cols, rows),
  close: (id: string) => Go.CloseSession(id),
  exportProfiles: () => Go.ExportProfiles(),
  importProfiles: (replace: boolean) => Go.ImportProfiles(replace) as unknown as Promise<ImportResult>,
  importSSHConfig: () => Go.ImportSSHConfig() as unknown as Promise<ImportResult>,
  browseFile: (title: string) => Go.BrowseFile(title),

  on: RT.EventsOn,
  clipboardGet: RT.ClipboardGetText,
  clipboardSet: RT.ClipboardSetText,
  setTitle: RT.WindowSetTitle,
  openURL: RT.BrowserOpenURL,
};

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
