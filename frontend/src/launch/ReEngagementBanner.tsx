import { useEffect, useRef } from "react";
import { logProductEvent } from "../lib/experimentation/productEvents";
import {
  acknowledgeReEngagementTouch,
  dismissReEngagementBanner,
  markWinBackShown,
  shouldLogDraftAbandoned,
  type CreateOrHomeBanner,
  type ReEngagementSurface,
} from "./reEngagementStore";

type Props = {
  surface: ReEngagementSurface;
  banner: CreateOrHomeBanner;
  onDismiss: () => void;
  navigate: (path: string) => void;
  /** SEO home uses light cards; in-app surfaces use dark panels. */
  theme?: "app" | "marketing";
};

export function ReEngagementBanner(props: Props) {
  const { surface, banner, onDismiss, navigate, theme = "app" } = props;
  const m = theme === "marketing";
  const winBackMarked = useRef(false);

  useEffect(() => {
    if (!banner || banner.kind !== "abandoned") return;
    if (shouldLogDraftAbandoned(banner.agreementId)) {
      logProductEvent("draft_abandoned", { agreementId: banner.agreementId });
    }
  }, [banner]);

  useEffect(() => {
    if (!banner || banner.kind !== "winback" || winBackMarked.current) return;
    winBackMarked.current = true;
    markWinBackShown();
  }, [banner]);

  if (!banner) return null;

  function dismiss(kind: string): void {
    dismissReEngagementBanner(surface, kind);
    onDismiss();
  }

  if (banner.kind === "abandoned") {
    const id = banner.agreementId;
    return (
      <div
        className={`mb-6 rounded-xl border px-4 py-4 sm:px-5 ${
          m ? "border-sky-200 bg-sky-50/90" : "border-sky-800/40 bg-sky-950/25"
        }`}
        role="region"
        aria-label="Resume draft"
      >
        <p
          className={`text-center text-sm font-medium leading-snug sm:text-left ${
            m ? "text-slate-900" : "text-slate-100"
          }`}
        >
          You started an agreement — ready to finish it?
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="vs01-btn vs01-btn--primary w-full min-h-[2.65rem] sm:w-auto"
            onClick={() => {
              acknowledgeReEngagementTouch();
              dismiss("abandoned");
              navigate(`/app/send/${encodeURIComponent(id)}`);
            }}
          >
            Resume agreement
          </button>
          <button
            type="button"
            className={`text-center text-xs underline-offset-2 hover:underline sm:text-right ${
              m ? "text-slate-600 hover:text-slate-800" : "text-slate-500 hover:text-slate-400"
            }`}
            onClick={() => dismiss("abandoned")}
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (banner.kind === "rehab") {
    const rehabPrimary = surface === "home" ? "/app/create" : "/app/billing";
    const rehabLabel = surface === "home" ? "Continue" : "View pricing";
    return (
      <div
        className={`mb-6 rounded-xl border px-4 py-4 sm:px-5 ${
          m ? "border-slate-200 bg-white shadow-sm" : "border-slate-700/80 bg-slate-900/40"
        }`}
        role="region"
        aria-label="Continue agreements"
      >
        <p
          className={`text-center text-sm font-medium leading-snug sm:text-left ${
            m ? "text-slate-800" : "text-slate-200"
          }`}
        >
          Still working on agreements? Pick up where you left off.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className={`vs01-btn vs01-btn--secondary w-full min-h-[2.65rem] border sm:w-auto ${
              m ? "border-slate-300" : "border-slate-600"
            }`}
            onClick={() => {
              acknowledgeReEngagementTouch();
              dismiss("rehab");
              navigate(rehabPrimary);
            }}
          >
            {rehabLabel}
          </button>
          <button
            type="button"
            className={`text-center text-xs underline-offset-2 hover:underline sm:text-right ${
              m ? "text-slate-600 hover:text-slate-800" : "text-slate-500 hover:text-slate-400"
            }`}
            onClick={() => dismiss("rehab")}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mb-6 rounded-xl border px-4 py-4 sm:px-5 ${
        m ? "border-emerald-200 bg-emerald-50/90" : "border-emerald-900/35 bg-emerald-950/20"
      }`}
      role="region"
      aria-label="Welcome back"
    >
      <p
        className={`text-center text-sm font-medium leading-snug sm:text-left ${
          m ? "text-emerald-950" : "text-emerald-100/95"
        }`}
      >
        We thought of you — your agreements and records are still here.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="vs01-btn vs01-btn--primary w-full min-h-[2.65rem] sm:w-auto"
          onClick={() => {
            acknowledgeReEngagementTouch();
            dismiss("winback");
            navigate("/app");
          }}
        >
          Open workspace
        </button>
        <button
          type="button"
          className={`text-center text-xs underline-offset-2 hover:underline sm:text-right ${
            m ? "text-slate-600 hover:text-slate-800" : "text-slate-500 hover:text-slate-400"
          }`}
          onClick={() => dismiss("winback")}
        >
          Thanks
        </button>
      </div>
    </div>
  );
}

export function WorkspaceWinBackBanner(props: { onDismiss: () => void; navigate: (path: string) => void }) {
  const { onDismiss, navigate } = props;
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    markWinBackShown();
  }, []);

  return (
    <div
      className="mb-4 flex flex-col gap-2 rounded-lg border border-emerald-900/35 bg-emerald-950/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      role="region"
      aria-label="Welcome back"
    >
      <p className="text-sm font-medium leading-snug text-emerald-100/95">
        We thought of you — your agreements and records are still here.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          className="vs01-btn vs01-btn--primary min-h-[2.5rem] px-4 text-sm"
          onClick={() => {
            acknowledgeReEngagementTouch();
            dismissReEngagementBanner("workspace", "winback");
            onDismiss();
            navigate("/app/create");
          }}
        >
          Continue
        </button>
        <button
          type="button"
          className="text-xs text-slate-500 underline-offset-2 hover:text-slate-400 hover:underline"
          onClick={() => {
            dismissReEngagementBanner("workspace", "winback");
            onDismiss();
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
