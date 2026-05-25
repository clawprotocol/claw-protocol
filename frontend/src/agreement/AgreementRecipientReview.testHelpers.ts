import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";

/** Opens the revise workspace from the review-first read tab (edit mode). */
export async function openRecipientReviseEditWorkspace(
  user: Pick<typeof userEvent, "click"> = userEvent,
): Promise<void> {
  const more = screen.queryByTestId("recipient-review-more-options");
  if (more) await user.click(more);
  await user.click(screen.getByTestId("recipient-review-edit-draft"));
  await waitFor(() => {
    expect(screen.getByTestId("recipient-compose-tablist")).toBeTruthy();
  });
}

/** Opens quick-change mode from review-first read tab. */
export async function openRecipientQuickChangeWorkspace(
  user: Pick<typeof userEvent, "click"> = userEvent,
): Promise<void> {
  await openRecipientReviseEditWorkspace(user);
  await user.click(screen.getByTestId("recipient-workflow-quick"));
}

/** Opens upload pick-method from review-first read tab. */
export async function openRecipientReviseUploadPickMethod(
  user: Pick<typeof userEvent, "click"> = userEvent,
): Promise<void> {
  const more = screen.queryByTestId("recipient-review-more-options");
  if (more) await user.click(more);
  await user.click(screen.getByTestId("recipient-review-upload-updated-draft"));
  await waitFor(() => {
    expect(screen.getByTestId("recipient-revised-version-panel")).toBeTruthy();
  });
}

/** Primary approve control on the review-first read tab. */
export async function approveDraftFromReviewFirst(
  user: Pick<typeof userEvent, "click"> = userEvent,
): Promise<void> {
  await user.click(screen.getByTestId("recipient-review-approve-draft"));
}
