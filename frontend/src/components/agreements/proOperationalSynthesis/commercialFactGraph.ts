import type { ParsedDraftShape } from "../intakeSmartDefaults";
import { shouldApplyAiWorkflowServicesQualityFloor } from "../paidProDomainScopeGuard";

export type CommercialFactGraph = {
  agreementKind: "ai_workflow_services" | "joint_venture_economics" | "services" | "generic";
  parties: {
    client: string | null;
    serviceProvider: string | null;
  };
  roles: {
    clientRole: "Client";
    serviceProviderRole: "Service Provider";
  };
  payment: {
    amount: string | null;
    trigger: string | null;
  };
  governingLaw: string | null;
  electronicSignaturesAllowed: boolean;
  serviceActivity: string | null;
  deliverableType: string[];
  implementationAssumptions: string[];
  integrationWorkflowAssumptions: string[];
  onboardingTraining: "included_if_needed" | "not_specified";
  acceptanceMilestone: "demonstration_or_acceptance_review" | "not_specified";
  ownership: {
    deliverablesConfigurations: "client_after_payment" | "not_specified";
    providerPreExistingToolsCarveout: boolean;
  };
  supportPeriod: {
    provided: string | null;
    unresolvedOptional: boolean;
  };
  operationalRisks: string[];
  missingItems: string[];
};

function norm(s: string | null | undefined): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

function titleCaseState(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\s+law$/i, "");
}

function partyPairFromIntake(raw: string): { a: string | null; b: string | null } {
  const patterns = [
    /\bbetween\s+(.+?)\s+and\s+(.+?)\s+for\b/i,
    /\bbetween\s+(.+?)\s+and\s+(.+?)(?:\.|,|$)/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (!m) continue;
    const a = norm(m[1]).replace(/^the\s+/i, "");
    const b = norm(m[2]).replace(/^the\s+/i, "");
    if (a.length >= 2 && b.length >= 2) return { a, b };
  }
  return { a: null, b: null };
}

function paymentTrigger(raw: string, amount: string | null): string | null {
  if (!amount) return null;
  const re = new RegExp(`(?:will\\s+pay|shall\\s+pay|pay)\\s+[^.]{0,80}?${amount.replace(/[$,]/g, (m) => `\\${m}`)}`, "i");
  if (re.test(raw)) return "Client pays the stated fee for the services.";
  if (/\bdeposit|upon\s+signing|milestone|acceptance|completion|invoice\b/i.test(raw)) {
    const sentence = raw.split(/(?<=[.!?])\s+/).find((s) => /\b(deposit|upon\s+signing|milestone|acceptance|completion|invoice)\b/i.test(s));
    return norm(sentence) || null;
  }
  return "Payment trigger not specified beyond the stated service fee.";
}

export function isJointVentureEconomicsIntake(rawIntake: string): boolean {
  const low = (rawIntake || "").toLowerCase();
  const jvFrame = /\b(?:joint\s+venture|jv|partnership|profit[-\s]?share|revenue[-\s]?share)\b/.test(low);
  const economics =
    /\b(?:profit\s+split|waterfall|preferred\s+return|pref(?:erred)?\s+equity|capital\s+calls?|buy-sell|50\s*\/\s*50)\b/.test(
      low,
    ) || /\$\d[\d,]*\s*[mbk]?\b/i.test(low);
  return jvFrame && economics;
}

export function extractJointVentureEconomicsAnchors(rawIntake: string): string[] {
  const raw = norm(rawIntake);
  if (!raw) return [];
  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 24);
  const anchorRe =
    /\b(?:joint\s+venture|jv|profit\s+split|revenue\s+share|waterfall|preferred\s+return|pref(?:erred)?\s+equity|\$\d[\d,]*(?:\.\d+)?\s*[mbk]?|capital\s+calls?|buy-sell|deadlock|50\s*\/\s*50|confidential)\b/i;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    if (!anchorRe.test(sentence)) continue;
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sentence.length > 320 ? `${sentence.slice(0, 317)}…` : sentence);
    if (out.length >= 6) break;
  }
  return out;
}

function supportPeriod(raw: string): { provided: string | null; unresolvedOptional: boolean } {
  const explicit = raw.match(/\b(?:support|maintenance)\s+(?:period|term|for)\s+([^.;]+)/i);
  if (explicit?.[0]) return { provided: norm(explicit[0]), unresolvedOptional: false };
  if (/\b(?:monthly support|support\s*\$|support at|ongoing support)\b/i.test(raw)) {
    const sentence = raw.split(/(?<=[.!?])\s+/).find((s) => /\bsupport\b/i.test(s));
    return { provided: norm(sentence) || null, unresolvedOptional: false };
  }
  return { provided: null, unresolvedOptional: true };
}

export function buildCommercialFactGraph(rawIntake: string, draft?: ParsedDraftShape | null): CommercialFactGraph {
  const raw = norm(rawIntake);
  const low = raw.toLowerCase();
  const pair = partyPairFromIntake(raw);
  const draftParties = draft?.parties ?? [];
  const client = norm(draftParties[0]?.name) || pair.a;
  const serviceProvider = norm(draftParties[1]?.name) || pair.b;
  const amount = raw.match(/\$\d[\d,]*(?:\.\d{2})?/)?.[0] ?? norm(draft?.payment_terms).match(/\$\d[\d,]*(?:\.\d{2})?/)?.[0] ?? null;
  const lawMatch =
    raw.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+law\b/) ??
    raw.match(/\bgovern(?:ing|ed by)\s+(?:the\s+laws?\s+of\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  const governingLaw = lawMatch?.[1] ? titleCaseState(norm(lawMatch[1])) : norm(draft?.jurisdiction) || null;
  const aiWorkflow = shouldApplyAiWorkflowServicesQualityFloor(raw);
  const jvEconomics = isJointVentureEconomicsIntake(raw);
  const serviceActivity = aiWorkflow
    ? "AI workflow setup"
    : norm(draft?.purpose) || (/\bservices?\b/i.test(low) ? "services" : null);
  const graph: CommercialFactGraph = {
    agreementKind: aiWorkflow
      ? "ai_workflow_services"
      : jvEconomics
        ? "joint_venture_economics"
        : /\bservices?\b/i.test(low)
          ? "services"
          : "generic",
    parties: { client, serviceProvider },
    roles: { clientRole: "Client", serviceProviderRole: "Service Provider" },
    payment: { amount, trigger: paymentTrigger(raw, amount) },
    governingLaw,
    electronicSignaturesAllowed: /\belectronic signatures?\s+(?:allowed|permitted|okay|ok)|e-?signatures?\s+(?:allowed|permitted)\b/i.test(raw),
    serviceActivity,
    deliverableType: aiWorkflow
      ? ["workflow mapping", "configuration support", "implementation assistance", "acceptance demonstration"]
      : [],
    implementationAssumptions: aiWorkflow
      ? [
          "Provider may map current workflows and configure agreed automations.",
          "Client must provide timely access, approvals, and source information needed for setup.",
        ]
      : [],
    integrationWorkflowAssumptions: aiWorkflow
      ? [
          "Integration obligations are limited to systems, accounts, and workflows the parties identify or approve in writing.",
          "Provider is not assuming responsibility for third-party platform outages or unavailable external systems.",
        ]
      : [],
    onboardingTraining: aiWorkflow ? "included_if_needed" : "not_specified",
    acceptanceMilestone: aiWorkflow ? "demonstration_or_acceptance_review" : "not_specified",
    ownership: {
      deliverablesConfigurations: aiWorkflow ? "client_after_payment" : "not_specified",
      providerPreExistingToolsCarveout: aiWorkflow,
    },
    supportPeriod: supportPeriod(raw),
    operationalRisks: aiWorkflow
      ? [
          "Client system access and approvals may delay implementation.",
          "Third-party AI, SaaS, or integration platforms may change behavior or availability.",
          "Acceptance criteria and post-launch support period should be confirmed if material.",
        ]
      : jvEconomics
        ? [
            "Capital call timing and cure mechanics should stay aligned with intake.",
            "Deadlock and buy-sell resolution should not be replaced with generic boilerplate.",
            "Audit, books, and confidentiality on underwriting materials may need Schedule A detail.",
          ]
        : [],
    missingItems: [
      ...(amount ? [] : ["payment amount"]),
      ...(governingLaw ? [] : ["governing law"]),
      ...(aiWorkflow ? ["specific systems/integrations", "timeline", "support period"] : []),
      ...(jvEconomics ? ["formal governance schedule", "tax allocations", "exit mechanics detail"] : []),
    ],
  };
  return graph;
}

export function commercialFactGraphToGuidanceLines(graph: CommercialFactGraph, rawIntake = ""): string[] {
  if (graph.agreementKind === "joint_venture_economics") {
    const anchors = extractJointVentureEconomicsAnchors(rawIntake);
    return [
      "Commercial fact graph: joint venture / profit-share economics.",
      "Preserve waterfall, preferred return, profit split, capital calls, and deadlock/buy-sell mechanics from intake.",
      "Do not invent fund sizes, timelines, governance committees, or support periods beyond what the user stated.",
      ...anchors.map((anchor, i) => `Economics anchor ${i + 1}: ${anchor}`),
    ];
  }
  if (graph.agreementKind !== "ai_workflow_services") return [];
  const lines = [
    "Commercial fact graph: AI workflow services engagement.",
    graph.parties.client && graph.parties.serviceProvider
      ? `Parties and roles: ${graph.parties.client} is Client; ${graph.parties.serviceProvider} is Service Provider.`
      : "Parties and roles: preserve full legal names from intake/draft.",
    graph.payment.amount ? `Payment: retain ${graph.payment.amount}; ${graph.payment.trigger ?? "payment trigger unresolved."}` : "Payment amount unresolved.",
    graph.governingLaw ? `Governing law: retain ${graph.governingLaw}.` : "Governing law unresolved.",
    graph.electronicSignaturesAllowed ? "Electronic signatures: expressly permitted." : "Electronic signature permission not specified.",
    "Services: expand AI workflow setup into workflow mapping, configuration, implementation support, documentation/training if needed, and demonstration/acceptance review.",
    "Do not invent specific tools, timelines, integrations, support periods, addresses, SLAs, uptime commitments, or support hours.",
    graph.supportPeriod.unresolvedOptional
      ? "Support period: unresolved/optional; flag for confirmation rather than inventing a period."
      : `Support period: ${graph.supportPeriod.provided}.`,
    "Ownership: client owns paid deliverables/configurations after payment; provider retains pre-existing tools, methods, templates, and know-how.",
  ];
  return lines.filter(Boolean);
}

export function aiWorkflowPremiumQualitySignals(text: string): { ok: boolean; missing: string[] } {
  const low = (text || "").toLowerCase();
  const checks: Array<[string, RegExp]> = [
    ["workflow_mapping", /\bworkflow\s+mapping|map\s+current\s+workflows?\b/i],
    ["configuration", /\bconfiguration|configure|configured\b/i],
    ["implementation", /\bimplementation|implement\b/i],
    ["demo_acceptance", /\bdemonstrat(?:e|ion)|acceptance\s+(?:review|testing|criteria)|acceptance\b/i],
    ["ownership", /\b(client|red mesa).{0,80}\bown|ownership\b/i],
    ["pre_existing_tools", /\bpre[-\s]?existing\s+(?:tools|methods|templates|know-how)|background\s+(?:tools|ip)\b/i],
  ];
  const missing = checks.filter(([, re]) => !re.test(low)).map(([id]) => id);
  return { ok: missing.length === 0, missing };
}
