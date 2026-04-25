/**
 * Builds safe HTML for the premium read-only agreement preview (escaped user text + trusted template inserts).
 */

import type { PremiumDocumentRenderHints } from "./premiumDocumentRenderHints";

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

export type PremiumSignatureSectionMode = "collaboration" | "execution";

function formatSignerDisplayName(raw: string, slot: "A" | "B"): { primary: string; sub: string } {
  const t = (raw || "").trim();
  if (!t || /^party\s*a$/i.test(t) || /^party\s*b$/i.test(t) || t.length < 2) {
    return {
      primary: slot === "A" ? "Party A / Authorized Signer" : "Party B / Authorized Signer",
      sub: "Sign below on behalf of the party named in the agreement body.",
    };
  }
  return { primary: t, sub: "Authorized Signer" };
}

/**
 * Formal signature block at the end of the LawDog Pro read-only paper (always shown).
 * `execution` adds initials emphasis and execution-ready framing (Ready for Signature path).
 */
export function buildPremiumSignatureSectionHtml(
  partyNameA: string,
  partyNameB: string,
  mode: PremiumSignatureSectionMode,
): string {
  const a = formatSignerDisplayName(partyNameA, "A");
  const b = formatSignerDisplayName(partyNameB, "B");
  const ap = escapeHtml(a.primary);
  const asub = escapeHtml(a.sub);
  const bp = escapeHtml(b.primary);
  const bsub = escapeHtml(b.sub);
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
  <p style="font-size:12px;color:#44403c;margin:0 0 1.35rem;line-height:1.65;max-width:44rem;text-align:justify">${escapeHtml(lead)}</p>
  <div style="margin-left:-0.125rem;margin-right:-0.125rem;padding:1.5rem 1.25rem 1.35rem;border-radius:5px;border:1px solid #d6d3cd;background:linear-gradient(180deg,#f6f2e8 0%,#efe9de 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.65),0 6px 20px -8px rgba(28,25,23,0.12)">
    ${signerBlock(ap, asub, false)}
    ${signerBlock(bp, bsub, true)}
  </div>
</section>`;
}

export type BuildPremiumAgreementReadonlyHtmlOpts = {
  /**
   * Send for Review vs Ready for Signature: execution mode uses slightly stronger execution framing
   * and initials markers.
   */
  signatureSectionMode: PremiumSignatureSectionMode;
  partyNameA: string;
  partyNameB: string;
  renderHints?: PremiumDocumentRenderHints | null;
};

/**
 * Convert plain agreement body (from `agreementDocumentText` or picked corpus) to HTML paragraphs and headings.
 * Always appends a professional signature section inside the paper document.
 */
export function buildPremiumAgreementReadonlyHtml(
  plain: string,
  opts: BuildPremiumAgreementReadonlyHtmlOpts,
): string {
  const hints = opts.renderHints ?? null;
  const raw = (plain || "").replace(/\r\n/g, "\n").trimEnd();
  const chunks = raw.split(/\n\n+/);
  const out: string[] = [];

  for (const part of chunks) {
    const chunk = part.trim();
    if (!chunk) continue;
    const lines = chunk.split("\n");
    const oneLine = lines.length === 1;

    if (oneLine && SECTION_HEADING.test(chunk)) {
      out.push(`<h2>${escapeHtml(chunk)}</h2>`);
      if (hints?.paymentNeedsFinalNumbers && /^2\.\s+PAYMENT\b/i.test(chunk)) {
        out.push(premiumCallout("Needs final numbers — confirm amounts, cadence, and tax treatment before send."));
      }
      if (hints?.jurisdictionNeedsSelection && /^4\.\s+GOVERNING\b/i.test(chunk)) {
        out.push(premiumCallout("Select jurisdiction before signing."));
      }
      continue;
    }
    if (oneLine && isStandaloneTitleLine(chunk)) {
      out.push(`<h1>${escapeHtml(chunk)}</h1>`);
      if (hints?.partiesNeedLegalNames) {
        out.push(premiumCallout("Replace legal names before sending."));
      }
      continue;
    }
    const inner = lines.map((ln) => escapeHtml(ln)).join("<br />");
    out.push(`<p>${inner}</p>`);
  }

  let html = out.join("\n");
  if (hints?.jurisdictionNeedsSelection && !/<h2>4\.\s+[^<]*GOVERNING/i.test(html)) {
    html = html.replace(
      /(<p>[\s\S]*?)(To be selected in review\.)/i,
      (_m, before, mid) => `${before}${mid}${premiumCalloutInline("Select jurisdiction before signing.")}`,
    );
  }
  html += buildPremiumSignatureSectionHtml(opts.partyNameA, opts.partyNameB, opts.signatureSectionMode);
  return html;
}
