/**
 * Unified agreement output quality pipeline — final gate for starter and premium bodies.
 */

import { formatStarterPreviewForDisplay } from "../starterPreviewFormatting";
import { stripAdvisoryLanguageFromAgreementBody } from "./premiumCompletionClassification";
import { suppressRepeatedBoilerplate } from "./boilerplateContaminationGuard";
import { validateAndRepairFinalRenderIntegrity } from "./finalRenderIntegrityValidator";
import { detectAgreementFamily } from "../agreementFamilyRouter";
import { applyPremiumExecutionNormalization } from "../premiumExecutionNormalization";
import { buildMaterialMissingItems } from "../proAgreementCompleteness/revisionQuestionEngine";
import { isCatastrophicStructuralFailure } from "../proAgreementCompleteness/proStructuralDetection";
import { validateAgreementIntegrity } from "../guidedDealCompletion/agreementIntegrityValidator";
import { applyVisibleBodyQualityGate } from "../visibleBodyQualityGate";
import { applyDocumentQualityFloor } from "../documentQualityFloor";
import { applySectionIsolatedPolishPipeline } from "./sectionIsolatedPolish";
import type { AgreementOutputQualityContext, IntegrityResult, MaterialMissingItem } from "./types";

export type AgreementOutputQualityResult = IntegrityResult & {
  clarificationsStripped: boolean;
  materialMissingItems?: MaterialMissingItem[];
  structuralCatastrophic?: boolean;
  structuralOk?: boolean;
};

/**
 * Run section-isolated polish, boilerplate guard, advisory strip (premium), and integrity validation.
 */
export function finalizeAgreementOutput(
  text: string,
  ctx: AgreementOutputQualityContext,
): AgreementOutputQualityResult {
  let working = (text || "").trim();
  let clarificationsStripped = false;

  if (ctx.tier === "premium") {
    const stripped = stripAdvisoryLanguageFromAgreementBody(working);
    if (stripped !== working) {
      working = stripped;
      clarificationsStripped = true;
    }
  }

  const structureRepairs: string[] = [];
  if (ctx.tier === "premium") {
    const isolated = applySectionIsolatedPolishPipeline(working, ctx);
    working = isolated.text;
    structureRepairs.push(...isolated.repairs);
    const boiler = suppressRepeatedBoilerplate(working);
    working = boiler.text;
  } else {
    const boiler = suppressRepeatedBoilerplate(working, { sectionPass: false });
    working = boiler.text;
    working = formatStarterPreviewForDisplay(working);
  }

  const executionNorm = applyPremiumExecutionNormalization(working, {
    tier: ctx.tier === "premium" ? "premium" : "starter",
  });
  if (executionNorm.repairs.length > 0) {
    working = executionNorm.text;
    structureRepairs.push(...executionNorm.repairs);
  }

  const qualityCtx = {
    intakeRaw: ctx.intakeRaw,
    partyNames: ctx.partyNames,
    agreementFamily:
      (ctx.agreementFamily as import("../agreementFamilyRouter").AgreementFamily | null) ??
      detectAgreementFamily(ctx.intakeRaw || ""),
    surface: ctx.surface,
  };

  if (ctx.tier === "starter") {
    const visibleGate = applyVisibleBodyQualityGate(working, qualityCtx);
    working = visibleGate.text;
    structureRepairs.push(...visibleGate.repairs);
    const qualityFloor = applyDocumentQualityFloor(working);
    working = qualityFloor.text;
    structureRepairs.push(...qualityFloor.repairs);
    const integrity = validateAndRepairFinalRenderIntegrity(working, ctx);
    return {
      ...integrity,
      clarificationsStripped,
      repairs: [...structureRepairs, ...integrity.repairs],
    };
  }

  const integrityPass = validateAgreementIntegrity(working, { ...ctx, ...qualityCtx });
  working = integrityPass.text;
  structureRepairs.push(...integrityPass.repairs);
  const qualityFloor = applyDocumentQualityFloor(working);
  working = qualityFloor.text;
  structureRepairs.push(...qualityFloor.repairs);
  const materialMissingItems = buildMaterialMissingItems({
    intakeRaw: ctx.intakeRaw,
    body: working,
  });
  const structuralCatastrophic =
    integrityPass.catastrophic ||
    isCatastrophicStructuralFailure({
      text: working,
      issues: [],
      partyNames: ctx.partyNames,
    });
  return {
    ok: integrityPass.ok,
    text: working,
    issues: integrityPass.issues.map((i) => ({
      code: i.code,
      message: i.message,
      repaired: i.repaired,
    })),
    repairs: [...structureRepairs, ...integrityPass.repairs],
    clarificationsStripped,
    materialMissingItems,
    structuralCatastrophic,
    structuralOk: integrityPass.ok && !structuralCatastrophic,
  };
}
