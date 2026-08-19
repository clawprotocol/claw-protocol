/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JourneyActionBanner } from "./JourneyActionBanner";
import {
  CUSTOMER_JOURNEY_STATE,
  resolveCustomerJourneyState,
} from "./customerJourneyReadiness";
import {
  feedbackAfterDirectSave,
  feedbackAfterDirectSaveFailed,
  feedbackAfterModelFailure,
  feedbackBlocked,
  feedbackCreatingAgreement,
  feedbackCreatingLinks,
  feedbackFailed,
  feedbackLinksInvalidated,
  clearJourneyActionFlash,
  publishJourneyActionFlash,
  readJourneyActionFlash,
  feedbackSucceeded,
  feedbackWorking,
} from "./journeyActionFeedback";

describe("JourneyActionBanner rendered states", () => {
  it("shows working, succeeded, blocked, and failed copy", () => {
    const onRemedy = vi.fn();
    const { rerender } = render(
      <JourneyActionBanner feedback={feedbackWorking("create_agreement", "Creating agreement", "Creating your agreement.")} />,
    );
    expect(screen.getByTestId("journey-action-banner").getAttribute("data-journey-action-kind")).toBe("working");
    expect(screen.getByText("Creating agreement")).toBeTruthy();

    rerender(
      <JourneyActionBanner
        feedback={feedbackSucceeded("create_agreement", "Agreement created", "We captured the parties and scope.")}
      />,
    );
    expect(screen.getByTestId("journey-action-banner").getAttribute("data-journey-action-kind")).toBe("succeeded");

    rerender(
      <JourneyActionBanner
        feedback={feedbackBlocked("create_agreement", "Add two legal names", "Name both contracting parties.", {
          remedyLabel: "Go to the first missing field",
        })}
        onRemedy={onRemedy}
      />,
    );
    expect(screen.getByTestId("journey-action-banner").getAttribute("data-journey-action-kind")).toBe("blocked");
    fireEvent.click(screen.getByTestId("journey-action-remedy"));
    expect(onRemedy).toHaveBeenCalledTimes(1);

    rerender(
      <JourneyActionBanner
        feedback={feedbackFailed("create_links", "Links were not created", "Your agreement is saved. Try again.")}
      />,
    );
    expect(screen.getByTestId("journey-action-banner").getAttribute("data-journey-action-kind")).toBe("failed");
  });

  it("keeps consequential success feedback available across route transitions until dismissed", () => {
    clearJourneyActionFlash();
    const feedback = feedbackSucceeded(
      "create_links",
      "Signing links created—share when ready",
      "Four private signing links were created. Nothing was emailed.",
    );
    publishJourneyActionFlash(feedback);
    expect(readJourneyActionFlash()).toEqual(feedback);
    clearJourneyActionFlash();
    expect(readJourneyActionFlash()).toBeNull();
  });
});

describe("customer journey in-flight states", () => {
  const base = {
    hasTwoParties: true,
    hasSubstantivePurpose: true,
    draftCreated: false,
    contentBlockers: false,
    partiesComplete: false,
    signerDetailsComplete: false,
    reviewRecipientsComplete: false,
    deliveryTrack: "none" as const,
    linksCreated: false,
    waitingForReview: false,
    waitingForSignatures: false,
    fullyExecuted: false,
    actionNeedsAttention: false,
  };

  it("creating agreement and creating links are distinct from ready states", () => {
    expect(resolveCustomerJourneyState({ ...base, creatingAgreement: true })).toBe(
      CUSTOMER_JOURNEY_STATE.creatingAgreement,
    );
    expect(
      resolveCustomerJourneyState({
        ...base,
        draftCreated: true,
        partiesComplete: true,
        reviewRecipientsComplete: true,
        deliveryTrack: "review",
        creatingLinks: true,
      }),
    ).toBe(CUSTOMER_JOURNEY_STATE.creatingLinks);
  });

  it("direct-save and model-failure copy do not claim success", () => {
    expect(feedbackAfterDirectSave()).toMatch(/Changes saved/);
    expect(feedbackAfterDirectSaveFailed()).toMatch(/unsaved text is still in the editor/i);
    expect(feedbackAfterModelFailure()).toMatch(/Your information is unchanged/i);
    expect(feedbackLinksInvalidated()).toMatch(/no longer valid/i);
    expect(feedbackCreatingAgreement().kind).toBe("working");
    expect(feedbackCreatingLinks("signing").body).toMatch(/signing links/i);
  });
});
