import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { SpaLink } from "./SpaLink";
import { LAWDOG_SUPPORT_EMAIL, LAWDOG_SUPPORT_MAILTO } from "./supportContact";

export type LaunchFailureKind =
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "invalid_link"
  | "unavailable";

const DEFAULT_TITLES: Record<LaunchFailureKind, string> = {
  not_found: "Page not found",
  unauthorized: "Sign-in required",
  forbidden: "Access not available",
  invalid_link: "Link unavailable",
  unavailable: "Unavailable",
};

export type LaunchFailureAction = {
  label: string;
  onClick: () => void;
};

export function LaunchFailureState(props: {
  kind: LaunchFailureKind;
  title?: string;
  message: string;
  detail?: string;
  /** Full app shell (default) or compact card for recipient envelopes. */
  variant?: "page" | "envelope";
  showSupport?: boolean;
  primaryAction?: LaunchFailureAction;
  secondaryAction?: LaunchFailureAction;
  children?: ReactNode;
}) {
  const {
    kind,
    title = DEFAULT_TITLES[kind],
    message,
    detail,
    variant = "page",
    showSupport = true,
    primaryAction,
    secondaryAction,
    children,
  } = props;

  const body = (
    <div
      className={variant === "envelope" ? "space-y-4 text-center" : "max-w-md space-y-4"}
      data-testid={`launch-failure-${kind}`}
      role="alert"
    >
      {variant === "envelope" ? (
        <h2 className="vs01-card__title text-rose-200/95">{title}</h2>
      ) : null}
      <p className={variant === "envelope" ? "text-sm text-rose-300" : "text-sm leading-relaxed text-slate-300"}>
        {message}
      </p>
      {detail ? (
        <p className={variant === "envelope" ? "text-sm text-slate-400" : "text-sm leading-relaxed text-slate-400"}>
          {detail}
        </p>
      ) : null}
      {showSupport ? (
        <p className="text-sm text-slate-400">
          Need help?{" "}
          <a
            href={LAWDOG_SUPPORT_MAILTO}
            className="font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
          >
            {LAWDOG_SUPPORT_EMAIL}
          </a>
        </p>
      ) : null}
      {children}
      {(primaryAction || secondaryAction) && (
        <div
          className={
            variant === "envelope"
              ? "flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center"
              : "flex flex-col gap-3 pt-2 sm:flex-row"
          }
        >
          {primaryAction ? (
            <button type="button" className="vs01-btn vs01-btn--primary" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button type="button" className="vs01-btn vs01-btn--secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );

  if (variant === "envelope") {
    return body;
  }

  return (
    <AppShell title={title} subtitle={kind === "not_found" ? "This address is not part of LawDog." : undefined}>
      {body}
      {!primaryAction && !secondaryAction ? (
        <nav className="mt-8 flex flex-wrap gap-3 text-sm">
          <SpaLink to="/" className="font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline">
            Go to home
          </SpaLink>
          <SpaLink
            to="/app/create"
            className="font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
          >
            Create an agreement
          </SpaLink>
        </nav>
      ) : null}
    </AppShell>
  );
}
