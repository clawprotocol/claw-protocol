import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Called after clearing the boundary state (e.g. return to My agreements). */
  onBack?: () => void;
};

type State = { error: Error | null };

/**
 * Catches render errors in agreement workspace content so the shell never goes blank.
 */
export class AgreementReviewErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AgreementReview] error boundary", error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[10rem] flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-center">
          <p className="text-sm text-rose-200">Something went wrong displaying this agreement.</p>
          <p className="mt-2 max-w-sm text-xs text-slate-500">
            Try again. If this keeps happening, go back and open review from describe.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700"
              onClick={() => {
                this.setState({ error: null });
              }}
            >
              Try again
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-700 bg-transparent px-4 py-2 text-sm text-slate-400 hover:bg-slate-900/80 hover:text-slate-200"
              onClick={() => {
                this.setState({ error: null });
                this.props.onBack?.();
              }}
            >
              Back to edit draft
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
