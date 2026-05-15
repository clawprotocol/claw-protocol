import { looksLikeEmail, stripRecipientEmailNoise } from "./recipientEmailValidation";

/** Dedupe by lowercased address; counts only valid-looking emails. */
export function countDistinctValidRecipientEmails(
  rows: readonly { raw: string }[],
): number {
  const seen = new Set<string>();
  for (const { raw } of rows) {
    const e = stripRecipientEmailNoise(raw);
    if (!looksLikeEmail(e)) continue;
    const low = e.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
  }
  return seen.size;
}

/** Primary sticky / modal action label for minting review links from recipient setup. */
export function premiumReviewMintPrimaryLabel(validEmailCount: number, hasValidationErrors: boolean): string {
  if (hasValidationErrors || validEmailCount < 1) return "Add recipient emails";
  return validEmailCount > 1 ? "Create review links" : "Create review link";
}

/** Short headline above the sticky primary when review send chrome is minimal. */
export function premiumReviewMintStickyHeadline(validEmailCount: number, hasValidationErrors: boolean): string {
  return premiumReviewMintPrimaryLabel(validEmailCount, hasValidationErrors);
}

export function premiumReviewMintConfirmModalTitle(validEmailCount: number, hasValidationErrors: boolean): string {
  if (hasValidationErrors || validEmailCount < 1) return "Add recipient emails?";
  return validEmailCount > 1 ? "Create review links?" : "Create review link?";
}
