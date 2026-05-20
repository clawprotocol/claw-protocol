/**
 * Section-isolated polish — each repair pass mutates only assigned section bodies.
 */

import { validateAndRepairPremiumAgreementStructure } from "../premiumAgreementStructure";
import { applySectionPurityPass } from "../proOperationalSynthesis/sectionPurityValidator";
import {
  mutateSectionsByKind,
  parseAgreementDocument,
  serializeAgreementDocument,
} from "./agreementDocumentModel";
import type { AgreementOutputQualityContext } from "./types";

/** Purity pass only on strict commercial sections (never global append). */
export function applySectionIsolatedPurityPass(text: string): string {
  const doc = parseAgreementDocument(text);
  const strictKinds = new Set(["contacts", "confidentiality", "ip", "governance", "scope"]);
  let serialized = serializeAgreementDocument(doc);
  const { text: purified, issues } = applySectionPurityPass(serialized);
  if (issues.length === 0) return purified;

  let next = parseAgreementDocument(purified);
  for (const issue of issues) {
    const kind = issue.sectionKind;
    if (!strictKinds.has(kind)) continue;
    next = mutateSectionsByKind(next, new Set([kind]), (body) => {
      const snippet = (issue.outlierSentence || "").trim();
      if (!snippet || !body.includes(snippet)) return body;
      return body.replace(snippet, "").replace(/\n{3,}/g, "\n\n").trim();
    });
  }
  return serializeAgreementDocument(next);
}

/** Structure repair runs globally but via validateAndRepair — re-parse per section for empty subs only on payment/term sections. */
export function applySectionIsolatedStructureRepair(text: string, ctx: AgreementOutputQualityContext): string {
  const structure = validateAndRepairPremiumAgreementStructure(text);
  let out = structure.text;
  if (ctx.tier === "starter") return out;
  return applySectionIsolatedPurityPass(out);
}

export function applySectionIsolatedPolishPipeline(
  text: string,
  ctx: AgreementOutputQualityContext,
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let working = (text || "").trim();
  const structure = applySectionIsolatedStructureRepair(working, ctx);
  if (structure !== working) {
    repairs.push("structure_repair");
    working = structure;
  }
  return { text: working, repairs };
}
