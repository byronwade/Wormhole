import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Error Boundary component to catch and display React errors gracefully.
 * Prevents the entire app from crashing when a component throws an error.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="h-screen bg-zinc-900 flex flex-col items-center justify-center p-8">
          <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>

          <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-zinc-400 text-center max-w-md mb-6">
            An unexpected error occurred. You can try reloading the app or resetting this view.
          </p>

          {this.state.error && (
            <div className="mb-6 p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 max-w-lg w-full">
              <p className="text-sm font-mono text-red-400 break-all">
                {this.state.error.message}
              </p>
              {this.state.errorInfo && (
                <details className="mt-2">
                  <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">
                    Show stack trace
                  </summary>
                  <pre className="mt-2 text-xs text-zinc-500 overflow-auto max-h-40">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={this.handleReset}
              className="gap-2 border-zinc-700"
            >
              Try Again
            </Button>
            <Button
              onClick={this.handleReload}
              className="gap-2 bg-emerald-700 hover:bg-emerald-800"
            >
              <RefreshCw className="w-4 h-4" />
              Reload App
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
