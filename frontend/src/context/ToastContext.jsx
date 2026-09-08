import { createContext, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

const TOAST_TONES = {
  success: 'toast toast-success',
  error: 'toast toast-error',
  info: 'toast toast-info',
};

/**
 * ToastProvider renders a fixed stack of transient notifications (top-right).
 * Any component can call `toast.success('Saved')` / `toast.error(...)` etc.
 * Toasts auto-dismiss after `durationMs` and can be dismissed manually.
 */
export function ToastProvider({ children, durationMs = 4200 }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  function push(tone, message) {
    if (!message) return;
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => dismiss(id), durationMs);
  }

  function dismiss(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  const toast = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={TOAST_TONES[t.tone] || TOAST_TONES.info} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span className="toast-msg">{t.message}</span>
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}