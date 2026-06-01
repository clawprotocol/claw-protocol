import { afterEach, describe, expect, it } from "vitest";
import { clearAuthoritativeSigningSnapshot, createAuthoritativeSigningSnapshot } from "../../authoritativeSigningSnapshot";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  readPaidProPinnedSignerAppliedCorpus,
} from "../../paidProFinalHydratedCorpus";
import {
  authorityPartiesToRecipientMetadata,
  clearConsumedPaidProSignerMetadataAuthority,
} from "../../paidProSignerMetadataAuthority";
import { resolveCanonicalFinalPartyManifest } from "../../guidedDealCompletion/canonicalFinalPartyManifest";
import {
  clearPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "../../paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "../../paidProReviewRenderCorpus";
import { buildCtaForensicEvaluation } from "../../paidProSignerMetadataForensicAudit";
import {
  PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA,
  PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
  resolvePaidProSignerDetailsGate,
} from "../../signerSetupPartyIdentity";
import { getAuthoritativeSigningSnapshot } from "../../authoritativeSigningSnapshot";
import {
  armPaidProHardeningSession,
  buildTest204SignerAuthority,
  loadPaidProHardeningFixture,
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./paidProHardeningFixtures";

const FIXTURE_NAME = "freeProQaTemplateATest204";

describe("paidProHardening signer typing immutability (SEND CTA)", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("Party 2 first character changes gate only — not SoT, pin, snapshot, or review plain", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE_NAME);
    const { acceptedText } = armPaidProHardeningSession({ fixture, withSignerMetadata: false });

    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem H Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      recipient1Name: PAID_PRO_HARDENING_CLIENT,
      recipient2Name: PAID_PRO_HARDENING_PROVIDER,
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "",
      extraPartyReviewEmails: [],
      draftPartyNames: [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const meta = authorityPartiesToRecipientMetadata(buildTest204SignerAuthority().parties);
    createAuthoritativeSigningSnapshot({
      corpus: acceptedText,
      signerMetadata: meta,
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });

    const sotHashBefore = getPaidProSourceOfTruth()?.hash ?? "";
    const sotTextBefore = getPaidProSourceOfTruth()?.text ?? "";
    const pinBefore = readPaidProPinnedSignerAppliedCorpus();
    const snapHashBefore = getAuthoritativeSigningSnapshot()?.hash ?? "";
    const reviewBefore = resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });

    const gateBefore = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
      partySignerNames: ["Anthem H Blanchard", ""],
      recipient1Name: PAID_PRO_HARDENING_CLIENT,
      recipient2Name: PAID_PRO_HARDENING_PROVIDER,
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "",
      extraPartyReviewEmails: [],
    });
    const evalBefore = buildCtaForensicEvaluation({
      gate: gateBefore,
      stickyCta: null,
      evaluatedValues: { party1_signerName: "Anthem H Blanchard", party2_signerName: "" },
    });

    const gateAfter = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
      partySignerNames: ["Anthem H Blanchard", "M"],
      recipient1Name: PAID_PRO_HARDENING_CLIENT,
      recipient2Name: PAID_PRO_HARDENING_PROVIDER,
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "",
      extraPartyReviewEmails: [],
    });
    const evalAfter = buildCtaForensicEvaluation({
      gate: gateAfter,
      stickyCta: null,
      evaluatedValues: { party1_signerName: "Anthem H Blanchard", party2_signerName: "M" },
    });

    expect(gateBefore.complete).toBe(false);
    expect(gateBefore.ctaLabel).toBe(PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA);
    expect(gateAfter.complete).toBe(false);
    expect(gateAfter.ctaLabel).toBe(PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA);
    expect(evalAfter.missingFields).not.toEqual(evalBefore.missingFields);
    expect(evalAfter.evaluatedValues.party2_signerName).toBe("M");

    expect(getPaidProSourceOfTruth()?.hash).toBe(sotHashBefore);
    expect(getPaidProSourceOfTruth()?.text).toBe(sotTextBefore);
    expect(hashPaidProCorpus(getPaidProSourceOfTruth()?.text ?? "")).toBe(sotHashBefore);
    expect(readPaidProPinnedSignerAppliedCorpus()).toBe(pinBefore);
    expect(getAuthoritativeSigningSnapshot()?.hash).toBe(snapHashBefore);
    expect(
      resolvePaidProReviewRenderPlain({
        draft: fixture.draft,
        intakeText: fixture.intakeText,
      }),
    ).toBe(reviewBefore);
  });

  it("completing Party 2 gate advances CTA without writing corpus stores", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE_NAME);
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const sotHashBefore = getPaidProSourceOfTruth()?.hash ?? "";
    const reviewBefore = resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });

    const gateComplete = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
      partySignerNames: ["Anthem H Blanchard", "Ira Vale"],
      recipient1Name: PAID_PRO_HARDENING_CLIENT,
      recipient2Name: PAID_PRO_HARDENING_PROVIDER,
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "ivee23@me.com",
      extraPartyReviewEmails: [],
    });
    expect(gateComplete.complete).toBe(true);
    expect(gateComplete.ctaLabel).toBe(PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA);

    expect(getPaidProSourceOfTruth()?.hash).toBe(sotHashBefore);
    expect(
      resolvePaidProReviewRenderPlain({
        draft: fixture.draft,
        intakeText: fixture.intakeText,
      }),
    ).toBe(reviewBefore);
  });
});
