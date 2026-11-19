import type { Folder, Profile, SSHOptions, SortMode } from './types';

export function displayTarget(p: Profile, defaults: SSHOptions): string {
  const user = p.host.includes('@') ? '' : p.ssh.user || defaults.user || '';
  const port = p.ssh.port || defaults.port || 22;
  return `${user ? user + '@' : ''}${p.host}${port !== 22 ? ':' + port : ''}`;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

export function sortProfiles(list: Profile[], mode: SortMode): Profile[] {
  const l = [...list];
  switch (mode) {
    case 'name-desc':
      return l.sort((a, b) => byName(b, a));
    case 'host':
      return l.sort((a, b) => a.host.localeCompare(b.host, undefined, { numeric: true }) || byName(a, b));
    case 'recent':
      return l.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || byName(a, b));
    case 'created':
      return l.sort((a, b) => b.createdAt - a.createdAt);
    default:
      return l.sort(byName);
  }
}

export function sortFolders(list: Folder[], mode: SortMode): Folder[] {
  const l = [...list].sort(byName);
  return mode === 'name-desc' ? l.reverse() : l;
}

export function folderPath(folders: Folder[], id?: string): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  const seen = new Set<string>();
  for (let cur = id ? byId.get(id) : undefined; cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    parts.unshift(cur.name);
    seen.add(cur.id);
  }
  return parts.join(' / ');
}

/** Folders in tree order with depth, for "Move to" menus and selects. */
export function flatFolders(folders: Folder[]): { folder: Folder; depth: number }[] {
  const out: { folder: Folder; depth: number }[] = [];
  const walk = (parentId: string | undefined, depth: number) => {
    for (const f of sortFolders(folders.filter((x) => (x.parentId || undefined) === parentId), 'name-asc')) {
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

export function matches(p: Profile, q: string): boolean {
  const s = q.toLowerCase();
  return [p.name, p.host, p.ssh.user, p.notes].some((x) => x?.toLowerCase().includes(s));
}

export const SORT_LABELS: Record<SortMode, string> = {
  'name-asc': 'Name (A → Z)',
  'name-desc': 'Name (Z → A)',
  host: 'Host',
  recent: 'Recently used',
  created: 'Recently added',
};
