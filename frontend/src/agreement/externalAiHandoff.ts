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

/**
 * Plain text for legal redline / block parsing: keeps paragraph breaks from block-level HTML.
 * {@link htmlToPlainText} collapses all whitespace and is unsuitable for clause blocking.
 */
export function htmlToPlainTextForLegalRedline(html: string): string {
  let raw = String(html ?? "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  raw = raw
    .replace(/<\/(p|div|section|article|h[1-6]|blockquote|li|tr|thead|tbody|table)\b[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n");
  raw = raw.replace(/<[^>]+>/g, " ");
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/ +/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
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
