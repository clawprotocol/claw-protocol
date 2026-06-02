import { findSignatureRegionStart } from "./guidedDealCompletion/signatureRegion";
import { assertNoPostAcceptanceStructuralMutation } from "./authoritativeAgreementDocument";
import { shouldBlockPaidProStructuralMutationAfterAcceptance } from "./paidProAuthoritativeRenderGate";
import { runCachedCorpusScan } from "./paidProCorpusScanCache";

type CompilerSignerIdentity = {
  partyDisplayName: string;
  representativeName?: string | null;
  title?: string | null;
  blockHeading?: string | null;
  isIndividual?: boolean | null;
};

export type SemanticPayloadType =
  | "services_scope_list"
  | "milestone_schedule"
  | "payment_amount"
  | "support_expectations"
  | "governing_law"
  | "termination_notice"
  | "ownership_terms"
  | "confidentiality_terms"
  | "notices_terms"
  | "signature_block";

type CompilerSectionKey =
  | "intro"
  | "purpose"
  | "fees"
  | "ownership"
  | "confidentiality"
  | "support"
  | "termination"
  | "notices"
  | "misc"
  | "electronic_signatures"
  | "execution"
  | "unknown";

export type FinalAgreementCompilerIntegrityContext = {
  intakeText?: string | null;
  draftText?: string | null;
  freeText?: string | null;
  signerIdentities?: readonly CompilerSignerIdentity[] | null;
  surface?: string | null;
};

export type FinalAgreementCompilerIntegrityResult = {
  text: string;
  repairs: string[];
  defects: string[];
};

const TOP_LEVEL_HEADING_RE = /^(\d+)\.\s+(?!\d+\.)(.+)$/;
const SUBSECTION_HEADING_RE = /^(\d+)\.(\d+)\.?\s+(.+)$/;
const SIGNATURE_START_RE = /^\s*(?:IN WITNESS WHEREOF|CLIENT\s*:|SERVICE PROVIDER\s*:|PARTY\s+\d+\s*:)\b/i;

export const semanticPayloadOwnerMap: Readonly<Record<SemanticPayloadType, CompilerSectionKey>> = {
  services_scope_list: "purpose",
  milestone_schedule: "fees",
  payment_amount: "fees",
  support_expectations: "support",
  governing_law: "misc",
  termination_notice: "termination",
  ownership_terms: "ownership",
  confidentiality_terms: "confidentiality",
  notices_terms: "notices",
  signature_block: "execution",
};

const SECTION_CONTRACTS: Readonly<Record<CompilerSectionKey, {
  allowedPayloads: readonly SemanticPayloadType[];
  forbiddenPayloads: readonly SemanticPayloadType[];
  allowedSubsectionTypes: readonly SemanticPayloadType[];
  minimumText: string;
}>> = {
  intro: { allowedPayloads: [], forbiddenPayloads: ["signature_block"], allowedSubsectionTypes: [], minimumText: "" },
  purpose: {
    allowedPayloads: ["services_scope_list"],
    forbiddenPayloads: ["milestone_schedule", "payment_amount", "support_expectations", "governing_law", "termination_notice", "ownership_terms", "signature_block"],
    allowedSubsectionTypes: ["services_scope_list"],
    minimumText: "Service Provider will provide the services described in this Agreement.",
  },
  fees: {
    allowedPayloads: ["payment_amount", "milestone_schedule"],
    forbiddenPayloads: ["services_scope_list", "support_expectations", "governing_law", "ownership_terms", "signature_block"],
    allowedSubsectionTypes: ["milestone_schedule", "payment_amount"],
    minimumText: "Client will pay the fees described in this Agreement.",
  },
  ownership: {
    allowedPayloads: ["ownership_terms"],
    forbiddenPayloads: ["milestone_schedule", "support_expectations", "governing_law", "termination_notice", "signature_block"],
    allowedSubsectionTypes: ["ownership_terms"],
    minimumText: "Client owns the project deliverables, and Service Provider retains pre-existing tools and background materials.",
  },
  confidentiality: {
    allowedPayloads: ["confidentiality_terms"],
    forbiddenPayloads: ["milestone_schedule", "governing_law", "support_expectations", "signature_block"],
    allowedSubsectionTypes: ["confidentiality_terms"],
    minimumText: "Each Party will protect confidential information using reasonable care.",
  },
  support: {
    allowedPayloads: ["support_expectations"],
    forbiddenPayloads: ["ownership_terms", "governing_law", "milestone_schedule", "payment_amount", "signature_block"],
    allowedSubsectionTypes: ["support_expectations"],
    minimumText: "Service Provider will provide support expectations stated in this Agreement.",
  },
  termination: {
    allowedPayloads: ["termination_notice"],
    forbiddenPayloads: ["milestone_schedule", "payment_amount", "governing_law", "signature_block"],
    allowedSubsectionTypes: ["termination_notice"],
    minimumText: "Either Party may terminate this Agreement as stated in this Agreement.",
  },
  notices: {
    allowedPayloads: ["notices_terms"],
    forbiddenPayloads: ["milestone_schedule", "payment_amount", "ownership_terms", "signature_block"],
    allowedSubsectionTypes: ["notices_terms"],
    minimumText: "Notices must be delivered to the parties at their designated addresses.",
  },
  misc: {
    allowedPayloads: ["governing_law"],
    forbiddenPayloads: ["milestone_schedule", "payment_amount", "support_expectations", "ownership_terms", "signature_block"],
    allowedSubsectionTypes: ["governing_law"],
    minimumText: "This Agreement is governed by the applicable law stated in this Agreement.",
  },
  electronic_signatures: {
    allowedPayloads: [],
    forbiddenPayloads: ["services_scope_list", "milestone_schedule", "payment_amount", "support_expectations", "governing_law", "termination_notice", "ownership_terms", "notices_terms", "signature_block"],
    allowedSubsectionTypes: [],
    minimumText: "Electronic signatures and counterparts are permitted and have the same effect as originals.",
  },
  execution: { allowedPayloads: ["signature_block"], forbiddenPayloads: [], allowedSubsectionTypes: [], minimumText: "" },
  unknown: { allowedPayloads: [], forbiddenPayloads: ["signature_block"], allowedSubsectionTypes: [], minimumText: "" },
};

function normalizeLines(text: string): string[] {
  return (text || "").replace(/\r\n?/g, "\n").split("\n");
}

function compact(text: string): string {
  return text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

function logCompilerRepair(event: string, payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info(`[${event}]`, payload);
}

function classifySectionHeading(heading: string): CompilerSectionKey {
  const h = heading.toLowerCase();
  if (/\bpurpose|scope|services\b/i.test(h)) return "purpose";
  if (/\bfees?|payment|compensation|commercial\b/i.test(h)) return "fees";
  if (/\bownership|work product|intellectual property|\bip\b/i.test(h)) return "ownership";
  if (/\bconfidential/i.test(h)) return "confidentiality";
  if (/\bsupport|acceptance|change requests?|sla|service levels?\b/i.test(h)) return "support";
  if (/\bterm|termination|renewal\b/i.test(h)) return "termination";
  if (/\bnotices?\b/i.test(h)) return "notices";
  if (/\bmiscellaneous|governing law|law\b/i.test(h)) return "misc";
  if (/\belectronic signatures?|counterparts?|e-?signature\b/i.test(h)) return "electronic_signatures";
  return "unknown";
}

function semanticPayloadTypeForText(line: string): SemanticPayloadType | null {
  const t = line.toLowerCase();
  if (likelySignatureLine(line) || SIGNATURE_START_RE.test(line)) return "signature_block";
  if (/ai workflow implementation|dashboard setup|paid advertising management|email marketing|operations consulting|recurring advisory calls|workflow recommendations|vendor coordination|monthly reporting support/i.test(t)) {
    return "services_scope_list";
  }
  if (/40\s*%\s*(?:is due for )?build\/configuration|30\s*%\s*(?:is due for )?rollout\/onboarding|30\s*%\s*(?:is due for )?support\/acceptance|3 milestones|three milestones|milestone schedule|phase allocation/i.test(t)) {
    return "milestone_schedule";
  }
  if (/\$[\d,]+(?:\.\d{2})?|\bmonthly fee\b|\bproject fee\b|\bpay\b.{0,50}\bfees?\b/i.test(t)) return "payment_amount";
  if (/uptime|support expectations?|support model|acceptance|change request|handoff|maintenance/i.test(t)) return "support_expectations";
  if (/governed by|governing law|\b(?:oklahoma|texas|delaware|california|new york)\s+law\b/i.test(t)) return "governing_law";
  if (/terminat|renewal|written notice|notice to terminate/i.test(t)) return "termination_notice";
  if (/owns?.{0,80}(?:deliverables?|work product)|pre-existing tools|background materials|retains?.{0,60}(?:tools|templates|know-how)/i.test(t)) {
    return "ownership_terms";
  }
  if (/confidential|non-disclosure|protect information/i.test(t)) return "confidentiality_terms";
  if (/notices?.{0,80}(?:email|address|delivered|mail)/i.test(t)) return "notices_terms";
  return null;
}

function signerNameForIdentity(id: CompilerSignerIdentity): string {
  if (id.isIndividual) return id.partyDisplayName.trim();
  return (id.representativeName?.trim() || id.partyDisplayName).trim();
}

function canonicalExecutionTail(identities: readonly CompilerSignerIdentity[]): string | null {
  const usable = identities.filter((id) => id.partyDisplayName?.trim());
  if (usable.length === 0) return null;
  const blocks = usable.map((id, index) => {
    const heading = (id.blockHeading?.trim() || (index === 0 ? "CLIENT" : index === 1 ? "SERVICE PROVIDER" : `PARTY ${index + 1}`)).toUpperCase();
    const lines = [
      `${heading}:`,
      id.partyDisplayName.trim(),
      "By: __________________________",
      `Name: ${signerNameForIdentity(id)}`,
    ];
    if (id.title?.trim()) lines.push(`Title: ${id.title.trim()}`);
    lines.push("Date: _________________________");
    return lines.join("\n");
  });
  return ["IN WITNESS WHEREOF, the Parties execute this Agreement.", ...blocks].join("\n\n");
}

function likelySignatureLine(line: string): boolean {
  const t = line.trim();
  return /^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:$/i.test(t) || /^(?:By|Name|Title|Date|Email|Signature)\s*:/i.test(t);
}

function malformedPartyFragment(line: string): boolean {
  const t = line.replace(/\s+/g, " ").trim();
  return (
    /\(\s*each\s+a\s+["“]?Party/i.test(t) ||
    /\(\s*["“]?[A-Z][^"”)]{1,80}["”]?\s*\)\s*\(\s*each/i.test(t) ||
    /\b(?:LLC|Inc\.?|Consulting|Corporation|Company)\b.{0,120}\(\s*each\s+a\s+["“]?Party/i.test(t)
  );
}

function payloadOccurrenceKey(type: SemanticPayloadType, line: string): string {
  const t = line.toLowerCase();
  if (type === "milestone_schedule") {
    if (/40\s*%/.test(t)) return `${type}:40_build`;
    if (/30\s*%/.test(t) && /rollout|onboarding/.test(t)) return `${type}:30_rollout`;
    if (/30\s*%/.test(t) && /support|acceptance/.test(t)) return `${type}:30_support`;
    if (/3 milestones|three milestones/.test(t)) return `${type}:three_milestones`;
  }
  if (type === "services_scope_list") {
    const terms = [
      "ai workflow implementation",
      "dashboard setup",
      "automation support",
      "onboarding assistance",
      "light ongoing maintenance",
      "paid advertising management",
      "launch coordination",
      "email marketing",
      "analytics reporting",
      "creative strategy",
      "campaign optimization",
      "operations consulting",
      "recurring advisory calls",
      "workflow recommendations",
      "vendor coordination",
      "monthly reporting support",
    ];
    const found = terms.filter((term) => t.includes(term));
    if (found.length) return `${type}:${found.join("|")}`;
  }
  if (type === "payment_amount") return `${type}:${t.match(/\$[\d,]+(?:\.\d{2})?/)?.[0] ?? "payment"}`;
  if (type === "governing_law") return `${type}:${t.match(/\b(?:oklahoma|texas|delaware|california|new york)\b/)?.[0] ?? "law"}`;
  if (type === "termination_notice") return `${type}:${t.match(/\b\d{1,3}\s*[- ]?days?\b/)?.[0] ?? "termination"}`;
  return `${type}:${t.replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120)}`;
}

function logSectionContractViolation(payload: Record<string, unknown>): void {
  logCompilerRepair("section-contract-violation", payload);
}

export function validateSectionContracts(
  text: string,
  context: FinalAgreementCompilerIntegrityContext = {},
): FinalAgreementCompilerIntegrityResult {
  const marker = findSignatureRegionStart(text);
  const body = marker >= 0 ? text.slice(0, marker) : text;
  const tail = marker >= 0 ? text.slice(marker) : "";
  const lines = normalizeLines(body);
  const repairs: string[] = [];
  const defects: string[] = [];
  const relocated = new Map<CompilerSectionKey, string[]>();
  const seenPayloads = new Set<string>();
  const out: string[] = [];
  let current: CompilerSectionKey = "intro";

  const pushRelocated = (owner: CompilerSectionKey, line: string, type: SemanticPayloadType) => {
    const bucket = relocated.get(owner) ?? [];
    bucket.push(line);
    relocated.set(owner, bucket);
    repairs.push(`section_contract:relocated:${type}:${owner}`);
    defects.push("section_contract_violation");
    logSectionContractViolation({ payloadType: type, owner, surface: context.surface ?? null });
  };

  for (const line of lines) {
    const heading = line.trim().match(TOP_LEVEL_HEADING_RE);
    if (heading) {
      current = classifySectionHeading(heading[2]);
      out.push(line);
      continue;
    }
    const type = semanticPayloadTypeForText(line);
    if (!type) {
      out.push(line);
      continue;
    }
    const owner = semanticPayloadOwnerMap[type];
    const occurrence = payloadOccurrenceKey(type, line);
    if (seenPayloads.has(occurrence)) {
      repairs.push(`duplicate_payload_rejected:${type}`);
      defects.push("duplicate_semantic_payload");
      logCompilerRepair("duplicate_payload_rejected", { payloadType: type, owner, surface: context.surface ?? null });
      continue;
    }
    seenPayloads.add(occurrence);
    const contract = SECTION_CONTRACTS[current] ?? SECTION_CONTRACTS.unknown;
    if (current !== owner && current !== "intro") {
      pushRelocated(owner, line, type);
      continue;
    }
    if (contract.forbiddenPayloads.includes(type)) {
      if (owner !== current) {
        pushRelocated(owner, line, type);
      } else {
        repairs.push(`section_contract:dropped_forbidden:${type}`);
        defects.push("section_contract_violation");
        logSectionContractViolation({ payloadType: type, owner: current, action: "dropped", surface: context.surface ?? null });
      }
      continue;
    }
    out.push(line);
  }

  if (relocated.size > 0) {
    const withRelocations: string[] = [];
    let active: CompilerSectionKey = "intro";
    for (let i = 0; i < out.length; i += 1) {
      const line = out[i];
      const heading = line.trim().match(TOP_LEVEL_HEADING_RE);
      if (heading) {
        const next = classifySectionHeading(heading[2]);
        if (active !== "intro" && relocated.has(active)) {
          withRelocations.push(...(relocated.get(active) ?? []));
          relocated.delete(active);
        }
        active = next;
      }
      withRelocations.push(line);
    }
    if (active !== "intro" && relocated.has(active)) {
      withRelocations.push(...(relocated.get(active) ?? []));
      relocated.delete(active);
    }
    for (const [owner, bucket] of relocated) {
      const label =
        owner === "purpose"
          ? "Purpose and Scope"
          : owner === "fees"
            ? "Fees and Payment"
            : owner === "support"
              ? "Support Expectations"
              : owner === "termination"
                ? "Term and Termination"
                : owner === "ownership"
                  ? "Ownership and Work Product"
                  : owner === "misc"
                    ? "Miscellaneous"
                    : owner === "notices"
                      ? "Notices"
                      : null;
      if (!label) continue;
      withRelocations.push(`${withRelocations.filter((l) => TOP_LEVEL_HEADING_RE.test(l.trim())).length + 1}. ${label}`);
      withRelocations.push(...bucket);
    }
    return {
      text: compact([withRelocations.join("\n").trim(), tail.trim()].filter(Boolean).join("\n\n")),
      repairs: [...new Set(repairs)],
      defects: [...new Set(defects)],
    };
  }

  return {
    text: compact([out.join("\n").trim(), tail.trim()].filter(Boolean).join("\n\n")),
    repairs: [...new Set(repairs)],
    defects: [...new Set(defects)],
  };
}

function payloadTypeForSubsectionHeading(heading: string): SemanticPayloadType | null {
  const h = heading.toLowerCase();
  if (/payment milestone|milestone/i.test(h)) return "milestone_schedule";
  if (/project services|services|scope|deliverables/i.test(h)) return "services_scope_list";
  if (/notice/i.test(h)) return "notices_terms";
  if (/governing law|law/i.test(h)) return "governing_law";
  if (/confidential/i.test(h)) return "confidentiality_terms";
  if (/ownership|work product|ip|intellectual/i.test(h)) return "ownership_terms";
  if (/support|acceptance|change request/i.test(h)) return "support_expectations";
  if (/term|termination|renewal/i.test(h)) return "termination_notice";
  return null;
}

export function renderMilestonePaymentsSubsection(context: FinalAgreementCompilerIntegrityContext): string[] {
  const source = `${context.intakeText ?? ""}\n${context.draftText ?? ""}`;
  if (/\b40\s*%/i.test(source)) {
    return [
      "- 40% is due for build/configuration.",
      "- 30% is due for rollout/onboarding.",
      "- 30% is due for support/acceptance.",
    ];
  }
  if (/\b3\s+milestones|\bthree\s+milestones/i.test(source)) {
    return ["- Payments will be made across three project milestones tied to delivery progress."];
  }
  return ["- Milestone payments are due as the corresponding project milestones are completed or accepted."];
}

function renderServicesScopeSubsection(context: FinalAgreementCompilerIntegrityContext): string[] {
  const source = `${context.intakeText ?? ""}\n${context.draftText ?? ""}`;
  if (/AI workflow implementation|dashboard setup|automation support/i.test(source)) {
    return [
      "- AI workflow implementation.",
      "- Dashboard setup.",
      "- Automation support, onboarding assistance, and light ongoing maintenance.",
    ];
  }
  if (/paid advertising management|email marketing|campaign optimization/i.test(source)) {
    return [
      "- Paid advertising management, launch coordination, and email marketing.",
      "- Analytics reporting, creative strategy, and campaign optimization.",
    ];
  }
  if (/operations consulting|advisory calls|workflow recommendations/i.test(source)) {
    return [
      "- Operations consulting and recurring advisory calls.",
      "- Workflow recommendations, vendor coordination, and monthly reporting support.",
    ];
  }
  return ["- Service Provider will provide the services and deliverables described in this Agreement."];
}

export function renderTerminationSubsection(context: FinalAgreementCompilerIntegrityContext): string[] {
  const source = `${context.intakeText ?? ""}\n${context.draftText ?? ""}`;
  const days = source.match(/\b(15|30|45|60)\s*[- ]?days?\b/i)?.[1] ?? "30";
  return [`Either Party may terminate this Agreement on ${days} days written notice.`];
}

export function renderSupportSubsection(context: FinalAgreementCompilerIntegrityContext): string[] {
  const source = `${context.intakeText ?? ""}\n${context.draftText ?? ""}`;
  if (/no\s+guaranteed?.{0,40}uptime|third-party ai platforms/i.test(source)) {
    return ["Support expectations do not include guaranteed third-party AI platform uptime."];
  }
  return ["Service Provider will provide the support expectations stated in this Agreement."];
}

function renderAtomicSubsection(payload: SemanticPayloadType, context: FinalAgreementCompilerIntegrityContext): string[] {
  if (payload === "milestone_schedule" || payload === "payment_amount") return renderMilestonePaymentsSubsection(context);
  if (payload === "services_scope_list") return renderServicesScopeSubsection(context);
  if (payload === "termination_notice") return renderTerminationSubsection(context);
  if (payload === "support_expectations") return renderSupportSubsection(context);
  if (payload === "notices_terms") return ["Notices must be delivered to the parties at their designated email or mailing addresses."];
  if (payload === "governing_law") {
    const source = `${context.intakeText ?? ""}\n${context.draftText ?? ""}`;
    const state = source.match(/\b(Oklahoma|Texas|Delaware|California|New York)\s+law\b/i)?.[1];
    return [`This Agreement is governed by the laws of the State of ${state ?? "the applicable jurisdiction"}.`];
  }
  if (payload === "confidentiality_terms") return ["Each Party will protect confidential information using reasonable care."];
  if (payload === "ownership_terms") {
    return ["Client owns the project deliverables, and Service Provider retains its pre-existing tools and background materials."];
  }
  return [];
}

function enforceSubsectionPayloads(
  lines: string[],
  context: FinalAgreementCompilerIntegrityContext,
): { lines: string[]; repairs: string[]; defects: string[] } {
  const repairs: string[] = [];
  const defects: string[] = [];
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    out.push(line);
    const sub = line.trim().match(SUBSECTION_HEADING_RE);
    if (!sub) continue;
    const heading = sub[3].trim();
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    const next = lines[j]?.trim() ?? "";
    const empty = !next || TOP_LEVEL_HEADING_RE.test(next) || SUBSECTION_HEADING_RE.test(next) || SIGNATURE_START_RE.test(next);
    if (!empty) continue;
    const payload = payloadTypeForSubsectionHeading(heading);
    const fallback = payload ? renderAtomicSubsection(payload, context) : [];
    if (fallback.length === 0) {
      repairs.push(`subsection_payload_repaired:${sub[1]}.${sub[2]}:removed_empty`);
      defects.push("empty_subsection_shell");
      out.pop();
      continue;
    }
    out.push(...fallback);
    repairs.push(`subsection_payload_repaired:${sub[1]}.${sub[2]}`);
    defects.push("empty_subsection_shell");
    logCompilerRepair("subsection_payload_repaired", {
      subsection: `${sub[1]}.${sub[2]}`,
      heading,
      surface: context.surface ?? null,
    });
  }
  return { lines: out, repairs, defects };
}

function isolateExecutionBlocks(
  text: string,
  context: FinalAgreementCompilerIntegrityContext,
): { text: string; repairs: string[]; defects: string[] } {
  const repairs: string[] = [];
  const defects: string[] = [];
  const marker = findSignatureRegionStart(text);
  const body = marker >= 0 ? text.slice(0, marker) : text;
  const tail = marker >= 0 ? text.slice(marker) : "";
  const bodyLines = normalizeLines(body);
  const cleanedBody = bodyLines.filter((line) => {
    const inClauseSignatureLine = likelySignatureLine(line);
    const malformed = malformedPartyFragment(line);
    if (inClauseSignatureLine || malformed) {
      repairs.push(malformed ? "malformed_party_fragment" : "execution_block_contamination");
      defects.push(malformed ? "malformed_party_fragment" : "execution_block_contamination");
      return false;
    }
    return true;
  });

  let nextTail = tail;
  const canonicalTail = canonicalExecutionTail(context.signerIdentities ?? []);
  const tailHasCompleteSignatureBlocks =
    /(?:^|\n)\s*CLIENT\s*:\s*\n/i.test(tail) &&
    /(?:^|\n)\s*SERVICE PROVIDER\s*:\s*\n/i.test(tail) &&
    /(?:^|\n)\s*(?:By|Signature)\s*:/im.test(tail);
  const tailHasBusinessPayload = normalizeLines(tail)
    .slice(1)
    .some((line) => {
      const type = semanticPayloadTypeForText(line);
      return Boolean(type && type !== "signature_block");
    });
  if (
    canonicalTail &&
    (repairs.length > 0 ||
      !tailHasCompleteSignatureBlocks ||
      tailHasBusinessPayload ||
      (tail && /(?:CLIENT|SERVICE PROVIDER)\s*:[\s\S]*\(\s*each\s+a\s+["“]?Party/i.test(tail)))
  ) {
    nextTail = canonicalTail;
    repairs.push("execution_block:canonical_template_rebuilt");
    if (tailHasBusinessPayload) {
      repairs.push("execution_block:business_clause_tail_removed");
      defects.push("execution_block_contamination");
    }
  }

  const combined = [cleanedBody.join("\n").trim(), nextTail.trim()].filter(Boolean).join("\n\n");
  if (repairs.length) {
    logCompilerRepair("execution_block_contamination", {
      repairs,
      surface: context.surface ?? null,
    });
  }
  return { text: compact(combined), repairs: [...new Set(repairs)], defects: [...new Set(defects)] };
}

function reconcileNumberingAndReferences(text: string): { text: string; repairs: string[]; defects: string[] } {
  const repairs: string[] = [];
  const defects: string[] = [];
  const marker = findSignatureRegionStart(text);
  const body = marker >= 0 ? text.slice(0, marker) : text;
  const tail = marker >= 0 ? text.slice(marker) : "";
  const lines = normalizeLines(body);
  const topMap = new Map<string, string>();
  const subMap = new Map<string, string>();
  const out: string[] = [];
  let currentTop = 0;
  let nextTop = 0;
  let nextSub = 0;

  for (const line of lines) {
    const top = line.trim().match(TOP_LEVEL_HEADING_RE);
    if (top) {
      nextTop += 1;
      currentTop = nextTop;
      nextSub = 0;
      if (top[1] !== String(nextTop)) {
        repairs.push("numbering_rebuilt");
        defects.push("numbering_mismatch");
      }
      topMap.set(top[1], String(nextTop));
      out.push(`${nextTop}. ${top[2].trim()}`);
      continue;
    }
    const sub = line.trim().match(SUBSECTION_HEADING_RE);
    if (sub && currentTop > 0) {
      nextSub += 1;
      const next = `${currentTop}.${nextSub}`;
      const old = `${sub[1]}.${sub[2]}`;
      if (old !== next) {
        repairs.push("numbering_rebuilt");
        defects.push("subsection_numbering_mismatch");
      }
      subMap.set(old, next);
      out.push(`${next} ${sub[3].trim()}`);
      continue;
    }
    out.push(line);
  }

  const topCount = nextTop;
  let reconciled = out.join("\n");
  reconciled = reconciled.replace(/\bSection\s+(\d+)(?:\.(\d+))?\b/g, (match, section, subsection) => {
    if (subsection) {
      const mapped = subMap.get(`${section}.${subsection}`);
      if (mapped) {
        repairs.push("reference_reconciled");
        return `Section ${mapped}`;
      }
      const parent = topMap.get(section);
      if (parent) {
        repairs.push("reference_reconciled");
        return `Section ${parent}`;
      }
      repairs.push("reference_reconciled");
      defects.push("orphan_subsection_reference");
      return "this Agreement";
    }
    const mapped = topMap.get(section);
    if (mapped && mapped !== section) {
      repairs.push("reference_reconciled");
      return `Section ${mapped}`;
    }
    const numeric = Number(section);
    if (!mapped && topCount > 0 && numeric > topCount) {
      repairs.push("reference_reconciled");
      defects.push("orphan_section_reference");
      return "this Agreement";
    }
    return match;
  });

  if (repairs.includes("numbering_rebuilt")) {
    logCompilerRepair("numbering_rebuilt", { topCount });
  }
  if (repairs.includes("reference_reconciled")) {
    logCompilerRepair("reference_reconciled", { topCount });
  }
  return {
    text: compact([reconciled.trim(), tail.trim()].filter(Boolean).join("\n\n")),
    repairs: [...new Set(repairs)],
    defects: [...new Set(defects)],
  };
}

export function validateInternalReferences(text: string): { ok: boolean; defects: string[] } {
  const marker = findSignatureRegionStart(text);
  const body = marker >= 0 ? text.slice(0, marker) : text;
  const lines = normalizeLines(body);
  const sections = new Set<string>();
  const subsections = new Set<string>();
  let current = "";
  for (const line of lines) {
    const top = line.trim().match(TOP_LEVEL_HEADING_RE);
    if (top) {
      current = top[1];
      sections.add(top[1]);
      continue;
    }
    const sub = line.trim().match(SUBSECTION_HEADING_RE);
    if (sub) {
      current = sub[1];
      subsections.add(`${sub[1]}.${sub[2]}`);
    }
  }
  const defects: string[] = [];
  for (const match of body.matchAll(/\bSection\s+(\d+)(?:\.(\d+))?\b/g)) {
    const section = match[1];
    const subsection = match[2];
    if (subsection && !subsections.has(`${section}.${subsection}`)) defects.push("malformed_reference");
    if (!subsection && !sections.has(section)) defects.push("malformed_reference");
  }
  for (const sub of subsections) {
    const parent = sub.split(".")[0];
    if (parent !== current && !sections.has(parent)) defects.push("orphan_subsection");
  }
  return { ok: defects.length === 0, defects: [...new Set(defects)] };
}

export function validateCanonicalFactParity(freeText: string, proText: string): { ok: boolean; defects: string[] } {
  const defects: string[] = [];
  const facts: readonly { id: string; re: RegExp; normalize?: (value: string) => string }[] = [
    { id: "governing_law", re: /\b(Oklahoma|Texas|Delaware|California|New York)\s+law\b/i, normalize: (v) => v.toLowerCase() },
    { id: "payment_structure", re: /\b(40\s*%|30\s*%|\$[\d,]+|month-to-month|monthly)\b/i, normalize: (v) => v.toLowerCase().replace(/\s+/g, "") },
    { id: "termination_structure", re: /\b(\d{1,3})\s*[- ]?days?\s+(?:written\s+)?notice\b/i },
    { id: "ownership_basics", re: /\b(client owns|company owns|service provider retains|provider retains)\b/i, normalize: (v) => v.toLowerCase().replace("company", "client") },
  ];
  for (const fact of facts) {
    const free = freeText.match(fact.re)?.[1];
    if (!free) continue;
    const pro = proText.match(fact.re)?.[1];
    const normalizedFree = fact.normalize ? fact.normalize(free) : free.toLowerCase();
    const normalizedPro = pro ? (fact.normalize ? fact.normalize(pro) : pro.toLowerCase()) : "";
    if (!pro || normalizedFree !== normalizedPro) defects.push(`canonical_fact_parity:${fact.id}`);
  }
  return { ok: defects.length === 0, defects };
}

export function stabilizeFinalAgreementCompilerOutput(
  text: string,
  context: FinalAgreementCompilerIntegrityContext = {},
): FinalAgreementCompilerIntegrityResult {
  const surface = context.surface ?? "final_agreement_compiler_integrity";
  return runCachedCorpusScan({
    surface,
    corpus: text,
    phase: "stabilize",
    scanType: "integrity_auto_repair",
    run: () => stabilizeFinalAgreementCompilerOutputUncached(text, context),
  });
}

function stabilizeFinalAgreementCompilerOutputUncached(
  text: string,
  context: FinalAgreementCompilerIntegrityContext = {},
): FinalAgreementCompilerIntegrityResult {
  let out = compact(text || "");
  const repairs: string[] = [];
  const defects: string[] = [];
  if (!out) return { text: out, repairs, defects };

  if (shouldBlockPaidProStructuralMutationAfterAcceptance(context.surface)) {
    return { text: out, repairs, defects };
  }

  const execution = isolateExecutionBlocks(out, context);
  out = execution.text;
  repairs.push(...execution.repairs);
  defects.push(...execution.defects);

  const contracts = validateSectionContracts(out, context);
  out = contracts.text;
  repairs.push(...contracts.repairs);
  defects.push(...contracts.defects);

  const marker = findSignatureRegionStart(out);
  const body = marker >= 0 ? out.slice(0, marker) : out;
  const tail = marker >= 0 ? out.slice(marker) : "";
  const subsection = enforceSubsectionPayloads(normalizeLines(body), context);
  out = compact([subsection.lines.join("\n").trim(), tail.trim()].filter(Boolean).join("\n\n"));
  repairs.push(...subsection.repairs);
  defects.push(...subsection.defects);

  const numbering = reconcileNumberingAndReferences(out);
  out = numbering.text;
  repairs.push(...numbering.repairs);
  defects.push(...numbering.defects);

  const finalRefs = validateInternalReferences(out);
  defects.push(...finalRefs.defects);
  const parity = context.freeText ? validateCanonicalFactParity(context.freeText, out) : { ok: true, defects: [] };
  defects.push(...parity.defects);
  if (repairs.length) {
    assertNoPostAcceptanceStructuralMutation({
      surface: context.surface ?? "final_agreement_compiler_integrity",
      mutation: "integrity-auto-repair",
      inputText: text,
      outputText: out,
    });
    logCompilerRepair("integrity-auto-repair", {
      repairs: [...new Set(repairs)],
      defects: [...new Set(defects)],
      surface: context.surface ?? null,
    });
  }

  return { text: out, repairs: [...new Set(repairs)], defects: [...new Set(defects)] };
}

export function finalAgreementHasEmptySubsectionShell(text: string): boolean {
  const lines = normalizeLines(text);
  for (let i = 0; i < lines.length; i += 1) {
    if (!SUBSECTION_HEADING_RE.test(lines[i].trim())) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    const next = lines[j]?.trim() ?? "";
    if (!next || TOP_LEVEL_HEADING_RE.test(next) || SUBSECTION_HEADING_RE.test(next) || SIGNATURE_START_RE.test(next)) return true;
  }
  return false;
}

export function finalAgreementHasExecutionContamination(text: string): boolean {
  const marker = findSignatureRegionStart(text);
  const body = marker >= 0 ? text.slice(0, marker) : text;
  return normalizeLines(body).some((line) => likelySignatureLine(line) || malformedPartyFragment(line));
}
