import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CaseSensitive, Clock, Plus, Regex, Server, X, Zap } from 'lucide-react';
import {
  closeTab, duplicateTab, editProfile, newProfileDraft, openMenu, openProfile, openQuick, useStore,
} from '../store';
import { terminals } from '../terminals';
import { displayTarget } from '../utils';
import { Copy, ClipboardPaste, Eraser, RotateCw, Search, TextSelect } from 'lucide-react';

function TerminalView({ tabId, active }: { tabId: string; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const rightClick = useStore((s) => s.data?.settings.terminal.rightClick);

  useEffect(() => {
    if (ref.current) terminals.mount(tabId, ref.current);
  }, [tabId]);

  useEffect(() => {
    if (active) requestAnimationFrame(() => terminals.focus(tabId));
  }, [active, tabId]);

  return (
    <div
      ref={ref}
      className={'term-view' + (active ? ' active' : '')}
      onContextMenu={(e) => {
        e.preventDefault();
        if (rightClick === 'paste') {
          if (terminals.hasSelection(tabId)) void terminals.copy(tabId);
          else void terminals.paste(tabId);
          return;
        }
        openMenu(e, [
          { label: 'Copy', icon: <Copy size={14} />, shortcut: 'Ctrl+Shift+C', disabled: !terminals.hasSelection(tabId), onClick: () => terminals.copy(tabId) },
          { label: 'Paste', icon: <ClipboardPaste size={14} />, shortcut: 'Ctrl+Shift+V', onClick: () => terminals.paste(tabId) },
          { label: 'Select all', icon: <TextSelect size={14} />, onClick: () => terminals.selectAll(tabId) },
          { separator: true },
          { label: 'Find…', icon: <Search size={14} />, shortcut: 'Ctrl+Shift+F', onClick: () => useStore.setState({ findOpen: true }) },
          { label: 'Clear scrollback', icon: <Eraser size={14} />, shortcut: 'Ctrl+Shift+K', onClick: () => terminals.clear(tabId) },
          { separator: true },
          { label: 'Duplicate tab', icon: <Plus size={14} />, onClick: () => duplicateTab(tabId) },
          { label: 'Reconnect', icon: <RotateCw size={14} />, onClick: () => terminals.reconnect(tabId) },
          { label: 'Close tab', icon: <X size={14} />, onClick: () => closeTab(tabId) },
        ]);
      }}
    />
  );
}

function FindBar({ tabId }: { tabId?: string }) {
  const [q, setQ] = useState('');
  const [cs, setCs] = useState(false);
  const [re, setRe] = useState(false);
  const [miss, setMiss] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const go = (dir: 'next' | 'prev', query = q) => setMiss(!!query && !terminals.find(tabId, query, dir, { caseSensitive: cs, regex: re }));
  const close = () => {
    terminals.clearFind(tabId);
    useStore.setState({ findOpen: false });
    if (tabId) terminals.focus(tabId);
  };

  return (
    <div className="findbar">
      <input ref={input} className={miss ? 'miss' : ''} value={q} placeholder="Find" spellCheck={false}
        onChange={(e) => { setQ(e.target.value); go('next', e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') go(e.shiftKey ? 'prev' : 'next');
          if (e.key === 'Escape') { e.stopPropagation(); close(); }
        }} />
      <button className={'icon-btn' + (cs ? ' on' : '')} title="Match case" onClick={() => setCs(!cs)}><CaseSensitive size={15} /></button>
      <button className={'icon-btn' + (re ? ' on' : '')} title="Regular expression" onClick={() => setRe(!re)}><Regex size={15} /></button>
      <button className="icon-btn" title="Previous (Shift+Enter)" onClick={() => go('prev')}><ArrowUp size={15} /></button>
      <button className="icon-btn" title="Next (Enter)" onClick={() => go('next')}><ArrowDown size={15} /></button>
      <button className="icon-btn" title="Close (Esc)" onClick={close}><X size={15} /></button>
    </div>
  );
}

export function QuickConnectInput({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const [v, setV] = useState('');
  return (
    <form className="quick-connect" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { openQuick(v); setV(''); onDone?.(); } }}>
      <Zap size={15} />
      <input autoFocus={autoFocus} value={v} onChange={(e) => setV(e.target.value)} placeholder="Quick connect: user@host:port" spellCheck={false} />
      <button className="btn primary small" type="submit" disabled={!v.trim()}>Connect</button>
    </form>
  );
}

function Welcome() {
  const data = useStore((s) => s.data)!;
  const recent = [...data.profiles]
    .filter((p) => p.lastUsedAt)
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    .slice(0, 6);
  const shown = recent.length ? recent : data.profiles.slice(0, 6);
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-logo"><span>&gt;_</span></div>
        <h1>sshng</h1>
        <p className="muted">Pick a server from the sidebar, or connect directly.</p>
        <QuickConnectInput />
        {shown.length > 0 && (
          <>
            <h4 className="welcome-sub">{recent.length ? <><Clock size={13} /> Recent</> : 'Servers'}</h4>
            <div className="recent-grid">
              {shown.map((p) => (
                <button key={p.id} className="recent-card" onClick={() => openProfile(p.id)}>
                  <span className="recent-icon" style={{ color: p.color || undefined }}><Server size={16} /></span>
                  <span className="recent-text">
                    <span className="row-title">{p.name}</span>
                    <span className="row-sub">{displayTarget(p, data.settings.ssh)}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="welcome-actions">
          <button className="btn ghost" onClick={() => editProfile(newProfileDraft(), true)}><Plus size={15} /> New profile</button>
        </div>
        <div className="shortcuts">
          <span><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> new connection</span>
          <span><kbd>Ctrl</kbd>+<kbd>Tab</kbd> next tab</span>
          <span><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>W</kbd> close tab</span>
          <span><kbd>Ctrl</kbd>+<kbd>,</kbd> settings</span>
        </div>
      </div>
    </div>
  );
}

export function TerminalArea() {
  const tabs = useStore((s) => s.tabs);
  const active = useStore((s) => s.activeTabId);
  const findOpen = useStore((s) => s.findOpen);
  return (
    <div className="terminal-area">
      {tabs.map((t) => <TerminalView key={t.id} tabId={t.id} active={t.id === active} />)}
      {tabs.length === 0 && <Welcome />}
      {findOpen && active && <FindBar key={active} tabId={active} />}
    </div>
  );
}
