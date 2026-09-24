import { Component } from 'react';

/**
 * Top-level error boundary. React error boundaries must be class components:
 * this one catches render/runtime errors anywhere in the routed tree so a
 * single broken screen degrades to a recoverable message instead of a blank
 * white page. No external error reporting — details go to the console only.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
    window.location.assign('/');
  };

  render() {
    if (this.state.error) {
      return (
        <div className="auth-wrap">
          <div className="card auth-card">
            <h1>Something went wrong</h1>
            <p className="muted">
              An unexpected error interrupted this screen. You can return to the
              dashboard and try again.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={this.handleReset}>
              Back to safety
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
