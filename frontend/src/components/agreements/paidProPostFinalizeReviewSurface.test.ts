import { describe, expect, it } from "vitest";
import { shouldRollbackSignerFinalizeUnreadyCorpus } from "./paidProPostFinalizeReviewSurface";

describe("shouldRollbackSignerFinalizeUnreadyCorpus", () => {
  it("does not roll back an accepted apply snapshot with blank execution names", () => {
    expect(
      shouldRollbackSignerFinalizeUnreadyCorpus({
        reusedAcceptedSnapshot: true,
        signingReadyPlain: "CLIENT:\nIronvale Manufacturing Inc\nName: __________________________\n",
        hydratedRejected: false,
      }),
    ).toBe(false);
  });

  it("still rolls back a rejected hydrate when the snapshot was not reused", () => {
    expect(
      shouldRollbackSignerFinalizeUnreadyCorpus({
        reusedAcceptedSnapshot: false,
        signingReadyPlain: "short",
        hydratedRejected: true,
      }),
    ).toBe(true);
  });
});
