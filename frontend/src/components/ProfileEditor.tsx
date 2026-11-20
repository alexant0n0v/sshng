import { useEffect, useState } from 'react';
import { FolderSearch, Terminal as TermIcon } from 'lucide-react';
import { api } from '../api';
import { PROFILE_COLORS } from '../defaults';
import { closeModal, openProfile, saveProfile, toast, useStore } from '../store';
import { THEMES } from '../themes';
import type { Profile, SSHOptions } from '../types';
import { flatFolders, maskProxy } from '../utils';
import { Field, ListEditor, Modal, NumberInput, Section, Segmented, TriState, useAutoFocus, useDebounced } from './ui';

type Page = 'general' | 'ssh' | 'forwarding' | 'terminal';

const yn = (b: boolean | undefined) => (b === undefined ? 'ssh default' : b ? 'yes' : 'no');

export const HOSTKEY_OPTIONS = [
  { value: 'ask', label: 'ask — prompt for unknown hosts' },
  { value: 'accept-new', label: 'accept-new — trust new, reject changed' },
  { value: 'yes', label: 'yes — only known hosts' },
  { value: 'no', label: 'no — accept anything (insecure)' },
];

export function ProfileEditor({ draft: initial, isNew }: { draft: Profile; isNew: boolean }) {
  const data = useStore((s) => s.data)!;
  const defaults = data.settings.ssh;
  const [p, setP] = useState<Profile>(initial);
  const [page, setPage] = useState<Page>('general');
  const [preview, setPreview] = useState('');
  const nameRef = useAutoFocus<HTMLInputElement>(!isNew);
  const debounced = useDebounced(p, 200);

  useEffect(() => {
    api.preview(debounced).then(setPreview).catch(() => setPreview(''));
  }, [debounced]);

  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));
  const setSSH = (patch: Partial<SSHOptions>) => setP((x) => ({ ...x, ssh: { ...x.ssh, ...patch } }));

  const valid = p.host.trim() !== '' && !p.host.trim().startsWith('-');
  const save = (connect: boolean) => {
    if (!valid) {
      setPage('general');
      toast('Host is required', 'error');
      return;
    }
    const clean: Profile = {
      ...p,
      host: p.host.trim(),
      ssh: {
        ...p.ssh,
        localForwards: p.ssh.localForwards?.filter((x) => x.trim()),
        remoteForwards: p.ssh.remoteForwards?.filter((x) => x.trim()),
        dynamicForwards: p.ssh.dynamicForwards?.filter((x) => x.trim()),
        options: p.ssh.options?.filter((x) => x.trim()),
      },
    };
    const saved = saveProfile(clean);
    closeModal();
    if (connect) openProfile(saved.id);
  };

  const browseKey = async () => {
    const f = await api.browseFile('Select private key');
    if (f) setSSH({ identityFile: f });
  };

  return (
    <Modal
      title={isNew ? 'New profile' : `Edit “${initial.name}”`}
      onClose={closeModal}
      width={680}
      className="profile-editor"
      footer={
        <>
          <div className="cmd-preview" title={preview}><TermIcon size={13} /> <code>{preview}</code></div>
          <button className="btn ghost" onClick={closeModal}>Cancel</button>
          <button className="btn" onClick={() => save(false)} disabled={!valid}>Save</button>
          <button className="btn primary" onClick={() => save(true)} disabled={!valid}>Save &amp; Connect</button>
        </>
      }
    >
      <div className="editor-tabs">
        <Segmented<Page> value={page} onChange={setPage} options={[
          { value: 'general', label: 'General' },
          { value: 'ssh', label: 'SSH Options' },
          { value: 'forwarding', label: 'Port Forwarding' },
          { value: 'terminal', label: 'Terminal' },
        ]} />
      </div>
      <form className="editor-page" onSubmit={(e) => { e.preventDefault(); save(false); }}>
        <button type="submit" hidden />
        {page === 'general' && (
          <Section title="Connection">
            <Field label="Name">
              <input ref={nameRef} value={p.name} placeholder={p.host || 'My server'} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Host" hint="Hostname, IP address, or an alias from ~/.ssh/config">
              <input value={p.host} placeholder="example.com" spellCheck={false} autoFocus={isNew}
                onChange={(e) => set({ host: e.target.value })} className={p.host && !valid ? 'invalid' : ''} />
            </Field>
            <Field label="Username">
              <input value={p.ssh.user ?? ''} spellCheck={false}
                placeholder={defaults.user ? `Default: ${defaults.user}` : 'Default: current Windows user'}
                onChange={(e) => setSSH({ user: e.target.value || undefined })} />
            </Field>
            <Field label="Port">
              <NumberInput value={p.ssh.port} min={1} max={65535} placeholder={`Default: ${defaults.port || 22}`}
                onChange={(v) => setSSH({ port: v })} />
            </Field>
            <Field label="Private key" wide>
              <span className="input-with-btn">
                <input value={p.ssh.identityFile ?? ''} spellCheck={false}
                  placeholder={defaults.identityFile ? `Default: ${defaults.identityFile}` : 'Default: ssh-agent / ~/.ssh/id_*'}
                  onChange={(e) => setSSH({ identityFile: e.target.value || undefined })} />
                <button type="button" className="btn small" onClick={browseKey}><FolderSearch size={14} /> Browse</button>
              </span>
            </Field>
            <Field label="Folder">
              <select value={p.folderId ?? ''} onChange={(e) => set({ folderId: e.target.value || undefined })}>
                <option value="">(Top level)</option>
                {flatFolders(data.folders).map(({ folder, depth }) => (
                  <option key={folder.id} value={folder.id}>{' '.repeat(depth) + folder.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Color tag">
              <span className="color-tags">
                {PROFILE_COLORS.map((c) => (
                  <button type="button" key={c || 'none'} title={c || 'None'}
                    className={'color-tag' + ((p.color ?? '') === c ? ' active' : '') + (c ? '' : ' none')}
                    style={{ background: c || undefined }} onClick={() => set({ color: c || undefined })} />
                ))}
              </span>
            </Field>
            <Field label="Notes" wide>
              <textarea rows={3} value={p.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
            </Field>
          </Section>
        )}

        {page === 'ssh' && (
          <>
            <Section title="Overrides" description="Leave a field empty or on “Default” to inherit the global SSH settings.">
              <Field label="Jump host (ProxyJump)">
                <input value={p.ssh.proxyJump ?? ''} spellCheck={false} placeholder={defaults.proxyJump ? `Default: ${defaults.proxyJump}` : 'user@bastion:22'}
                  onChange={(e) => setSSH({ proxyJump: e.target.value || undefined })} />
              </Field>
              <Field label="SOCKS5 proxy" hint={defaults.socksProxy ? 'type none to bypass the default' : '[user:pass@]host:port'}>
                <input value={p.ssh.socksProxy ?? ''} spellCheck={false}
                  placeholder={defaults.socksProxy ? `Default: ${maskProxy(defaults.socksProxy)}` : 'proxy.example.com:1080'}
                  onChange={(e) => setSSH({ socksProxy: e.target.value || undefined })} />
              </Field>
              <Field label="Host key checking">
                <select value={p.ssh.strictHostKeyChecking ?? ''} onChange={(e) => setSSH({ strictHostKeyChecking: e.target.value || undefined })}>
                  <option value="">Default ({defaults.strictHostKeyChecking || 'ssh default'})</option>
                  {HOSTKEY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Keep-alive interval (s)">
                <NumberInput value={p.ssh.serverAliveInterval} min={0} placeholder={`Default: ${defaults.serverAliveInterval ?? 'off'}`}
                  onChange={(v) => setSSH({ serverAliveInterval: v })} />
              </Field>
              <Field label="Keep-alive max missed">
                <NumberInput value={p.ssh.serverAliveCountMax} min={0} placeholder={`Default: ${defaults.serverAliveCountMax ?? 3}`}
                  onChange={(v) => setSSH({ serverAliveCountMax: v })} />
              </Field>
              <Field label="Connect timeout (s)">
                <NumberInput value={p.ssh.connectTimeout} min={0} placeholder={`Default: ${defaults.connectTimeout ?? 'none'}`}
                  onChange={(v) => setSSH({ connectTimeout: v })} />
              </Field>
              <Field label="Compression">
                <TriState value={p.ssh.compression} onChange={(v) => setSSH({ compression: v })} inheritLabel={`Default (${yn(defaults.compression)})`} />
              </Field>
              <Field label="Agent forwarding">
                <TriState value={p.ssh.forwardAgent} onChange={(v) => setSSH({ forwardAgent: v })} inheritLabel={`Default (${yn(defaults.forwardAgent)})`} />
              </Field>
              <Field label="Identities only">
                <TriState value={p.ssh.identitiesOnly} onChange={(v) => setSSH({ identitiesOnly: v })} inheritLabel={`Default (${yn(defaults.identitiesOnly)})`} />
              </Field>
            </Section>
            <Section title="Advanced">
              <Field label="Extra -o options" wide hint="Added after the global ones, e.g. LogLevel=ERROR">
                <ListEditor value={p.ssh.options} onChange={(v) => setSSH({ options: v })} placeholder="Key=Value" addLabel="Add option" />
              </Field>
              <Field label="Extra arguments" wide hint="Raw ssh.exe arguments, appended after the global ones">
                <input value={p.ssh.extraArgs ?? ''} spellCheck={false} placeholder="-v" onChange={(e) => setSSH({ extraArgs: e.target.value || undefined })} />
              </Field>
              <Field label="Remote command" wide hint="Run instead of a login shell, e.g. tmux new -A -s main">
                <input value={p.remoteCommand ?? ''} spellCheck={false} onChange={(e) => set({ remoteCommand: e.target.value || undefined })} />
              </Field>
            </Section>
          </>
        )}

        {page === 'forwarding' && (
          <Section title="Port forwarding" description="Added to any forwards configured in the global settings.">
            <Field label="Local (-L)" wide hint="[bind:]port:host:hostport — e.g. 8080:localhost:80">
              <ListEditor value={p.ssh.localForwards} onChange={(v) => setSSH({ localForwards: v })} placeholder="8080:localhost:80" addLabel="Add local forward" />
            </Field>
            <Field label="Remote (-R)" wide hint="[bind:]port:host:hostport">
              <ListEditor value={p.ssh.remoteForwards} onChange={(v) => setSSH({ remoteForwards: v })} placeholder="9000:localhost:3000" addLabel="Add remote forward" />
            </Field>
            <Field label="Dynamic / SOCKS (-D)" wide hint="[bind:]port">
              <ListEditor value={p.ssh.dynamicForwards} onChange={(v) => setSSH({ dynamicForwards: v })} placeholder="1080" addLabel="Add SOCKS proxy" />
            </Field>
          </Section>
        )}

        {page === 'terminal' && (
          <Section title="Appearance" description="Give production servers a distinct colour scheme so they are easy to recognise.">
            <Field label="Color scheme" wide>
              <div className="theme-chips">
                <button type="button" className={'theme-chip' + (!p.theme ? ' active' : '')} onClick={() => set({ theme: undefined })}>
                  <span className="chip-swatch default">Aa</span> Default
                </button>
                {THEMES.map((t) => (
                  <button type="button" key={t.id} className={'theme-chip' + (p.theme === t.id ? ' active' : '')} onClick={() => set({ theme: t.id })}>
                    <span className="chip-swatch" style={{ background: t.colors.background, color: t.colors.foreground }}>
                      Aa<i style={{ background: t.colors.red }} /><i style={{ background: t.colors.green }} /><i style={{ background: t.colors.blue }} />
                    </span>
                    {t.name}
                  </button>
                ))}
              </div>
            </Field>
          </Section>
        )}
      </form>
    </Modal>
  );
}
