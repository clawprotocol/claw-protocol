import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countUsableReviewRecipientLinks,
  resolveOwnerSigningPartyId,
  shouldIncludeOwnerReviewLink,
  shouldSkipPaidProPrepareReviewLinkInterstitial,
} from "./paidProPostRecipientSetupHandoff";
import type { AgreementDraft } from "../../agreement/agreementTypes";

describe("paidProPostRecipientSetupHandoff", () => {
  it("exports send-flow diagnostics and VS01 bridge wiring", () => {
    const s = readFileSync(join(__dirname, "paidProPostRecipientSetupHandoff.ts"), "utf8");
    expect(s).toContain("[send-flow-skip-review-link-interstitial]");
    expect(s).toContain("[send-flow-vs01-bridge-start]");
    expect(s).toContain("[send-flow-vs01-bridge-success]");
    expect(s).toContain("[send-flow-vs01-bridge-failed]");
    expect(s).toContain("tryNavigatePaidProAgreementSenderFirstVs01Esign");
    expect(s).toContain("tryNavigateGuidedSignatureTrackLocalVs01Esign");
    expect(s).toContain("resolvePaidSessionSignatureTrackHandoff");
    expect(s).toContain("mergePaidSessionSignatureTrackDraft");
    expect(s).toContain("relaxPaidSessionCorpusAssert: options.relaxPaidSessionCorpusAssert");
    expect(s).toContain("assertGuidedProVs01BridgeCorpusReady");
    expect(s).toContain("resolveGuidedVs01SigningHandoffForBridge");
    expect(s).toContain("mergeAgreementDraftWithGuidedSigningHandoff");
    expect(s).toContain("mintSimpleDoneReviewRecipientLinkRows");
    expect(s).toContain("shouldIncludeOwnerReviewLink");
    expect(s).toContain("countUsableReviewRecipientLinks");
    expect(s).toContain("linkCount");
    expect(s).toContain("resolveReviewFirstMintPolicyGate");
    expect(s).toContain("postReviewSentServer");
    expect(s).toContain("maybePostReviewSentAfterReviewFirstHandoff");
    expect(s).toContain("resolvePremiumSenderFirstSigningPath");
    expect(s).toContain("lockAuthoritativeVersionAndMintSigningInvites");
    expect(s).toContain("mintedInvitesPreserved");
    expect(s).toContain("professional_sign");
    expect(s).toContain("persistAcceptedSigningPacket");
    expect(s).toContain("shouldOpenSenderFirstProfessionalSign");
    const mintLoop = s.indexOf("for (const participantId of lockedInvite.requiredParticipantIds)");
    const notReadyAfterMint = s.indexOf(
      "The finalized agreement is not ready for signing yet",
      mintLoop,
    );
    expect(mintLoop).toBeGreaterThan(0);
    expect(notReadyAfterMint).toBe(-1);
    expect(s).not.toContain('path: "/app/done/');
    expect(s).not.toContain("/app/send/");
  });

  it("SimpleCreatePage uses skip interstitial handoff instead of defaulting to /app/send for paid Pro", () => {
    const page = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
    expect(page).toContain("shouldSkipPaidProPrepareReviewLinkInterstitial");
    expect(page).toContain("executePaidProPostRecipientSetupHandoff");
    expect(page).toContain("Retry prepare signing");
    expect(page).toContain("Back to agreement");
    const onCreated = page.indexOf("onCreated={");
    expect(onCreated).toBeGreaterThanOrEqual(0);
    const slice = page.slice(onCreated, onCreated + 3200);
    const skipIdx = slice.indexOf("shouldSkipPaidProPrepareReviewLinkInterstitial");
    const sendIdx = slice.indexOf("/app/send/");
    expect(skipIdx).toBeGreaterThanOrEqual(0);
    expect(sendIdx === -1 || sendIdx > skipIdx).toBe(true);
  });

  it("AgreementBuilderIntake inline send CTA uses post-recipient handoff before /app/send fallback", () => {
    const intake = readFileSync(
      join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"),
      "utf8",
    );
    const block = intake.slice(
      intake.indexOf("openPaidProPostInlineSendDestination"),
      intake.indexOf("openPaidProPostInlineSendDestination") + 2200,
    );
    expect(block).toContain("executePaidProPostRecipientSetupHandoff");
    expect(block).toContain("shouldSkipPaidProPrepareReviewLinkInterstitial");
    expect(intake).toContain("linkCount: Math.max(1, result.linkCount ?? 0)");
    expect(intake).not.toContain("linkCount: Math.max(1, paidProDistinctValidRecipientEmailCount)");
    const handoffIdx = block.indexOf("executePaidProPostRecipientSetupHandoff");
    const sendIdx = block.indexOf("/app/send/");
    expect(handoffIdx).toBeGreaterThanOrEqual(0);
    expect(sendIdx === -1 || sendIdx > handoffIdx).toBe(true);
  });
});

describe("resolveOwnerSigningPartyId", () => {
  const harbor = {
    id: "party-harbor",
    name: "Harbor Peak Analytics LLC",
    role: "owner",
    email: "maya.chen@harborpeak.test",
  };
  const ironvale = {
    id: "party-ironvale",
    name: "Ironvale Manufacturing Inc.",
    role: "reviewer",
    email: "jordan.hale@ironvale.test",
  };

  it("selects the owner role, not the first party with an id", () => {
    const reversed = { parties: [ironvale, harbor] } as AgreementDraft;
    expect(resolveOwnerSigningPartyId(reversed)).toBe("party-harbor");
    const listed = { parties: [harbor, ironvale] } as AgreementDraft;
    expect(resolveOwnerSigningPartyId(listed)).toBe("party-harbor");
  });

  it("does not fall back to array position when owner is missing or ambiguous", () => {
    expect(resolveOwnerSigningPartyId({ parties: [ironvale] } as AgreementDraft)).toBeNull();
    expect(
      resolveOwnerSigningPartyId({
        parties: [
          { ...harbor, role: "owner" },
          { ...ironvale, id: "party-other", role: "owner" },
        ],
      } as AgreementDraft),
    ).toBeNull();
    expect(resolveOwnerSigningPartyId({ parties: [{ ...harbor, id: "" }] } as AgreementDraft)).toBeNull();
  });
});

describe("shouldIncludeOwnerReviewLink", () => {
  it("keeps owner review links at three or more named legal parties", () => {
    expect(
      shouldIncludeOwnerReviewLink({
        parties: [
          { id: "o", name: "Harbor Peak Analytics LLC", role: "owner" },
          { id: "c", name: "Ironvale Manufacturing Inc.", role: "reviewer" },
          { id: "a", name: "Alex Rivera", role: "reviewer" },
        ],
      } as AgreementDraft),
    ).toBe(true);
  });

  it("counts minted review hrefs, not recipient emails", () => {
    expect(
      countUsableReviewRecipientLinks([
        { reviewHref: "https://app.example.com/agreements/a1/review?t=tok-northwind" },
        { reviewHref: "   " },
      ]),
    ).toBe(1);
  });

  it("omits the two-party owner so they use workspace, not recipient-approve", () => {
    expect(
      shouldIncludeOwnerReviewLink({
        parties: [
          { id: "o", name: "Orion Harbor LLC", role: "owner" },
          { id: "c", name: "Northwind Retail Inc", role: "reviewer" },
        ],
      } as AgreementDraft),
    ).toBe(false);
  });
});

describe("shouldSkipPaidProPrepareReviewLinkInterstitial", () => {
  it("returns false for non-authoritative drafts", () => {
    expect(
      shouldSkipPaidProPrepareReviewLinkInterstitial({
        draft: { purpose: "free" } as never,
        agreementId: "a1",
        premiumSendIntent: "review",
      }),
    ).toBe(false);
  });
});
