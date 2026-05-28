import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PREMIUM_JURISDICTION_PLACEHOLDER, resolveFinalGoverningLaw } from "./premiumDraftTransform";
import { buildCommercialFactGraph } from "./proOperationalSynthesis";

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
  const graph = buildCommercialFactGraph(rawIntake, draft);
  if (graph.agreementKind === "ai_workflow_services") {
    return buildAiWorkflowServicesPremiumBody(draft, rawIntake, graph, opts);
  }
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

type AiWorkflowGraph = ReturnType<typeof buildCommercialFactGraph>;

function buildAiWorkflowServicesPremiumBody(
  draft: ParsedDraftShape,
  rawIntake: string,
  graph: AiWorkflowGraph,
  opts?: { defaultTitle?: string },
): string {
  const client = graph.parties.client || (draft.parties?.[0]?.name || "").trim() || "Client";
  const provider = graph.parties.serviceProvider || (draft.parties?.[1]?.name || "").trim() || "Service Provider";
  const title = (opts?.defaultTitle || draft.title || "AI Workflow Services Agreement").trim();
  const amount = graph.payment.amount || (draft.payment_terms || "").trim() || "the fees stated in the signed order form";
  const law = graph.governingLaw || resolveFinalGoverningLaw(rawIntake, draft, (draft.jurisdiction || "").trim());
  const supportLine = graph.supportPeriod.unresolvedOptional
    ? "Post-acceptance support is optional and unresolved unless the Parties later state a support period, response expectations, or support fee in writing."
    : `Support will follow the stated support terms: ${graph.supportPeriod.provided}.`;
  const esign = graph.electronicSignaturesAllowed
    ? "The Parties may sign electronically, and electronic signatures will have the same effect as original signatures."
    : "The Parties may sign electronically if permitted by applicable law and their signing process.";
  const body = [
    title.toUpperCase(),
    "",
    `This Agreement is between ${client} ("Client") and ${provider} ("Service Provider"). Client engages Service Provider to perform AI workflow setup services under the operational terms below.`,
    "",
    "1. SERVICES AND COMMERCIAL OBJECTIVE",
    "Service Provider will assist Client with AI workflow setup. The services may include workflow mapping, configuration planning, implementation support, documentation of the configured workflow, and a practical demonstration or acceptance review of the configured workflow. The Parties may refine details in writing without changing the core commercial terms of this Agreement.",
    "",
    "2. IMPLEMENTATION ASSUMPTIONS AND CLIENT DEPENDENCIES",
    "Client will provide timely access to relevant personnel, existing process information, accounts, data samples, and approvals reasonably needed for setup. Service Provider is not responsible for delays caused by missing access, unavailable Client stakeholders, or third-party systems outside Service Provider's control. Service Provider will not be deemed to have promised any specific AI platform, software tool, integration, timeline, uptime level, or support window unless the Parties state that detail in writing.",
    "",
    "3. WORKFLOW CONFIGURATION, INTEGRATIONS, AND TRAINING",
    "For this AI workflow setup, commercially normal implementation work may include identifying the current workflow, recommending configuration steps, setting up agreed automation logic or prompts, coordinating with approved systems, and providing reasonable onboarding or training needed for Client to use the configured workflow. Any material integration with a named third-party system must be approved by Client and is limited to credentials, permissions, and capabilities made available for the engagement.",
    "",
    "4. ACCEPTANCE REVIEW",
    "Service Provider will provide a reasonable demonstration, walkthrough, or acceptance review showing that the configured workflow materially reflects the agreed scope. Client will promptly identify material nonconformities so Service Provider can correct them within the scope of the engagement. Minor issues, preference changes, or requests for new workflows are handled as follow-on work unless the Parties agree otherwise.",
    "",
    "5. FEES AND PAYMENT",
    `Client will pay Service Provider ${amount}. ${graph.payment.trigger || "Payment timing beyond the stated fee is not specified and should be confirmed by the Parties if material."}`,
    "",
    "6. OWNERSHIP AND PRE-EXISTING MATERIALS",
    "After Service Provider receives all amounts due, Client owns the final Client-specific deliverables, documentation, and configurations created specifically for Client under this Agreement. Service Provider retains all pre-existing tools, methods, templates, know-how, prompt patterns, background technology, and reusable implementation techniques. Client receives the right to use those retained materials only as embedded in or necessary to use the delivered Client-specific configuration.",
    "",
    "7. SUPPORT PERIOD; OPEN OPERATIONAL ITEMS",
    supportLine,
    `Operational items that may require later confirmation include ${graph.missingItems.filter((x) => x !== "payment amount" && x !== "governing law").join(", ") || "specific integrations, timeline, acceptance details, and support expectations"}.`,
    "",
    "8. CONFIDENTIALITY AND DATA HANDLING",
    "Each Party will protect non-public business, workflow, customer, operational, and technical information received from the other Party. Service Provider will use Client information only to perform the services and will not disclose it except to personnel or advisors who need it for the engagement and are bound by confidentiality obligations.",
    "",
    "9. THIRD-PARTY SYSTEMS AND OPERATIONAL RISK",
    "AI tools, SaaS platforms, APIs, and other third-party systems may change, fail, restrict access, or produce unexpected results. Service Provider will use commercially reasonable care in configuration and implementation support but does not guarantee third-party platform availability, model outputs, or business results unless expressly stated in a signed writing.",
    "",
    "10. GOVERNING LAW",
    `This Agreement is governed by the laws of ${law}, without regard to conflict-of-law rules.`,
    "",
    "11. ELECTRONIC SIGNATURES",
    esign,
  ].join("\n");
  return body.replace(/\n{3,}/g, "\n\n").trim();
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
