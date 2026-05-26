import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";

/** Opens the revise workspace from the review-first read tab (edit mode). */
export async function openRecipientReviseEditWorkspace(
  user: Pick<typeof userEvent, "click"> = userEvent,
): Promise<void> {
  await user.click(screen.getByTestId("recipient-review-propose-updated-draft"));
  await waitFor(() => {
    expect(screen.getByTestId("recipient-edit-draft-textarea")).toBeTruthy();
  });
}

/** Opens the manual updated-draft editor used by the review-first path. */
export async function openRecipientQuickChangeWorkspace(
  user: Pick<typeof userEvent, "click"> = userEvent,
): Promise<void> {
  await openRecipientReviseEditWorkspace(user);
  const quick = screen.queryByTestId("recipient-workflow-quick");
  if (quick) await user.click(quick);
  await waitFor(() => {
    expect(screen.getByTestId("recipient-revision-voice-field")).toBeTruthy();
  });
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
