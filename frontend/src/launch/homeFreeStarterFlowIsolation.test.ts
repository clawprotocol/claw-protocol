/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { establishPaidProSourceOfTruth, clearPaidProSourceOfTruth, hasPaidProSourceOfTruth } from "../components/agreements/paidProSourceOfTruth";
import {
  shouldRestoreStoredCreateReviewDraftSnapshot,
  shouldSkipHomeAutoGenerateForStoredReview,
} from "../components/agreements/createReviewRefreshRestore";
import {
  FREE_STARTER_REVIEW_TITLE,
  resetStalePaidReviewShellForFreeStarter,
  resolveReviewShellChrome,
} from "../components/agreements/freeStarterReviewShell";
import { resolveCanonicalFinalPartyManifest } from "../components/agreements/guidedDealCompletion/canonicalFinalPartyManifest";
import { extractBetweenPartyNameList } from "../components/agreements/partyBetweenParse";
import {
  clearPremiumPartyNamesHandoff,
  writePremiumRecipientHandoffExact,
} from "../components/agreements/premiumPartyNamesHandoff";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "../components/agreements/paidProSessionEligibility";
import { markPaidPremiumCompletionSession, hasPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";
import {
  clearStalePaidProAuthorityForFreshFreeStarter,
  initializeNewAgreementSession,
} from "./newAgreementSessionReset";
import { writeCreateReviewDraftReadyMarker } from "../components/agreements/agreementIntakeStorage";

import {
  buildStarterIsolationSubstantiveProCorpus,
  STARTER_ISOLATION_HARBOR_PEAK,
  STARTER_ISOLATION_RED_MESA,
  STARTER_ISOLATION_TWO_PARTY_INTAKE,
} from "./starterIsolationFixtures";

describe("homeFreeStarterFlowIsolation (test331)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    sessionStorage.clear();
  });

  it("initializeNewAgreementSession clears stale paid Pro SoT from prior QA tab session", () => {
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    establishPaidProSourceOfTruth({
      text: buildStarterIsolationSubstantiveProCorpus(),
      source: "server_full_draft",
    });
    markPaidPremiumCompletionSession({ source: "qa_bypass" });
    writePremiumRecipientHandoffExact(
      { name: "Stale A", email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
      { name: "Stale B", email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
      [
        { name: "Extra 3", email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
        { name: "Extra 4", email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
        { name: "Extra 5", email: "", role: "party", signerName: "", signerTitle: "", partyAddress: "" },
      ],
    );
    expect(hasPaidProSourceOfTruth()).toBe(true);

    initializeNewAgreementSession();

    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(hasPaidPremiumCompletionSession()).toBe(false);
    expect(sessionStorage.getItem("claw_premium_recipient_handoff_v2")).toBeNull();
  });

  function establishStalePaidProSoTForIsolation(): void {
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    establishPaidProSourceOfTruth({
      text: buildStarterIsolationSubstantiveProCorpus(),
      source: "server_full_draft",
    });
  }

  it("fresh homepage hero handoff does not skip auto-generate solely because stale paid SoT exists", () => {
    establishStalePaidProSoTForIsolation();
    expect(shouldSkipHomeAutoGenerateForStoredReview()).toBe(true);
    expect(shouldSkipHomeAutoGenerateForStoredReview({ freshHomeHeroHandoff: true })).toBe(false);
  });

  it("resetStalePaidReviewShellForFreeStarter clears paid authority for home_create_submit", () => {
    establishStalePaidProSoTForIsolation();
    resetStalePaidReviewShellForFreeStarter("home_create_submit");
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(
      resolveReviewShellChrome({
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: false,
        paidProAuthoritative: false,
        paidProReviewReadyBase: false,
        guidedCompletionActive: false,
      }).title,
    ).toBe(FREE_STARTER_REVIEW_TITLE);
  });

  it("shouldRestoreStoredCreateReviewDraftSnapshot stays false when paid SoT blocks restore", () => {
    writeCreateReviewDraftReadyMarker();
    establishStalePaidProSoTForIsolation();
    expect(shouldRestoreStoredCreateReviewDraftSnapshot()).toBe(false);
  });

  it("test331 prompt resolves exactly two parties and manifest stays at two slots", () => {
    clearStalePaidProAuthorityForFreshFreeStarter();
    expect(extractBetweenPartyNameList(STARTER_ISOLATION_TWO_PARTY_INTAKE)).toEqual([
      STARTER_ISOLATION_RED_MESA,
      STARTER_ISOLATION_HARBOR_PEAK,
    ]);
    const manifest = resolveCanonicalFinalPartyManifest({
      sendMode: "review",
      recipientsDeferred: false,
      partyCount: 2,
      recipient1Name: "Red Mesa Logistics",
      recipient2Name: "LLC",
      recipient1Email: "",
      recipient2Email: "",
      draftPartyNames: ["Red Mesa Logistics", "LLC", "Harbor Peak Automation"],
      partySignerNames: ["", ""],
      extraPartyReviewEmails: [],
      intakeText: STARTER_ISOLATION_TWO_PARTY_INTAKE,
    });
    expect(manifest.parties).toHaveLength(2);
    expect(manifest.parties[0]?.partyName).toBe(STARTER_ISOLATION_RED_MESA);
    expect(manifest.parties[1]?.partyName).toBe(STARTER_ISOLATION_HARBOR_PEAK);
  });
});
