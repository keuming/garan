import { LABELS, tone } from '../format.js';

export function Wordmark({ style }) {
  return (
    <span className="wordmark" style={style} aria-label="gaRAN">
      <span className="ga">ga</span>
      <span className="ran">RAN</span>
    </span>
  );
}

export function Badge({ kind, value }) {
  const label = LABELS[kind]?.[value] ?? value;
  const t = tone[kind]?.[value] ?? 'muted';
  return <span className={`badge ${t}`}>{label}</span>;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      {error.message ?? String(error)}
    </div>
  );
}

export function Pager({ page, limit, total, onPage }) {
  if (!total) return null;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pager">
      <span>
        Page {page} / {pages} · {total} résultat{total > 1 ? 's' : ''}
      </span>
      <button className="btn secondary small" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Précédent
      </button>
      <button className="btn secondary small" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Suivant
      </button>
    </div>
  );
}

export function Field({ label, id, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = true }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`card${wide ? ' wide' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="page-head">
          <h2>{title}</h2>
          <button className="btn secondary small" type="button" onClick={onClose}>
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
