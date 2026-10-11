import { Component } from "react";
import { reportKioskError } from "../../api/kiosk";

const RECOVER_SECONDS = 6;

/**
 * Last line of defence for the kiosk: if anything throws while rendering, show a
 * short apology, report it to the server, and reload back to the idle screen —
 * instead of a dead screen that needs someone to log in and refresh.
 */
export default class KioskErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    reportKioskError(`Render error: ${error?.message || error}`, {
      screen: info?.componentStack?.split("\n")[1]?.trim() || null,
    });
    this.timer = setTimeout(() => window.location.replace("/kiosk"), RECOVER_SECONDS * 1000);
  }

  componentWillUnmount() {
    clearTimeout(this.timer);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-gray-50 p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Sorry — something went wrong</h1>
        <p className="mt-3 text-lg text-gray-600">The kiosk is restarting. Please try again in a moment.</p>
        <button
          type="button"
          onClick={() => window.location.replace("/kiosk")}
          className="mt-8 rounded-2xl bg-brand-600 px-8 py-4 text-xl font-semibold text-white active:scale-95"
        >
          Restart now
        </button>
      </div>
    );
  }
}
