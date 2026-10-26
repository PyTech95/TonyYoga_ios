import { Component } from "react";

/**
 * Keeps one broken screen from blanking the whole app. Without this, any runtime
 * error (bad data from the server, an old phone missing a browser API) unmounted
 * everything and left a white screen with no way back except force-closing the app.
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
    // eslint-disable-next-line no-console
    console.error("Screen crashed", error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    // Navigating to another screen clears the error.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div
        role="alert"
        data-testid="screen-error"
        className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ paddingTop: "calc(var(--page-top, 0px) + 2rem)" }}
      >
        <div className="serif text-2xl text-[#1C221F]">Something didn't load.</div>
        <p className="text-sm leading-relaxed text-[#6B7269]">
          Please check your connection and try again. If it keeps happening, let us know from Help &amp; contact.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className="pill pill-primary">Try again</button>
          <button type="button" onClick={() => { window.location.href = "/"; }} className="pill pill-ghost">Go home</button>
        </div>
      </div>
    );
  }
}
