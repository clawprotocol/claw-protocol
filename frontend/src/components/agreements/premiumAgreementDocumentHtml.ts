/**
 * Builds safe HTML for the premium read-only agreement preview (escaped user text + trusted template inserts).
 */

import type { PremiumDocumentRenderHints } from "./premiumDocumentRenderHints";
import { findSignatureRegionStart } from "./guidedDealCompletion/signatureRegion";
import { corpusHasHydratedSignatureBlock } from "./guidedDealCompletion/signatureRegion";
import { forbidPaidProExecutionBlockSynthesis } from "./paidProExecutionBlockAuthority";
import { sanitizeProReviewDisplayText } from "./polishProAgreementDisplayLayer";
import { premiumRenderHintsWithoutDocumentCallouts } from "./premiumDocumentIntelligenceStrip";
import {
  applyPaidProReviewRenderSanitizer,
  resolvePartiesForReviewRender,
} from "./paidProReviewRenderCorpus";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";

export function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Numbered section labels from buildAgreementPreviewText (e.g. "1. SCOPE OF SERVICES · PURPOSE"). */
const SECTION_HEADING = /^\d+\.\s+[A-Z0-9 ·\/—–'\-,&]+$/;

function isStandaloneTitleLine(s: string): boolean {
  const t = s.trim();
  if (t.length < 4 || t.length > 96) return false;
  if (/^\d+\./.test(t)) return false;
  if (/[a-z]/.test(t)) return false;
  return /^[A-Z]/.test(t);
}

function premiumCallout(text: string): string {
  return `<p class="premium-doc-callout" role="note">${escapeHtml(text)}</p>`;
}

function premiumCalloutInline(text: string): string {
  return `<span class="premium-doc-callout-inline" role="note">${escapeHtml(text)}</span>`;
}

const SIGNATURE_PARTY_HEADER_RE = /^(?:CLIENT|SERVICE\s+PROVIDER|PARTY\s+\d+)\s*:?\s*$/i;
const SIGNATURE_NOTICE_EMAIL_RE = /^email(?:\s+for\s+notices?)?\s*:/i;
const SIGNATURE_ENTITY_LINE_RE =
  /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\b/i;

/** Display-only: signature region lines use uniform legal-document weight (no per-field bold). */
function formatSignatureRegionLineHtml(line: string): string {
  return escapeHtml(line);
}

function paragraphClassForSignatureChunk(chunk: string, inSignatureRegion: boolean): string | null {
  if (!inSignatureRegion) return null;
  const firstLine = chunk.split("\n")[0]?.trim() ?? "";
  if (SIGNATURE_PARTY_HEADER_RE.test(firstLine)) return "premium-doc-signature-party-start";
  if (
    firstLine.length >= 4 &&
    firstLine.length <= 120 &&
    SIGNATURE_ENTITY_LINE_RE.test(firstLine) &&
    !/^(?:by|name|title|date|email|address|signature)\s*:/i.test(firstLine)
  ) {
    return "premium-doc-signature-entity-name";
  }
  if (SIGNATURE_NOTICE_EMAIL_RE.test(firstLine)) return "premium-doc-signature-notice";
  if (/^(?:by|name|title|date|address|signature)\s*:/i.test(firstLine)) {
    return "premium-doc-signature-field";
  }
  return null;
}

export type PremiumSignatureSectionMode = "collaboration" | "execution";

function formatSignerDisplayName(raw: string, index: number): { primary: string; sub: string } {
  const t = (raw || "").trim();
  const letter = String.fromCharCode(65 + Math.min(index, 25));
  if (!t || /^party\s*[a-z]$/i.test(t) || t.length < 2) {
    return {
      primary: `Party ${letter} / Authorized Signer`,
      sub: "Sign below on behalf of the party named in the agreement body.",
    };
  }
  return { primary: t, sub: "Authorized Signer" };
}

/**
 * Formal fallback signature block at the end of the LawDog Pro read-only paper.
 * `execution` adds initials emphasis and execution-ready framing (Ready for Signature path).
 */
export function buildPremiumSignatureSectionHtml(
  partyNames: readonly string[],
  mode: PremiumSignatureSectionMode,
): string {
  const names = partyNames.length > 0 ? [...partyNames] : ["Party A", "Party B"];
  const formatted = names.map((name, index) => formatSignerDisplayName(name, index));
  const head =
    mode === "execution"
      ? "Execution — Signatures"
      : "Signatures";
  const lead =
    mode === "execution"
      ? "The parties intend to execute this Agreement. Initials and full signatures are placed in tracked e-sign when you send. Review and add signers in the next step — nothing is sent from this page."
      : "The parties intend to execute this Agreement. The lines below mirror a traditional signature page; tracked e-sign and signer routing are completed when you send. Next: add recipients or reviewers in the following step.";

  const line = (label: string) => `
    <div style="margin:0.65rem 0 0">
      <p style="font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#78716c;margin:0 0 0.2rem">${label}</p>
      <div style="border-bottom:1.5px solid #44403c;height:1.85rem"></div>
    </div>`;

  const initialsBlock =
    mode === "execution"
      ? `<div>
      <div style="border:1px dashed #a8a29e;height:2.2rem;border-radius:4px;background:#fafaf9;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6)"></div>
      <p style="font-size:9px;color:#78716c;margin:0.3rem 0 0;text-align:center;letter-spacing:0.06em;text-transform:uppercase">Initials</p>
    </div>`
      : "";

  const signerBlock = (primary: string, sub: string, isLast: boolean) => {
    const showInitials = mode === "execution";
    const gridCols = showInitials ? "minmax(0,1fr) 100px" : "minmax(0,1fr)";
    return `
    <div style="margin-bottom:${isLast ? "0" : "1.75rem"};padding-bottom:${isLast ? "0" : "1.5rem"};border-bottom:${isLast ? "none" : "1px solid rgba(68,64,60,0.12)"}">
      <p style="font-size:13px;font-weight:600;color:#1c1917;margin:0 0 0.15rem;line-height:1.35">${primary}</p>
      <p style="font-size:11px;color:#57534d;margin:0 0 0.9rem;line-height:1.45;max-width:40rem">${sub}</p>
      <div style="display:grid;grid-template-columns:${gridCols};gap:1rem;align-items:start;max-width:36rem">
        <div>
          ${line("Signature")}
          ${line("Print name")}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem 1rem;margin-top:0.65rem">
            <div>
              <p style="font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#78716c;margin:0 0 0.2rem">Title</p>
              <div style="border-bottom:1.5px solid #c4c0b8;height:1.5rem"></div>
            </div>
            <div>
              <p style="font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#78716c;margin:0 0 0.2rem">Date</p>
              <div style="border-bottom:1.5px solid #c4c0b8;height:1.5rem"></div>
            </div>
          </div>
        </div>
        ${initialsBlock}
      </div>
    </div>`;
  };

  return `
<section class="claw-premium-signature-section" style="clear:both;margin-top:2.75rem;padding-top:1.75rem;border-top:1px solid rgba(28,25,23,0.1)">
  <h2 style="font-size:0.72rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#292524;margin:0 0 0.75rem;line-height:1.45;padding-bottom:0.2rem;border-bottom:1px solid rgba(28,25,23,0.12)">${escapeHtml(
    head,
  )}</h2>
  <p style="font-size:12px;color:#44403c;margin:0 0 1.35rem;line-height:1.65;max-width:44rem;text-align:left">${escapeHtml(lead)}</p>
  <div style="margin-left:-0.125rem;margin-right:-0.125rem;padding:1.5rem 1.25rem 1.35rem;border-radius:5px;border:1px solid #d6d3cd;background:linear-gradient(180deg,#f6f2e8 0%,#efe9de 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.65),0 6px 20px -8px rgba(28,25,23,0.12)">
    ${formatted
      .map((f, index) =>
        signerBlock(escapeHtml(f.primary), escapeHtml(f.sub), index === formatted.length - 1),
      )
      .join("")}
  </div>
</section>`;
}

export type BuildPremiumAgreementReadonlyHtmlOpts = {
  /**
   * Send for Review vs Ready for Signature: execution mode uses slightly stronger execution framing
   * and initials markers.
   */
  signatureSectionMode: PremiumSignatureSectionMode;
  partyNames: readonly string[];
  renderHints?: PremiumDocumentRenderHints | null;
  /** Guided Pro final review: never append decorative signature cards when corpus was rebuilt. */
  forceEmbeddedCorpusSignature?: boolean;
  /**
   * Canonical Pro review: signer cards / VS01 own execution — strip inline signature tails from the
   * readonly body and do not render embedded or decorative signature blocks in the document.
   */
  suppressCorpusEmbeddedSignatureForDisplay?: boolean;
  /** Final paid Pro review: omit situation-intelligence callouts from the agreement paper. */
  suppressDocumentIntelligenceCallouts?: boolean;
};

/** Remove signature tails when external signer UI owns execution blocks. */
export function stripCorpusSignatureRegionForExternalSignerUi(plain: string): string {
  const raw = (plain || "").replace(/\r\n/g, "\n").trimEnd();
  if (!raw) return "";
  const start = findSignatureRegionStart(raw);
  let body = start >= 0 ? raw.slice(0, start).trimEnd() : raw;
  body = body
    .replace(/\n\s*[^\n]{0,120}\bas of the\s*$/i, "")
    .replace(/\n\s*(?:By|Name|Title|Date|Email|Signature)\s*:\s*_{2,}\s*$/gim, "")
    .trimEnd();
  return body;
}

export type PremiumSignaturePreviewMode =
  | "embedded_corpus_signature_block"
  | "decorative_fallback_signature_card";

export function resolvePremiumSignaturePreviewMode(
  plain: string,
  signerCount: number,
  opts?: { forceEmbeddedCorpusSignature?: boolean },
): { mode: PremiumSignaturePreviewMode; hasCorpusSignatureBlock: boolean; signerCount: number } {
  const count = Math.max(1, signerCount);
  const hasCorpusSignatureBlock = corpusHasHydratedSignatureBlock(plain, count);
  const forceEmbedded = Boolean(opts?.forceEmbeddedCorpusSignature);
  return {
    mode:
      hasCorpusSignatureBlock || forceEmbedded
        ? "embedded_corpus_signature_block"
        : "decorative_fallback_signature_card",
    hasCorpusSignatureBlock: hasCorpusSignatureBlock || forceEmbedded,
    signerCount: count,
  };
}

let lastSignaturePreviewModeLogKey = "";

export function resetSignaturePreviewModeLogDedupeForTests(): void {
  lastSignaturePreviewModeLogKey = "";
}

export function logSignaturePreviewMode(payload: {
  mode: PremiumSignaturePreviewMode;
  hasCorpusSignatureBlock: boolean;
  signerCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${payload.mode}:${payload.hasCorpusSignatureBlock}:${payload.signerCount}`;
  if (key === lastSignaturePreviewModeLogKey) return;
  lastSignaturePreviewModeLogKey = key;
  // eslint-disable-next-line no-console
  console.info("[signature-preview-mode]", payload);
}

/**
 * Convert plain agreement body (from `agreementDocumentText` or picked corpus) to HTML paragraphs and headings.
 * Uses the embedded corpus signature block when present; otherwise appends a professional fallback section.
 */
/** Remove free-tier starter disclaimer lines that must not appear on Pro paper or PDF exports. */
export function stripStarterPreviewDisclaimerFromPlainText(plain: string): string {
  const lines = (plain || "").replace(/\r\n/g, "\n").split("\n");
  const filtered = lines.filter((ln) => {
    const t = ln.trim().toLowerCase();
    if (!t) return true;
    if (t.includes("simplified starter preview")) return false;
    if (t.includes("starter preview only")) return false;
    return true;
  });
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function buildPremiumAgreementReadonlyHtml(
  plain: string,
  opts: BuildPremiumAgreementReadonlyHtmlOpts,
): string {
  if (!(plain || "").trim()) return "";
  const hints = opts.suppressDocumentIntelligenceCallouts
    ? premiumRenderHintsWithoutDocumentCallouts(opts.renderHints)
    : (opts.renderHints ?? null);
  let raw = stripStarterPreviewDisclaimerFromPlainText((plain || "").replace(/\r\n/g, "\n")).trimEnd();
  if (
    hasPaidProSourceOfTruth() &&
    (opts.forceEmbeddedCorpusSignature || opts.suppressDocumentIntelligenceCallouts)
  ) {
    const parties = resolvePartiesForReviewRender();
    if (parties.length >= 2) {
      raw = applyPaidProReviewRenderSanitizer(raw, parties).text;
    }
  }
  if (opts.suppressCorpusEmbeddedSignatureForDisplay) {
    raw = stripCorpusSignatureRegionForExternalSignerUi(raw);
    raw = sanitizeProReviewDisplayText(raw, {
      source: "premium_agreement_readonly_html",
    }).text;
  }
  const chunks = raw.split(/\n\n+/);
  const out: string[] = [];
  const signatureRegionStart = findSignatureRegionStart(raw);
  let chunkOffset = 0;

  for (const part of chunks) {
    const chunk = part.trim();
    if (!chunk) {
      chunkOffset += part.length + 2;
      continue;
    }
    const inSignatureRegion = signatureRegionStart >= 0 && chunkOffset >= signatureRegionStart;
    chunkOffset += part.length + 2;
    const lines = chunk.split("\n");
    const oneLine = lines.length === 1;

    if (oneLine && inSignatureRegion && SIGNATURE_PARTY_HEADER_RE.test(chunk)) {
      out.push(`<p class="premium-doc-signature-party-start">${escapeHtml(chunk)}</p>`);
      continue;
    }
    if (oneLine && SECTION_HEADING.test(chunk)) {
      out.push(`<h2>${escapeHtml(chunk)}</h2>`);
      if (hints?.paymentNeedsFinalNumbers && /^2\.\s+PAYMENT\b/i.test(chunk)) {
        out.push(
          premiumCallout("Confirm amounts, payment cadence, and tax treatment here before you send."),
        );
      }
      if (hints?.jurisdictionNeedsSelection && /^4\.\s+GOVERNING\b/i.test(chunk)) {
        out.push(premiumCallout("Select jurisdiction before signing."));
      }
      continue;
    }
    if (oneLine && isStandaloneTitleLine(chunk) && !(inSignatureRegion && SIGNATURE_PARTY_HEADER_RE.test(chunk))) {
      out.push(`<h1>${escapeHtml(chunk)}</h1>`);
      if (hints?.executiveFramingLine) {
        out.push(premiumCallout(hints.executiveFramingLine));
      }
      if (hints?.contradictionDocumentNote) {
        out.push(premiumCallout(hints.contradictionDocumentNote));
      }
      if (hints?.partiesNeedLegalNames) {
        out.push(premiumCallout("Replace legal entity names before sending."));
      }
      continue;
    }
    const inner = inSignatureRegion
      ? lines.map((ln) => formatSignatureRegionLineHtml(ln)).join("<br />")
      : lines.map((ln) => escapeHtml(ln)).join("<br />");
    const sigClass = paragraphClassForSignatureChunk(chunk, inSignatureRegion);
    out.push(sigClass ? `<p class="${sigClass}">${inner}</p>` : `<p>${inner}</p>`);
  }

  let html = out.join("\n");
  if (hints?.jurisdictionNeedsSelection && !/<h2>4\.\s+[^<]*GOVERNING/i.test(html)) {
    html = html.replace(
      /(<p>[\s\S]*?)(To be selected in review\.)/i,
      (_m, before, mid) => `${before}${mid}${premiumCalloutInline("Select jurisdiction before signing.")}`,
    );
  }
  if (opts.suppressCorpusEmbeddedSignatureForDisplay) {
    logSignaturePreviewMode({
      mode: "decorative_fallback_signature_card",
      hasCorpusSignatureBlock: false,
      signerCount: opts.partyNames.length,
    });
    return html;
  }
  const forceEmbeddedFromAuthority =
    hasPaidProSourceOfTruth() && forbidPaidProExecutionBlockSynthesis(raw, opts.partyNames.length);
  const previewMode = resolvePremiumSignaturePreviewMode(raw, opts.partyNames.length, {
    forceEmbeddedCorpusSignature: opts.forceEmbeddedCorpusSignature || forceEmbeddedFromAuthority,
  });
  logSignaturePreviewMode(previewMode);
  if (
    previewMode.mode === "decorative_fallback_signature_card" &&
    !forceEmbeddedFromAuthority
  ) {
    html += buildPremiumSignatureSectionHtml(opts.partyNames, opts.signatureSectionMode);
  }
  return html;
}
