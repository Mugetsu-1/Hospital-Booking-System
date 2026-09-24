import { Link } from 'react-router-dom';

/** Friendly 404 for unknown routes, instead of a silent redirect home. */
export default function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Page not found</h1>
        <p className="muted">
          The page you are looking for doesn&rsquo;t exist or may have moved.
        </p>
        <Link to="/" className="btn btn-primary btn-block">
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}
