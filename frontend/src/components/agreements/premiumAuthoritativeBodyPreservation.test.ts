import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";
import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { repairDuplicateAgreementOpening } from "./canonicalPartyIdentityResolver";
import {
  AUTHORITATIVE_BODY_PRESERVE_DOWNGRADE_RATIO,
  coalesceAuthoritativePremiumBody,
  resolveAuthoritativePremiumSnapshotPlain,
} from "./premiumAuthoritativeBodyPreservation";
import { resolvePremiumRenderSource } from "./premiumRenderSourceResolver";

const MINIMAL_INTAKE = `
Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup.
Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.
`.trim();

const emptyPayment = { amount: 5000, cadence: null as string | null, valid: true };

function servicesDraft(over: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Texas",
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    purpose: "AI workflow setup.",
    payment_terms: "$5,000",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: emptyPayment,
    agreement_family: "services_agreement",
    ...over,
  };
}

function longProBody(minLen = 2_700): string {
  const core = [
    "SERVICES AGREEMENT",
    'This SERVICES AGREEMENT (the "Agreement") is This Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.',
    "1. Scope. Provider delivers AI workflow setup for Client.",
    "2. Fees. Client pays Provider $5,000.",
    "3. Governing Law. Texas.",
    "4. Confidentiality. Mutual.",
    "5. Termination. Material breach with notice.",
    "6. Limitation of Liability. Except gross negligence.",
    "7. Disputes. Negotiation then courts of Texas.",
    "8. Notices. Email to designated representatives.",
    "9. Entire Agreement. Electronic signatures permitted.",
    "EXECUTION — SIGNATURES",
    "Red Mesa Logistics LLC (Client)\nBy: ____________________",
    "Harbor Peak Automation LLC (Service Provider)\nBy: ____________________",
  ].join("\n\n");
  const pad = " Operative services clause with commercially reasonable performance standards. ".repeat(40);
  let t = core;
  while (t.length < minLen) t += pad;
  return t;
}

describe("premiumAuthoritativeBodyPreservation", () => {
  it("blocks material shrink of accepted winning body", () => {
    const winning = SHARED_ACCEPTED_PAID_BODY;
    const short = "y".repeat(880);
    const r = coalesceAuthoritativePremiumBody({
      preservedBody: winning,
      candidateBody: short,
      preservedSource: "server_full_draft",
      candidateSource: "canonical_fallback",
    });
    expect(r.downgradePrevented).toBe(true);
    expect(r.text).toHaveLength(2_700);
  });

  it("allows validated repair success even when shorter", () => {
    const winning = SHARED_ACCEPTED_PAID_BODY;
    const repaired = "z".repeat(2_000);
    const r = coalesceAuthoritativePremiumBody({
      preservedBody: winning,
      candidateBody: repaired,
      preservedSource: "server_full_draft",
      candidateSource: "validated_repair",
      allowValidatedRepairSuccess: true,
    });
    expect(r.text).toHaveLength(2_000);
    expect(r.downgradePrevented).toBe(false);
  });

  it("resolveAuthoritativePremiumSnapshotPlain keeps >=80% of winning after short resolved text", () => {
    const winning = longProBody(2_696);
    const resolved = "z".repeat(880);
    const r = resolveAuthoritativePremiumSnapshotPlain({
      winningBody: winning,
      resolvedText: resolved,
      pipelineSource: "server_full_draft",
      resolvedSource: "server_full_document_text",
      intakeText: MINIMAL_INTAKE,
      draft: servicesDraft(),
    });
    expect(r.text.length).toBeGreaterThanOrEqual(
      Math.floor(winning.length * AUTHORITATIVE_BODY_PRESERVE_DOWNGRADE_RATIO),
    );
    expect(r.downgradePrevented).toBe(true);
  });

  it("repairs duplicate services agreement opening", () => {
    const broken =
      'This SERVICES AGREEMENT (the "Agreement") is This Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.';
    const records = [
      {
        fullLegalName: "Red Mesa Logistics LLC",
        roleLabel: "Client",
        displayAlias: "Red Mesa",
        signerName: null,
        signerTitle: null,
      },
      {
        fullLegalName: "Harbor Peak Automation LLC",
        roleLabel: "Service Provider",
        displayAlias: "Harbor Peak",
        signerName: null,
        signerTitle: null,
      },
    ];
    const { text, repairs } = repairDuplicateAgreementOpening(broken, records);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).toContain('This Services Agreement (the "Agreement") is entered into by and between');
    expect(text).toContain('Red Mesa Logistics LLC ("Client")');
    expect(text).toContain('Harbor Peak Automation LLC ("Service Provider")');
    expect(text).not.toMatch(/is This Agreement is between/i);
  });
});

describe("resolvePremiumRenderSource authoritative preservation", () => {
  it("prefers long paidAuthoritativeProBody over short server_full_document_text on draft", () => {
    const paid = longProBody(2_696);
    const shortServer = "z".repeat(880);
    const r = resolvePremiumRenderSource({
      draft: servicesDraft({
        premium_server_full_document_text: shortServer,
        premium_full_document_text: shortServer,
      }),
      intakeText: MINIMAL_INTAKE,
      paidAuthoritativeProBody: paid,
      premiumWinningCorpusFallback: paid,
      buildLivePreview: () => "LIVE ".repeat(400),
    });
    expect(r.premium_render_source).toBe("server_full_document_text");
    expect(r.text.length).toBeGreaterThanOrEqual(Math.floor(paid.length * 0.8));
    expect(r.text).not.toHaveLength(880);
  });

  it("uses winning corpus when draft server field is shorter than fallback", () => {
    const winning = longProBody(2_696);
    const shortOnDraft = "z".repeat(880);
    const r = resolvePremiumRenderSource({
      draft: servicesDraft({
        premium_server_full_document_text: shortOnDraft,
        premium_full_document_text: shortOnDraft,
      }),
      intakeText: MINIMAL_INTAKE,
      premiumWinningCorpusFallback: winning,
      buildLivePreview: () => "LIVE ".repeat(200),
    });
    expect(r.text.length).toBeGreaterThanOrEqual(Math.floor(winning.length * 0.8));
  });
});
