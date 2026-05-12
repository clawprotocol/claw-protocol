/**
 * Client-side mirror of backend `_render_html` for agreements_v2_api.py so recipient
 * whole-document preview matches server rendering without calling `/revise`.
 */

import type { AgreementDraft } from "./agreementTypes";
import { normalizeJurisdictionDisplay } from "./jurisdictionNormalize";
import { formatLegalPartyList } from "../components/agreements/formatLegalPartyList";

const INTERNAL_PARTY_REF_RE = /\s*[\[(]?\s*(?:ORG|PARTY|CLIENT|COMPANY)_\d+\s*[\])]?\s*/gi;

function stripInternalPartyRefsFromName(name: string): string {
  const s = (name || "").trim();
  if (!s) return "";
  const cleaned = s.replace(INTERNAL_PARTY_REF_RE, " ");
  return cleaned.replace(/\s+/g, " ").trim();
}


function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Mirrors backend `_purpose_looks_like_full_client_agreement_text`. */
export function purposeLooksLikeFullAgreementTextForRender(purpose: string): boolean {
  const t = (purpose || "").trim();
  if (t.length >= 2400) return true;
  if (t.length < 240) return false;
  const low = t.toLowerCase();
  if (low.includes("this draft agreement preview is generated from your structured fields")) return true;
  if (low.includes("this draft llc operating agreement preview is generated")) return true;
  if (low.includes("by and between") && (low.includes("\n2. payment terms\n") || low.includes("\n2. payment terms\r\n")))
    return true;
  return false;
}

/**
 * Renders agreement HTML the same way the API does for preview (no watermark footer).
 * Used for recipient whole-document compare when skipping `/revise`.
 */
export function renderAgreementDraftHtmlLikeBackend(draft: AgreementDraft): string {
  const purposeRaw = (draft.purpose || "").trim();
  if (purposeLooksLikeFullAgreementTextForRender(purposeRaw)) {
    const body = escapeHtml(purposeRaw);
    return (
      "<article style='position:relative;max-width:720px;margin:0 auto'>" +
      "<p style='text-align:center;color:#475569;font-size:12px;margin-bottom:12px'>" +
      "Draft Agreement (non-binding template)</p>" +
      "<pre style='white-space:pre-wrap;font-family:Georgia,serif;font-size:15px;line-height:1.65;" +
      "color:#0f172a;margin:0;padding:0;border:0;background:transparent'>" +
      body +
      "</pre>" +
      "<p style='margin-top:18px;font-size:12px;color:#475569;text-align:center'>" +
      "Execution and signature placement are handled in the electronic signing step." +
      "</p>" +
      "</article>"
    );
  }

  const title = escapeHtml((draft.title || "").trim() || "Agreement");
  const jurisdictionRaw = (draft.jurisdiction || "").trim() || "TBD";
  const jurisdiction = escapeHtml(normalizeJurisdictionDisplay(jurisdictionRaw) || "TBD");
  const effectiveDate = escapeHtml((draft.effective_date || "").trim() || "TBD");
  const purpose = escapeHtml(purposeRaw || "TBD");
  const paymentTerms = escapeHtml((draft.payment_terms || "").trim() || "TBD");
  const duration = escapeHtml((draft.duration || "").trim() || "TBD");
  const dueDate = escapeHtml((draft.due_date || "").trim() || "TBD");
  const partiesForFormat = (draft.parties || []).map((p, idx) => {
    const rawName = stripInternalPartyRefsFromName((p?.name || "").trim());
    const name = rawName || (idx === 0 ? "Party A" : "Party B");
    const role = (p?.role || "").trim() || "party";
    return { name, role };
  });
  const partyListHtml = escapeHtml(formatLegalPartyList(partiesForFormat));
  const partyAName = escapeHtml(partiesForFormat[0]?.name || "Party A");
  const partyBName = escapeHtml(partiesForFormat[1]?.name || "Party B");

  return (
    "<article style='position:relative'>" +
    `<h1 style='text-align:center;margin-bottom:6px'>${title}</h1>` +
    "<p style='text-align:center;margin-top:0;color:#475569'>Draft Agreement (non-binding template)</p>" +
    `<p>This ${title} (the "Agreement") is made effective as of ${effectiveDate}, by and between ` +
    `${partyListHtml}. The parties agree as follows:</p>` +
    "<h2>1. Scope of Services</h2>" +
    `<p>${purpose}. The service provider will perform the services in a professional and workmanlike manner and ` +
    "will keep the client reasonably informed regarding project progress.</p>" +
    "<h2>2. Compensation</h2>" +
    `<p>In consideration for the services, compensation is as follows: ${paymentTerms}.</p>` +
    "<h2>3. Payment Terms</h2>" +
    `<p>Payments are due according to the agreed schedule. If applicable, final delivery is expected by ${dueDate}. ` +
    "Late payments may be subject to commercially reasonable collection procedures.</p>" +
    "<h2>4. Term and Termination</h2>" +
    `<p>This Agreement begins on the effective date and remains in effect for ${duration}, unless earlier terminated ` +
    "by either party on written notice for material breach or as otherwise agreed in writing.</p>" +
    "<h2>5. Confidentiality</h2>" +
    "<p>Each party shall keep confidential non-public business and technical information disclosed by the other party " +
    "and shall use such information solely for performance under this Agreement.</p>" +
    "<h2>6. Independent Contractor</h2>" +
    "<p>The parties agree that the service provider is an independent contractor and not an employee, partner, or " +
    "agent of the client, except as expressly authorized in writing.</p>" +
    "<h2>7. Governing Law</h2>" +
    `<p>This Agreement is governed by the laws of ${jurisdiction}, without regard to conflict of law principles.</p>` +
    "<h2>8. Signatures</h2>" +
    "<p>IN WITNESS WHEREOF, the parties have executed this Agreement as of the effective date.</p>" +
    "<table style='width:100%;margin-top:16px;border-collapse:collapse'>" +
    "<tr>" +
    `<td style='width:50%;padding-right:12px'><div style='border-bottom:1px solid #64748b;height:28px'></div><div style='font-size:12px;color:#475569'>` +
    `${partyAName} Signature</div><div style='margin-top:8px;border-bottom:1px solid #cbd5e1;height:20px'></div><div style='font-size:12px;color:#475569'>Date</div></td>` +
    `<td style='width:50%;padding-left:12px'><div style='border-bottom:1px solid #64748b;height:28px'></div><div style='font-size:12px;color:#475569'>` +
    `${partyBName} Signature</div><div style='margin-top:8px;border-bottom:1px solid #cbd5e1;height:20px'></div><div style='font-size:12px;color:#475569'>Date</div></td>` +
    "</tr>" +
    "</table>" +
    "</article>"
  );
}
