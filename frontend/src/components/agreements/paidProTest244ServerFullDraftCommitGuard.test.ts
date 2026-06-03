import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { logPaidProCorpusInvariant } from "./paidProSourceOfTruth";
import {
  clearFrozenPremiumSessionBodiesForTests,
  freezeAcceptedPremiumBodyForSession,
  latchAcceptedServerFullDraftAuthority,
  LONG_PREMIUM_AUTHORITATIVE_MIN_LEN,
} from "./premiumAcceptancePolicy";
import {
  guardPaidProAcceptedServerFullDraftCommit,
  PAID_PRO_ACCEPTED_SERVER_SHORTENING_MAX_RATIO,
} from "./paidProAcceptedServerFullDraftCommitGuard";
import { resolveAuthoritativePremiumSnapshotPlain } from "./premiumAuthoritativeBodyPreservation";
import { tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth } from "./paidProPostCheckoutRecoveryAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const structured: ParsedDraftShape = {
  title: "Mutual Consulting and Implementation Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  purpose: "AI workflow implementation services.",
  payment_terms: "$8,500 fixed fee.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: emptyPayment,
  agreement_family: "services_agreement",
};

function buildAcceptedServerBody(targetLen: number): string {
  const header = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    "Blue Canyon Analytics LLC (Client) and Iron Vale Systems Inc. (Service Provider).",
    "Delaware law governs. Fixed fee $8,500.",
    "",
    "1. Scope. AI workflow implementation services with commercially reasonable skill.",
    "2. Payment. $8,500 upon execution.",
    "3. Confidentiality. Mutual obligations apply.",
    "4. IP. Work product vests in Client after payment.",
    "5. Term. Twelve months unless terminated for material breach.",
    "",
    "IN WITNESS WHEREOF",
    "CLIENT: Blue Canyon Analytics LLC",
    "SERVICE PROVIDER: Iron Vale Systems Inc.",
  ].join("\n");
  let body = header;
  let i = 0;
  while (body.length < targetLen) {
    body += `\nSection ${i + 1}. Additional operative clause for milestone delivery and acceptance criteria.\n`;
    i += 1;
  }
  return body;
}

describe("paidPro Test244 server_full_draft commit guard", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearFrozenPremiumSessionBodiesForTests();
    vi.restoreAllMocks();
  });

  it("rejects 4711 candidate when 15817 server_full_draft is latched", () => {
    const accepted = buildAcceptedServerBody(15_817);
    expect(accepted.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);
    latchAcceptedServerFullDraftAuthority(accepted, "server_full_draft");

    const shortCandidate = "z".repeat(4_711);
    const guarded = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: shortCandidate,
      candidateSource: "server_full_draft",
      renderSource: "server_full_draft",
      generationOutcome: "ok",
      agreementGenerationId: "g-test244",
      reason: "test_short_candidate",
    });

    expect(guarded.rejected).toBe(true);
    expect(guarded.text.length).toBeGreaterThanOrEqual(
      Math.floor(accepted.length * PAID_PRO_ACCEPTED_SERVER_SHORTENING_MAX_RATIO),
    );
    expect(guarded.text.length).toBeGreaterThan(
      Math.floor(accepted.length * PAID_PRO_ACCEPTED_SERVER_SHORTENING_MAX_RATIO),
    );
    expect(hashPaidProCorpus(guarded.text)).toBe(guarded.acceptedHash);
  });

  it("establishPaidProSourceOfTruth preserves latched full server body over shorter second commit", () => {
    const accepted = buildAcceptedServerBody(15_817);
    freezeAcceptedPremiumBodyForSession("g-test244-sot", accepted, "server_full_draft");

    establishPaidProSourceOfTruth({
      text: accepted,
      source: "server_full_draft",
      draft: structured,
      intakeText: "Blue Canyon and Iron Vale consulting $8500 Delaware",
      agreementGenerationId: "g-test244-sot",
      generationOutcome: "ok",
    });
    const firstHash = getPaidProSourceOfTruth()!.hash;
    const firstLen = getPaidProSourceOfTruth()!.text.length;
    expect(firstLen).toBeGreaterThanOrEqual(
      Math.floor(accepted.length * PAID_PRO_ACCEPTED_SERVER_SHORTENING_MAX_RATIO),
    );

    establishPaidProSourceOfTruth({
      text: "y".repeat(4_711),
      source: "server_full_draft",
      draft: structured,
      agreementGenerationId: "g-test244-sot",
      generationOutcome: "ok",
    });
    expect(getPaidProSourceOfTruth()!.hash).toBe(firstHash);
    expect(getPaidProSourceOfTruth()!.text.length).toBe(firstLen);
  });

  it("invariant validates full accepted corpus hash, not shortened fallback", () => {
    const accepted = buildAcceptedServerBody(15_817);
    latchAcceptedServerFullDraftAuthority(accepted, "server_full_draft");
    establishPaidProSourceOfTruth({
      text: accepted,
      source: "server_full_draft",
      draft: structured,
      intakeText: "Blue Canyon Iron Vale AI workflow $8500 Delaware",
      generationOutcome: "ok",
    });
    const record = getPaidProSourceOfTruth()!;
    const invariant = logPaidProCorpusInvariant({
      displayed: record.text,
      copied: record.text,
      review: record.text,
      finalized: record.text,
      vs01: record.text,
    });
    expect(invariant).not.toBeNull();
    expect(invariant!.accepted_len).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);
    expect(invariant!.accepted_hash).toBe(record.hash);
    expect(invariant!.review_matches).toBe(true);
    expect(invariant!.accepted_len).toBeGreaterThan(10_000);
  });

  it("recovery SoT commit blocked when latched server_full_draft exists", () => {
    const accepted = buildAcceptedServerBody(15_817);
    latchAcceptedServerFullDraftAuthority(accepted, "server_full_draft");
    const recovery = buildAcceptedServerBody(5_200);
    const out = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: recovery,
      draft: structured,
      intakeText: "Blue Canyon Iron Vale",
      premiumRenderSource: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(out.committed).toBe(false);
    if (!out.committed) {
      expect(out.reason).toBe("latched_server_full_draft_authority_present");
    }
  });

  it("resolveAuthoritativePremiumSnapshotPlain preserves winning server body over short resolved text", () => {
    const winning = buildAcceptedServerBody(15_817);
    latchAcceptedServerFullDraftAuthority(winning, "server_full_draft");
    const resolved = "x".repeat(4_711);
    const r = resolveAuthoritativePremiumSnapshotPlain({
      winningBody: winning,
      resolvedText: resolved,
      pipelineSource: "server_full_draft",
      resolvedSource: "server_full_document_text",
      intakeText: "Blue Canyon Iron Vale AI $8500 Delaware",
      draft: structured,
    });
    expect(r.text.length).toBeGreaterThanOrEqual(
      Math.floor(winning.length * PAID_PRO_ACCEPTED_SERVER_SHORTENING_MAX_RATIO),
    );
    expect(r.downgradePrevented).toBe(true);
  });

  it("server_full_draft path does not accept fallback_preview as commit candidate when latched", () => {
    const accepted = buildAcceptedServerBody(15_817);
    latchAcceptedServerFullDraftAuthority(accepted, "server_full_draft");
    const guarded = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: "preview ".repeat(400),
      candidateSource: "fallback_preview",
      renderSource: "server_full_draft",
      generationOutcome: "ok",
      reason: "test_fallback",
    });
    expect(guarded.rejected).toBe(true);
    expect(isAuthoritativePremiumPipelineRenderSource("fallback_preview")).toBe(false);
    expect(guarded.text.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);
  });
});
