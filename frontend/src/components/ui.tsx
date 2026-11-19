import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';

export function Modal(props: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [props.onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={'modal ' + (props.className ?? '')} style={{ width: props.width }} role="dialog" aria-modal>
        <div className="modal-header">
          <div className="modal-title">{props.title}</div>
          <button className="icon-btn" onClick={props.onClose} title="Close (Esc)"><X size={16} /></button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-footer">{props.footer}</div>}
      </div>
    </div>
  );
}

export function Field(props: { label: ReactNode; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={'field' + (props.wide ? ' wide' : '')}>
      <span className="field-label">{props.label}</span>
      <span className="field-control">{props.children}</span>
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  );
}

export function Section(props: { title: string; children: ReactNode; description?: ReactNode }) {
  return (
    <section className="form-section">
      <h3>{props.title}</h3>
      {props.description && <p className="section-desc">{props.description}</p>}
      <div className="form-grid">{props.children}</div>
    </section>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <span className="toggle-wrap" onClick={(e) => { e.preventDefault(); props.onChange(!props.checked); }}>
      <span className={'toggle' + (props.checked ? ' on' : '')} role="switch" aria-checked={props.checked} tabIndex={0}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); props.onChange(!props.checked); } }}>
        <span className="toggle-knob" />
      </span>
      {props.label && <span className="toggle-label">{props.label}</span>}
    </span>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <span className="segmented">
      {props.options.map((o) => (
        <button type="button" key={o.value} title={o.title}
          className={o.value === props.value ? 'active' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** Inherit / Yes / No control for optional boolean overrides. */
export function TriState(props: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
  inheritLabel: string;
}) {
  const v = props.value === undefined ? 'inherit' : props.value ? 'yes' : 'no';
  return (
    <Segmented
      value={v}
      onChange={(x) => props.onChange(x === 'inherit' ? undefined : x === 'yes')}
      options={[
        { value: 'inherit', label: props.inheritLabel },
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ]}
    />
  );
}

export function NumberInput(props: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input type="number" value={props.value ?? ''} placeholder={props.placeholder} min={props.min} max={props.max} step={props.step}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return props.onChange(undefined);
        const n = Number(raw);
        if (!Number.isNaN(n)) props.onChange(n);
      }} />
  );
}

export function ListEditor(props: { value: string[] | undefined; onChange: (v: string[]) => void; placeholder: string; addLabel: string }) {
  const list = props.value ?? [];
  return (
    <div className="list-editor">
      {list.map((item, i) => (
        <div className="list-row" key={i}>
          <input value={item} placeholder={props.placeholder} spellCheck={false}
            onChange={(e) => props.onChange(list.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" className="icon-btn" title="Remove" onClick={() => props.onChange(list.filter((_, j) => j !== i))}>
            <X size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn ghost small" onClick={() => props.onChange([...list, ''])}>
        <Plus size={14} /> {props.addLabel}
      </button>
    </div>
  );
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useAutoFocus<T extends HTMLInputElement>(select = false) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      ref.current?.focus();
      if (select) ref.current?.select();
    }, 10);
    return () => window.clearTimeout(t);
  }, [select]);
  return ref;
}
