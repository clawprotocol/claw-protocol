/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearLawdogUserSessionState } from "../../auth/userSessionState";
import { getOrgId, setOrgId } from "../../launch/orgContext";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { commitAcceptedPaidProCorpusHandoffSync } from "./enterCanonicalPaidProReviewFlow";
import {
  inactivateImmutableFrozenLegalCorpusSession,
  rememberImmutableFrozenLegalCorpus,
  resolveImmutableFrozenLegalCorpusOnSignerFinalize,
  restoreImmutableFrozenLegalCorpusFromServerAuthority,
} from "./paidProFrozenLegalCorpus";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  SHARED_HARBOR_PEAK,
  SHARED_RED_MESA,
  buildTwoPartyProfessionalServicesCorpus,
} from "./paidProSharedFixtureSystem";
import { hashPaidProCorpus } from "./paidProSourceOfTruthState";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";

const ORG_ONE = "user-scope-frozen-one";
const ORG_TWO = "user-scope-frozen-two";
const AGREEMENT_A = "ag_frozen_legal_a";
const AGREEMENT_B = "ag_frozen_legal_b";
const BROWSER_STASH_KEY = "claw_frozen_legal_corpus_v1";

function bodyA(): string {
  return buildTwoPartyProfessionalServicesCorpus(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
}

function bodyB(): string {
  return `${bodyA()}\n\nOperational addendum unique to Agreement B. The parties confirm this addendum is part of Agreement B only.`;
}

function finalizeScope(args: {
  rawCorpus: string;
  agreementId?: string | null;
  organizationId?: string | null;
  expectedFrozenHash?: string | null;
}): string | null {
  const authority = buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: SHARED_RED_MESA,
    recipient2Name: SHARED_HARBOR_PEAK,
    recipient1Email: "a@example.test",
    recipient2Email: "b@example.test",
    extraPartyReviewEmails: [],
    partySignerNames: ["Pat Kim", "Riley Chen"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: ["", ""],
  });
  const resolved = resolveImmutableFrozenLegalCorpusOnSignerFinalize({
    surface: "finalize_paid_pro_signer_metadata",
    signatureRegionOnly: true,
    repairRecital: false,
    agreementId: args.agreementId,
    organizationId: args.organizationId,
    expectedHash: args.expectedFrozenHash,
  });
  if (resolved !== null) return resolved;
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: args.rawCorpus,
    authority,
    intakeRaw: "",
    surface: "finalize_paid_pro_signer_metadata",
    signatureRegionOnly: true,
    repairRecital: false,
    agreementId: args.agreementId,
    organizationId: args.organizationId,
    expectedFrozenHash: args.expectedFrozenHash,
  });
  return hydrated.corpus === args.rawCorpus.trim() ? null : hydrated.corpus;
}

function seedValidatedHandoff(args: {
  body: string;
  agreementId: string;
  organizationId: string;
}): void {
  markPaidProPipelineValidationPassed({ text: args.body, source: "server_full_draft" });
  expect(
    commitAcceptedPaidProCorpusHandoffSync({
      corpusPlain: args.body,
      pipelineSource: "server_full_draft",
      agreementId: args.agreementId,
      organizationId: args.organizationId,
    }),
  ).toBe(true);
}

describe("Batch 2.1.1 frozen legal corpus agreement/org authority", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    setOrgId(ORG_ONE);
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
  });

  it("never returns Agreement A's corpus while finalizing Agreement B", () => {
    const a = bodyA();
    const b = bodyB();
    seedValidatedHandoff({ body: a, agreementId: AGREEMENT_A, organizationId: ORG_ONE });

    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_B,
        organizationId: ORG_ONE,
      }),
    ).toBeNull();
    expect(
      finalizeScope({
        rawCorpus: b,
        agreementId: AGREEMENT_B,
        organizationId: ORG_ONE,
      }),
    ).not.toBe(a.trim());

    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
      }),
    ).toBe(a.trim());

    seedValidatedHandoff({ body: b, agreementId: AGREEMENT_B, organizationId: ORG_ONE });
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_B,
        organizationId: ORG_ONE,
      }),
    ).toBe(b.trim());
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
      }),
    ).toBe(a.trim());
  });

  it("logout and organization switch inactivate the prior corpus", () => {
    const a = bodyA();
    seedValidatedHandoff({ body: a, agreementId: AGREEMENT_A, organizationId: ORG_ONE });
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
      }),
    ).toBe(a.trim());

    setOrgId(ORG_TWO);
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORG_TWO,
      }),
    ).toBeNull();
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
      }),
    ).toBeNull();

    setOrgId(ORG_ONE);
    const restoredAfterSwitch = restoreImmutableFrozenLegalCorpusFromServerAuthority({
      agreementId: AGREEMENT_A,
      organizationId: ORG_ONE,
      expectedHash: hashPaidProCorpus(a),
    });
    expect(restoredAfterSwitch.ok).toBe(true);
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
      }),
    ).toBe(a.trim());

    setOrgId(ORG_ONE);
    seedValidatedHandoff({ body: a, agreementId: AGREEMENT_A, organizationId: ORG_ONE });
    clearLawdogUserSessionState();
    expect(getOrgId()).toBe("local-org");
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
      }),
    ).toBeNull();
    expect(
      restoreImmutableFrozenLegalCorpusFromServerAuthority({
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
        expectedHash: hashPaidProCorpus(a),
      }).ok,
    ).toBe(false);
  });

  it("reload of the same authorized agreement restores the exact frozen body and hash from server authority", () => {
    const a = bodyA();
    const frozenHash = hashPaidProCorpus(a);
    seedValidatedHandoff({ body: a, agreementId: AGREEMENT_A, organizationId: ORG_ONE });
    localStorage.setItem(
      BROWSER_STASH_KEY,
      JSON.stringify({ agreementId: AGREEMENT_B, organizationId: ORG_TWO, body: bodyB() }),
    );
    inactivateImmutableFrozenLegalCorpusSession();

    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
      }),
    ).toBeNull();

    const restored = restoreImmutableFrozenLegalCorpusFromServerAuthority({
      agreementId: AGREEMENT_A,
      organizationId: ORG_ONE,
      expectedHash: frozenHash,
    });
    expect(restored).toEqual({ ok: true, body: a.trim(), hash: frozenHash });
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
        expectedHash: frozenHash,
      }),
    ).toBe(a.trim());
    expect(hashPaidProCorpus(a)).toBe(frozenHash);
    expect(localStorage.getItem(BROWSER_STASH_KEY)).toContain(AGREEMENT_B);
  });

  it("missing or mismatched agreement/hash authority fails closed", () => {
    const a = bodyA();
    const frozenHash = hashPaidProCorpus(a);
    seedValidatedHandoff({ body: a, agreementId: AGREEMENT_A, organizationId: ORG_ONE });
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
        expectedHash: "9999:deadbeef",
      }),
    ).toBeNull();
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
        expectedHash: frozenHash,
      }),
    ).toBe(a.trim());
    inactivateImmutableFrozenLegalCorpusSession();

    expect(
      restoreImmutableFrozenLegalCorpusFromServerAuthority({
        agreementId: "",
        organizationId: ORG_ONE,
        expectedHash: frozenHash,
      }),
    ).toEqual({ ok: false, reason: "missing_authority" });
    expect(
      restoreImmutableFrozenLegalCorpusFromServerAuthority({
        agreementId: AGREEMENT_A,
        organizationId: "local-org",
        expectedHash: frozenHash,
      }),
    ).toEqual({ ok: false, reason: "unauthorized_scope" });
    expect(
      restoreImmutableFrozenLegalCorpusFromServerAuthority({
        agreementId: AGREEMENT_B,
        organizationId: ORG_ONE,
        expectedHash: frozenHash,
      }),
    ).toEqual({ ok: false, reason: "server_authority_missing" });
    expect(
      restoreImmutableFrozenLegalCorpusFromServerAuthority({
        agreementId: AGREEMENT_A,
        organizationId: ORG_TWO,
        expectedHash: frozenHash,
      }),
    ).toEqual({ ok: false, reason: "server_authority_missing" });
    expect(
      restoreImmutableFrozenLegalCorpusFromServerAuthority({
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
        expectedHash: "9999:deadbeef",
      }),
    ).toEqual({ ok: false, reason: "hash_mismatch" });
    expect(
      resolveImmutableFrozenLegalCorpusOnSignerFinalize({
        surface: "finalize_paid_pro_signer_metadata",
        signatureRegionOnly: true,
        repairRecital: false,
        agreementId: AGREEMENT_A,
        organizationId: ORG_ONE,
        expectedHash: "9999:deadbeef",
      }),
    ).toBeNull();
    expect(rememberImmutableFrozenLegalCorpus("short")).toBe(false);
  });
});
