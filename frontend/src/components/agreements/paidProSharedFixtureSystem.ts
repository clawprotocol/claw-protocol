/**
 * Shared Paid Pro corpus fixtures — hybrid deterministic builders + versioned literals.
 *
 * Positive fixtures exceed SUBSTANTIVE_SERVER_DRAFT_MIN_LEN and pass professional coverage.
 * Negative fixtures remain explicitly deficient for rejection tests.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { assessProfessionalProClauseCoverage } from "./paidProProfessionalClauseCoverage";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import { buildAcceptedQuadPartyServerCorpus } from "./paidProTestAcceptedQuadPartyCorpus";
import { TEST518_DASHBOARD_CREATE_INTAKE, TEST518_PRODUCTION_QUAD_PARTY_INTAKE } from "./paidProTest518Fixtures";

/** Bump when builder semantics change (requires hash fixture review). */
export const PAID_PRO_SHARED_FIXTURE_VERSION = "v1" as const;

export const SHARED_RED_MESA = "Red Mesa Logistics LLC";
export const SHARED_HARBOR_PEAK = "Harbor Peak Automation LLC";
export const SHARED_BLUE_CANYON = "Blue Canyon Analytics LLC";

export const SHARED_TWO_PARTY_INTAKE = [
  `Draft a Professional Services Agreement between ${SHARED_RED_MESA} (Client) and ${SHARED_HARBOR_PEAK} (Service Provider).`,
  "",
  "Harbor Peak will evaluate warehouse operations, optimize workflows, automate reporting, and implement dashboard integrations.",
  "",
  "Total fee: $96,000 payable in four milestone installments. Term: twelve (12) months.",
  "",
  "Include confidentiality, intellectual property, limitation of liability, termination for cause or convenience, governing law (Delaware), notice provisions, and standard signature blocks.",
  "",
  "Authorized signers:",
  `* Sarah Mitchell, CEO, ${SHARED_RED_MESA}`,
  `* Michael Torres, President, ${SHARED_HARBOR_PEAK}`,
].join("\n");

export const SHARED_TRIPARTITE_INTAKE = [
  "Create a TRIPARTITE SOFTWARE DEVELOPMENT AND REVENUE SHARING AGREEMENT.",
  "",
  `Party 1: ${SHARED_RED_MESA}`,
  `Party 2: ${SHARED_HARBOR_PEAK}`,
  `Party 3: ${SHARED_BLUE_CANYON}`,
  "",
  "Include confidentiality, intellectual property, limitation of liability, termination, governing law (Oklahoma), notices, and electronic signatures.",
  "Revenue sharing: Red Mesa 50%, Harbor Peak 30%, Blue Canyon 20%.",
].join("\n");

const TWO_PARTY_OPERATIVE_SECTIONS = [
  "1. DEFINITIONS. Capitalized terms have the meanings set forth in this Agreement.",
  "2. SCOPE OF SERVICES. Service Provider shall perform commercially reasonable consulting, implementation, and reporting services described in the statement of work.",
  "3. PAYMENT. Client shall pay Service Provider the fees stated in the recital in accordance with the milestone schedule. Late amounts accrue interest at the lesser of 1.5% per month or the maximum permitted by law.",
  "4. TERM AND TERMINATION. The term is twelve (12) months unless terminated earlier. Either party may terminate for cause upon uncured material breach or for convenience upon thirty (30) days' written notice.",
  "5. CONFIDENTIALITY. Each party shall hold the other party's Confidential Information in strict confidence and use it only to perform under this Agreement.",
  "6. INTELLECTUAL PROPERTY. Service Provider assigns to Client all right, title, and interest in work product, deliverables, and inventions arising from the services, excluding pre-existing materials.",
  "7. REPRESENTATIONS. Each party represents it has authority to enter this Agreement and will comply with applicable law.",
  "8. LIMITATION OF LIABILITY. Neither party is liable for indirect, incidental, special, or consequential damages. Aggregate liability is capped at fees paid in the twelve months preceding the claim.",
  "9. INDEMNITY. Each party shall defend and indemnify the other against third-party claims arising from its gross negligence or willful misconduct.",
  "10. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware without regard to conflict of laws principles.",
  "11. NOTICES. All notices must be in writing and delivered to the notice addresses designated below with confirmation of receipt.",
  "12. ENTIRE AGREEMENT. This Agreement constitutes the entire agreement and may be amended only in a signed writing.",
  "IN WITNESS WHEREOF, the parties execute this Agreement by their authorized signers.",
  `CLIENT:\n${SHARED_RED_MESA}\nBy: ____________________\nName:\nTitle:\nDate:\n\nSERVICE PROVIDER:\n${SHARED_HARBOR_PEAK}\nBy: ____________________\nName:\nTitle:\nDate:`,
].join("\n\n");

function buildTwoPartyOperativeHeader(): string {
  return [
    "PROFESSIONAL SERVICES AGREEMENT",
    "",
    `This Professional Services Agreement ("Agreement") is entered into by and between ${SHARED_RED_MESA} ("Client") and ${SHARED_HARBOR_PEAK} ("Service Provider").`,
    "",
    TWO_PARTY_OPERATIVE_SECTIONS,
  ].join("\n\n");
}

/** Positive two-party professional services corpus — deterministic builder. */
export function buildTwoPartyProfessionalServicesCorpus(
  minLen = SUBSTANTIVE_SERVER_DRAFT_MIN_LEN,
): string {
  return expandOperativeCorpusWithUniqueSupplements(buildTwoPartyOperativeHeader(), minLen);
}

/** Positive tripartite professional services corpus. */
export function buildTripartiteProfessionalServicesCorpus(
  minLen = SUBSTANTIVE_SERVER_DRAFT_MIN_LEN,
): string {
  const header = [
    "TRIPARTITE SOFTWARE DEVELOPMENT AND REVENUE SHARING AGREEMENT",
    "",
    `This Agreement is entered into among ${SHARED_RED_MESA}, ${SHARED_HARBOR_PEAK}, and ${SHARED_BLUE_CANYON}.`,
    "",
    TWO_PARTY_OPERATIVE_SECTIONS.replaceAll(SHARED_HARBOR_PEAK, `${SHARED_HARBOR_PEAK} and ${SHARED_BLUE_CANYON}`),
  ].join("\n\n");
  return expandOperativeCorpusWithUniqueSupplements(header, minLen);
}

/** Positive four-party corpus via existing deterministic fallback. */
export function buildFourPartyProfessionalServicesCorpus(
  intake = TEST518_DASHBOARD_CREATE_INTAKE,
  minLen = SUBSTANTIVE_SERVER_DRAFT_MIN_LEN,
): string {
  return buildAcceptedQuadPartyServerCorpus(intake, buildFourPartyProfessionalServicesDraft(intake), minLen);
}

export function buildFourPartyProfessionalServicesDraft(
  intake = TEST518_DASHBOARD_CREATE_INTAKE,
): ParsedDraftShape {
  void intake;
  return {
    title: "Multi-Party Services Agreement",
    jurisdiction: "Delaware",
    purpose: "Professional technology services",
    payment_terms: "$450,000 milestone installments",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: "$450,000 milestone installments",
    parties: [
      { name: "Redwood Biologics, Inc.", role: "Client" },
      { name: "Summit AI Consulting LLC", role: "Lead Provider" },
      { name: "Blue Harbor Systems LLC", role: "Implementation Partner" },
      { name: "Iron Gate Security LLC", role: "Cybersecurity Auditor" },
    ],
    premium_render_source: "server_full_document_text",
  } as unknown as ParsedDraftShape;
}

export function buildTwoPartyProfessionalServicesDraft(
  corpus = buildTwoPartyProfessionalServicesCorpus(),
): ParsedDraftShape {
  return {
    title: "Professional Services Agreement",
    jurisdiction: "Delaware",
    purpose: "Warehouse operations optimization and reporting integrations",
    payment_terms: "$96,000 milestone installments",
    parties: [
      { name: SHARED_RED_MESA, role: "Client" },
      { name: SHARED_HARBOR_PEAK, role: "Service Provider" },
    ],
    premium_render_source: "server_full_document_text",
    premium_server_full_document_text: corpus,
    premium_full_document_text: corpus,
  } as ParsedDraftShape;
}

/** Explicit thin body for negative source-label / mislabeled tests. */
export function buildThinMislabeledServerFullDraft(len = 719): string {
  return `CONSULTING AGREEMENT between ${SHARED_RED_MESA} and ${SHARED_HARBOR_PEAK}. ${"x".repeat(Math.max(0, len - 80))}`;
}

/** Missing IP section only — professional coverage negative. */
export function buildTwoPartyMissingIpNegativeCorpus(
  minLen = SUBSTANTIVE_SERVER_DRAFT_MIN_LEN,
): string {
  const withoutIp = TWO_PARTY_OPERATIVE_SECTIONS.replace(
    /6\. INTELLECTUAL PROPERTY\.[^\n]+(?:\n[^\n]+)*/i,
    "6. INTELLECTUAL PROPERTY. [Intentionally omitted for negative fixture.]",
  );
  const header = [
    "PROFESSIONAL SERVICES AGREEMENT",
    "",
    `This Agreement is between ${SHARED_RED_MESA} and ${SHARED_HARBOR_PEAK}.`,
    "",
    withoutIp,
  ].join("\n\n");
  return expandOperativeCorpusWithUniqueSupplements(header, minLen);
}

/** Versioned frozen literal for hash/parity tests (two-party v1). */
export const FROZEN_TWO_PARTY_PROFESSIONAL_V1 = buildTwoPartyProfessionalServicesCorpus();
export const FROZEN_TWO_PARTY_PROFESSIONAL_V1_HASH = hashPaidProCorpus(FROZEN_TWO_PARTY_PROFESSIONAL_V1);

/** Back-compat aliases used across legacy tests. */
export const SHARED_ACCEPTED_PAID_BODY = FROZEN_TWO_PARTY_PROFESSIONAL_V1;
export const SHARED_ACCEPTED_PAID_BODY_HASH = FROZEN_TWO_PARTY_PROFESSIONAL_V1_HASH;

export function assertSharedFixturePassesProfessionalGate(
  corpus: string,
  intake = SHARED_TWO_PARTY_INTAKE,
): void {
  const assessment = assessProfessionalProClauseCoverage({ text: corpus, intake });
  if (!assessment.ok) {
    throw new Error(
      `[shared-fixture-gate-failed] missing=${assessment.missingClauses.join(",")};len=${corpus.length}`,
    );
  }
  if (corpus.length < SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) {
    throw new Error(
      `[shared-fixture-gate-failed] below_substantive_min;len=${corpus.length};min=${SUBSTANTIVE_SERVER_DRAFT_MIN_LEN}`,
    );
  }
}

export const SHARED_QUAD_PARTY_INTAKE = TEST518_PRODUCTION_QUAD_PARTY_INTAKE;

export type ProfessionalServicesCorpusOptions = {
  parties?: 2 | 3 | 4;
  governingLaw?: string;
  minLen?: number;
};

export type IncompleteProfessionalCorpusOptions = {
  base?: string;
  omit: "intellectual_property" | "termination" | "confidentiality";
  minLen?: number;
};

/** Unified builder entry point for positive professional corpora. */
export function buildProfessionalServicesCorpus(opts: ProfessionalServicesCorpusOptions = {}): string {
  const minLen = opts.minLen ?? SUBSTANTIVE_SERVER_DRAFT_MIN_LEN;
  const parties = opts.parties ?? 2;
  if (parties >= 4) return buildFourPartyProfessionalServicesCorpus(TEST518_DASHBOARD_CREATE_INTAKE, minLen);
  if (parties === 3) return buildTripartiteProfessionalServicesCorpus(minLen);
  return buildTwoPartyProfessionalServicesCorpus(minLen);
}

/** Negative derivative — omit one required section from valid base. */
export function buildIncompleteProfessionalCorpus(opts: IncompleteProfessionalCorpusOptions): string {
  if (opts.omit === "intellectual_property") {
    return buildTwoPartyMissingIpNegativeCorpus(opts.minLen);
  }
  const base = opts.base ?? buildTwoPartyProfessionalServicesCorpus(opts.minLen);
  const patterns: Record<IncompleteProfessionalCorpusOptions["omit"], RegExp> = {
    intellectual_property: /6\. INTELLECTUAL PROPERTY[^\n]*/i,
    termination: /4\. TERM AND TERMINATION[^\n]*/i,
    confidentiality: /5\. CONFIDENTIALITY[^\n]*/i,
  };
  return base.replace(patterns[opts.omit], `${opts.omit.toUpperCase()} [Intentionally omitted for negative fixture.]`);
}

/** Frozen fixture metadata for hash governance. */
export const FROZEN_FIXTURE_REGISTRY = {
  "two-party-professional-v1": {
    id: "two-party-professional-v1",
    version: PAID_PRO_SHARED_FIXTURE_VERSION,
    purpose: "Canonical two-party professional services hash/parity",
    partyCount: 2,
    sectionManifest: [
      "definitions",
      "scope",
      "payment",
      "term",
      "termination",
      "confidentiality",
      "intellectual_property",
      "representations",
      "liability",
      "indemnity",
      "governing_law",
      "notices",
      "execution",
    ],
    executionBlockPolicy: "single",
    expectedHash: FROZEN_TWO_PARTY_PROFESSIONAL_V1_HASH,
    changeLog: ["v1: initial shared deterministic builder"],
  },
} as const;
