/**
 * Unified agreement output quality pipeline — final gate for starter and premium bodies.
 */

import { formatStarterPreviewForDisplay } from "../starterPreviewFormatting";
import { stripAdvisoryLanguageFromAgreementBody } from "./premiumCompletionClassification";
import { suppressRepeatedBoilerplate } from "./boilerplateContaminationGuard";
import { validateAndRepairFinalRenderIntegrity } from "./finalRenderIntegrityValidator";
import { applySectionIsolatedPolishPipeline } from "./sectionIsolatedPolish";
import type { AgreementOutputQualityContext, IntegrityResult } from "./types";

export type AgreementOutputQualityResult = IntegrityResult & {
  clarificationsStripped: boolean;
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

  const integrity = validateAndRepairFinalRenderIntegrity(working, ctx);
  return {
    ...integrity,
    clarificationsStripped,
    repairs: [...structureRepairs, ...integrity.repairs],
  };
}
