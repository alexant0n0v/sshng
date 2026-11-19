import { useEffect, useMemo, useState } from 'react';
import { Server, Zap } from 'lucide-react';
import { openProfile, openQuick, useStore } from '../store';
import { displayTarget, folderPath, matches, sortProfiles } from '../utils';
import { useAutoFocus } from './ui';

/** Ctrl+Shift+T palette: fuzzy-pick a profile or quick-connect to user@host. */
export function Launcher() {
  const data = useStore((s) => s.data)!;
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useAutoFocus<HTMLInputElement>();
  const close = () => useStore.setState({ launcherOpen: false });

  const items = useMemo(() => {
    const list = sortProfiles(q ? data.profiles.filter((p) => matches(p, q)) : data.profiles, 'recent').slice(0, 50);
    const out: { key: string; label: string; sub: string; color?: string; quick?: boolean; run: () => void }[] = list.map((p) => ({
      key: p.id,
      label: p.name,
      sub: [displayTarget(p, data.settings.ssh), folderPath(data.folders, p.folderId)].filter(Boolean).join('  ·  '),
      color: p.color,
      run: () => openProfile(p.id),
    }));
    const t = q.trim();
    if (t && !t.includes(' ')) out.push({ key: '__quick', label: `ssh ${t}`, sub: 'Quick connect (not saved)', quick: true, run: () => openQuick(t) });
    return out;
  }, [q, data]);

  useEffect(() => setSel(0), [q]);

  return (
    <div className="modal-backdrop launcher-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="launcher">
        <input
          ref={input}
          value={q}
          placeholder="Connect to… (profile name, host, or user@host:port)"
          spellCheck={false}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); close(); }
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === 'Enter' && items[sel]) { items[sel].run(); close(); }
          }}
        />
        <div className="launcher-list">
          {items.map((it, i) => (
            <div key={it.key} className={'launcher-item' + (i === sel ? ' sel' : '')}
              onMouseEnter={() => setSel(i)} onClick={() => { it.run(); close(); }}>
              <span className="row-icon" style={{ color: it.color || undefined }}>{it.quick ? <Zap size={15} /> : <Server size={15} />}</span>
              <span className="row-text">
                <span className="row-title">{it.label}</span>
                <span className="row-sub">{it.sub}</span>
              </span>
            </div>
          ))}
          {items.length === 0 && <div className="tree-empty">Type a host name to quick-connect</div>}
        </div>
      </div>
    </div>
  );
}
