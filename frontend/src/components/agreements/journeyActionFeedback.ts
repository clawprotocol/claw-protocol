/**
 * Customer-facing success / remainder / next-step copy after consequential actions.
 * Deterministic — the model may not claim an operation succeeded.
 */

export type JourneyActionKind = "working" | "succeeded" | "blocked" | "failed";

export type JourneyActionFeedback = {
  kind: JourneyActionKind;
  actionId: string;
  title: string;
  body: string;
  remedyLabel?: string;
  focusSelector?: string;
};

export const JOURNEY_ACTION_FLASH_EVENT = "claw:journey-action-flash";
const JOURNEY_ACTION_FLASH_KEY = "claw_journey_action_flash_v1";
const JOURNEY_ACTION_FLASH_TTL_MS = 10 * 60 * 1000;

type JourneyActionFlashRecord = {
  feedback: JourneyActionFeedback;
  createdAt: number;
};

function validJourneyActionFeedback(value: unknown): value is JourneyActionFeedback {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<JourneyActionFeedback>;
  return (
    ["working", "succeeded", "blocked", "failed"].includes(String(candidate.kind)) &&
    typeof candidate.actionId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.body === "string"
  );
}

/** Publish feedback that must remain visible after an SPA route transition. */
export function publishJourneyActionFlash(feedback: JourneyActionFeedback): void {
  if (typeof window === "undefined") return;
  const record: JourneyActionFlashRecord = { feedback, createdAt: Date.now() };
  try {
    window.sessionStorage.setItem(JOURNEY_ACTION_FLASH_KEY, JSON.stringify(record));
  } catch {
    /* the in-memory event still delivers feedback when storage is unavailable */
  }
  window.dispatchEvent(new CustomEvent<JourneyActionFeedback>(JOURNEY_ACTION_FLASH_EVENT, { detail: feedback }));
}

export function readJourneyActionFlash(): JourneyActionFeedback | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(JOURNEY_ACTION_FLASH_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<JourneyActionFlashRecord>;
    if (
      typeof record.createdAt !== "number" ||
      Date.now() - record.createdAt > JOURNEY_ACTION_FLASH_TTL_MS ||
      !validJourneyActionFeedback(record.feedback)
    ) {
      window.sessionStorage.removeItem(JOURNEY_ACTION_FLASH_KEY);
      return null;
    }
    return record.feedback;
  } catch {
    return null;
  }
}

export function clearJourneyActionFlash(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(JOURNEY_ACTION_FLASH_KEY);
  } catch {
    /* no-op */
  }
}

export function feedbackWorking(actionId: string, title: string, body: string): JourneyActionFeedback {
  return { kind: "working", actionId, title, body };
}

export function feedbackSucceeded(actionId: string, title: string, body: string): JourneyActionFeedback {
  return { kind: "succeeded", actionId, title, body };
}

export function feedbackBlocked(
  actionId: string,
  title: string,
  body: string,
  opts?: { remedyLabel?: string; focusSelector?: string },
): JourneyActionFeedback {
  return {
    kind: "blocked",
    actionId,
    title,
    body,
    remedyLabel: opts?.remedyLabel,
    focusSelector: opts?.focusSelector,
  };
}

export function feedbackFailed(actionId: string, title: string, body: string, opts?: { remedyLabel?: string }): JourneyActionFeedback {
  return { kind: "failed", actionId, title, body, remedyLabel: opts?.remedyLabel };
}

export function feedbackAfterDirectSave(): string {
  return "Changes saved. The agreement text is updated. Review or signature links were not created.";
}

export function feedbackAfterDirectSaveFailed(): string {
  return "The save did not complete. Your unsaved text is still in the editor. Try saving again.";
}

export function feedbackAfterModelFailure(): string {
  return "Your information is unchanged.";
}

export function feedbackAfterFailedCreate(safeReason?: string | null): JourneyActionFeedback {
  const reason = (safeReason || "").trim();
  const body = reason
    ? `Your information is unchanged. ${reason}`
    : "Your information is unchanged.";
  return feedbackFailed("create_agreement", "LawDog couldn't create the agreement.", body, {
    remedyLabel: "Retry",
  });
}

export function feedbackLinksInvalidated(): string {
  return "The agreement text changed after links were created. Those links are no longer valid. Create new links for this version.";
}

export function feedbackCreatingAgreement(): JourneyActionFeedback {
  return feedbackWorking("create_agreement", "Creating agreement", "Creating your agreement. This can take a moment — don’t tap Create again.");
}

export function feedbackCreatingLinks(kind: "review" | "signing"): JourneyActionFeedback {
  const what = kind === "review" ? "review links" : "signing links";
  return feedbackWorking("create_links", "Creating links", `Creating ${what}. Don’t tap the button again until this finishes.`);
}

export function feedbackAfterGeneration(args: {
  captured: readonly string[];
  confirmBeforeSignature?: string | null;
}): string {
  const captured = args.captured.filter(Boolean);
  const capturedLine =
    captured.length > 0
      ? `We captured the ${joinList(captured)}.`
      : "We captured the details you provided.";
  const confirm = (args.confirmBeforeSignature || "").trim();
  const next = confirm
    ? ` ${confirm.replace(/\.*$/, "")} before sending for signature.`
    : " Review the draft, then choose review or signature.";
  return `Agreement created. ${capturedLine}${next}`;
}

export function feedbackAfterEdit(sectionLabel: string, otherSectionsChanged: boolean): string {
  const section = sectionLabel.trim() || "A section";
  if (otherSectionsChanged) return `${section} was updated. Review the rest of the draft for related changes.`;
  return `${section} was updated. No other sections changed.`;
}

export function feedbackAfterPartyAdded(partyName: string, slot: number): string {
  const name = partyName.trim() || `Party ${slot}`;
  return `${name} was added as Party ${slot}. Add its authorized signer before creating signing links.`;
}

export function feedbackAfterReviewLinksCreated(count: number): string {
  const n = Math.max(0, count);
  const noun = n === 1 ? "private review link was" : "private review links were";
  return `${formatCount(n)} ${noun} created. Nothing was emailed. Copy and share each link when ready.`;
}

export function feedbackAfterReviewLinksAlreadyReady(): string {
  return "Existing review links were kept. Nothing new was created.";
}

export function feedbackAfterSigningLinksCreated(count: number): string {
  const n = Math.max(0, count);
  const noun = n === 1 ? "private signing link was" : "private signing links were";
  return `${formatCount(n)} ${noun} created. Nothing was emailed. Each signer receives a different link.`;
}

export function feedbackAfterLinkFailure(args: {
  kind: "review" | "signing";
  saved: boolean;
  fieldRemedy: string;
}): string {
  const what = args.kind === "review" ? "Review links" : "Signing links";
  const saved = args.saved
    ? " Your agreement and signer details are saved."
    : " Your agreement details are saved.";
  return `${what} were not created.${saved} ${args.fieldRemedy.trim()} and try again.`;
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function formatCount(n: number): string {
  if (n === 0) return "No";
  if (n === 1) return "One";
  if (n === 2) return "Two";
  if (n === 3) return "Three";
  if (n === 4) return "Four";
  return String(n);
}
