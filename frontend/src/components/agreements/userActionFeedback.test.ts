import { describe, expect, it } from "vitest";
import { CUSTOMER_JOURNEY_STATE, resolveCustomerJourneyState } from "./customerJourneyReadiness";
import { REVIEW_LINKS_ALREADY_READY_MESSAGE } from "../../launch/simpleProduct/reviewLinkMintIdempotency";
import { resolveUserActionFeedback, userActionFeedbackHasNextStep } from "./userActionFeedback";

const catalog: Array<Parameters<typeof resolveUserActionFeedback>[0]> = [
  { actor: "anonymous", action: "create_agreement", outcome: "blocked" },
  { actor: "anonymous", action: "open_review_link", outcome: "succeeded" },
  { actor: "owner", action: "create_agreement", outcome: "working" },
  { actor: "owner", action: "create_agreement", outcome: "succeeded" },
  { actor: "owner", action: "create_agreement", outcome: "failed" },
  {
    actor: "owner",
    action: "create_agreement",
    outcome: "blocked",
    title: "Name the parties to continue",
    remainder: "We can see commercial details, but not clear legal names for every signing party (2–4).",
  },
  { actor: "owner", action: "create_agreement", outcome: "succeeded", partyCount: 4 },
  { actor: "owner", action: "choose_review_track", outcome: "succeeded" },
  { actor: "owner", action: "choose_signature_track", outcome: "succeeded" },
  { actor: "owner", action: "add_party", outcome: "succeeded", remainder: "Remint Gamma LLC" },
  { actor: "owner", action: "create_review_links", outcome: "working" },
  { actor: "owner", action: "create_review_links", outcome: "succeeded", linkCount: 3 },
  { actor: "owner", action: "create_review_links", outcome: "already_complete" },
  { actor: "owner", action: "create_review_links", outcome: "failed" },
  { actor: "owner", action: "create_signing_links", outcome: "blocked", remainingNamed: "Remint Beta LLC" },
  { actor: "owner", action: "create_signing_links", outcome: "succeeded", linkCount: 3 },
  { actor: "owner", action: "complete_agreement", outcome: "blocked", remainingNamed: "Remint Gamma LLC" },
  { actor: "owner", action: "complete_agreement", outcome: "succeeded" },
  { actor: "recipient", action: "approve_review", outcome: "working" },
  { actor: "recipient", action: "approve_review", outcome: "succeeded" },
  { actor: "recipient", action: "approve_review", outcome: "already_complete" },
  { actor: "recipient", action: "approve_review", outcome: "blocked", remainder: "Use the personal review link from the sender." },
  { actor: "recipient", action: "approve_review", outcome: "failed" },
  { actor: "recipient", action: "open_review_link", outcome: "working" },
  { actor: "recipient", action: "open_review_link", outcome: "failed" },
  { actor: "signer", action: "complete_signature", outcome: "working" },
  { actor: "signer", action: "complete_signature", outcome: "succeeded", remainingNamed: "Remint Beta LLC" },
  { actor: "signer", action: "complete_signature", outcome: "already_complete" },
  { actor: "signer", action: "complete_signature", outcome: "blocked", remainder: "wrong party" },
  { actor: "signer", action: "complete_signature", outcome: "blocked", remainder: "Your signing session could not be verified." },
  { actor: "signer", action: "complete_signature", outcome: "failed" },
];

describe("user action feedback thread", () => {
  it("covers every owner, recipient, signer, and anonymous action with plain-language next state", () => {
    for (const input of catalog) {
      const feedback = resolveUserActionFeedback(input);
      expect(feedback.title.trim().length).toBeGreaterThan(3);
      expect(feedback.body.trim().length).toBeGreaterThan(8);
      expect(feedback.body).not.toMatch(/^[a-z0-9_]+$/);
      expect(userActionFeedbackHasNextStep(feedback)).toBe(true);
    }
  });

  it("repeated create review links reports already ready without claiming new minting", () => {
    const feedback = resolveUserActionFeedback({
      actor: "owner",
      action: "create_review_links",
      outcome: "already_complete",
    });
    expect(feedback.title).toBe(REVIEW_LINKS_ALREADY_READY_MESSAGE);
    expect(feedback.body).toMatch(/Nothing new was created/);
    expect(
      resolveCustomerJourneyState({
        hasTwoParties: true,
        hasSubstantivePurpose: true,
        draftCreated: true,
        contentBlockers: false,
        partiesComplete: true,
        signerDetailsComplete: false,
        reviewRecipientsComplete: true,
        deliveryTrack: "review",
        linksCreated: true,
        waitingForReview: false,
        waitingForSignatures: false,
        fullyExecuted: false,
        actionNeedsAttention: false,
        reviewLinksAlreadyReady: true,
      }),
    ).toBe(CUSTOMER_JOURNEY_STATE.reviewLinksAlreadyReady);
  });

  it("created drafts name 2–4 parties and track choice uses existing GTM copy", () => {
    expect(
      resolveUserActionFeedback({
        actor: "owner",
        action: "create_agreement",
        outcome: "succeeded",
        partyCount: 4,
      }).body,
    ).toMatch(/4 parties/);
    expect(
      resolveUserActionFeedback({ actor: "owner", action: "choose_review_track", outcome: "succeeded" }).body,
    ).toMatch(/private review links/i);
    expect(
      resolveUserActionFeedback({ actor: "owner", action: "choose_signature_track", outcome: "succeeded" }).body,
    ).toMatch(/authorized signer/i);
  });

  it("duplicate approval and early completion name the current state", () => {
    const dup = resolveUserActionFeedback({
      actor: "recipient",
      action: "approve_review",
      outcome: "already_complete",
    });
    expect(dup.title).toMatch(/Review submitted/i);
    expect(dup.body).toMatch(/recorded|close this page/i);
    const early = resolveUserActionFeedback({
      actor: "owner",
      action: "complete_agreement",
      outcome: "blocked",
      remainingNamed: "Remint Gamma LLC",
    });
    expect(early.body).toMatch(/cannot complete yet/);
    expect(early.body).toMatch(/Remint Gamma LLC/);
  });
});
