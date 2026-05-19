/**
 * Deterministic local Pro QA pipeline (no live premium-full-draft API).
 */

import { finalizeUserVisibleAgreementPlainText } from "../agreementTemplatePlaceholderSafety";
import type { ParsedDraftShape } from "../intakeSmartDefaults";
import type { PaidProRenderPolishResult } from "../paidProRenderPolish";
import { buildPremiumFullDraftContextForProRequest } from "../premiumFullDraftApi";
import {
  buildProOperationalSynthesis,
  enrichPremiumContextWithOperationalSynthesis,
  type ProOperationalSynthesisResult,
} from "./index";
import type { ProOperationalQaFixture } from "./proOperationalSynthesisFixtures";

export type ProQaPipelineResult = {
  text: string;
  synthesis: ProOperationalSynthesisResult;
  context: ReturnType<typeof buildPremiumFullDraftContextForProRequest>;
  draft: ParsedDraftShape;
  placeholderOk: boolean;
  placeholderRemainingFatal: string[];
  polishLog: PaidProRenderPolishResult | null;
};

export function fixtureToParsedDraft(f: ProOperationalQaFixture): ParsedDraftShape {
  return {
    title: f.title,
    jurisdiction: f.jurisdiction,
    parties: f.parties.map((name, i) => ({
      name,
      role: f.roles?.[i] ?? "party",
    })),
    purpose: f.purpose,
    payment_terms: f.paymentTerms,
    payment: f.payment ?? { amount: null, cadence: null, valid: false },
    duration: f.duration ?? null,
    due_date: f.dueDate ?? null,
    effective_date: f.effectiveDate ?? null,
    additional_terms: f.additionalTerms ?? null,
    agreement_family: f.agreementFamily ?? undefined,
  };
}

/** Synthetic model output with intentional defects the polish pipeline should repair. */
export function buildSyntheticModelDraft(f: ProOperationalQaFixture): string {
  const recital = f.shortNames.join(", ");
  const contactBlocks = f.parties.map((p, i) => `${p}\nEmail: [EMAIL_${i + 1}]`);
  const sigShort = f.shortNames.map((s) => `${s}\nBy: ___________________`).join("\n\n");

  const lines: string[] = [
    f.title.toUpperCase(),
    "",
    `This Agreement is entered into by and among ${recital}.`,
    "",
    "1. PARTIES",
    ...f.parties.map((p) => `- ${p}`),
    "",
    "2. SCOPE AND SERVICES",
    f.purpose,
    "The Parties shall coordinate as needed on deliverables and dependencies.",
    "",
    "3. COMPENSATION",
    f.paymentTerms,
    "",
    "4. TERM AND RENEWAL",
    f.duration ?? "Initial term as stated in the intake; renewal by mutual written agreement.",
    "",
    "5. GOVERNING LAW",
    `This Agreement is governed by the laws of ${f.jurisdiction}.`,
    "",
    "6. CONFIDENTIALITY",
    "Each party shall protect Confidential Information using commercially reasonable efforts.",
    "",
    "7. INTELLECTUAL PROPERTY",
    "Ownership, license grants, and work product rights are as described in the intake.",
    "",
    "8. DATA SECURITY",
    "Reasonable administrative, technical, and organizational safeguards apply to protected data.",
    "",
    "9. TERMINATION",
    "Provisions that by their nature should survive termination remain in effect.",
    "",
    "10. DISPUTES",
    "The parties will negotiate in good faith before formal proceedings.",
    "",
    "11. SERVICE LEVELS",
    "Provider will use commercially reasonable efforts to maintain platform availability.",
    "",
    "NOTICES",
    "Operational contacts are listed below.",
    "Any dispute shall be resolved by binding arbitration in the governing jurisdiction.",
    "",
    "KEY CONTACTS",
    ...contactBlocks,
    "",
    "IN WITNESS WHEREOF",
    sigShort,
  ];

  if (f.injectJunkRecitalParties?.length) {
    lines[2] = `This Agreement is entered into by and among ${[...f.injectJunkRecitalParties, recital].join(", ")}.`;
  }

  return lines.join("\n");
}

export function runProOperationalQaPipeline(f: ProOperationalQaFixture): ProQaPipelineResult {
  const draft = fixtureToParsedDraft(f);
  const synthesis = buildProOperationalSynthesis(f.intake, draft, {
    agreementFamily: f.agreementFamily ?? null,
  });
  const baseCtx = buildPremiumFullDraftContextForProRequest(f.intake, draft);
  const context = enrichPremiumContextWithOperationalSynthesis(baseCtx, f.intake, draft);
  const rawBody = buildSyntheticModelDraft(f);
  const finalized = finalizeUserVisibleAgreementPlainText(rawBody, {
    intakeRaw: f.intake,
    partyNames: [...f.parties],
    surface: `pro-qa-${f.id}`,
  });
  return {
    text: finalized.text,
    synthesis,
    context,
    draft,
    placeholderOk: finalized.ok,
    placeholderRemainingFatal: finalized.remainingFatal,
    polishLog: null,
  };
}
