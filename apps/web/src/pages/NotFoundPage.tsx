import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="wrap app-main">
      <div className="state">
        <h1 style={{ fontSize: 'var(--t-h2)' }}>Page not found</h1>
        <p className="muted">This address does not match a Truce page.</p>
        <Link className="btn btn--primary" to="/verify">Check an invoice</Link>
      </div>
    </div>
  );
}
