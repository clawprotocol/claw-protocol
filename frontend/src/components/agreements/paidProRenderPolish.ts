/**
 * Ordered paid-Pro render polish: party names (email-safe) → contact email substitution → mutation guard.
 */

import {
  extractIntakeEmailsOrdered,
  substitutePaidProIntakeContactPlaceholders,
  type PaidProContactSubstitutionResult,
} from "./paidProIntakeContactSubstitution";
import { polishPaidProAgreementText } from "./paidProAgreementPolish";
import { textContainsCorruptedEntityEmail } from "./paidProEmailMask";

export type EmailMutationGuardResult = {
  originalEmailCount: number;
  finalExactEmailCount: number;
  mutatedEmailCount: number;
  mutatedSamples: string[];
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
): EmailMutationGuardResult {
  const originals = extractIntakeEmailsOrdered(intakeRaw);
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
  };
}

/** Re-apply exact intake emails when party expansion leaked into substituted addresses. */
export function repairCorruptedIntakeEmails(text: string, intakeRaw: string | null | undefined): string {
  const emails = extractIntakeEmailsOrdered(intakeRaw);
  let out = text;
  for (const email of emails) {
    if (out.includes(email)) continue;
    const local = email.split("@")[0];
    if (!local) continue;
    const corruptRe = new RegExp(`${local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}@[^\\s,;<>\\]]+`, "gi");
    out = out.replace(corruptRe, email);
  }
  return out;
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
 * a) substitute [EMAIL_N] placeholders with exact intake emails
 * b) universal agreement polish (recital, signatures, enterprise clauses)
 * c) verify no intake email was mutated; repair when possible
 */
export function applyPaidProRenderPolish(
  text: string,
  intakeRaw: string | null | undefined,
  partyNames: readonly string[] | null | undefined,
  opts?: { surface?: string },
): PaidProRenderPolishResult {
  const surface = opts?.surface ?? "unknown";
  const explicitPartyList = (partyNames?.length ?? 0) >= 2;

  const contactSub = substitutePaidProIntakeContactPlaceholders(text, intakeRaw, { surface });
  let working = contactSub.text;

  const agreementPolish = polishPaidProAgreementText(working, intakeRaw, partyNames, {
    surface,
    explicitPartyList,
  });
  working = agreementPolish.text;

  let emailGuard = verifyIntakeEmailsPreserved(intakeRaw, working);
  if (emailGuard.mutatedEmailCount > 0) {
    working = repairCorruptedIntakeEmails(working, intakeRaw);
    emailGuard = verifyIntakeEmailsPreserved(intakeRaw, working);
  }

  logPaidProEmailMutationGuard({ surface, ...emailGuard });

  return { text: working, contactSub, agreementPolish: agreementPolish.log, emailGuard };
}
