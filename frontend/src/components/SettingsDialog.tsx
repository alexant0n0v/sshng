import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import {
  Database, Download, FolderInput, FolderSearch, KeyRound, Palette, RotateCcw, Settings as Gear, SquareTerminal, Upload,
} from 'lucide-react';
import { api, errMsg } from '../api';
import { DEFAULT_TERMINAL, FONT_SUGGESTIONS } from '../defaults';
import {
  closeModal, exportProfiles, importProfiles, importSSHConfig, updateSettings, updateTerminal, useStore,
} from '../store';
import { ANSI_KEYS, BRIGHT_KEYS, THEMES, resolveTheme } from '../themes';
import { xtermOptions } from '../terminals';
import type { SSHOptions, TerminalSettings, ThemeColors } from '../types';
import { HOSTKEY_OPTIONS } from './ProfileEditor';
import { Field, ListEditor, Modal, NumberInput, Section, Segmented, Toggle, TriState } from './ui';

type Page = 'general' | 'ssh' | 'appearance' | 'terminal' | 'data';

const PAGES: { id: Page; label: string; icon: ReactNode }[] = [
  { id: 'general', label: 'General', icon: <Gear size={20} /> },
  { id: 'ssh', label: 'SSH', icon: <KeyRound size={20} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={20} /> },
  { id: 'terminal', label: 'Terminal', icon: <SquareTerminal size={20} /> },
  { id: 'data', label: 'Profiles', icon: <Database size={20} /> },
];

export function SettingsDialog({ section }: { section?: string }) {
  const [page, setPage] = useState<Page>((section as Page) || 'general');
  return (
    <Modal title="Settings" onClose={closeModal} width={820} className="settings">
      <nav className="prefs-toolbar">
        {PAGES.map((p) => (
          <button key={p.id} className={page === p.id ? 'active' : ''} onClick={() => setPage(p.id)}>
            {p.icon}
            <span>{p.label}</span>
          </button>
        ))}
      </nav>
      <div className="prefs-page">
        {page === 'general' && <GeneralPage />}
        {page === 'ssh' && <SSHPage />}
        {page === 'appearance' && <AppearancePage />}
        {page === 'terminal' && <TerminalPage />}
        {page === 'data' && <DataPage />}
      </div>
    </Modal>
  );
}

function GeneralPage() {
  const s = useStore((st) => st.data!.settings);
  const env = useStore((st) => st.env);
  const [check, setCheck] = useState<{ ok: boolean; text: string }>();

  useEffect(() => {
    const t = window.setTimeout(() => {
      api.checkSSH(s.sshPath ?? '').then((v) => setCheck({ ok: true, text: v })).catch((e) => setCheck({ ok: false, text: errMsg(e) }));
    }, 300);
    return () => window.clearTimeout(t);
  }, [s.sshPath]);

  return (
    <>
      <Section title="OpenSSH client">
        <Field label="ssh.exe path" wide hint={check && <span className={check.ok ? 'ok' : 'err'}>{check.text}</span>}>
          <span className="input-with-btn">
            <input value={s.sshPath ?? ''} spellCheck={false}
              placeholder={env?.detectedSshPath ? `Auto: ${env.detectedSshPath}` : 'Auto-detect'}
              onChange={(e) => updateSettings({ sshPath: e.target.value })} />
            <button className="btn small" onClick={async () => {
              const f = await api.browseFile('Select ssh.exe');
              if (f) updateSettings({ sshPath: f });
            }}><FolderSearch size={14} /> Browse</button>
          </span>
        </Field>
      </Section>
      <Section title="Tabs & windows">
        <Field label="Confirm before closing a connected tab or quitting" wide>
          <Toggle checked={s.confirmCloseActive} onChange={(v) => updateSettings({ confirmCloseActive: v })} />
        </Field>
        <Field label="Close the tab when a session exits cleanly (exit code 0)" wide>
          <Toggle checked={s.closeOnCleanExit} onChange={(v) => updateSettings({ closeOnCleanExit: v })} />
        </Field>
      </Section>
    </>
  );
}


function SSHPage() {
  const ssh = useStore((st) => st.data!.settings.ssh);
  const set = (patch: Partial<SSHOptions>) => updateSettings({ ssh: { ...ssh, ...patch } });
  return (
    <>
      <Section title="Defaults for all sessions" description="Every profile inherits these values unless it overrides them.">
        <Field label="Username">
          <input value={ssh.user ?? ''} spellCheck={false} placeholder="Current Windows user" onChange={(e) => set({ user: e.target.value || undefined })} />
        </Field>
        <Field label="Port">
          <NumberInput value={ssh.port} min={1} max={65535} placeholder="22" onChange={(v) => set({ port: v })} />
        </Field>
        <Field label="Private key" wide>
          <span className="input-with-btn">
            <input value={ssh.identityFile ?? ''} spellCheck={false} placeholder="ssh-agent / ~/.ssh/id_*" onChange={(e) => set({ identityFile: e.target.value || undefined })} />
            <button className="btn small" onClick={async () => {
              const f = await api.browseFile('Select private key');
              if (f) set({ identityFile: f });
            }}><FolderSearch size={14} /> Browse</button>
          </span>
        </Field>
        <Field label="Jump host (ProxyJump)">
          <input value={ssh.proxyJump ?? ''} spellCheck={false} placeholder="none" onChange={(e) => set({ proxyJump: e.target.value || undefined })} />
        </Field>
        <Field label="Host key checking">
          <select value={ssh.strictHostKeyChecking ?? ''} onChange={(e) => set({ strictHostKeyChecking: e.target.value || undefined })}>
            <option value="">ssh default (ask)</option>
            {HOSTKEY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Keep-alive interval (s)" hint="ServerAliveInterval; 0 disables">
          <NumberInput value={ssh.serverAliveInterval} min={0} placeholder="off" onChange={(v) => set({ serverAliveInterval: v })} />
        </Field>
        <Field label="Keep-alive max missed" hint="ServerAliveCountMax">
          <NumberInput value={ssh.serverAliveCountMax} min={0} placeholder="3" onChange={(v) => set({ serverAliveCountMax: v })} />
        </Field>
        <Field label="Connect timeout (s)">
          <NumberInput value={ssh.connectTimeout} min={0} placeholder="system default" onChange={(v) => set({ connectTimeout: v })} />
        </Field>
        <Field label="Compression (-C)">
          <TriState value={ssh.compression} onChange={(v) => set({ compression: v })} inheritLabel="ssh default" />
        </Field>
        <Field label="Agent forwarding (-A)">
          <TriState value={ssh.forwardAgent} onChange={(v) => set({ forwardAgent: v })} inheritLabel="ssh default" />
        </Field>
        <Field label="Identities only" hint="Only offer the configured key">
          <TriState value={ssh.identitiesOnly} onChange={(v) => set({ identitiesOnly: v })} inheritLabel="ssh default" />
        </Field>
      </Section>
      <Section title="Advanced">
        <Field label="Extra -o options" wide hint="Applied to every session, e.g. UserKnownHostsFile=~/.ssh/known_hosts_work">
          <ListEditor value={ssh.options} onChange={(v) => set({ options: v })} placeholder="Key=Value" addLabel="Add option" />
        </Field>
        <Field label="Extra arguments" wide hint="Raw ssh.exe arguments added to every session">
          <input value={ssh.extraArgs ?? ''} spellCheck={false} placeholder="-4" onChange={(e) => set({ extraArgs: e.target.value || undefined })} />
        </Field>
      </Section>
    </>
  );
}

const SAMPLE = [
  '\x1b[1;32muser@server\x1b[0m:\x1b[1;34m~\x1b[0m$ ls -l',
  'drwxr-xr-x 3 user staff   96 Nov 19 09:58 \x1b[1;34msrc\x1b[0m',
  '-rwxr-xr-x 1 user staff 4.0K Nov 19 09:58 \x1b[1;32mdeploy.sh\x1b[0m',
  '-rw-r--r-- 1 user staff 1.2K Nov 19 09:58 README.md',
  '\x1b[1;32muser@server\x1b[0m:\x1b[1;34m~\x1b[0m$ git status -s',
  ' \x1b[31mM\x1b[0m app.go   \x1b[32mA\x1b[0m store.go   \x1b[33m??\x1b[0m notes.txt',
  '',
  ' ' + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `\x1b[4${i}m   `).join('') + '\x1b[0m  normal',
  ' ' + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `\x1b[10${i}m   `).join('') + '\x1b[0m  bright',
  '\x1b[1;32muser@server\x1b[0m:\x1b[1;34m~\x1b[0m$ ',
].join('\r\n');

function Preview({ settings, theme }: { settings: TerminalSettings; theme: ThemeColors }) {
  const ref = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | undefined>(undefined);
  const fit = useRef<FitAddon | undefined>(undefined);

  useEffect(() => {
    const t = new Terminal({ ...xtermOptions(settings, theme), disableStdin: true, scrollback: 0 });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(ref.current!);
    t.write(SAMPLE);
    term.current = t;
    fit.current = f;
    const raf = requestAnimationFrame(() => f.fit());
    return () => {
      cancelAnimationFrame(raf);
      term.current = undefined;
      t.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!term.current) return;
    term.current.options = { ...xtermOptions(settings, theme), scrollback: 0 };
    requestAnimationFrame(() => term.current && fit.current?.fit());
  }, [settings, theme]);

  return (
    <div className="preview-frame" style={{ background: theme.background, padding: settings.padding }}>
      <div ref={ref} className="preview-term" />
    </div>
  );
}

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="swatch" title={`${label}: ${value}`}>
      <input type="color" value={toHex(value)} onChange={(e) => onChange(e.target.value)} />
      <span className="swatch-color" style={{ background: value }} />
      <span className="swatch-label">{label}</span>
    </label>
  );
}

function toHex(c: string) {
  return /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000';
}

const NAMES = ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White'];

function AppearancePage() {
  const t = useStore((st) => st.data!.settings.terminal);
  const theme = resolveTheme(t.theme, t.customTheme);
  const setColor = (key: keyof ThemeColors, v: string) =>
    updateTerminal({ theme: 'custom', customTheme: { ...theme, [key]: v } });

  return (
    <div className="appearance">
      <Preview settings={t} theme={theme} />
      <div className="appearance-cols">
        <div className="preset-list">
          <div className="col-title">Color presets</div>
          {t.customTheme && (
            <button className={'preset' + (t.theme === 'custom' ? ' active' : '')} onClick={() => updateTerminal({ theme: 'custom' })}>
              <PresetSwatch c={t.customTheme} /> Custom
            </button>
          )}
          {THEMES.map((p) => (
            <button key={p.id} className={'preset' + (t.theme === p.id ? ' active' : '')} onClick={() => updateTerminal({ theme: p.id })}>
              <PresetSwatch c={p.colors} /> {p.name}
            </button>
          ))}
        </div>
        <div className="colors-panel">
          <div className="col-title">ANSI colors</div>
          <div className="ansi-grid">
            <span />
            {NAMES.map((n) => <span key={n} className="ansi-head">{n}</span>)}
            <span className="ansi-row-label">Normal</span>
            {ANSI_KEYS.map((k, i) => <Swatch key={k} label={NAMES[i]} value={theme[k] as string} onChange={(v) => setColor(k, v)} />)}
            <span className="ansi-row-label">Bright</span>
            {BRIGHT_KEYS.map((k, i) => <Swatch key={k} label={'Bright ' + NAMES[i]} value={theme[k] as string} onChange={(v) => setColor(k, v)} />)}
          </div>
          <div className="col-title">Basic colors</div>
          <div className="basic-grid">
            <Swatch label="Foreground" value={theme.foreground} onChange={(v) => setColor('foreground', v)} />
            <Swatch label="Background" value={theme.background} onChange={(v) => setColor('background', v)} />
            <Swatch label="Cursor" value={theme.cursor} onChange={(v) => setColor('cursor', v)} />
            <Swatch label="Cursor text" value={theme.cursorAccent} onChange={(v) => setColor('cursorAccent', v)} />
            <Swatch label="Selection" value={theme.selectionBackground} onChange={(v) => setColor('selectionBackground', v)} />
            <Swatch label="Selected text" value={theme.selectionForeground ?? theme.foreground} onChange={(v) => setColor('selectionForeground', v)} />
          </div>

          <div className="col-title">Text</div>
          <div className="form-grid compact">
            <Field label="Font" wide>
              <input list="font-list" value={t.fontFamily} spellCheck={false} onChange={(e) => updateTerminal({ fontFamily: e.target.value })} />
              <datalist id="font-list">{FONT_SUGGESTIONS.map((f) => <option key={f} value={f} />)}</datalist>
            </Field>
            <Field label="Size">
              <NumberInput value={t.fontSize} min={6} max={48} onChange={(v) => v && updateTerminal({ fontSize: v })} />
            </Field>
            <Field label="Line height">
              <NumberInput value={t.lineHeight} min={0.8} max={2} step={0.05} onChange={(v) => v && updateTerminal({ lineHeight: v })} />
            </Field>
            <Field label="Letter spacing">
              <NumberInput value={t.letterSpacing} min={-2} max={10} step={0.5} onChange={(v) => updateTerminal({ letterSpacing: v ?? 0 })} />
            </Field>
            <Field label="Margins (px)">
              <NumberInput value={t.padding} min={0} max={40} onChange={(v) => updateTerminal({ padding: v ?? 0 })} />
            </Field>
            <Field label="Use bold fonts"><Toggle checked={t.boldFonts} onChange={(v) => updateTerminal({ boldFonts: v })} /></Field>
            <Field label="Brighten bold text"><Toggle checked={t.boldIsBright} onChange={(v) => updateTerminal({ boldIsBright: v })} /></Field>
            <Field label={`Minimum contrast (${t.minimumContrastRatio.toFixed(1)})`} wide>
              <input type="range" min={1} max={7} step={0.5} value={t.minimumContrastRatio}
                onChange={(e) => updateTerminal({ minimumContrastRatio: Number(e.target.value) })} />
            </Field>
          </div>

          <div className="col-title">Cursor</div>
          <div className="form-grid compact">
            <Field label="Style">
              <Segmented value={t.cursorStyle} onChange={(v) => updateTerminal({ cursorStyle: v })} options={[
                { value: 'block', label: <span className="cursor-demo block" />, title: 'Box' },
                { value: 'underline', label: <span className="cursor-demo underline" />, title: 'Underline' },
                { value: 'bar', label: <span className="cursor-demo bar" />, title: 'Vertical bar' },
              ]} />
            </Field>
            <Field label="Blinking cursor"><Toggle checked={t.cursorBlink} onChange={(v) => updateTerminal({ cursorBlink: v })} /></Field>
          </div>
          <button className="btn ghost small reset" onClick={() => updateTerminal({ ...DEFAULT_TERMINAL, customTheme: t.customTheme })}>
            <RotateCcw size={13} /> Restore defaults
          </button>
        </div>
      </div>
    </div>
  );
}

function PresetSwatch({ c }: { c: ThemeColors }) {
  return (
    <span className="preset-swatch" style={{ background: c.background, color: c.foreground }}>
      Aa<i style={{ background: c.red }} /><i style={{ background: c.green }} /><i style={{ background: c.yellow }} /><i style={{ background: c.blue }} />
    </span>
  );
}

function TerminalPage() {
  const t = useStore((st) => st.data!.settings.terminal);
  return (
    <>
      <Section title="Scrollback & bell">
        <Field label="Scrollback lines">
          <NumberInput value={t.scrollback} min={0} max={1000000} onChange={(v) => updateTerminal({ scrollback: v ?? 0 })} />
        </Field>
        <Field label="Bell">
          <Segmented value={t.bell} onChange={(v) => updateTerminal({ bell: v })} options={[
            { value: 'visual', label: 'Flash' }, { value: 'none', label: 'Silent' },
          ]} />
        </Field>
      </Section>
      <Section title="Mouse & clipboard">
        <Field label="Copy to clipboard on selection" wide><Toggle checked={t.copyOnSelect} onChange={(v) => updateTerminal({ copyOnSelect: v })} /></Field>
        <Field label="Ctrl+C copies when text is selected (otherwise sends ^C)" wide>
          <Toggle checked={t.ctrlCCopies} onChange={(v) => updateTerminal({ ctrlCCopies: v })} />
        </Field>
        <Field label="Ctrl+V pastes (Ctrl+Shift+V always pastes)" wide>
          <Toggle checked={t.ctrlVPastes} onChange={(v) => updateTerminal({ ctrlVPastes: v })} />
        </Field>
        <Field label="Right click" wide>
          <Segmented value={t.rightClick} onChange={(v) => updateTerminal({ rightClick: v })} options={[
            { value: 'menu', label: 'Context menu' }, { value: 'paste', label: 'Copy / paste (PuTTY style)' },
          ]} />
        </Field>
      </Section>
      <Section title="Rendering">
        <Field label="GPU acceleration (WebGL)" wide hint="Turn off if you see rendering glitches">
          <Toggle checked={t.gpu} onChange={(v) => updateTerminal({ gpu: v })} />
        </Field>
      </Section>
    </>
  );
}

function DataPage() {
  const env = useStore((st) => st.env);
  const count = useStore((st) => st.data!.profiles.length);
  return (
    <>
      <Section title="Import & export" description={`You have ${count} saved profile(s). Exports are plain JSON and contain no passwords.`}>
        <div className="button-row wide">
          <button className="btn" onClick={exportProfiles}><Upload size={15} /> Export to file…</button>
          <button className="btn" onClick={importProfiles}><Download size={15} /> Import from file…</button>
          <button className="btn" onClick={importSSHConfig}><FolderInput size={15} /> Import ~/.ssh/config</button>
        </div>
      </Section>
      <Section title="Storage">
        <Field label="Settings file" wide><code className="path">{env?.dataPath}</code></Field>
        <Field label="OpenSSH version" wide><code className="path">{env?.sshVersion || 'not found'}</code></Field>
      </Section>
    </>
  );
}
