/**
 * Ordered paid-Pro render polish: contact substitution → masked agreement polish → email restoration.
 */

import {
  extractIntakeEmailsOrdered,
  substitutePaidProIntakeContactPlaceholders,
  type PaidProContactSubstitutionResult,
} from "./paidProIntakeContactSubstitution";
import { polishPaidProAgreementText } from "./paidProAgreementPolish";
import {
  maskProtectedSpans,
  restoreExactIntakeEmails,
  textContainsCorruptedEntityEmail,
  unmaskProtectedSpans,
} from "./paidProEmailMask";

export type EmailMutationGuardResult = {
  originalEmailCount: number;
  finalExactEmailCount: number;
  mutatedEmailCount: number;
  mutatedSamples: string[];
  repairedCount: number;
};

function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.length <= 2 ? "*" : `${local.slice(0, 2)}***`;
  return `${head}@${domain}`;
}

export function verifyIntakeEmailsPreserved(
  intakeRaw: string | null | undefined,
  text: string,
  intakeEmails?: readonly string[],
): EmailMutationGuardResult {
  const originals = intakeEmails ?? extractIntakeEmailsOrdered(intakeRaw);
  const mutatedSamples: string[] = [];
  let finalExactEmailCount = 0;

  for (const email of originals) {
    if (text.includes(email)) finalExactEmailCount += 1;
    else mutatedSamples.push(redactEmail(email));
  }

  if (textContainsCorruptedEntityEmail(text)) {
    mutatedSamples.push("@<legal-entity-in-email-domain>");
  }

  const corrupted = textContainsCorruptedEntityEmail(text);
  const missingCount = originals.length - finalExactEmailCount;
  const mutatedEmailCount = missingCount > 0 ? missingCount : corrupted ? 1 : 0;

  return {
    originalEmailCount: originals.length,
    finalExactEmailCount,
    mutatedEmailCount,
    mutatedSamples: mutatedSamples.slice(0, 8),
    repairedCount: 0,
  };
}

export function logPaidProEmailMutationGuard(
  payload: EmailMutationGuardResult & { surface: string },
): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-email-mutation-guard]", payload);
}

export type PaidProRenderPolishResult = {
  text: string;
  contactSub: PaidProContactSubstitutionResult;
  agreementPolish: ReturnType<typeof polishPaidProAgreementText>["log"];
  emailGuard: EmailMutationGuardResult;
};

/**
 * 1) substitute numbered contact emails
 * 2) mask emails/URLs and run universal agreement polish
 * 3) unmask and authoritatively restore intake emails until guard passes
 */
export function applyPaidProRenderPolish(
  text: string,
  intakeRaw: string | null | undefined,
  partyNames: readonly string[] | null | undefined,
  opts?: { surface?: string },
): PaidProRenderPolishResult {
  const surface = opts?.surface ?? "unknown";
  const explicitPartyList = (partyNames?.length ?? 0) >= 2;
  const intakeEmails = extractIntakeEmailsOrdered(intakeRaw);

  const contactSub = substitutePaidProIntakeContactPlaceholders(text, intakeRaw, { surface });
  let working = contactSub.text;

  const { text: masked, emails, urls } = maskProtectedSpans(working);
  const agreementPolish = polishPaidProAgreementText(masked, intakeRaw, partyNames, {
    surface,
    explicitPartyList,
    skipInternalMask: true,
  });
  working = unmaskProtectedSpans(agreementPolish.text, emails, urls);

  let repairedCount = 0;
  let guard = verifyIntakeEmailsPreserved(intakeRaw, working, intakeEmails);
  if (guard.mutatedEmailCount > 0 && intakeEmails.length > 0) {
    const restored = restoreExactIntakeEmails(working, intakeEmails);
    working = restored.text;
    repairedCount += restored.repairedCount;
    guard = verifyIntakeEmailsPreserved(intakeRaw, working, intakeEmails);
    if (guard.mutatedEmailCount > 0) {
      const restored2 = restoreExactIntakeEmails(working, intakeEmails);
      working = restored2.text;
      repairedCount += restored2.repairedCount;
      guard = verifyIntakeEmailsPreserved(intakeRaw, working, intakeEmails);
    }
  }

  logPaidProEmailMutationGuard({ surface, ...guard, repairedCount });

  return { text: working, contactSub, agreementPolish: agreementPolish.log, emailGuard: { ...guard, repairedCount } };
}
