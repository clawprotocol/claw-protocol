import { expect, test } from "@playwright/test";
import {
  fetchOwnerIdentityState,
  persistOwnerPartyContacts,
} from "./qualityEvalJourney";
import { seedCorePaidJourneyOwner } from "./corePaidJourneyLiveAuth";

/**
 * Integration-only: `persistOwnerPartyContacts` posts `/update-field`.
 * Not customer-journey proof. Customer qualification uses visible signer-details UI.
 */
const enabled = process.env.QUALITY_EVAL_INTEGRATION === "1";
test.skip(!enabled, "persistOwnerPartyContacts is integration setup, not customer-journey proof");

test.describe("integration: persistOwnerPartyContacts API setup (not customer-journey proof)", () => {
  test("writes labeled party contacts through update-field", async ({ page }) => {
    test.setTimeout(30_000);
    await seedCorePaidJourneyOwner(page);
    const agreementId = process.env.QUALITY_EVAL_INTEGRATION_AGREEMENT_ID || "";
    test.skip(!agreementId, "requires QUALITY_EVAL_INTEGRATION_AGREEMENT_ID");
    const signers = [
      { legalEntity: "Harbor Peak Analytics LLC", signerName: "Pat Harbor", signerEmail: "pat.harbor@harbor.test" },
      { legalEntity: "Ironvale Manufacturing Inc", signerName: "Sam Ironvale", signerEmail: "sam.ironvale@ironvale.test" },
      { legalEntity: "Alex Rivera", signerName: "Alex Rivera", signerEmail: "alex.rivera@advisor.test" },
    ] as const;
    await persistOwnerPartyContacts(page, agreementId, signers);
    const saved = await fetchOwnerIdentityState(page, agreementId);
    for (const signer of signers) {
      const row = saved.parties.find((party) => String(party.name || "").includes(signer.legalEntity));
      expect(row, signer.legalEntity).toBeTruthy();
      expect(String(row?.signerName || row?.signer_name || "")).toMatch(
        new RegExp(signer.signerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      );
    }
  });
});
