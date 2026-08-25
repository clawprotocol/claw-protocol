/** @vitest-environment jsdom */
/**
 * After TEST pay, AGREEMENT body keeps intake identities, but Signer details was
 * seeding from corrupted draft.parties (Harbor Marks LLC / "Diego Alvarez of").
 * Panel seed must use intake-repaired draftSnapshotRef parties.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  persistStarterReviewBeforeCheckout,
  readCheckoutBackRestoreSnapshot,
  repairCheckoutBackRestoreDraftParties,
  clearCheckoutBackRestoreSnapshot,
} from "./checkoutBackRestore";
import { getRecipientHandoffNamesFromDraft } from "./partyIntakeNormalize";
import { pickRecipientNameForHandoff } from "./reviewPlaceholderGuard";
import {
  canOpenPaidSessionFinalReviewAfterSigners,
  resolvePaidSessionTwoSignerNamesEmailsComplete,
  shouldKeepPaidSessionSignerEmailsInteractive,
} from "./paidProPaidSessionLanding";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
import {
  clearPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
} from "./premiumCompletionStorage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const INTAKE_SRC = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

const INTAKE =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit.";

const PRE_CHECKOUT_DRAFT: ParsedDraftShape = {
  title: "SERVICES AGREEMENT",
  jurisdiction: "Texas",
  parties: [
    { name: "Priya Shah of Northline Studio", role: "client" },
    { name: "Diego Alvarez of Harbor Marks LLC", role: "service_provider" },
  ],
  purpose: "design a logo and brand kit",
};

const POST_GENERATION_CORRUPTED_DRAFT: ParsedDraftShape = {
  ...PRE_CHECKOUT_DRAFT,
  parties: [
    { name: "Harbor Marks LLC", role: "client" },
    { name: "Diego Alvarez of", role: "service_provider" },
  ],
};

const PARTY1 = "Priya Shah of Northline Studio";
const PARTY2 = "Diego Alvarez of Harbor Marks LLC";

describe("after-pay Signer details panel seed (Priya/Diego live miss)", () => {
  beforeEach(() => {
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
  });

  afterEach(() => {
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
  });

  it("live miss: raw draft.parties seed Harbor Marks LLC / Diego Alvarez of", () => {
    const raw = getRecipientHandoffNamesFromDraft(POST_GENERATION_CORRUPTED_DRAFT);
    expect(raw.n1).toBe("Harbor Marks LLC");
    expect(raw.n2).toBe("Diego Alvarez of");
    expect(pickRecipientNameForHandoff("", raw.n1)).toBe("Harbor Marks LLC");
    expect(pickRecipientNameForHandoff("", raw.n2)).toBe("Diego Alvarez of");
    expect(pickRecipientNameForHandoff("Harbor Marks LLC", PARTY1)).toBe("Harbor Marks LLC");
  });

  it("repaired draftSnapshotRef seed keeps the two visitor-named legal entities", () => {
    persistStarterReviewBeforeCheckout({
      intakeText: INTAKE,
      draft: PRE_CHECKOUT_DRAFT,
    });
    const snap = readCheckoutBackRestoreSnapshot();
    expect(snap?.intakeText).toBe(INTAKE);

    const repaired = repairCheckoutBackRestoreDraftParties(
      POST_GENERATION_CORRUPTED_DRAFT,
      snap?.intakeText || INTAKE,
    );
    expect(repaired.parties.map((p) => p.name)).toEqual([PARTY1, PARTY2]);

    const seeded = getRecipientHandoffNamesFromDraft(repaired);
    expect(seeded.n1).toBe(PARTY1);
    expect(seeded.n2).toBe(PARTY2);
    expect(seeded.n1).not.toBe("Harbor Marks LLC");
    expect(seeded.n2).not.toBe("Diego Alvarez of");
  });

  it("reviewer emails stay typeable and Continue / Send track stay armed once names+emails are complete", () => {
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    const repaired = repairCheckoutBackRestoreDraftParties(POST_GENERATION_CORRUPTED_DRAFT, INTAKE);
    const seeded = getRecipientHandoffNamesFromDraft(repaired);
    const emails = {
      signer1Name: seeded.n1,
      signer1Email: "priya.shah@example.com",
      signer2Name: seeded.n2,
      signer2Email: "diego.alvarez@example.com",
    };
    expect(resolvePaidSessionTwoSignerNamesEmailsComplete(emails)).toBe(true);
    expect(
      shouldKeepPaidSessionSignerEmailsInteractive({
        paidSessionActive: true,
        premiumCompletionReturn: true,
      }),
    ).toBe(true);
    expect(
      canOpenPaidSessionFinalReviewAfterSigners({
        paidSessionActive: true,
        visibleDealBody: true,
        twoSignerNamesAndEmailsComplete: true,
      }),
    ).toBe(true);

    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      intakeText: INTAKE,
      draftPartyNames: [seeded.n1, seeded.n2],
      partySignerNames: ["Priya Shah", "Diego Alvarez"],
      recipient1Name: seeded.n1,
      recipient2Name: seeded.n2,
      recipient1Email: emails.signer1Email,
      recipient2Email: emails.signer2Email,
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(true);
    expect(gate.blockerMessage).toBe("");
  });

  it("intake writes repaired parties onto draftSnapshotRef and seeds the panel from it", () => {
    expect(INTAKE_SRC).toContain("After-pay Signer details seed: draftSnapshotRef parties stay intake-authoritative");
    expect(INTAKE_SRC).toContain("draftSnapshotRef.current = next");
    expect(INTAKE_SRC).toContain("repairCheckoutBackRestoreDraftParties(draft, intake)");
    expect(INTAKE_SRC).toContain("Seed from draftSnapshotRef (repaired), not live draft.parties");
    expect(INTAKE_SRC).toContain(
      "repairCheckoutBackRestoreDraftParties(draftSnapshotRef.current ?? draft, intakeForCap)",
    );
    expect(INTAKE_SRC).toMatch(/if \(names\[0\]\) setRecipient1Name\(names\[0\]\)/);
    expect(INTAKE_SRC).toMatch(/if \(names\[1\]\) setRecipient2Name\(names\[1\]\)/);

    const prefillStart = INTAKE_SRC.indexOf("Prefill recipient names / signer labels");
    expect(prefillStart).toBeGreaterThan(-1);
    const prefill = INTAKE_SRC.slice(prefillStart, prefillStart + 2200);
    expect(prefill).toContain("draftSnapshotRef.current");
    expect(prefill).toContain("repairCheckoutBackRestoreDraftParties");
    expect(prefill).not.toMatch(/getRecipientHandoffNamesFromDraft\(draft\)/);

    expect(INTAKE_SRC).toContain("Continue after complete signers opens SimpleProFinalReviewScreen");
    expect(INTAKE_SRC).toContain("<SimpleProFinalReviewScreen");
    const sendStart = INTAKE_SRC.indexOf("const handleProSendForSignature = React.useCallback");
    expect(sendStart).toBeGreaterThan(-1);
    const send = INTAKE_SRC.slice(sendStart, sendStart + 4500);
    expect(send).toContain("feedbackCreatingLinks(\"signing\")");
    expect(send).toContain("enterGuidedSignatureTrackRoute");
    expect(send).not.toContain("authorized-signer-name");
    const trackStart = INTAKE_SRC.indexOf("const enterGuidedSignatureTrackRoute = React.useCallback");
    expect(trackStart).toBeGreaterThan(-1);
    const track = INTAKE_SRC.slice(trackStart, trackStart + 25000);
    expect(track).toContain("draftSnapshotRef.current");
    expect(track).not.toMatch(/\bdraftRef\b/);
  });
});
