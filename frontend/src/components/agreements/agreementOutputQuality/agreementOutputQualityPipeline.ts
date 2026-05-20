/**
 * Unified agreement output quality pipeline — final gate for starter and premium bodies.
 */

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

  const isolated = applySectionIsolatedPolishPipeline(working, ctx);
  working = isolated.text;

  const boiler = suppressRepeatedBoilerplate(working);
  working = boiler.text;

  const integrity = validateAndRepairFinalRenderIntegrity(working, ctx);
  return {
    ...integrity,
    clarificationsStripped,
    repairs: [...isolated.repairs, ...integrity.repairs],
  };
}
