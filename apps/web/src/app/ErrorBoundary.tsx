import { Component, type ReactNode } from 'react';

/** Keeps a render error from blanking the page; shows a plain message with a reload. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="wrap app-main">
        <div className="state" role="alert">
          <h1 style={{ fontSize: 'var(--t-h2)' }}>Something went wrong on this page</h1>
          <p className="muted">{this.state.error.message}</p>
          <button type="button" className="btn btn--secondary" onClick={() => location.reload()}>Reload the page</button>
        </div>
      </div>
    );
  }
}
