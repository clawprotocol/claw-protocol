/**
 * Pre–final-review signer slot completeness — all required parties, not just party 1.
 */

import { isPlaceholderPartyName } from "../starterPartyLimits";
import { looksLikeEmail, shouldShowRecipientEmailFormatError, stripRecipientEmailNoise } from "../recipientEmailValidation";

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

export type SignerSetupFieldBlocker = {
  partyIndex: number;
  field: "representative_name" | "email";
  reason: "missing" | "invalid_email" | "name_in_email_field" | "placeholder_name";
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
  if (isUsablePartyIdentity(displayNameForPartyIndex(args, index))) return true;
  if (isUsablePartyIdentity((args.draftPartyNames[index] ?? "").trim())) return true;
  if (index >= 1) {
    const signer = (args.partySignerNames[index] ?? "").trim();
    if (isUsablePartyIdentity(signer)) return true;
  }
  return false;
}

function partyRequiresEmail(args: ResolveGuidedPreReviewSignerSlotsArgs, index: number): boolean {
  if (args.recipientsDeferred) return false;
  if (args.sendMode === "signature") return index >= 1;
  return true;
}

export function isNameTypedInEmailField(emailRaw: string): boolean {
  const t = stripRecipientEmailNoise(emailRaw);
  if (!t) return false;
  if (looksLikeEmail(t)) return false;
  if (t.includes("@") && !looksLikeEmail(t)) return true;
  if (!t.includes("@") && /^[A-Za-z][A-Za-z\s.'-]{2,}$/.test(t) && /\s/.test(t)) return true;
  return false;
}

export function describeGuidedSignerSetupBlockers(
  args: ResolveGuidedPreReviewSignerSlotsArgs,
): SignerSetupFieldBlocker[] {
  const requiredCount = Math.max(args.partyCount, 2);
  const blockers: SignerSetupFieldBlocker[] = [];

  for (let i = 0; i < requiredCount; i++) {
    const name = displayNameForPartyIndex(args, i) || (args.draftPartyNames[i] ?? "").trim();
    const email = emailForPartyIndex(args, i);

    if (!partyHasIdentity(args, i)) {
      if (isPlaceholderPartyName(name)) {
        blockers.push({ partyIndex: i, field: "representative_name", reason: "placeholder_name" });
      } else {
        blockers.push({ partyIndex: i, field: "representative_name", reason: "missing" });
      }
    }

    if (!partyRequiresEmail(args, i)) continue;

    if (!email) {
      blockers.push({ partyIndex: i, field: "email", reason: "missing" });
    } else if (isNameTypedInEmailField(email)) {
      blockers.push({ partyIndex: i, field: "email", reason: "name_in_email_field" });
    } else if (!looksLikeEmail(email)) {
      blockers.push({ partyIndex: i, field: "email", reason: "invalid_email" });
    }
  }

  return blockers;
}

export function formatGuidedSignerSetupBlockerMessage(blockers: readonly SignerSetupFieldBlocker[]): string {
  if (!blockers.length) return "";
  const first = blockers[0]!;
  const partyLabel = `Party ${first.partyIndex + 1}`;
  if (first.field === "email" && first.reason === "name_in_email_field") {
    return `${partyLabel}: enter a valid email address (not a person's name) in the email field.`;
  }
  if (first.field === "email" && first.reason === "invalid_email") {
    return `${partyLabel}: enter a valid email address (example: name@company.com).`;
  }
  if (first.field === "email" && first.reason === "missing") {
    return `${partyLabel}: add a signer or reviewer email to continue.`;
  }
  if (first.field === "representative_name") {
    return `${partyLabel}: add the representative or company name before continuing.`;
  }
  return "Complete all signer details before continuing to final review.";
}

export type GuidedPreReviewSignerSlotsResolution = {
  complete: boolean;
  requiredCount: number;
  filledCount: number;
  incompleteIndices: number[];
  blockers: SignerSetupFieldBlocker[];
  blockerMessage: string;
};

export function resolveGuidedPreReviewSignerSlots(
  args: ResolveGuidedPreReviewSignerSlotsArgs,
): GuidedPreReviewSignerSlotsResolution {
  const requiredCount = Math.max(args.partyCount, 2);
  const blockers = describeGuidedSignerSetupBlockers(args);
  const visibleBlockers = blockers.filter((blocker) => {
    if (blocker.field !== "email" || blocker.reason !== "invalid_email") return true;
    return shouldShowRecipientEmailFormatError(emailForPartyIndex(args, blocker.partyIndex));
  });
  const incompleteIndices = [...new Set(blockers.map((b) => b.partyIndex))];
  const filledCount = requiredCount - incompleteIndices.length;

  return {
    complete: incompleteIndices.length === 0,
    requiredCount,
    filledCount,
    incompleteIndices,
    blockers,
    blockerMessage: formatGuidedSignerSetupBlockerMessage(visibleBlockers),
  };
}
