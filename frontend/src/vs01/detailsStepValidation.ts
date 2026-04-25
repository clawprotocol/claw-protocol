import type { Vs01Counterparty } from "./types";

/** Stable key for “other signer” name field errors (binds to a concrete row). */
export function counterpartyNameErrorKey(counterpartyId: string): string {
  return `counterpartyName:${counterpartyId}`;
}

/** Enough to catch obvious mistakes; not exhaustive RFC validation. */
export function isPlausibleEmail(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Single source of truth for “Who needs to sign?” required fields:
 * agreement title, your name, your email, at least one other signer name.
 */
export function buildDetailsStepFieldErrors(
  agreementTitle: string,
  creatorName: string,
  creatorEmail: string,
  counterparties: Vs01Counterparty[]
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!agreementTitle.trim()) {
    errors.agreementTitle = "Agreement title is required";
  }
  if (!creatorName.trim()) {
    errors.creatorName = "Your name is required";
  }
  const em = creatorEmail.trim();
  if (!em) {
    errors.creatorEmail = "Your email is required";
  } else if (!isPlausibleEmail(creatorEmail)) {
    errors.creatorEmail = "Enter a valid email address";
  }
  const hasNamedSigner = counterparties.some((c) => c.name.trim().length > 0);
  if (!hasNamedSigner) {
    const first = counterparties[0];
    if (first?.id) {
      errors[counterpartyNameErrorKey(first.id)] = "Add at least one signer name";
    }
  }
  return errors;
}

export function detailsStepIsValid(
  agreementTitle: string,
  creatorName: string,
  creatorEmail: string,
  counterparties: Vs01Counterparty[]
): boolean {
  return (
    Object.keys(buildDetailsStepFieldErrors(agreementTitle, creatorName, creatorEmail, counterparties)).length === 0
  );
}

/** CSS selector for the first invalid control (title → your name → your email → first row with a name error). */
export function firstDetailsErrorFieldSelector(
  counterparties: Vs01Counterparty[],
  errors: Record<string, string>
): string | null {
  if (errors.agreementTitle) return `[data-vs01-details-field="agreementTitle"]`;
  if (errors.creatorName) return `[data-vs01-details-field="creatorName"]`;
  if (errors.creatorEmail) return `[data-vs01-details-field="creatorEmail"]`;
  for (const c of counterparties) {
    const k = counterpartyNameErrorKey(c.id);
    if (errors[k]) {
      const esc =
        typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(c.id) : c.id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `[data-vs01-details-field="counterpartyName"][data-counterparty-id="${esc}"]`;
    }
  }
  return null;
}

export function scrollFocusFirstDetailsFieldError(
  counterparties: Vs01Counterparty[],
  errors: Record<string, string>
): void {
  const sel = firstDetailsErrorFieldSelector(counterparties, errors);
  if (!sel) return;
  requestAnimationFrame(() => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      window.setTimeout(() => {
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      }, 350);
    }
  });
}
