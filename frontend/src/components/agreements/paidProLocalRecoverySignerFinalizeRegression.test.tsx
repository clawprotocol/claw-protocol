/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftApiResult } from "./premiumFullDraftApi";
import { PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";
import { tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth } from "./paidProPostCheckoutRecoveryAuthority";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  auditPaidProPostFinalizeHydrationInvariant,
  resolvePaidProPostFinalizeReviewPlain,
} from "./paidProPostFinalizeReviewSurface";
import {
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  authorityPartiesToRecipientMetadata,
} from "./paidProSignerMetadataAuthority";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { authorityPartiesToCanonicalPartyIdentities } from "./paidProSignerMetadataAuthority";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import {
  buildCanonicalAgreementSnapshot,
  clearFrozenCanonicalAgreementCorpus,
  freezeCanonicalAgreementSnapshot,
} from "./canonicalAgreementSnapshot";
import { PaidProForcedFirstReviewChrome } from "./paidProForcedFirstReviewChrome";
import { render, screen } from "@testing-library/react";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "qa/paidProHardening/fixtures");
const INTAKE = readFileSync(join(FIXTURE_DIR, "freeProQaTemplateATest220.intake.txt"), "utf8").trim();

const CLIENT = "Blue Canyon Analytics LLC";
const PROVIDER = "Iron Vale Systems Inc";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const structured: ParsedDraftShape = {
  title: "Mutual Consulting and Implementation Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: CLIENT, role: "Client" },
    { name: PROVIDER, role: "Service Provider" },
  ],
  purpose: "AI workflow implementation services.",
  payment_terms: "$8,500 fixed fee.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: emptyPayment,
  agreement_family: "services_agreement",
};

const h = vi.hoisted(() => ({
  mockResp: null as PremiumFullDraftApiResult | null,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      h.mockResp
        ? Promise.resolve(h.mockResp)
        : Promise.resolve({
            ok: false as const,
            failure_kind: "network" as const,
            retryable: true,
            error_code: "network_changed" as const,
            document_text: "" as const,
            attemptCount: 2,
          }),
  };
});

function qaSignerAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: CLIENT,
    recipient2Name: PROVIDER,
    recipient1Email: "anthemhayek@me.com",
    recipient2Email: "cryptocurated21@gmail.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: ["414 SE Washington Blvd., STE 205", "138 Main St, Austin TX"],
  });
}

function finalizeSignerMetadata(rawCorpus: string) {
  const authority = qaSignerAuthority();
  setConsumedPaidProSignerMetadataAuthority(authority);
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus,
    authority,
    intakeRaw: INTAKE,
    surface: "finalize_paid_pro_signer_metadata",
    signatureRegionOnly: true,
    repairRecital: true,
  });
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus: hydrated.corpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: INTAKE,
      draftPartyNames: [CLIENT, PROVIDER],
    }),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  return { hydrated, authority };
}

describe("paidPro local recovery signer finalize regression", () => {
  beforeEach(() => {
    h.mockResp = {
      ok: false,
      failure_kind: "network",
      retryable: true,
      error_code: "network_changed",
      document_text: "",
      attemptCount: 2,
    };
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    clearFrozenCanonicalAgreementCorpus();
  });

  it("premium_network_local_recovery + signer finalize hydrates both parties", async () => {
    const out = await runPremiumCompletion({
      intakeText: INTAKE,
      originalUserIntakeRawForMerge: INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "regression-local-recovery",
      premiumRequestIntakeFingerprint: "fp-regression",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    expect(out.premiumRenderSource).toBe(PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE);
    const localBody = (out.winningPremiumBodyText || "").trim();
    expect(localBody.length).toBeGreaterThan(2000);
    expect(localBody).toMatch(/IN WITNESS WHEREOF/i);

    const commit = tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth({
      body: localBody,
      draft: { ...out.premiumDraft, premium_full_document_text: localBody },
      intakeText: INTAKE,
      premiumRenderSource: out.premiumRenderSource,
      reviewSessionId: "regression-local-recovery",
    });
    expect(commit.committed).toBe(true);

    const { hydrated } = finalizeSignerMetadata(localBody);
    expect(hydrated.rejected).toBe(false);
    expect(countPaidProExecutionBlocks(hydrated.corpus)).toBe(1);
    expect(countBlankSignerMetadataLinesInExecutionBlock(hydrated.corpus)).toBe(0);

    const snap = getAuthoritativeSigningSnapshot();
    expect(snap?.corpus).toMatch(/Sarah Mitchell/i);
    expect(snap?.corpus).toMatch(/Michael Torres/i);
    expect(snap?.corpus).toMatch(/anthemhayek@me\.com/i);
    expect(snap?.corpus).toMatch(/cryptocurated21@gmail\.com/i);
    expect(countBlankSignerMetadataLinesInExecutionBlock(snap?.corpus ?? "")).toBe(0);

    const reviewPlain = resolvePaidProPostFinalizeReviewPlain();
    expect(reviewPlain).toMatch(/Sarah Mitchell/i);
    expect(countBlankSignerMetadataLinesInExecutionBlock(reviewPlain)).toBe(0);

    const audit = auditPaidProPostFinalizeHydrationInvariant({
      reviewPlain,
      signerMetadata: snap?.signerMetadata ?? null,
    });
    expect(audit.blocked).toBe(false);
    expect(audit.blankSignerLinesRemaining).toBe(0);
  });

  it("starter frozen canonical does not override pro SoT during finalize", async () => {
    const starterSnap = buildCanonicalAgreementSnapshot({
      surface: "test_stale_starter",
      tier: "starter",
      candidates: [{ source: "free_starter", text: "STARTER ONLY\n\nNo witness block." }],
      intakeText: INTAKE,
      parties: [
        { name: CLIENT, role: "Client", email: null },
        { name: PROVIDER, role: "Service Provider", email: null },
      ],
      signerState: { complete: false, signerCount: 2 },
      minLen: 120,
    });
    freezeCanonicalAgreementSnapshot(starterSnap, "free_starter");

    const out = await runPremiumCompletion({
      intakeText: INTAKE,
      originalUserIntakeRawForMerge: INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "regression-starter-freeze",
      premiumRequestIntakeFingerprint: "fp-starter-freeze",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
    });
    const localBody = (out.winningPremiumBodyText || "").trim();
    establishPaidProSourceOfTruth({
      text: localBody,
      source: "server_full_draft",
      intakeText: INTAKE,
    });

    const { resolvePaidProSignerFinalizeRawCorpus } = await import("./paidProSignerFinalizeRawCorpus");
    const raw = resolvePaidProSignerFinalizeRawCorpus();
    expect(raw.source).toBe("paid_pro_source_of_truth");
    expect(raw.corpus.length).toBeGreaterThan(1000);

    finalizeSignerMetadata(raw.corpus);
    const reviewPlain = resolvePaidProPostFinalizeReviewPlain();
    expect(reviewPlain).toMatch(/Sarah Mitchell/i);
    expect(countBlankSignerMetadataLinesInExecutionBlock(reviewPlain)).toBe(0);
  });

  it("hydration warning keeps edit agreement clickable", () => {
    render(
      <PaidProForcedFirstReviewChrome
        signersReady
        signerMetadataFinalized
        hydrationBlocked
        editDisabled={false}
        getCopyPlainText={() => "Agreement body"}
        onEditAgreement={() => {}}
        onExportAgreement={() => {}}
        onShareForReview={() => {}}
        onPrepareSignatures={() => {}}
      />,
    );
    expect(screen.getByTestId("paid-pro-forced-prepare-signatures").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("paid-pro-forced-edit-agreement").hasAttribute("disabled")).toBe(false);
  });
});
