/**
 * Pre–final-review signer slot completeness — all required parties, not just party 1.
 */

import { isPlaceholderPartyName } from "../starterPartyLimits";
import { looksLikeEmail, stripRecipientEmailNoise } from "../recipientEmailValidation";

export type PremiumSendModeForSignerGate = "signature" | "review";

export type ResolveGuidedPreReviewSignerSlotsArgs = {
  partyCount: number;
  partySignerNames: readonly string[];
  recipient1Name: string;
  recipient2Name: string;
  recipient1Email: string;
  recipient2Email: string;
  extraPartyReviewEmails: readonly string[];
  draftPartyNames: readonly string[];
  sendMode: PremiumSendModeForSignerGate;
  recipientsDeferred: boolean;
};

function isUsablePartyIdentity(name: string): boolean {
  const t = name.trim();
  if (t.length < 2) return false;
  if (isPlaceholderPartyName(t)) return false;
  if (/^party[_\s-]?[ab]$/i.test(t)) return false;
  return true;
}

function emailForPartyIndex(args: ResolveGuidedPreReviewSignerSlotsArgs, index: number): string {
  if (index === 0) return stripRecipientEmailNoise(args.recipient1Email);
  if (index === 1) return stripRecipientEmailNoise(args.recipient2Email);
  return stripRecipientEmailNoise(args.extraPartyReviewEmails[index - 2] ?? "");
}

function displayNameForPartyIndex(args: ResolveGuidedPreReviewSignerSlotsArgs, index: number): string {
  if (index === 0) return args.recipient1Name.trim();
  if (index === 1) return args.recipient2Name.trim();
  return "";
}

function partyHasIdentity(args: ResolveGuidedPreReviewSignerSlotsArgs, index: number): boolean {
  const signer = (args.partySignerNames[index] ?? "").trim();
  if (isUsablePartyIdentity(signer)) return true;
  if (isUsablePartyIdentity(displayNameForPartyIndex(args, index))) return true;
  if (isUsablePartyIdentity((args.draftPartyNames[index] ?? "").trim())) return true;
  return false;
}

function partyRequiresEmail(args: ResolveGuidedPreReviewSignerSlotsArgs, index: number): boolean {
  if (args.recipientsDeferred) return false;
  if (args.sendMode === "signature") return index >= 1;
  return true;
}

function partyHasEmail(args: ResolveGuidedPreReviewSignerSlotsArgs, index: number): boolean {
  if (!partyRequiresEmail(args, index)) return true;
  return looksLikeEmail(emailForPartyIndex(args, index));
}

export type GuidedPreReviewSignerSlotsResolution = {
  complete: boolean;
  requiredCount: number;
  filledCount: number;
  incompleteIndices: number[];
};

export function resolveGuidedPreReviewSignerSlots(
  args: ResolveGuidedPreReviewSignerSlotsArgs,
): GuidedPreReviewSignerSlotsResolution {
  const requiredCount = Math.max(args.partyCount, 2);
  const incompleteIndices: number[] = [];
  let filledCount = 0;

  for (let i = 0; i < requiredCount; i++) {
    const identity = partyHasIdentity(args, i);
    const email = partyHasEmail(args, i);
    if (identity && email) {
      filledCount += 1;
    } else {
      incompleteIndices.push(i);
    }
  }

  return {
    complete: incompleteIndices.length === 0,
    requiredCount,
    filledCount,
    incompleteIndices,
  };
}
