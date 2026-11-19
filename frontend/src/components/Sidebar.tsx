import { useMemo, useState, type DragEvent, type MouseEvent } from 'react';
import {
  ArrowDownUp, ChevronRight, Copy, Download, Edit3, Folder as FolderIcon, FolderInput, FolderOpen,
  FolderPlus, MoreHorizontal, Play, Plus, Search, Server, Settings as SettingsIcon, Trash2, Upload, X,
} from 'lucide-react';
import {
  createFolder, deleteFolder, deleteProfile, duplicateProfile, editProfile, exportProfiles, importProfiles,
  importSSHConfig, isDescendant, moveFolder, moveProfile, newProfileDraft, openMenu, openProfile, renameFolder,
  toggleCollapsed, toast, updateUI, useStore, type MenuItem,
} from '../store';
import { api } from '../api';
import type { Folder, Profile, SortMode } from '../types';
import { SORT_LABELS, displayTarget, flatFolders, folderPath, matches, sortFolders, sortProfiles } from '../utils';

const DND = 'application/x-sshng';
type DragItem = { type: 'profile' | 'folder'; id: string };

function readDrag(e: DragEvent): DragItem | null {
  try {
    return JSON.parse(e.dataTransfer.getData(DND));
  } catch {
    return null;
  }
}

export function Sidebar() {
  const data = useStore((s) => s.data)!;
  const search = useStore((s) => s.search);
  const tabs = useStore((s) => s.tabs);
  const [selected, setSelected] = useState<string>();
  const [rootDrop, setRootDrop] = useState(false);
  const { folders, profiles, settings } = data;
  const ui = settings.ui;

  const running = useMemo(
    () => new Set(tabs.filter((t) => t.status === 'running' && t.profileId).map((t) => t.profileId!)),
    [tabs],
  );

  const moveToMenu = (current: string | undefined, onPick: (id: string | undefined) => void, exclude?: string): MenuItem[] => [
    { label: '(Top level)', checked: !current, onClick: () => onPick(undefined) },
    ...flatFolders(folders)
      .filter(({ folder }) => folder.id !== exclude && !(exclude && isDescendant(folders, folder.id, exclude)))
      .map(({ folder, depth }) => ({
        label: ' '.repeat(depth) + folder.name,
        checked: folder.id === current,
        onClick: () => onPick(folder.id),
      })),
  ];

  const profileMenu = (e: MouseEvent, p: Profile) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(p.id);
    openMenu(e, [
      { label: 'Connect', icon: <Play size={14} />, shortcut: 'Enter', onClick: () => openProfile(p.id) },
      { separator: true },
      { label: 'Edit…', icon: <Edit3 size={14} />, onClick: () => editProfile(p) },
      { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => duplicateProfile(p.id) },
      { label: 'Move to', icon: <FolderInput size={14} />, submenu: moveToMenu(p.folderId, (id) => moveProfile(p.id, id)) },
      {
        label: 'Copy SSH command', icon: <Copy size={14} />,
        onClick: async () => {
          await api.clipboardSet(await api.preview(p));
          toast('Command copied');
        },
      },
      { separator: true },
      { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => deleteProfile(p.id) },
    ]);
  };

  const folderMenu = (e: MouseEvent, f: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu(e, [
      { label: 'New profile here…', icon: <Plus size={14} />, onClick: () => editProfile(newProfileDraft(f.id), true) },
      { label: 'New subfolder…', icon: <FolderPlus size={14} />, onClick: () => createFolder(f.id) },
      { separator: true },
      { label: 'Rename…', icon: <Edit3 size={14} />, onClick: () => renameFolder(f.id) },
      { label: 'Move to', icon: <FolderInput size={14} />, submenu: moveToMenu(f.parentId, (id) => moveFolder(f.id, id), f.id) },
      {
        label: 'Connect to all', icon: <Play size={14} />,
        onClick: () => profiles.filter((p) => p.folderId === f.id).forEach((p) => openProfile(p.id)),
      },
      { separator: true },
      { label: 'Delete folder…', icon: <Trash2 size={14} />, danger: true, onClick: () => deleteFolder(f.id) },
    ]);
  };

  const emptyMenu = (e: MouseEvent) => {
    e.preventDefault();
    openMenu(e, [
      { label: 'New profile…', icon: <Plus size={14} />, onClick: () => editProfile(newProfileDraft(), true) },
      { label: 'New folder…', icon: <FolderPlus size={14} />, onClick: () => createFolder() },
    ]);
  };

  const sortMenu = (e: MouseEvent) =>
    openMenu(e, [
      ...(Object.keys(SORT_LABELS) as SortMode[]).map((m) => ({
        label: SORT_LABELS[m], checked: ui.sort === m, onClick: () => updateUI({ sort: m }),
      })),
      { separator: true },
      { label: 'Show user@host', checked: ui.showHost, onClick: () => updateUI({ showHost: !ui.showHost }) },
      { label: 'Expand all', onClick: () => updateUI({ collapsed: [] }) },
      { label: 'Collapse all', onClick: () => updateUI({ collapsed: folders.map((f) => f.id) }) },
    ]);

  const transferMenu = (e: MouseEvent) =>
    openMenu(e, [
      { label: 'Export profiles to file…', icon: <Upload size={14} />, onClick: exportProfiles },
      { label: 'Import profiles from file…', icon: <Download size={14} />, onClick: importProfiles },
      { separator: true },
      { label: 'Import hosts from ~/.ssh/config', icon: <FolderInput size={14} />, onClick: importSSHConfig },
    ]);

  const addMenu = (e: MouseEvent) =>
    openMenu(e, [
      { label: 'New profile…', icon: <Server size={14} />, shortcut: 'Ctrl+Shift+N', onClick: () => editProfile(newProfileDraft(), true) },
      { label: 'New folder…', icon: <FolderPlus size={14} />, onClick: () => createFolder() },
    ]);

  const onDropTo = (e: DragEvent, folderId: string | undefined) => {
    e.preventDefault();
    e.stopPropagation();
    setRootDrop(false);
    const item = readDrag(e);
    if (!item) return;
    if (item.type === 'profile') moveProfile(item.id, folderId);
    else moveFolder(item.id, folderId);
  };

  const renderProfile = (p: Profile, depth: number, sub?: string) => (
    <div
      key={p.id}
      className={'tree-row profile' + (selected === p.id ? ' selected' : '')}
      style={{ paddingLeft: 10 + depth * 16 }}
      tabIndex={0}
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DND, JSON.stringify({ type: 'profile', id: p.id }))}
      onClick={() => setSelected(p.id)}
      onDoubleClick={() => openProfile(p.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openProfile(p.id);
        if (e.key === 'F2') editProfile(p);
        if (e.key === 'Delete') deleteProfile(p.id);
      }}
      onContextMenu={(e) => profileMenu(e, p)}
      title={`${displayTarget(p, settings.ssh)}${p.notes ? '\n\n' + p.notes : ''}\n\nDouble-click to connect`}
    >
      <span className="row-icon" style={{ color: p.color || undefined }}>
        <Server size={15} />
        {running.has(p.id) && <span className="live-dot" />}
      </span>
      <span className="row-text">
        <span className="row-title">{p.name}</span>
        {(sub || ui.showHost) && <span className="row-sub">{sub ?? displayTarget(p, settings.ssh)}</span>}
      </span>
      <button className="row-action" title="Connect" onClick={(e) => { e.stopPropagation(); openProfile(p.id); }}>
        <Play size={13} />
      </button>
    </div>
  );

  const renderFolder = (f: Folder, depth: number): React.ReactNode => {
    const collapsed = ui.collapsed.includes(f.id);
    const childFolders = sortFolders(folders.filter((x) => x.parentId === f.id), ui.sort);
    const childProfiles = sortProfiles(profiles.filter((p) => p.folderId === f.id), ui.sort);
    const count = countIn(f.id);
    return (
      <div key={f.id}>
        <div
          className="tree-row folder"
          style={{ paddingLeft: 4 + depth * 16 }}
          tabIndex={0}
          draggable
          onDragStart={(e) => e.dataTransfer.setData(DND, JSON.stringify({ type: 'folder', id: f.id }))}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('drop'); }}
          onDragLeave={(e) => e.currentTarget.classList.remove('drop')}
          onDrop={(e) => { e.currentTarget.classList.remove('drop'); onDropTo(e, f.id); }}
          onClick={() => toggleCollapsed(f.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') toggleCollapsed(f.id);
            if (e.key === 'ArrowLeft') toggleCollapsed(f.id, true);
            if (e.key === 'ArrowRight') toggleCollapsed(f.id, false);
            if (e.key === 'F2') renameFolder(f.id);
          }}
          onContextMenu={(e) => folderMenu(e, f)}
        >
          <ChevronRight size={14} className={'chevron' + (collapsed ? '' : ' open')} />
          <span className="row-icon folder-icon">{collapsed ? <FolderIcon size={15} /> : <FolderOpen size={15} />}</span>
          <span className="row-text"><span className="row-title">{f.name}</span></span>
          <span className="count">{count}</span>
          <button className="row-action" title="Folder actions" onClick={(e) => { e.stopPropagation(); folderMenu(e, f); }}>
            <MoreHorizontal size={14} />
          </button>
        </div>
        {!collapsed && (
          <div className="tree-children">
            {childFolders.map((c) => renderFolder(c, depth + 1))}
            {childProfiles.map((p) => renderProfile(p, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const countIn = (folderId: string): number =>
    profiles.filter((p) => p.folderId === folderId).length +
    folders.filter((f) => f.parentId === folderId).reduce((n, f) => n + countIn(f.id), 0);

  const folderIds = new Set(folders.map((f) => f.id));
  const rootFolders = sortFolders(folders.filter((f) => !f.parentId || !folderIds.has(f.parentId)), ui.sort);
  const rootProfiles = sortProfiles(profiles.filter((p) => !p.folderId || !folderIds.has(p.folderId)), ui.sort);
  const results = search ? sortProfiles(profiles.filter((p) => matches(p, search)), ui.sort) : [];

  return (
    <aside className="sidebar" style={{ width: ui.sidebarWidth }}>
      <div className="sidebar-header">
        <div className="search">
          <Search size={14} />
          <input
            placeholder="Search profiles"
            value={search}
            spellCheck={false}
            onChange={(e) => useStore.setState({ search: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') useStore.setState({ search: '' });
              if (e.key === 'Enter' && results[0]) openProfile(results[0].id);
            }}
          />
          {search && <button className="icon-btn tiny" onClick={() => useStore.setState({ search: '' })}><X size={12} /></button>}
        </div>
        <button className="icon-btn" title="New…" onClick={addMenu}><Plus size={16} /></button>
      </div>

      <div
        className={'tree' + (rootDrop ? ' drop' : '')}
        onContextMenu={emptyMenu}
        onDragOver={(e) => { e.preventDefault(); setRootDrop(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setRootDrop(false); }}
        onDrop={(e) => onDropTo(e, undefined)}
      >
        {search ? (
          results.length ? results.map((p) => renderProfile(p, 0, folderPath(folders, p.folderId) || displayTarget(p, settings.ssh)))
            : <div className="tree-empty">No matches</div>
        ) : (
          <>
            {rootFolders.map((f) => renderFolder(f, 0))}
            {rootProfiles.map((p) => renderProfile(p, 0))}
            {profiles.length === 0 && folders.length === 0 && (
              <div className="tree-empty">
                <p>No saved servers yet.</p>
                <button className="btn primary small" onClick={() => editProfile(newProfileDraft(), true)}>
                  <Plus size={14} /> New profile
                </button>
                <button className="btn ghost small" onClick={importSSHConfig}>Import ~/.ssh/config</button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <button className="icon-btn" title={'Sort: ' + SORT_LABELS[ui.sort]} onClick={sortMenu}><ArrowDownUp size={16} /></button>
        <button className="icon-btn" title="New folder" onClick={() => createFolder()}><FolderPlus size={16} /></button>
        <button className="footer-btn" title="Import / export profiles" onClick={transferMenu}>
          <Download size={15} /> Import / Export
        </button>
        <span className="spacer" />
        <button className="icon-btn" title="Settings (Ctrl+,)" onClick={() => useStore.setState({ modal: { kind: 'settings' } })}>
          <SettingsIcon size={16} />
        </button>
      </div>
    </aside>
  );
}
