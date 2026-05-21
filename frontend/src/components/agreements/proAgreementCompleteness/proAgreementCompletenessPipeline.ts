/**
 * Universal Pro structural validation + normalization + material question engine.
 * Runs before any paid Pro agreement body is user-visible.
 */

import { validateAndRepairFinalRenderIntegrity } from "../agreementOutputQuality/finalRenderIntegrityValidator";
import type { AgreementOutputQualityContext } from "../agreementOutputQuality/types";
import {
  buildMaterialMissingItems,
  materialItemsToClarificationStrings,
} from "./revisionQuestionEngine";
import {
  isCatastrophicStructuralFailure,
  normalizeProStructuralBody,
} from "./proStructuralDetection";
import type { ProAgreementCompletenessResult, ProCompletenessContext } from "./types";

export function applyProAgreementCompletenessPipeline(
  text: string,
  ctx: ProCompletenessContext & { serverMissingMaterial?: readonly string[] },
): ProAgreementCompletenessResult {
  const normalized = normalizeProStructuralBody(text, ctx);
  let working = normalized.text;
  const repairs = [...normalized.repairs];
  const issues = [...normalized.issues];

  const integrityCtx: AgreementOutputQualityContext = {
    intakeRaw: ctx.intakeRaw,
    partyNames: ctx.partyNames,
    agreementFamily: ctx.agreementFamily ?? null,
    surface: ctx.surface,
    tier: "premium",
  };
  const integrity = validateAndRepairFinalRenderIntegrity(working, integrityCtx);
  working = integrity.text;
  repairs.push(...integrity.repairs);
  for (const i of integrity.issues) {
    issues.push({
      code: i.code,
      message: i.message,
      repaired: i.repaired,
      catastrophic: i.code === "empty" || i.code === "placeholder_fatal",
    });
  }

  const structuralCatastrophic = isCatastrophicStructuralFailure({
    text: working,
    issues,
    partyNames: ctx.partyNames,
  });

  const materialMissingItems = buildMaterialMissingItems({
    intakeRaw: ctx.intakeRaw,
    body: working,
    structuralIssues: issues,
    serverMissing: ctx.serverMissingMaterial,
  });

  const structuralOk =
    !structuralCatastrophic &&
    issues.filter((i) => i.catastrophic && !i.repaired).length === 0;

  return {
    text: working,
    structuralOk,
    structuralCatastrophic,
    issues,
    repairs,
    materialMissingItems,
  };
}

export function completenessClarificationsForClassification(
  result: ProAgreementCompletenessResult,
): string[] {
  return materialItemsToClarificationStrings(result.materialMissingItems);
}
