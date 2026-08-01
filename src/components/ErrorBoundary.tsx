import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || "Unknown error" };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[IGNOSHASHI ERROR]", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-[#050505] flex items-center justify-center relative overflow-hidden crt-effect">
          {/* Scan lines */}
          <div className="absolute inset-0 pointer-events-none z-10" style={{
            background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.015) 2px, rgba(0,255,65,0.015) 4px)",
          }} />

          <div className="relative z-20 text-center px-4 max-w-lg">
            {/* Glitch icon */}
            <div className="text-7xl mb-6 retro-blink">🤖</div>

            {/* Main error heading — glitchy style */}
            <h1
              className="text-2xl font-bold mb-4"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "clamp(0.7rem, 4vw, 1.1rem)",
                color: "#00ff41",
                textShadow: "0 0 15px rgba(0,255,65,0.5), 3px 0 0 rgba(0,255,65,0.3), -2px 0 0 rgba(57,255,20,0.2)",
              }}
            >
              ⚠️ SYSTEM MALFUNCTION
            </h1>

            {/* Error details in terminal style */}
            <div
              className="retro-card p-4 mb-6 text-left"
              style={{ borderColor: "rgba(0,255,65,0.3)", boxShadow: "0 0 20px rgba(0,255,65,0.1)" }}
            >
              <p
                className="text-[#b0d0b0] mb-1"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}
              >
                &gt; ERROR LOG:
              </p>
              <div
                className="bg-[#0a0f0a] border border-[rgba(0,255,65,0.2)] rounded-md p-3"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#00cc33" }}
              >
                <p className="break-words">{this.state.errorMessage || "An unexpected error occurred in the system."}</p>
              </div>
            </div>

            {/* RELOAD button */}
            <button
              onClick={this.handleReload}
              className="retro-btn retro-btn-orange text-[0.55rem] px-6 py-3 neon-glow-yellow"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              🔄 RELOAD SYSTEM
            </button>

            <p
              className="text-[#b0d0b0] mt-6"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
            >
              If this persists, the system may require maintenance.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
