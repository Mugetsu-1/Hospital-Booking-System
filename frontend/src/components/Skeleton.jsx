/**
 * Skeleton loading placeholders — shimmering rows/cards shown while data is
 * fetched, so the UI gives immediate feedback instead of a bare spinner.
 */

export function SkeletonRows({ rows = 3, columns = 4, className = '' }) {
  const grid = Array.from({ length: rows }, (_, r) => (
    <div className="skeleton-row" key={r}>
      {Array.from({ length: columns }, (_, c) => (
        <span className="skeleton-cell" key={c} style={{ width: `${55 + ((r + c) * 13) % 40}%` }} />
      ))}
    </div>
  ));
  return <div className={`skeleton ${className}`} role="status" aria-label="Loading">{grid}</div>;
}

export function SkeletonCards({ cards = 3 }) {
  const items = Array.from({ length: cards }, (_, i) => (
    <div className="skeleton-card" key={i}>
      <span className="skeleton-avatar" />
      <span className="skeleton-line" style={{ width: '70%' }} />
      <span className="skeleton-line" style={{ width: '45%' }} />
    </div>
  ));
  return <div className="skeleton" role="status" aria-label="Loading">{items}</div>;
}