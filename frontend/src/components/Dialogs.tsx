import { useState } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { closeModal, useStore, type Modal as ModalState } from '../store';
import { Modal, useAutoFocus } from './ui';
import { ProfileEditor } from './ProfileEditor';
import { SettingsDialog } from './SettingsDialog';

function PromptDialog({ m }: { m: Extract<ModalState, { kind: 'prompt' }> }) {
  const [v, setV] = useState(m.value);
  const ref = useAutoFocus<HTMLInputElement>(true);
  const done = (r: string | null) => { closeModal(); m.resolve(r); };
  return (
    <Modal title={m.title} onClose={() => done(null)} width={420}
      footer={<>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => done(null)}>Cancel</button>
        <button className="btn primary" onClick={() => done(v)} disabled={!v.trim()}>{m.okLabel ?? 'OK'}</button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) done(v); }}>
        <label className="field wide">
          {m.label && <span className="field-label">{m.label}</span>}
          <input ref={ref} value={v} onChange={(e) => setV(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}

function ConfirmDialog({ m }: { m: Extract<ModalState, { kind: 'confirm' }> }) {
  const done = (r: boolean | 'extra') => { closeModal(); m.resolve(r); };
  const ok = useAutoFocus<HTMLButtonElement & HTMLInputElement>();
  return (
    <Modal title={m.title} onClose={() => done(false)} width={440}
      footer={<>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => done(false)}>Cancel</button>
        {m.extra && <button className="btn danger" onClick={() => done('extra')}>{m.extra}</button>}
        <button ref={ok} className={'btn ' + (m.danger ? 'danger' : 'primary')} onClick={() => done(true)}>{m.okLabel ?? 'OK'}</button>
      </>}>
      <p className="confirm-text">{m.message}</p>
    </Modal>
  );
}

export function Modals() {
  const modal = useStore((s) => s.modal);
  if (!modal) return null;
  switch (modal.kind) {
    case 'settings':
      return <SettingsDialog section={modal.section} />;
    case 'profile':
      return <ProfileEditor key={modal.draft.id || 'new'} draft={modal.draft} isNew={modal.isNew} />;
    case 'prompt':
      return <PromptDialog m={modal} />;
    case 'confirm':
      return <ConfirmDialog m={modal} />;
  }
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          {t.kind === 'error' ? <AlertCircle size={16} /> : t.kind === 'success' ? <CheckCircle2 size={16} /> : <Info size={16} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
