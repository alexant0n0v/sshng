import { create } from 'zustand';
import { api, errMsg } from './api';
import { normalizeData } from './defaults';
import type {
  AppData, EnvInfo, Folder, Profile, Settings, Tab, TerminalSettings, UISettings,
} from './types';
import { terminals } from './terminals';

export const uid = () =>
  Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-6);

export interface MenuItem {
  label?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  checked?: boolean;
  submenu?: MenuItem[];
  onClick?: () => void;
}

export type Modal =
  | { kind: 'settings'; section?: string }
  | { kind: 'profile'; draft: Profile; isNew: boolean }
  | { kind: 'prompt'; title: string; label?: string; value: string; okLabel?: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message: string; okLabel?: string; danger?: boolean; extra?: string; resolve: (v: boolean | 'extra') => void };

export interface Toast { id: string; text: string; kind: 'info' | 'error' | 'success' }

interface State {
  data: AppData | null;
  env: EnvInfo | null;
  loadError?: string;
  tabs: Tab[];
  activeTabId?: string;
  modal: Modal | null;
  menu: { x: number; y: number; items: MenuItem[] } | null;
  launcherOpen: boolean;
  findOpen: boolean;
  search: string;
  toasts: Toast[];
}

export const useStore = create<State>(() => ({
  data: null,
  env: null,
  tabs: [],
  modal: null,
  menu: null,
  launcherOpen: false,
  findOpen: false,
  search: '',
  toasts: [],
}));

const set = useStore.setState;
const get = useStore.getState;

// ---------- persistence ----------

let saveTimer: number | undefined;
let savePending = false;

function saveNow(): Promise<void> {
  window.clearTimeout(saveTimer);
  savePending = false;
  const d = get().data;
  if (!d) return Promise.resolve();
  return api.saveData(d).catch((e) => toast('Could not save: ' + errMsg(e), 'error'));
}

function persist() {
  window.clearTimeout(saveTimer);
  savePending = true;
  saveTimer = window.setTimeout(saveNow, 250);
}

/** Writes any debounced change immediately (the backend reads profiles from disk state on connect). */
export function flushSave(): Promise<void> {
  return savePending ? saveNow() : Promise.resolve();
}

function mutate(fn: (d: AppData) => AppData) {
  const d = get().data;
  if (!d) return;
  set({ data: fn(d) });
  persist();
}

export async function load() {
  try {
    const d = normalizeData(await api.getData());
    set({ data: d });
    terminals.applySettings(d.settings.terminal);
    api.env().then((env) => set({ env }));
  } catch (e) {
    set({ loadError: errMsg(e) });
  }
}

export function replaceData(d: AppData) {
  set({ data: normalizeData(d) });
}

// ---------- toasts / dialogs ----------

export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = uid();
  set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
  window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 6000 : 3000);
}

export function confirmDialog(o: { title: string; message: string; okLabel?: string; danger?: boolean; extra?: string }) {
  return new Promise<boolean | 'extra'>((resolve) => set({ modal: { kind: 'confirm', ...o, resolve } }));
}

export function promptDialog(o: { title: string; label?: string; value?: string; okLabel?: string }) {
  return new Promise<string | null>((resolve) =>
    set({ modal: { kind: 'prompt', value: '', ...o, resolve } }));
}

export const closeModal = () => set({ modal: null });
export const openMenu = (e: { clientX: number; clientY: number }, items: MenuItem[]) =>
  set({ menu: { x: e.clientX, y: e.clientY, items } });
export const closeMenu = () => set({ menu: null });

// ---------- settings ----------

export function updateSettings(patch: Partial<Settings>) {
  mutate((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
}

export function updateTerminal(patch: Partial<TerminalSettings>) {
  mutate((d) => ({ ...d, settings: { ...d.settings, terminal: { ...d.settings.terminal, ...patch } } }));
  terminals.applySettings(get().data!.settings.terminal);
}

export function updateUI(patch: Partial<UISettings>) {
  mutate((d) => ({ ...d, settings: { ...d.settings, ui: { ...d.settings.ui, ...patch } } }));
}

export function toggleCollapsed(folderId: string, collapsed?: boolean) {
  const cur = get().data?.settings.ui.collapsed ?? [];
  const isCollapsed = cur.includes(folderId);
  const next = collapsed ?? !isCollapsed;
  if (next === isCollapsed) return;
  updateUI({ collapsed: next ? [...cur, folderId] : cur.filter((x) => x !== folderId) });
}

// ---------- profiles ----------

export function newProfileDraft(folderId?: string): Profile {
  return { id: '', name: '', host: '', folderId, ssh: {}, createdAt: 0 };
}

export function editProfile(p: Profile, isNew = false) {
  set({ modal: { kind: 'profile', draft: structuredClone(p), isNew } });
}

export function saveProfile(p: Profile): Profile {
  const saved: Profile = { ...p, id: p.id || uid(), createdAt: p.createdAt || Date.now(), name: p.name.trim() || p.host };
  mutate((d) => {
    const exists = d.profiles.some((x) => x.id === saved.id);
    return {
      ...d,
      profiles: exists ? d.profiles.map((x) => (x.id === saved.id ? saved : x)) : [...d.profiles, saved],
    };
  });
  // Keep open tabs' titles/colours in sync.
  set((s) => ({
    tabs: s.tabs.map((t) => (t.profileId === saved.id ? { ...t, title: saved.name, color: saved.color } : t)),
  }));
  terminals.applyProfileTheme(saved.id);
  return saved;
}

export async function deleteProfile(id: string) {
  const p = get().data?.profiles.find((x) => x.id === id);
  if (!p) return;
  const ok = await confirmDialog({
    title: 'Delete profile', message: `Delete "${p.name}"? This cannot be undone.`, okLabel: 'Delete', danger: true,
  });
  if (ok !== true) return;
  mutate((d) => ({ ...d, profiles: d.profiles.filter((x) => x.id !== id) }));
}

export function duplicateProfile(id: string) {
  const p = get().data?.profiles.find((x) => x.id === id);
  if (!p) return;
  const copy = saveProfile({ ...structuredClone(p), id: '', createdAt: 0, lastUsedAt: undefined, name: p.name + ' copy' });
  editProfile(copy);
}

export function moveProfile(id: string, folderId: string | undefined) {
  mutate((d) => ({ ...d, profiles: d.profiles.map((x) => (x.id === id ? { ...x, folderId } : x)) }));
  if (folderId) toggleCollapsed(folderId, false);
}

// ---------- folders ----------

export async function createFolder(parentId?: string) {
  const name = await promptDialog({ title: 'New folder', label: 'Folder name', value: 'New Folder', okLabel: 'Create' });
  if (!name?.trim()) return;
  const f: Folder = { id: uid(), name: name.trim(), parentId, createdAt: Date.now() };
  mutate((d) => ({ ...d, folders: [...d.folders, f] }));
  if (parentId) toggleCollapsed(parentId, false);
}

export async function renameFolder(id: string) {
  const f = get().data?.folders.find((x) => x.id === id);
  if (!f) return;
  const name = await promptDialog({ title: 'Rename folder', label: 'Folder name', value: f.name, okLabel: 'Rename' });
  if (!name?.trim()) return;
  mutate((d) => ({ ...d, folders: d.folders.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)) }));
}

export function isDescendant(folders: Folder[], id: string, ancestorId: string): boolean {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const seen = new Set<string>();
  for (let cur = byId.get(id)?.parentId; cur && !seen.has(cur); cur = byId.get(cur)?.parentId) {
    if (cur === ancestorId) return true;
    seen.add(cur);
  }
  return false;
}

export function moveFolder(id: string, parentId: string | undefined) {
  const d = get().data;
  if (!d || id === parentId) return;
  if (parentId && isDescendant(d.folders, parentId, id)) {
    toast('A folder cannot be moved into its own subfolder', 'error');
    return;
  }
  mutate((d) => ({ ...d, folders: d.folders.map((x) => (x.id === id ? { ...x, parentId } : x)) }));
}

export async function deleteFolder(id: string) {
  const d = get().data;
  const f = d?.folders.find((x) => x.id === id);
  if (!d || !f) return;
  const ids = new Set([id, ...d.folders.filter((x) => isDescendant(d.folders, x.id, id)).map((x) => x.id)]);
  const count = d.profiles.filter((p) => p.folderId && ids.has(p.folderId)).length;
  let deleteContents = false;
  if (count > 0) {
    const r = await confirmDialog({
      title: 'Delete folder',
      message: `"${f.name}" contains ${count} profile(s). Keep them (moved up one level) or delete them too?`,
      okLabel: 'Keep profiles', extra: 'Delete everything', danger: false,
    });
    if (r === false) return;
    deleteContents = r === 'extra';
  }
  mutate((d) => ({
    ...d,
    folders: deleteContents
      ? d.folders.filter((x) => !ids.has(x.id))
      : d.folders.filter((x) => x.id !== id).map((x) => (x.parentId === id ? { ...x, parentId: f.parentId } : x)),
    profiles: deleteContents
      ? d.profiles.filter((p) => !(p.folderId && ids.has(p.folderId)))
      : d.profiles.map((p) => (p.folderId === id ? { ...p, folderId: f.parentId } : p)),
  }));
}

// ---------- tabs ----------

export function openProfile(profileId: string) {
  const p = get().data?.profiles.find((x) => x.id === profileId);
  if (!p) return;
  const tab: Tab = { id: uid(), title: p.name, profileId, color: p.color, status: 'connecting' };
  set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, launcherOpen: false }));
}

export function openQuick(target: string) {
  const t = target.trim().replace(/^ssh\s+/, '');
  if (!t) return;
  const tab: Tab = { id: uid(), title: t, quickTarget: t, status: 'connecting' };
  set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, launcherOpen: false }));
}

export function duplicateTab(id: string) {
  const t = get().tabs.find((x) => x.id === id);
  if (!t) return;
  if (t.profileId) openProfile(t.profileId);
  else if (t.quickTarget) openQuick(t.quickTarget);
}

export function updateTab(id: string, patch: Partial<Tab>) {
  set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

export function activateTab(id: string) {
  set({ activeTabId: id, findOpen: false });
}

export function cycleTab(dir: 1 | -1) {
  const { tabs, activeTabId } = get();
  if (tabs.length < 2) return;
  const i = tabs.findIndex((t) => t.id === activeTabId);
  activateTab(tabs[(i + dir + tabs.length) % tabs.length].id);
}

export function moveTab(id: string, toIndex: number) {
  set((s) => {
    const tabs = [...s.tabs];
    const from = tabs.findIndex((t) => t.id === id);
    if (from < 0) return {};
    const [t] = tabs.splice(from, 1);
    tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, t);
    return { tabs };
  });
}

export async function closeTab(id: string, force = false) {
  const { tabs, data } = get();
  const t = tabs.find((x) => x.id === id);
  if (!t) return;
  if (!force && t.status === 'running' && data?.settings.confirmCloseActive) {
    const ok = await confirmDialog({
      title: 'Close tab', message: `Disconnect from "${t.title}"?`, okLabel: 'Disconnect',
    });
    if (ok !== true) return;
  }
  terminals.dispose(id);
  set((s) => {
    const idx = s.tabs.findIndex((x) => x.id === id);
    const rest = s.tabs.filter((x) => x.id !== id);
    let activeTabId = s.activeTabId;
    if (activeTabId === id) activeTabId = rest[Math.min(idx, rest.length - 1)]?.id;
    return { tabs: rest, activeTabId };
  });
}

export async function closeTabs(ids: string[]) {
  const running = get().tabs.filter((t) => ids.includes(t.id) && t.status === 'running').length;
  if (running > 0 && get().data?.settings.confirmCloseActive) {
    const ok = await confirmDialog({
      title: 'Close tabs', message: `Disconnect ${running} running session(s)?`, okLabel: 'Disconnect',
    });
    if (ok !== true) return;
  }
  for (const id of ids) await closeTab(id, true);
}

export async function renameTab(id: string) {
  const t = get().tabs.find((x) => x.id === id);
  if (!t) return;
  const v = await promptDialog({ title: 'Rename tab', label: 'Tab title', value: t.title, okLabel: 'Rename' });
  if (v?.trim()) updateTab(id, { title: v.trim() });
}

// ---------- import / export ----------

export async function exportProfiles() {
  try {
    await flushSave();
    const path = await api.exportProfiles();
    if (path) toast(`Exported ${get().data?.profiles.length ?? 0} profile(s) to ${path}`, 'success');
  } catch (e) {
    toast('Export failed: ' + errMsg(e), 'error');
  }
}

export async function importProfiles() {
  let replace = false;
  if ((get().data?.profiles.length ?? 0) > 0) {
    const r = await confirmDialog({
      title: 'Import profiles',
      message: 'Merge the imported profiles with your current ones, or replace everything? Profiles with the same ID are updated when merging.',
      okLabel: 'Merge', extra: 'Replace all',
    });
    if (r === false) return;
    replace = r === 'extra';
  }
  try {
    await flushSave();
    const res = await api.importProfiles(replace);
    if (!res.path) return;
    replaceData(res.data);
    toast(`Imported ${res.count} profile(s)`, 'success');
  } catch (e) {
    toast('Import failed: ' + errMsg(e), 'error');
  }
}

export async function importSSHConfig() {
  try {
    await flushSave();
    const res = await api.importSSHConfig();
    replaceData(res.data);
    toast(res.count ? `Imported ${res.count} host(s) from ${res.path}` : 'No new hosts found in ssh config', res.count ? 'success' : 'info');
  } catch (e) {
    toast(errMsg(e), 'error');
  }
}
