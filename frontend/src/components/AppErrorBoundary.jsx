import React from "react";
export default class AppErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error) { console.error("TonYoga screen failed:", error?.name); }
  render() {
    if (this.state.error) return <main className="min-h-screen bg-[#FAFAF7] flex flex-col items-center justify-center p-6 gap-4 text-center">
      <h1 className="serif text-2xl">This screen could not load</h1>
      <p>Your account and purchases have not been changed. Please try again.</p>
      <button className="pill pill-primary" onClick={() => window.location.assign("/home")}>Return to Home</button>
      <a href="mailto:tonyoga.online@gmail.com">Contact TonYoga support</a>
    </main>;
    return this.props.children;
  }
}
