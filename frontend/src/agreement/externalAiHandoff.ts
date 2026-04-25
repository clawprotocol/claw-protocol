/**
 * Helpers for exporting agreement text to external LLMs (clipboard only; no API calls).
 */

import type { AgreementDraft } from "./agreementTypes";
import type { ClauseFrictionId } from "../vs01/negotiationPatterns";

export function htmlToPlainText(html: string): string {
  const raw = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  if (typeof document === "undefined") {
    return raw
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const d = document.createElement("div");
  d.innerHTML = raw;
  return (d.textContent || d.innerText || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function draftExcerptForClause(draft: AgreementDraft, clause: ClauseFrictionId): string {
  switch (clause) {
    case "payment_terms":
      return ["Payment terms (current draft field):", String(draft.payment_terms ?? "").trim()].join("\n");
    case "duration":
      return ["Term / duration:", String(draft.duration ?? "").trim()].join("\n");
    case "scope":
      return ["Scope / purpose:", String(draft.purpose ?? "").trim()].join("\n");
    case "termination":
      return [
        "Termination-related fields (draft):",
        `Duration: ${String(draft.duration ?? "").trim()}`,
        `Purpose: ${String(draft.purpose ?? "").trim()}`,
      ].join("\n");
    case "confidentiality":
      return ["Confidentiality context (from purpose / scope text):", String(draft.purpose ?? "").trim()].join("\n");
    case "governing_law":
      return ["Governing law / jurisdiction:", String(draft.jurisdiction ?? "").trim()].join("\n");
    case "other":
    default:
      return [
        "Agreement excerpt (administrative / general):",
        `Title: ${String(draft.title ?? "").trim()}`,
        `Purpose: ${String(draft.purpose ?? "").trim()}`,
      ].join("\n");
  }
}
