import { useState, type MouseEvent } from 'react';
import { Copy, Edit3, Plus, RotateCw, Settings2, Unplug, X, PanelLeft } from 'lucide-react';
import {
  activateTab, closeTab, closeTabs, duplicateTab, editProfile, moveTab, openMenu, renameTab, updateUI, useStore,
} from '../store';
import { terminals } from '../terminals';
import type { Tab } from '../types';

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const active = useStore((s) => s.activeTabId);
  const profiles = useStore((s) => s.data?.profiles);
  const sidebarHidden = useStore((s) => s.data?.settings.ui.sidebarHidden);
  const [dragId, setDragId] = useState<string>();
  const [dropIndex, setDropIndex] = useState<number>();

  const tabMenu = (e: MouseEvent, t: Tab) => {
    e.preventDefault();
    const idx = tabs.findIndex((x) => x.id === t.id);
    const profile = profiles?.find((p) => p.id === t.profileId);
    openMenu(e, [
      { label: 'Duplicate tab', icon: <Copy size={14} />, shortcut: 'Ctrl+Shift+D', onClick: () => duplicateTab(t.id) },
      { label: 'Reconnect', icon: <RotateCw size={14} />, shortcut: 'Ctrl+Shift+R', onClick: () => terminals.reconnect(t.id) },
      { label: 'Disconnect', icon: <Unplug size={14} />, disabled: t.status !== 'running', onClick: () => terminals.disconnect(t.id) },
      { label: 'Rename tab…', icon: <Edit3 size={14} />, onClick: () => renameTab(t.id) },
      ...(profile ? [{ label: 'Edit profile…', icon: <Settings2 size={14} />, onClick: () => editProfile(profile) }] : []),
      { separator: true },
      { label: 'Close tab', icon: <X size={14} />, shortcut: 'Ctrl+Shift+W', onClick: () => closeTab(t.id) },
      { label: 'Close other tabs', disabled: tabs.length < 2, onClick: () => closeTabs(tabs.filter((x) => x.id !== t.id).map((x) => x.id)) },
      { label: 'Close tabs to the right', disabled: idx === tabs.length - 1, onClick: () => closeTabs(tabs.slice(idx + 1).map((x) => x.id)) },
    ]);
  };

  return (
    <div className="tabbar" onDoubleClick={(e) => e.target === e.currentTarget && useStore.setState({ launcherOpen: true })}>
      {sidebarHidden && (
        <button className="icon-btn tab-sidebar-btn" title="Show sidebar (Ctrl+Shift+B)" onClick={() => updateUI({ sidebarHidden: false })}>
          <PanelLeft size={16} />
        </button>
      )}
      <div className="tabs" onDragOver={(e) => e.preventDefault()}>
        {tabs.map((t, i) => (
          <div
            key={t.id}
            className={
              'tab' + (t.id === active ? ' active' : '') + (dragId === t.id ? ' dragging' : '') +
              (dropIndex === i && dragId && dragId !== t.id ? ' drop-before' : '')
            }
            style={t.color ? ({ '--tab-color': t.color } as React.CSSProperties) : undefined}
            draggable
            onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); }}
            onDragEnd={() => { setDragId(undefined); setDropIndex(undefined); }}
            onDragOver={(e) => { e.preventDefault(); setDropIndex(i); }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) {
                const from = tabs.findIndex((x) => x.id === dragId);
                moveTab(dragId, from < i ? i - 1 : i);
              }
              setDragId(undefined);
              setDropIndex(undefined);
            }}
            onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(t.id); } }}
            onClick={() => activateTab(t.id)}
            onContextMenu={(e) => tabMenu(e, t)}
            title={[t.title, t.remoteTitle, t.command, i < 9 ? `Ctrl+Shift+${i + 1}` : ''].filter(Boolean).join('\n')}
          >
            <span className={'status-dot ' + t.status} />
            <span className="tab-title">{t.title}</span>
            <button className="tab-close" title="Close (Ctrl+Shift+W)" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <button className="icon-btn new-tab" title="New connection (Ctrl+Shift+T)" onClick={() => useStore.setState({ launcherOpen: true })}>
        <Plus size={16} />
      </button>
      <div className="tabbar-drag" onDoubleClick={() => useStore.setState({ launcherOpen: true })} />
    </div>
  );
}
