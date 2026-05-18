/** Homepage → starter draft: submit threshold and logging. */

export const HOME_DRAFT_SUBMIT_MIN_CHARS = 6;

export function meetsHomeDraftSubmitThreshold(text: string): boolean {
  return text.trim().length >= HOME_DRAFT_SUBMIT_MIN_CHARS;
}

export function logHomeCreateSubmit(text: string): void {
  console.info("[home-create-submit]", {
    inputLen: text.length,
    source: "home_textarea_current_value",
    target: "starter_review",
  });
}
