import { useEffect, useRef } from 'react';
import { api } from './api';
import { ContextMenu } from './components/ContextMenu';
import { Modals, Toasts } from './components/Dialogs';
import { Launcher } from './components/Launcher';
import { Sidebar } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { TerminalArea } from './components/TerminalArea';
import {
  activateTab, closeTab, cycleTab, duplicateTab, editProfile, load, newProfileDraft, updateTerminal, updateUI, useStore,
} from './store';
import { terminals } from './terminals';

const isTerminalTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && t.classList.contains('xterm-helper-textarea');

/**
 * Global shortcuts. Runs in the capture phase so it sees keys before
 * xterm.js does; anything handled here is swallowed.
 */
function handleKey(e: KeyboardEvent): boolean {
  const st = useStore.getState();
  if (!st.data) return false;
  const tab = st.activeTabId;
  const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
  const shift = e.shiftKey;
  const k = e.key.toLowerCase();
  const inTerm = isTerminalTarget(e.target);
  const t = st.data.settings.terminal;

  if (ctrl && !shift && e.key === ',') {
    useStore.setState({ modal: { kind: 'settings' } });
    return true;
  }
  if (st.modal || st.launcherOpen) return false;

  if (ctrl && e.key === 'Tab') {
    cycleTab(shift ? -1 : 1);
    return true;
  }
  if (ctrl && shift) {
    if (/^Digit[1-9]$/.test(e.code)) {
      const target = st.tabs[Number(e.code.slice(5)) - 1];
      if (target) activateTab(target.id);
      return true;
    }
    switch (k) {
      case 't': useStore.setState({ launcherOpen: true }); return true;
      case 'w': if (tab) void closeTab(tab); return true;
      case 'd': if (tab) duplicateTab(tab); return true;
      case 'r': if (tab) terminals.reconnect(tab); return true;
      case 'n': editProfile(newProfileDraft(), true); return true;
      case 'b': updateUI({ sidebarHidden: !st.data.settings.ui.sidebarHidden }); return true;
      case 'f': if (tab) useStore.setState({ findOpen: true }); return true;
      case 'k': terminals.clear(tab); return true;
      case 'c': void terminals.copy(tab); return true;
      case 'v': void terminals.paste(tab); return true;
      case 'pageup': cycleTab(-1); return true;
      case 'pagedown': cycleTab(1); return true;
    }
  }
  if (ctrl && !shift) {
    if (e.key === '=' || e.key === '+') { updateTerminal({ fontSize: Math.min(48, t.fontSize + 1) }); return true; }
    if (e.key === '-') { updateTerminal({ fontSize: Math.max(6, t.fontSize - 1) }); return true; }
    if (e.key === '0') { updateTerminal({ fontSize: 14 }); return true; }
    if (inTerm && k === 'c' && t.ctrlCCopies && terminals.hasSelection(tab)) { void terminals.copy(tab); return true; }
    if (inTerm && k === 'v' && t.ctrlVPastes) { void terminals.paste(tab); return true; }
  }
  return false;
}

function SidebarResizer() {
  const dragging = useRef(false);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      updateUI({ sidebarWidth: Math.max(200, Math.min(520, e.clientX)) });
    };
    const up = () => {
      dragging.current = false;
      document.body.classList.remove('resizing');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);
  return (
    <div className="resizer" onMouseDown={(e) => {
      e.preventDefault();
      dragging.current = true;
      document.body.classList.add('resizing');
    }} onDoubleClick={() => updateUI({ sidebarWidth: 280 })} />
  );
}

export default function App() {
  const data = useStore((s) => s.data);
  const loadError = useStore((s) => s.loadError);
  const launcherOpen = useStore((s) => s.launcherOpen);
  const activeTitle = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.title);

  useEffect(() => {
    terminals.init();
    void load();
    const onKey = (e: KeyboardEvent) => {
      if (handleKey(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    api.setTitle(activeTitle ? `${activeTitle} — sshng` : 'sshng');
  }, [activeTitle]);

  if (loadError) return <div className="fatal">Could not load settings: {loadError}</div>;
  if (!data) return <div className="fatal" />;

  return (
    <div className="app">
      {!data.settings.ui.sidebarHidden && (
        <>
          <Sidebar />
          <SidebarResizer />
        </>
      )}
      <main className="main">
        <TabBar />
        <TerminalArea />
      </main>
      {launcherOpen && <Launcher />}
      <Modals />
      <ContextMenu />
      <Toasts />
    </div>
  );
}
