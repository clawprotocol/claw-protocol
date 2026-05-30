import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { resolveAuthoritativePaidProReviewPlain } from "./authoritativePaidProReview";
import { establishPaidProSourceOfTruth, getPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  fingerprintSigningSnapshot,
  getAuthoritativeSigningSnapshot,
  getPaidProSigningAuthorityPhase,
  hasAuthoritativeSigningSnapshot,
  isPostSignerMetadataFreezeActive,
} from "./authoritativeSigningSnapshot";
import { PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA } from "./signerSetupPartyIdentity";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BLUE_CANYON = "Blue Canyon Analytics LLC";
const IRON_VALE = "Iron Vale Systems Inc";

const PRODUCTION_SOT_BODY = [
  "SOFTWARE INTEGRATION AGREEMENT",
  "",
  `Between ${BLUE_CANYON} and ${IRON_VALE}.`,
  "",
  ...Array.from({ length: 120 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
].join("\n");

function armSession() {
  establishPaidProSourceOfTruth({ text: PRODUCTION_SOT_BODY, source: "paidProSourceOfTruth" });
}

function buildSmokeSnapshot() {
  const manifest = resolveCanonicalFinalPartyManifest({
    partyCount: 2,
    partySignerNames: ["Anthem H Blanchard", "Jim Summit"],
    partySignerTitles: ["Manager", "CEO"],
    recipient1Name: BLUE_CANYON,
    recipient2Name: IRON_VALE,
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "anthemhayek@me.com",
    extraPartyReviewEmails: [],
    draftPartyNames: [BLUE_CANYON, IRON_VALE],
    sendMode: "signature",
    recipientsDeferred: false,
  });
  return createAuthoritativeSigningSnapshot({
    corpus: PRODUCTION_SOT_BODY,
    signerMetadata: {
      partySignerNames: ["Anthem H Blanchard", "Jim Summit"],
      partySignerTitles: ["Manager", "CEO"],
      recipient1Name: BLUE_CANYON,
      recipient2Name: IRON_VALE,
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "anthemhayek@me.com",
      extraPartyReviewEmails: [],
    },
    partyManifest: manifest,
    signatureBlockModel: { signFirst: true, entries: [] },
  });
}

describe("authoritativeSigningSnapshot", () => {
  afterEach(() => {
    clearAuthoritativeSigningSnapshot();
  });

  it("creates SIGNER_METADATA_FINALIZED phase and stable hash", () => {
    armSession();
    const snap = buildSmokeSnapshot();
    expect(getPaidProSigningAuthorityPhase()).toBe("SIGNER_METADATA_FINALIZED");
    expect(snap.hash).toBe(getPaidProSourceOfTruth()?.hash);
    expect(hasAuthoritativeSigningSnapshot()).toBe(true);
    const again = buildSmokeSnapshot();
    expect(again.hash).toBe(snap.hash);
    expect(again.frozenAt).toBe(snap.frozenAt);
  });

  it("post-freeze blocks preview fallback sources for review corpus", () => {
    armSession();
    buildSmokeSnapshot();
    expect(isPostSignerMetadataFreezeActive({ signaturePreparationRequested: false })).toBe(true);
    const reviewPlain = resolveAuthoritativePaidProReviewPlain();
    expect(reviewPlain).toBe(PRODUCTION_SOT_BODY);
    const corpus = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "short preview",
      renderedPreviewPlain: buildAgreementPreviewText({
        parties: [{ name: BLUE_CANYON }, { name: IRON_VALE }],
      } as Parameters<typeof buildAgreementPreviewText>[0]),
    });
    expect(corpus.plainText).toBe(PRODUCTION_SOT_BODY);
    expect(corpus.source).toBe("authoritative_hydrated");
  });

  it("typing/autofill after freeze does not change snapshot hash", () => {
    armSession();
    const snap = buildSmokeSnapshot();
    const fpBefore = fingerprintSigningSnapshot(snap);
    resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem H Blanchard", "Mutated Name"],
      partySignerTitles: ["Manager", "CEO"],
      recipient1Name: BLUE_CANYON,
      recipient2Name: IRON_VALE,
      recipient1Email: "other@example.com",
      recipient2Email: "mutated@example.com",
      extraPartyReviewEmails: [],
      draftPartyNames: [BLUE_CANYON, IRON_VALE],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const after = getAuthoritativeSigningSnapshot()!;
    expect(after.hash).toBe(snap.hash);
    expect(fingerprintSigningSnapshot(after)).toBe(fpBefore);
    expect(after.signerMetadata.recipient1Email).toBe("anthemhayek@gmail.com");
  });

  it("smoke: Party 1 autofill + Party 2 manual metadata survives in snapshot", () => {
    armSession();
    const snap = buildSmokeSnapshot();
    expect(snap.signerMetadata.partySignerNames[0]).toMatch(/Anthem/);
    expect(snap.signerMetadata.partySignerNames[1]).toMatch(/Jim/);
    expect(snap.partyManifest.parties[0]?.partyName).toMatch(/Blue Canyon/);
    expect(snap.partyManifest.parties[1]?.partyName).toMatch(/Iron Vale/);
    expect(snap.signerMetadata.recipient1Email).toBe("anthemhayek@gmail.com");
    expect(snap.signerMetadata.recipient2Email).toBe("anthemhayek@me.com");
  });
});

describe("AgreementBuilderIntake authority routing", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("green signer CTA finalizes metadata and does not call continueGuidedFinalReviewToSigning", () => {
    expect(intake).toContain("finalizePaidProSignerMetadataAndOpenReviewDecision");
    const ctaBlock = intake.slice(
      intake.indexOf('cta.reason === "paid_pro_signer_details_complete"'),
      intake.indexOf('cta.reason === "paid_pro_signer_details_complete"') + 500,
    );
    expect(ctaBlock).toContain("finalizePaidProSignerMetadataAndOpenReviewDecision");
    expect(ctaBlock).not.toContain('continueGuidedFinalReviewToSigning({ intent: "signature" })');
  });

  it("signaturePreparationRequested is set only on explicit signing paths", () => {
    expect(intake).toMatch(/markSigningPreparationRequested\(\)/);
    expect(PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA).toMatch(/review decision/i);
    expect(PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA).not.toMatch(/Prepare signature links/i);
  });

  it("wires authoritativeSigningSnapshot module", () => {
    expect(intake).toContain("createAuthoritativeSigningSnapshot");
    expect(intake).toContain("hasAuthoritativeSigningSnapshot");
    expect(intake).toContain("readAuthoritativeSigningCorpus");
    expect(intake).toContain("clearAuthoritativeSigningSnapshot");
  });
});
