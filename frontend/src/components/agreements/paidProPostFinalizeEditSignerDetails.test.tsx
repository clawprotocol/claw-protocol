/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToLiveSignerMetadataUi,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  resolvePaidProPostFinalizeSignerDetailsEditSeed,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { PaidProForcedFirstReviewChrome } from "./paidProForcedFirstReviewChrome";
import {
  beginPaidProPostFinalizeSignerDetailsReopen,
  logPaidProPostFinalizeEditSignerDetailsOpened,
  shouldShowPaidProPostFinalizeEditSignerDetails,
} from "./paidProPostFinalizeEditSignerDetails";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  readPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";

const BLUE = "Harbor Peak Automation LLC";
const RED = "Red Mesa Logistics LLC";

function qaAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED,
    recipient2Name: BLUE,
    recipient1Email: "rand@example.test",
    recipient2Email: "rasta@example.test",
    extraPartyReviewEmails: [],
    partySignerNames: ["Rand Mann", "Rasta Benning"],
    partySignerTitles: ["CEO", "Member"],
    partyAddresses: ["8873 Restful ST., Jokerful, AL 71000", "783 Firefly Ave., Valley Ville, CA 91002"],
  });
}

describe("paidProPostFinalizeEditSignerDetails", () => {
  afterEach(() => {
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    cleanup();
  });

  it("shouldShow is true only before packet prepared / prepare-signing", () => {
    expect(
      shouldShowPaidProPostFinalizeEditSignerDetails({
        trackChooserVisible: true,
        packetPrepared: false,
        signaturePreparationRequested: false,
      }),
    ).toBe(true);
    expect(
      shouldShowPaidProPostFinalizeEditSignerDetails({
        trackChooserVisible: true,
        packetPrepared: true,
        signaturePreparationRequested: false,
      }),
    ).toBe(false);
    expect(
      shouldShowPaidProPostFinalizeEditSignerDetails({
        trackChooserVisible: true,
        packetPrepared: false,
        signaturePreparationRequested: true,
      }),
    ).toBe(false);
    expect(
      shouldShowPaidProPostFinalizeEditSignerDetails({
        trackChooserVisible: false,
        packetPrepared: false,
        signaturePreparationRequested: false,
      }),
    ).toBe(false);
  });

  it("resolvePaidProPostFinalizeSignerDetailsEditSeed prefers consumed authority", () => {
    const authority = qaAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const seed = resolvePaidProPostFinalizeSignerDetailsEditSeed();
    expect(seed?.[0]?.signerEmail).toBe("rand@example.test");
    expect(seed?.[1]?.signerName).toBe("Rasta Benning");
  });

  it("authorityPartiesToLiveSignerMetadataUi maps entity + human signer fields for reopen", () => {
    const ui = authorityPartiesToLiveSignerMetadataUi(qaAuthority().parties);
    expect(ui.recipient1Name).toBe(RED);
    expect(ui.recipient1Email).toBe("rand@example.test");
    expect(ui.partySignerNames[0]).toBe("Rand Mann");
    expect(ui.recipient2Name).toBe(BLUE);
    expect(ui.recipient2Email).toBe("rasta@example.test");
    expect(ui.partySignerNames[1]).toBe("Rasta Benning");
    expect(ui.partySignerTitles[1]).toBe("Member");
    expect(ui.partyAddresses[0]).toContain("8873 Restful");
  });

  it("corrected email in seeded UI round-trips to recipient metadata handoff", () => {
    const ui = authorityPartiesToLiveSignerMetadataUi(qaAuthority().parties);
    const corrected = {
      ...ui,
      recipient1Email: "corrected@example.test",
    };
    const authority = buildLivePaidProSignerMetadataAuthority(corrected);
    const meta = authorityPartiesToRecipientMetadata(authority.parties);
    expect(meta.recipient1Email).toBe("corrected@example.test");
    expect(meta.partySignerNames[0]).toBe("Rand Mann");
  });

  it("forced review chrome shows Edit signer details and invokes handler", () => {
    const onEditSignerDetails = vi.fn();
    render(
      <PaidProForcedFirstReviewChrome
        signersReady
        signerMetadataFinalized
        postFinalizeCorpusHash="hash1"
        postFinalizeActionsReady
        getCopyPlainText={() => "body"}
        onEditAgreement={vi.fn()}
        onEditSignerDetails={onEditSignerDetails}
        onExportAgreement={vi.fn()}
        onShareForReview={vi.fn()}
        onPrepareSignatures={vi.fn()}
      />,
    );
    const editSignerBtn = screen.getByTestId("paid-pro-forced-edit-signer-details");
    expect(editSignerBtn.textContent).toContain("Edit signer details");
    fireEvent.click(editSignerBtn);
    expect(onEditSignerDetails).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("paid-pro-forced-edit-agreement").textContent).toContain(
      "Edit agreement text",
    );
  });

  it("forced review chrome omits Edit signer details when handler not provided", () => {
    render(
      <PaidProForcedFirstReviewChrome
        signersReady
        signerMetadataFinalized
        postFinalizeCorpusHash="hash1"
        postFinalizeActionsReady
        getCopyPlainText={() => "body"}
        onEditAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
        onShareForReview={vi.fn()}
        onPrepareSignatures={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("paid-pro-forced-edit-signer-details")).toBeNull();
    expect(screen.getByTestId("paid-pro-forced-edit-agreement")).toBeTruthy();
  });

  it("intake wires post-finalize edit signer details beside edit agreement text", () => {
    const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intakeSrc).toContain("shouldShowPaidProPostFinalizeEditSignerDetails");
    expect(intakeSrc).toContain("onEditSignerDetails=");
    expect(intakeSrc).toContain("handleGuidedBackToSignerDetailsFromFinalReview");
    expect(intakeSrc).toContain("resolvePaidProPostFinalizeSignerDetailsEditSeed");
    expect(intakeSrc).toContain("authorityPartiesToLiveSignerMetadataUi");
    const chromeSrc = readFileSync(join(__dirname, "paidProForcedFirstReviewChrome.tsx"), "utf8");
    expect(chromeSrc).toContain('data-testid="paid-pro-forced-edit-signer-details"');
  });

  it("seed falls back to snapshot metadata when consumed authority is empty", () => {
    const authority = qaAuthority();
    const corpus = "x".repeat(600);
    createAuthoritativeSigningSnapshot({
      corpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: [],
        signFirst: true,
      }),
    });
    const seed = resolvePaidProPostFinalizeSignerDetailsEditSeed();
    expect(seed?.[0]?.partyLegalName).toBe(RED);
    expect(seed?.[0]?.signerEmail).toBe("rand@example.test");
  });

  it("beginPaidProPostFinalizeSignerDetailsReopen clears snapshot and pinned hydrated corpus", () => {
    const authority = qaAuthority();
    const corpus = "x".repeat(600);
    createAuthoritativeSigningSnapshot({
      corpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: [],
        signFirst: true,
      }),
    });
    setPaidProPinnedSignerAppliedCorpus(corpus);
    expect(isPaidProPostFinalizeHydratedCorpusLocked()).toBe(true);

    beginPaidProPostFinalizeSignerDetailsReopen();
    expect(isPaidProPostFinalizeHydratedCorpusLocked()).toBe(false);
    expect(readPaidProPinnedSignerAppliedCorpus()).toBe("");
  });

  it("logPaidProPostFinalizeEditSignerDetailsOpened is dev-only", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPaidProPostFinalizeEditSignerDetailsOpened({ corpusHash: "h", partyCount: 2 });
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });
});

describe("post-finalize signer correction re-hydration", () => {
  afterEach(() => {
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("re-finalize path can hydrate corrected email into signature block metadata", () => {
    const authority = qaAuthority();
    const rawCorpus = [
      "AGREEMENT",
      "",
      ...Array.from({ length: 40 }, (_, i) => `Clause ${i + 1}.`),
      "",
      "IN WITNESS WHEREOF",
      "",
      `CLIENT: ${RED}`,
      "Name: ________________________________",
      "Email for Notice: __________________________",
    ].join("\n");
    const correctedUi = authorityPartiesToLiveSignerMetadataUi(authority.parties);
    correctedUi.recipient1Email = "fixed@example.test";
    const nextAuthority = buildLivePaidProSignerMetadataAuthority(correctedUi);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus,
      authority: nextAuthority,
      intakeRaw: "",
      surface: "test_post_finalize_signer_correction",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.corpus).toMatch(/fixed@example\.test/i);
    expect(hydrated.corpus).toMatch(/Rand Mann/i);
  });
});
