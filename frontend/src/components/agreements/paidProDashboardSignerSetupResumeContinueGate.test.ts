/**
 * Screen 2 / resume_signer_setup Continue gate — restore names from persist
 * and accept typed names without a stuck "could not be applied" client gate.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup } from "@testing-library/react";
import type { FrozenSigningAuthoritySnapshotV1 } from "./frozenSigningAuthoritySnapshot";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  evaluateDashboardSignerSetupResumeContinueGate,
  resolveDashboardSignerSetupResumeFinalizeRawCorpus,
  resolveDashboardSignerSetupResumeSessionCorpus,
  restoreDashboardSignerSetupResumeSignerFields,
} from "./paidProDashboardSignerSetupResumeContinueGate";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");

const AGREEMENT_ID = "4e18814c-c8fe-4eb9-85ae-a3e694cb596e";
const CEDAR = "Cedar Peak Design LLC";
const BLUE = "Blue Harbor Media Inc";
const PRIYA = "Priya Shah";
const DIEGO = "Diego Alvarez";
const PRIYA_EMAIL = "cryptocurated21+priya@gmail.com";
const DIEGO_EMAIL = "cryptocurated21+diego@gmail.com";

function askLawDogResumeCorpus(opts?: { names?: boolean; placeholders?: boolean }): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(40);
  const notices = opts?.placeholders
    ? [
        "10. Notices",
        "Any notice under this Agreement must be in writing.",
        `If to ${CEDAR}:`,
        "Email: provided during signer setup",
        "Address: provided during signer setup",
        `If to ${BLUE}:`,
        "Email: provided during signer setup",
        "Address: provided during signer setup",
      ]
    : [
        "10. Notices",
        "Any notice under this Agreement must be in writing and delivered to the addresses specified by the parties.",
      ];
  return [
    "SERVICES AGREEMENT",
    `This Agreement is entered into as of the Effective Date by and between ${CEDAR} ("Client") and ${BLUE} ("Service Provider").`,
    "1. Engagement and Scope of Services",
    "1.1 Services. Provider shall deliver a brand website refresh, including homepage redesign, style guide, and CMS handoff.",
    "5. Confidentiality",
    "5.4 Required Disclosure. A Receiving Party may disclose Confidential Information if required by law.",
    "11. Governing Law",
    "This Agreement is governed by the laws of the State of Texas, without regard to conflict-of-laws principles.",
    ...notices,
    pad,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    CEDAR,
    "By: ____________________",
    opts?.names ? `Name: ${PRIYA}` : "Name:",
    "Title:",
    "Date: ____________________",
    "SERVICE PROVIDER:",
    BLUE,
    "By: ____________________",
    opts?.names ? `Name: ${DIEGO}` : "Name:",
    "Title:",
    "Date: ____________________",
  ].join("\n");
}

function frozenWithPriyaDiego(): FrozenSigningAuthoritySnapshotV1 {
  return {
    version: 1,
    agreementId: AGREEMENT_ID,
    agreementSessionId: "sess-4e18814c",
    frozenCorpusHash: "hash-4e18814c",
    frozenAt: new Date().toISOString(),
    parties: [
      {
        agreementPartyId: "p1",
        legalEntityName: CEDAR,
        canonicalOrder: 0,
      },
      {
        agreementPartyId: "p2",
        legalEntityName: BLUE,
        canonicalOrder: 1,
      },
    ],
    signers: [
      {
        signerRecordId: "s1",
        agreementPartyId: "p1",
        signerName: PRIYA,
        signerTitle: "Principal",
        signerEmail: PRIYA_EMAIL,
        signingOrder: 1,
        requiresSignature: true,
        requiresInitials: false,
      },
      {
        signerRecordId: "s2",
        agreementPartyId: "p2",
        signerName: DIEGO,
        signerTitle: "Director",
        signerEmail: DIEGO_EMAIL,
        signingOrder: 2,
        requiresSignature: true,
        requiresInitials: false,
      },
    ],
    recipients: [],
    execution: {
      partyOrder: ["p1", "p2"],
      signerOrder: ["s1", "s2"],
      executionBlockHash: "exec-4e18814c",
    },
  };
}

function reset(): void {
  resetPaidProPipelineTestIsolation();
  clearPaidProSourceOfTruth();
  cleanup();
}

describe("resume_signer_setup Continue gate (4e18814c Screen 2)", () => {
  beforeEach(reset);
  afterEach(reset);

  it("restores Priya/Diego from persist parties when draft signerName was dropped", () => {
    const restored = restoreDashboardSignerSetupResumeSignerFields({
      persistParties: [
        { name: CEDAR, signerName: PRIYA, signerEmail: PRIYA_EMAIL },
        { name: BLUE, signerName: DIEGO, signerEmail: DIEGO_EMAIL },
      ],
      uiSignerNames: ["", ""],
    });
    expect(restored.partySignerNames).toEqual([PRIYA, DIEGO]);
    expect(restored.recipient1Email).toBe(PRIYA_EMAIL);
    expect(restored.recipient2Email).toBe(DIEGO_EMAIL);
    expect(restored.recipient1Name).toBe(CEDAR);
    expect(restored.recipient2Name).toBe(BLUE);
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: [CEDAR, BLUE],
      partySignerNames: restored.partySignerNames,
      recipient1Name: restored.recipient1Name,
      recipient2Name: restored.recipient2Name,
      recipient1Email: restored.recipient1Email,
      recipient2Email: restored.recipient2Email,
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(true);
  });

  it("restores Priya/Diego from persist corpus Name lines when parties have empty signerName", () => {
    const restored = restoreDashboardSignerSetupResumeSignerFields({
      persistParties: [{ name: CEDAR }, { name: BLUE }],
      corpusText: askLawDogResumeCorpus({ names: true }),
      uiSignerNames: ["", ""],
    });
    expect(restored.partySignerNames).toEqual([PRIYA, DIEGO]);
  });

  it("restores Priya/Diego from frozen signing authority", () => {
    const restored = restoreDashboardSignerSetupResumeSignerFields({
      persistParties: [{ name: CEDAR }, { name: BLUE }],
      frozen: frozenWithPriyaDiego(),
      uiSignerNames: ["", ""],
    });
    expect(restored.partySignerNames).toEqual([PRIYA, DIEGO]);
    expect(restored.recipient1Email).toBe(PRIYA_EMAIL);
    expect(restored.recipient2Email).toBe(DIEGO_EMAIL);
  });

  it("does not overwrite typed signer names", () => {
    const restored = restoreDashboardSignerSetupResumeSignerFields({
      persistParties: [
        { name: CEDAR, signerName: PRIYA },
        { name: BLUE, signerName: DIEGO },
      ],
      uiSignerNames: ["Alex Typed", "Morgan Typed"],
    });
    expect(restored.partySignerNames).toEqual(["Alex Typed", "Morgan Typed"]);
  });

  it("keeps empty invalid signers incomplete (do not weaken Continue integrity)", () => {
    const restored = restoreDashboardSignerSetupResumeSignerFields({
      persistParties: [{ name: CEDAR }, { name: BLUE }],
      corpusText: askLawDogResumeCorpus({ names: false }),
      uiSignerNames: ["", ""],
    });
    expect(restored.partySignerNames).toEqual(["", ""]);
    const gate = evaluateDashboardSignerSetupResumeContinueGate({
      partySignerNames: ["", ""],
      recipient1Name: CEDAR,
      recipient2Name: BLUE,
      recipient1Email: PRIYA_EMAIL,
      recipient2Email: DIEGO_EMAIL,
      rawCorpus: askLawDogResumeCorpus({ names: false, placeholders: true }),
    });
    expect(gate.detailsComplete).toBe(false);
    expect(gate.signingReady).toBe(false);
    expect(gate.blockerMessage).toMatch(/authorized signer name/i);
  });

  it("accepts typed names on Ask LawDog / Review resume corpus without a stuck client gate", () => {
    const corpus = askLawDogResumeCorpus({ names: false, placeholders: true });
    expect(corpus.length).toBeGreaterThan(500);
    const emptyReview = resolveDashboardSignerSetupResumeFinalizeRawCorpus({
      authoritativePaidProReviewPlain: "",
      resumeSessionCorpus: "",
    });
    expect(emptyReview.corpus).toBe("");
    const picked = resolveDashboardSignerSetupResumeFinalizeRawCorpus({
      authoritativePaidProReviewPlain: "",
      resumeSessionCorpus: corpus,
    });
    expect(picked.corpus.length).toBeGreaterThan(500);

    const blockedEmpty = evaluateDashboardSignerSetupResumeContinueGate({
      partySignerNames: [PRIYA, DIEGO],
      recipient1Name: CEDAR,
      recipient2Name: BLUE,
      recipient1Email: PRIYA_EMAIL,
      recipient2Email: DIEGO_EMAIL,
      rawCorpus: emptyReview.corpus,
    });
    expect(blockedEmpty.detailsComplete).toBe(true);
    expect(blockedEmpty.wouldBlockContinueWithoutNetwork).toBe(true);
    expect(blockedEmpty.blockerMessage).toMatch(/could not be applied/i);

    const ok = evaluateDashboardSignerSetupResumeContinueGate({
      partySignerNames: [PRIYA, DIEGO],
      recipient1Name: CEDAR,
      recipient2Name: BLUE,
      recipient1Email: PRIYA_EMAIL,
      recipient2Email: DIEGO_EMAIL,
      rawCorpus: picked.corpus,
    });
    expect(ok.detailsComplete).toBe(true);
    expect(ok.rejected).toBe(false);
    expect(ok.signingReady).toBe(true);
    expect(ok.wouldBlockContinueWithoutNetwork).toBe(false);
  });

  it("picks painted resume session corpus over an empty verified-GET review plain", () => {
    const painted = askLawDogResumeCorpus({ names: true });
    expect(
      resolveDashboardSignerSetupResumeSessionCorpus({
        verifiedCommercialDisplayPlain: "",
        paintedSequentialPersistPlain: painted,
        purpose: "short purpose",
      }),
    ).toBe(painted);
  });

  it("typed-name continue still signing-ready when SoT is the Ask LawDog painted body", () => {
    const corpus = askLawDogResumeCorpus({ names: false, placeholders: true });
    establishPaidProSourceOfTruth({
      text: corpus,
      source: "server_full_draft",
      allowShorterOverwrite: true,
      generationOutcome: "ok",
    });
    const picked = resolveDashboardSignerSetupResumeFinalizeRawCorpus({
      authoritativePaidProReviewPlain: "",
      resumeSessionCorpus: corpus,
    });
    expect(picked.source).toBe("paid_pro_source_of_truth");
    const ok = evaluateDashboardSignerSetupResumeContinueGate({
      partySignerNames: [PRIYA, DIEGO],
      recipient1Name: CEDAR,
      recipient2Name: BLUE,
      recipient1Email: PRIYA_EMAIL,
      recipient2Email: DIEGO_EMAIL,
      rawCorpus: picked.corpus,
    });
    expect(ok.signingReady).toBe(true);
  });

  it("intake resume hydrate uses restore helper and finalize uses resume corpus fallback", () => {
    expect(intakeSrc).toContain("restoreDashboardSignerSetupResumeSignerFields");
    expect(intakeSrc).toContain("resolveDashboardSignerSetupResumeFinalizeRawCorpus");
    expect(intakeSrc).toContain("resolveDashboardSignerSetupResumeSessionCorpus");
    expect(intakeSrc).toContain("dashboard_signer_setup_resume_hydrate");
    const finalizeStart = intakeSrc.indexOf(
      "const finalizePaidProSignerMetadataAndOpenReviewDecision = React.useCallback",
    );
    const finalizeSlice = intakeSrc.slice(finalizeStart, finalizeStart + 9000);
    expect(finalizeSlice).toContain("resolveDashboardSignerSetupResumeFinalizeRawCorpus");
    expect(finalizeSlice).toContain("Signer details could not be applied");
    expect(finalizeSlice).toContain("prepareCommercialReviewSnapshotAuthority");
  });

  it("Continue → Prepare → esign recovers pending accept instead of silent-stall", () => {
    expect(intakeSrc).toContain("ensureAcceptedCommercialReviewForEsignHandoff");
    const continueBlock = intakeSrc.slice(
      intakeSrc.indexOf('if (cta.reason === "dashboard_signer_setup_resume_complete")'),
      intakeSrc.indexOf('if (cta.reason === "dashboard_signer_setup_resume_complete")') + 900,
    );
    expect(continueBlock).toContain("finalizePaidProSignerMetadataAndOpenReviewDecision");
    expect(continueBlock).toContain("handlePaidProPrepareSignaturesFromFirstReview()");
    const prepareFrag = intakeSrc.slice(
      intakeSrc.indexOf("const handlePaidProPrepareSignaturesFromFirstReview = React.useCallback"),
      intakeSrc.indexOf("const handlePaidProPrepareSignaturesFromFirstReview = React.useCallback") + 4500,
    );
    expect(prepareFrag).toContain("ensureAcceptedCommercialReviewForEsignHandoff");
    expect(prepareFrag).toContain("canEnableCommercialPrepareFromServerSnapshot(agreementIdForAccept)");
    const trackStart = intakeSrc.indexOf("const enterGuidedSignatureTrackRoute = React.useCallback");
    const trackFrag = intakeSrc.slice(trackStart, trackStart + 16000);
    expect(trackFrag).toContain("ensureAcceptedCommercialReviewForEsignHandoff");
    expect(trackFrag).toContain("enterGuidedSignatureTrackRoute:accept_blocked");
    expect(trackFrag).toContain("handoff_ok");
    expect(continueBlock).not.toMatch(/resend|sendEmail|send_mail/i);
    expect(continueBlock).not.toMatch(/stripe|checkout|premiumCompletion/i);
    expect(trackFrag).not.toMatch(/Ask LawDog to revise[\s\S]{0,80}Apply/);
  });

  it("keeps the #180 resume Continue client gate (empty/invalid signers fail closed)", () => {
    const empty = evaluateDashboardSignerSetupResumeContinueGate({
      partySignerNames: ["", ""],
      recipient1Name: CEDAR,
      recipient2Name: BLUE,
      recipient1Email: "",
      recipient2Email: "",
      rawCorpus: askLawDogResumeCorpus({ names: false }),
    });
    expect(empty.detailsComplete).toBe(false);
    expect(empty.wouldBlockContinueWithoutNetwork).toBe(true);
    const finalizeSlice = intakeSrc.slice(
      intakeSrc.indexOf("const finalizePaidProSignerMetadataAndOpenReviewDecision = React.useCallback"),
      intakeSrc.indexOf("const finalizePaidProSignerMetadataAndOpenReviewDecision = React.useCallback") + 9000,
    );
    expect(finalizeSlice).toContain("Signer details could not be applied");
    expect(finalizeSlice).toContain("if (!paidProSignerDetailsGate.complete)");
  });
});
