import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PREMIUM_JURISDICTION_PLACEHOLDER, resolveFinalGoverningLaw } from "./premiumDraftTransform";

const BANNED_PROSE_SUBSTR = [
  "quality gate",
  "thin starter",
  "not a finished pro",
  "organized for review",
  "starter outline",
].map((s) => s.toLowerCase());

/**
 * When premium-full-draft is unavailable, build a full-clause Pro-style body
 * (fallback/stitch path) with governing law from intake and no downgrade phrasing.
 */
export function buildPremiumPostCheckoutStitchedBody(
  draft: ParsedDraftShape,
  rawIntake: string,
  opts?: { defaultTitle?: string },
): string {
  const jResolved = resolveFinalGoverningLaw(rawIntake, draft, (draft.jurisdiction || "").trim() || "Delaware");
  const d = { ...draft, jurisdiction: jResolved };
  const raw = (rawIntake || "").trim();
  const p0 = (d.parties?.[0]?.name || "").trim();
  const p1 = (d.parties?.[1]?.name || "").trim();
  const r0 = (d.parties?.[0]?.role || "").trim() || "Client";
  const r1 = (d.parties?.[1]?.role || "").trim() || "Service Provider";
  const party0 = p0 && !/^(service provider|client|party\s*a|developer|contractor)$/i.test(p0) ? p0 : "";
  const party1 = p1 && !/^(service provider|client|party\s*b|developer|contractor)$/i.test(p1) ? p1 : "";
  const clientLabel = /client/i.test(r0) ? r0 : /client/i.test(r1) ? r1 : "Client";
  const devLabel = /(developer|contractor|service\s+provider|provider)/i.test(r0)
    ? r0
    : /(developer|contractor|service\s+provider|provider)/i.test(r1)
      ? r1
      : "Developer / Service Provider";
  const entityA = party0 || p0 || "the Client";
  const entityB = party1 || p1 || "the Developer / Service Provider";
  const title =
    (opts?.defaultTitle || "").trim() ||
    suggestSoftwareDevTitle(d, raw) ||
    (d.title || "").trim() ||
    "Service Agreement";
  const purpose = (d.purpose || "").trim() || "The services and deliverables described in the parties’ written intake, specifications, and any statement of work agreed in writing by the parties.";
  const pay = (d.payment_terms || "").trim() || "The fees, invoicing method, and payment timing described in the intake, fee schedule, or written change orders the parties sign.";
  const add = (d.additional_terms || "").trim();
  const term = [d.duration, d.due_date, d.effective_date]
    .filter((x): x is string => Boolean(x && String(x).trim()))
    .map((s) => String(s).trim())
    .join("; ") || "Milestones and a final delivery date as set in writing between the parties (or as stated in the intake)";

  const j0 = (d.jurisdiction || "").trim();
  let lawGoverning: string;
  if (!j0 || j0 === PREMIUM_JURISDICTION_PLACEHOLDER) {
    lawGoverning =
      "a jurisdiction the Parties will confirm in a signed amendment (or, if not specified, a forum reasonably related to the Parties and this engagement)";
  } else if (/\boklahoma\b/i.test(j0)) {
    lawGoverning = "the laws of the State of Oklahoma, without regard to its conflict of law rules";
  } else {
    lawGoverning = `the laws of ${j0}, without regard to its conflict of law rules`;
  }

  const serviceBullets = purpose
    .split(/\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 12)
    .slice(0, 7)
    .map((s) => `• ${s}`);

  const blocks: string[] = [
    [
      title.toUpperCase(),
      "",
      "The Parties enter into this Agreement to set forth a binding services engagement. The signature block at the end evidence their intent to be bound. This is not legal advice; confirm material terms with the other party or independent counsel as needed.",
    ].join("\n"),
    [
      "1. PARTIES AND ROLES",
      `${entityA} (“${clientLabel}”) and ${entityB} (“${devLabel}”) are the Parties. ${entityA} engages ${entityB} in the role described in this Agreement (each a “Party,” together the “Parties”).`,
    ].join("\n"),
    [
      "2. SERVICES; DELIVERABLES",
      "The Developer will perform the professional services, milestones, and deliverables described in the materials referenced between the parties (intake, specifications, and any written statement of work the parties sign). Services include, without limitation:",
      serviceBullets.length ? serviceBullets.join("\n") : `• ${purpose.slice(0, 520)}${purpose.length > 520 ? "…" : ""}`,
    ].join("\n\n"),
    [
      "3. FEES; PAYMENT SCHEDULE",
      "Fees, deposits, and recurring or milestone payments are as set forth here or in a signed statement of work:",
      pay,
    ].join("\n\n"),
    [
      "4. TIMELINE; DELIVERY DEADLINE",
      `Schedule, milestones, and the target completion / delivery date: ${term}. Time is important, but any dates are extended automatically for delays caused by the other Party’s non-cooperation, agreed change orders, or events outside a Party’s reasonable control, once documented in writing.`,
    ].join("\n"),
    [
      "5. REVISIONS",
      "The Parties are entitled to two (2) rounds of substantive written revisions to each major deliverable before acceptance, unless a statement of work specifies a different number. Out-of-scope requests may be agreed in a written change order with any adjusted schedule or additional fees stated there.",
    ].join("\n"),
    [
      "6. OWNERSHIP; INTELLECTUAL PROPERTY; PRE-EXISTING TOOLS",
      "Upon full payment of amounts due for the deliverables, Client receives ownership of the final work product and deliverables specifically created for Client under this Agreement, except for Developer’s pre-existing tools, code libraries, background processes, and templates that the Developer may reuse in other engagements, which the Developer retains; Client receives a license sufficient to use, deploy, and maintain the delivered work for Client’s business. Any narrower or broader terms in a written statement of work or exhibit signed by the Parties will control in case of conflict with this generality.",
    ].join("\n"),
    [
      "7. CONFIDENTIALITY",
      "The Parties will hold non-public business, technical, and customer information in confidence, use it only to perform or receive the Services, and not disclose it except to personnel or advisors bound to confidentiality and as required by law.",
    ].join("\n"),
    [
      "8. NOTICES",
      "Notices, approvals, and formal communications under this Agreement may be given by e-mail to the addresses the parties designate, with copies to other contacts they provide in the signature block or a written notice of address. Either Party may change its notice e-mail on written notice to the other Party.",
    ].join("\n"),
    [
      "9. GOVERNING LAW; VENUE",
      `This Agreement shall be governed by ${lawGoverning}. The Parties may elect exclusive venue in state or federal courts in the state whose law governs, in any signed amendment. If a forum is not specified, venue may lie in a forum reasonably related to the Parties and this relationship.`,
    ].join("\n"),
    [
      "10. E-SIGNATURE; COUNTERPARTS",
      "The Parties may execute and deliver this Agreement, exhibits, and counterparts using electronic or digital means that satisfy applicable law; counterparts together will constitute a single agreement.",
    ].join("\n"),
  ];
  if (add) {
    blocks.push(["11. ADDITIONAL TERMS; PRIOR E-MAILS", add].join("\n\n"));
  }
  const sigN = add ? 12 : 11;
  blocks.push(
    [
      `${sigN}. SIGNATURES`,
      "",
      "______________________________  Date: __________",
      `Name: ${entityA}    Title: __________    Email: __________`,
      "",
      "______________________________  Date: __________",
      `Name: ${entityB}    Title: __________    Email: __________`,
    ].join("\n"),
  );
  const out = blocks.join("\n\n");
  const outLow = out.toLowerCase();
  for (const b of BANNED_PROSE_SUBSTR) {
    if (outLow.includes(b)) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[premium-stitched] banned copy fragment in output; review generator", b);
      }
    }
  }
  return out;
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
