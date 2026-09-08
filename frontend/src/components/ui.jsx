export function Loader({ full }) {
  return (
    <div className={full ? 'loader-full' : 'loader-inline'} role="status">
      <span className="spinner" aria-hidden="true" />
      <span>Loading&hellip;</span>
    </div>
  );
}

export function ErrorBanner({ error }) {
  if (!error) return null;
  return (
    <div className="alert alert-danger" role="alert">
      {error}
    </div>
  );
}

export function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <div className="alert alert-success" role="status">
      {message}
    </div>
  );
}

export function Badge({ tone, children }) {
  return <span className={`badge badge-${tone || 'muted'}`}>{children}</span>;
}

export function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}

export function FormField({ label, error, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
