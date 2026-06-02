/**
 * Professional structure floor for Paid Pro mutual consulting / implementation agreements.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { isCommercialServicesIntake } from "./agreementIntentContract";
import { insertBeforeExecutionTail } from "./paidProMutualConsultingQualityFloorInsert";

export type MutualConsultingStructureTopic =
  | "services_scope"
  | "term"
  | "compensation"
  | "confidentiality"
  | "ownership_work_product"
  | "independent_contractor"
  | "warranties_compliance"
  | "termination_suspension"
  | "limitation_liability"
  | "notices"
  | "governing_law_venue"
  | "miscellaneous_esignatures";

export const MUTUAL_CONSULTING_MIN_NUMBERED_SECTIONS = 12;
export const MUTUAL_CONSULTING_LIGHTWEIGHT_SECTION_CEILING = 9;

const TOPIC_PATTERNS: Record<MutualConsultingStructureTopic, RegExp> = {
  services_scope:
    /\b(?:scope\s+of\s+services|project\s+scope|services\s+and\s+deliverables|professional\s+services)\b/i,
  term: /\b(?:term\s+of\s+agreement|term\s+and\s+termination|commencement|effective\s+date)\b/i,
  compensation:
    /\b(?:compensation|payment\s+schedule|fees?\s+and\s+payment|consideration|invoice)\b/i,
  confidentiality: /\bconfidential(?:ity| information)\b/i,
  ownership_work_product:
    /\b(?:work\s+product|ownership|intellectual\s+property|use\s+rights|assign(?:ment)?)\b/i,
  independent_contractor:
    /\b(?:independent\s+contractor|contractor\s+status|access\s+responsibilit|client\s+systems)\b/i,
  warranties_compliance:
    /\b(?:warrant(?:y|ies)|representations?|compliance|disclaimer)\b/i,
  termination_suspension: /\b(?:terminat(?:ion|e)|suspend(?:ed|sion)?)\b/i,
  limitation_liability: /\b(?:limitation\s+of\s+liability|liability\s+cap|consequential\s+damages)\b/i,
  notices: /\b(?:notices?|notice\s+details|email\s+for\s+notice)\b/i,
  governing_law_venue:
    /\b(?:governing\s+law|venue|jurisdiction|dispute\s+resolution|laws\s+of)\b/i,
  miscellaneous_esignatures:
    /\b(?:entire\s+agreement|miscellaneous|amendment|severability|electronic\s+signatures?|counterparts?)\b/i,
};

export function countNumberedAgreementSections(text: string): number {
  const nums = new Set(
    [...(text || "").matchAll(/^\s*(\d{1,2})\.\s+[A-Z]/gm)].map((m) => Number(m[1])).filter(Number.isFinite),
  );
  return nums.size;
}

export function assessPaidProMutualConsultingProfessionalStructure(args: {
  text: string;
  rawIntake: string;
  draft?: ParsedDraftShape | null;
}): {
  applies: boolean;
  ok: boolean;
  numberedSectionCount: number;
  topicsFound: MutualConsultingStructureTopic[];
  topicsMissing: MutualConsultingStructureTopic[];
  collapsedLightweight: boolean;
} {
  const text = (args.text || "").trim();
  const intake = (args.rawIntake || "").trim();
  const numberedSectionCount = countNumberedAgreementSections(text);
  const applies =
    isCommercialServicesIntake(intake) &&
    ((/\bmutual\s+consulting\b/i.test(intake) && /\bimplementation\b/i.test(intake)) ||
      (numberedSectionCount > 0 && numberedSectionCount <= MUTUAL_CONSULTING_LIGHTWEIGHT_SECTION_CEILING));
  if (!applies) {
    return {
      applies: false,
      ok: true,
      numberedSectionCount,
      topicsFound: [],
      topicsMissing: [],
      collapsedLightweight: false,
    };
  }
  const topicsFound: MutualConsultingStructureTopic[] = [];
  const topicsMissing: MutualConsultingStructureTopic[] = [];
  for (const topic of Object.keys(TOPIC_PATTERNS) as MutualConsultingStructureTopic[]) {
    if (TOPIC_PATTERNS[topic].test(text)) topicsFound.push(topic);
    else topicsMissing.push(topic);
  }
  const collapsedLightweight = numberedSectionCount > 0 && numberedSectionCount <= MUTUAL_CONSULTING_LIGHTWEIGHT_SECTION_CEILING;
  const ok =
    !collapsedLightweight &&
    numberedSectionCount >= MUTUAL_CONSULTING_MIN_NUMBERED_SECTIONS &&
    topicsMissing.length === 0;
  return {
    applies,
    ok,
    numberedSectionCount,
    topicsFound,
    topicsMissing,
    collapsedLightweight,
  };
}

export function applyMutualConsultingProfessionalQualityFloor(
  text: string,
  draft: ParsedDraftShape | null | undefined,
  intakeText: string,
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n?/g, "\n").trim();
  const assessment = assessPaidProMutualConsultingProfessionalStructure({
    text: out,
    rawIntake: intakeText,
    draft,
  });
  if (!assessment.applies || assessment.ok) return { text: out, repairs };

  const parties = draft?.parties ?? [];
  const client = String(parties[0]?.name || "Client").trim() || "Client";
  const provider = String(parties[1]?.name || "Service Provider").trim() || "Service Provider";
  let n = countNumberedAgreementSections(out) + 1;
  const sections: string[] = [];

  const pushIfMissing = (topic: MutualConsultingStructureTopic, body: string) => {
    if (!TOPIC_PATTERNS[topic].test(out)) {
      sections.push(`${n++}. ${body}`);
      repairs.push(`quality:mutual_consulting_${topic}`);
    }
  };

  pushIfMissing(
    "services_scope",
    `SCOPE OF SERVICES AND PROJECT DELIVERABLES\n${provider} will perform the consulting and implementation services described in any Statement of Work, including automation tooling, AI-assisted reporting workflows, and related implementation support for ${client}.`,
  );
  pushIfMissing(
    "term",
    `TERM\nThis Agreement begins on the Effective Date and continues until the services are completed or terminated as provided herein.`,
  );
  pushIfMissing(
    "compensation",
    `COMPENSATION AND PAYMENT SCHEDULE\n${client} will pay ${provider} the fees stated in the applicable Statement of Work or order form. Invoices are due within thirty (30) days unless otherwise agreed in writing.`,
  );
  pushIfMissing(
    "confidentiality",
    `CONFIDENTIALITY\nEach Party will protect the other Party's Confidential Information using reasonable care and use it only to perform under this Agreement.`,
  );
  pushIfMissing(
    "ownership_work_product",
    `OWNERSHIP AND WORK PRODUCT\n${client} owns deliverables created specifically for ${client} under this Agreement once paid in full. ${provider} retains pre-existing tools, templates, and background materials.`,
  );
  pushIfMissing(
    "independent_contractor",
    `INDEPENDENT CONTRACTOR AND ACCESS\n${provider} is an independent contractor. ${provider} will access ${client} systems only as authorized and will comply with ${client}'s reasonable security policies.`,
  );
  pushIfMissing(
    "warranties_compliance",
    `WARRANTIES AND COMPLIANCE\nEach Party represents it has authority to enter this Agreement. Services are provided professionally and in material conformance with the agreed scope, subject to the limitations herein.`,
  );
  pushIfMissing(
    "termination_suspension",
    `TERMINATION AND SUSPENSION\nEither Party may terminate for uncured material breach after written notice. ${provider} may suspend services for non-payment after notice.`,
  );
  pushIfMissing(
    "limitation_liability",
    `LIMITATION OF LIABILITY\nNeither Party is liable for indirect or consequential damages except as required by law. Direct damages are capped to fees paid in the twelve (12) months preceding the claim.`,
  );
  pushIfMissing(
    "notices",
    `NOTICES\nFormal notices may be sent by email to the addresses in Party Notice Details or the signature blocks, with confirmation of receipt.`,
  );
  pushIfMissing(
    "governing_law_venue",
    `GOVERNING LAW AND VENUE\nThis Agreement is governed by the laws of ${String(draft?.jurisdiction || "Delaware").trim() || "Delaware"}, without regard to conflict-of-law rules.`,
  );
  pushIfMissing(
    "miscellaneous_esignatures",
    `MISCELLANEOUS AND ELECTRONIC SIGNATURES\nThis Agreement is the entire agreement between the Parties. It may be executed electronically with the same effect as originals.`,
  );

  if (sections.length) {
    out = insertBeforeExecutionTail(out, sections.join("\n\n"));
  }
  return { text: out.trim(), repairs };
}
