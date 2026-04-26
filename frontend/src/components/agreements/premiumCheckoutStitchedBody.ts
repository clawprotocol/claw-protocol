import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PREMIUM_JURISDICTION_PLACEHOLDER, resolvePremiumJurisdiction } from "./premiumDraftTransform";

/**
 * When premium-full-draft is unavailable, build a review-ready body without
 * marketing “preview / thin outline” phrasing, with explicit sections and
 * governing law from intake (e.g. Oklahoma) where possible.
 */
export function buildPremiumPostCheckoutStitchedBody(
  draft: ParsedDraftShape,
  rawIntake: string,
  opts?: { defaultTitle?: string },
): string {
  const d = { ...draft, jurisdiction: resolvePremiumJurisdiction(draft, rawIntake) };
  const raw = (rawIntake || "").trim();
  const p0 = (d.parties?.[0]?.name || "").trim();
  const p1 = (d.parties?.[1]?.name || "").trim();
  const r0 = (d.parties?.[0]?.role || "").trim() || "Party A";
  const r1 = (d.parties?.[1]?.role || "").trim() || "Party B";
  const party0 = p0 && !/^(service provider|client|party\s*a)$/i.test(p0) ? p0 : "";
  const party1 = p1 && !/^(service provider|client|party\s*b)$/i.test(p1) ? p1 : "";
  const entityA = party0 || p0 || "the first party named in the recitals or signature block";
  const entityB = party1 || p1 || "the second party named in the recitals or signature block";
  const title =
    (opts?.defaultTitle || "").trim() ||
    suggestSoftwareDevTitle(d, raw) ||
    (d.title || "").trim() ||
    "Service Agreement";
  const purpose = (d.purpose || "").trim() || "The services, deliverables, and business relationship described in the parties’ discussions and the intake above.";
  const pay = (d.payment_terms || "").trim() || "As stated in the intake, schedules, or statements of work agreed by the parties.";
  const add = (d.additional_terms || "").trim();
  const term = [d.duration, d.due_date, d.effective_date]
    .filter((x): x is string => Boolean(x && String(x).trim()))
    .map((s) => String(s).trim())
    .join("; ") || "As set forth in this Agreement or the parties’ written change orders.";

  let lawGoverning = "";
  const j0 = (d.jurisdiction || "").trim();
  if (/\boklahoma\b/i.test(raw) && (/\bdelaware\b/i.test(j0) || j0 === PREMIUM_JURISDICTION_PLACEHOLDER || !j0)) {
    lawGoverning = "the laws of the State of Oklahoma, without regard to its conflict of law rules";
  } else if (j0 && j0 !== PREMIUM_JURISDICTION_PLACEHOLDER) {
    lawGoverning = `the laws of ${j0}, without regard to its conflict of law rules`;
  } else if (/\boklahoma\b/i.test(raw)) {
    lawGoverning = "the laws of the State of Oklahoma, without regard to its conflict of law rules";
  } else {
    lawGoverning =
      "a jurisdiction the Parties will confirm in a signed amendment (or, if not specified, a forum reasonably related to the Parties and this engagement)";
  }

  const blocks: string[] = [
    [
      title.toUpperCase(),
      "",
      "The following is presented for your review and editing before signing. It is not legal advice; confirm all material details with the other party or counsel.",
    ].join("\n"),
    [
      "1. PARTIES",
      `This Agreement is between ${entityA} (“${r0}” or the first Party) and ${entityB} (“${r1}” or the second Party) (each a “Party,” together the “Parties”).`,
    ].join("\n"),
    ["2. SCOPE", purpose].join("\n\n"),
    ["3. COMPENSATION AND PAYMENT", "Payment and fees shall be as follows unless the Parties agree otherwise in writing:", pay].join("\n\n"),
    ["4. TIMELINE AND MILESTONES", term].join("\n\n"),
    [
      "5. REVISIONS",
      "The Parties will agree in good faith on a reasonable number of revision rounds and change requests; out-of-scope changes may be documented in a change order with adjusted fees or schedule where appropriate.",
    ].join("\n"),
    [
      "6. INTELLECTUAL PROPERTY / WORK PRODUCT",
      "Work product, deliverables, and pre-existing materials shall be allocated as stated in the intake, schedules, or a signed statement of work. Absent a contrary signed agreement, the Parties will follow customary independent-contractor and software-development norms for the described engagement.",
    ].join("\n"),
    [
      "7. CONFIDENTIALITY",
      "The Parties will protect non-public information disclosed in connection with this relationship using reasonable care and will use such information only for the relationship described herein, subject to applicable law and written exceptions.",
    ].join("\n"),
    [
      "8. NOTICES",
      "Notices may be given by email to the addresses the Parties designate, with updates provided in writing.",
    ].join("\n"),
    [
      "9. GOVERNING LAW; VENUE",
      `This Agreement shall be governed by ${lawGoverning}. If the Parties elect courts, exclusive venue may be the state or federal courts in the state whose laws govern, unless the Parties agree otherwise in writing before execution.`,
    ].join("\n"),
    [
      "10. E-SIGNATURES; COUNTERPARTS",
      "The Parties may execute this Agreement and counterparts by electronic or digital means; taken together, counterparts form one agreement.",
    ].join("\n"),
  ];
  if (add) {
    blocks.push(["11. ADDITIONAL TERMS", add].join("\n\n"));
  }
  blocks.push(
    [
      "SIGNATURES",
      "",
      "______________________________  Date: __________",
      `Name: ${entityA}    Title: __________`,
      "",
      "______________________________  Date: __________",
      `Name: ${entityB}    Title: __________`,
    ].join("\n"),
  );
  return blocks.join("\n\n");
}

function suggestSoftwareDevTitle(d: ParsedDraftShape, raw: string): string {
  const low = `${raw} ${d.title || ""}`.toLowerCase();
  if (/\b(software|developer|development|saas|app|api|code|repository)\b/.test(low)) {
    return /\bfreelance|contractor|1099|independent\b/.test(low)
      ? "Freelance Software Development Agreement"
      : "Software Development Agreement";
  }
  return "";
}
