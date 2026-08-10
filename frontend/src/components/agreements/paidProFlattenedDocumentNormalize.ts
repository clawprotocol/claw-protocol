/**
 * Repair flattened Pro server bodies for review display and acceptance:
 * - isolate embedded section headings into their own blocks
 * - strip stale server "SIGNATURES The parties have caused…" tails before LawDog witness blocks
 */

import { stripPreWitnessExecutionPollutionFromPrefix, resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import { repairGluedSectionHeadingsInText } from "./documentSectionHeadingSplit";
import { normalizePaidProOrphanSubsections } from "./normalizePaidProOrphanSubsections";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import { applyPaidProSectionHeadingTitleAuthority } from "./paidProSectionHeadingTitleAuthority";
import { applyContactAuthorityExecutionBlockIntegrity } from "./contactAuthorityExecutionBlockIntegrity";
import { repairPaidProOrphanSectionNumbers } from "./paidProOrphanSectionNumberRepair";
import { normalizePaidProSectionRender } from "./paidProSectionRenderNormalize";
import { repairSplitPaidProHeadingFragments } from "./repairSplitPaidProHeadingFragments";
import { repairPaidProEmptyParentSectionHierarchy } from "./repairPaidProEmptyParentSectionHierarchy";
import { reconcileNamedSectionCrossReferences } from "./paidProReviewedDocumentIntegrity";
import { normalizePaidProCopyQuality } from "./paidProCopyQualityNormalize";
import { repairMalformedSectionAnyReference } from "./paidProFrozenManifestDisplayAuthority";
import {
  repairBareEntityOnlyNoticeStanzas,
  repairCollapsedInlineNoticeStanzas,
  repairFusedNoticesHeadingToPriorClause,
} from "./paidProPartyNoticeDetails";
import { repairPaidProDocumentTitleOpening } from "./paidProDocumentTitleOpeningRepair";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { getPaidProSourceOfTruthText, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { hasAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { projectPaidProFrozenSoTDisplayPlain } from "./paidProDisplayPlainAuthority";
import {
  buildCorpusRoleIdentitiesForExecutionReconcile,
  detectExecutionBlockRoleInversion,
} from "./paidProAcceptedCorpusPartyRoles";
import { reconcileExecutionBlockToRoleIdentities } from "./paidProSignerMetadataMergeGate";

function expandInlineSignatureMarkersToLines(prefix: string): string {
  return prefix
    .replace(/\s+(\bSIGNATURES\b\s+The\s+parties)/gi, "\n\n$1")
    .replace(/\s+(\bSIGNATURES\b\s*:)/gi, "\n\n$1")
    .replace(/([.!?])\s+\bSIGNATURES\b\s*$/gim, "$1")
    .replace(/\s+(\bCLIENT\s*:)/gi, "\n$1")
    .replace(/\s+(\bSERVICE\s+PROVIDER\s*:)/gi, "\n$1")
    .replace(/\s+(By\s*:)/gi, "\n$1")
    .replace(/\s+(Name\s*:)/gi, "\n$1")
    .replace(/\s+(Title\s*:)/gi, "\n$1")
    .replace(/\s+(Date\s*:)/gi, "\n$1");
}

/** Insert paragraph breaks before glued title / numbered section headings. */
export function normalizeFlattenedPaidProDocumentBlocks(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n").trim();
  if (!out) return { text: out, repairs };

  const titleOpening = repairPaidProDocumentTitleOpening(out);
  if (titleOpening.repairs.length > 0) {
    out = titleOpening.text;
    repairs.push(...titleOpening.repairs);
  }

  const before = out;

  out = repairGluedSectionHeadingsInText(out);

  const splitHeadingFragments = repairSplitPaidProHeadingFragments(out);
  if (splitHeadingFragments.repairs.length > 0) {
    out = splitHeadingFragments.text;
    repairs.push(...splitHeadingFragments.repairs);
  }

  out = out.replace(
    /^((?:CONSULTING AND IMPLEMENTATION|MUTUAL CONSULTING AND IMPLEMENTATION|SERVICES) AGREEMENT)\s+(This\b)/i,
    "$1\n\n$2",
  );

  out = out.replace(/^(MUTUAL SERVICES AGREEMENT)\s+(This\b)/i, "$1\n\n$2");

  out = out.replace(
    /([.!?)"])\s+(\d+\.\s+(?!\d+\.\d)(?:[A-Z][^\n]{2,160}?))(?=\s+\d+(?:\.\d+)?\s+)/g,
    "$1\n\n$2",
  );

  out = out.replace(/([a-z0-9])\s+(\d+\.\s+(?!\d+\.\d)[A-Z][A-Za-z])/g, "$1\n\n$2");

  // "1. Services and Scope 1.1 Services" → main heading + subsection on separate blocks.
  out = out.replace(
    /(\d+\.\s+(?!\d+\.\d)(?:[A-Za-z][^\n]{2,160}?))\s+(\d+\.\d+\s+)/g,
    "$1\n\n$2",
  );

  out = out.replace(/(\d+\.\d+\s+[^.\n]{4,220}?\.?)\s+(\d+\.\d+\s+)/g, "$1\n\n$2");

  out = out.replace(/(\d+\.\d+\s+[^.\n]{4,220}?\.?)\s+(\d+\.\s+(?!\d+\.\d))/g, "$1\n\n$2");

  if (out !== before) repairs.push("normalize:flattened_section_breaks");
  out = out.replace(/\n{3,}/g, "\n\n");
  return { text: out, repairs };
}

/**
 * Remove server-generated signature tails (SIGNATURES / CLIENT: / SERVICE PROVIDER: with By: lines)
 * that appear before the canonical LawDog IN WITNESS WHEREOF block.
 */
export function stripInlineStaleServerSignatureTailBeforeWitness(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  let working = (text || "").replace(/\r\n/g, "\n");
  const witnessIdx = resolveAuthoritativeWitnessIndex(working);
  if (witnessIdx < 0) return { text: working.trim(), repairs };

  const tail = working.slice(witnessIdx);
  let prefix = working.slice(0, witnessIdx);
  const minPos = Math.max(0, Math.floor(working.length * 0.25));

  const expanded = expandInlineSignatureMarkersToLines(prefix);
  if (expanded !== prefix) {
    repairs.push("normalize:expand_inline_signature_markers");
    prefix = expanded;
  }

  const stalePatterns = [
    /(?:^|\n)\s*SIGNATURES\b\s+The\s+parties\s+have\s+caused[\s\S]*$/i,
    /\bSIGNATURES\b\s+The\s+parties\s+have\s+caused[\s\S]*$/i,
    /(?:^|\n)\s*SIGNATURES\b[\s\S]*?\bSERVICE\s+PROVIDER\s*:[\s\S]*$/i,
  ];
  for (const re of stalePatterns) {
    const m = prefix.match(re);
    if (m && m.index != null && m.index >= minPos && /\bBy\s*:/i.test(m[0])) {
      prefix = prefix.slice(0, m.index).trimEnd();
      repairs.push("strip:inline_stale_server_signature_block");
      break;
    }
  }

  const lineStrip = stripPreWitnessExecutionPollutionFromPrefix(prefix);
  if (lineStrip.repairs.length > 0) {
    prefix = lineStrip.text;
    repairs.push(...lineStrip.repairs);
  }

  const merged = `${prefix}\n\n${tail}`.replace(/\n{3,}/g, "\n\n").trim();
  return { text: merged, repairs: [...new Set(repairs)] };
}

function shouldUseFrozenDisplayPrepOnly(opts?: { frozenDisplayOnly?: boolean }): boolean {
  if (opts?.frozenDisplayOnly != null) return opts.frozenDisplayOnly;
  if (!hasPaidProSourceOfTruth()) return false;
  if (getPaidProSourceOfTruthText().trim().length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  if (hasAuthoritativeSigningSnapshot()) return false;
  return true;
}

/** Post-freeze display prep — authorized presentation projection only; never hydrates notices or execution. */
export function preparePaidProFrozenDisplayPlain(
  text: string,
  _opts?: { intakeText?: string | null; draftPartyNames?: readonly string[] | null },
): {
  text: string;
  repairs: string[];
} {
  const projected = projectPaidProFrozenSoTDisplayPlain(text);
  const repairs =
    projected !== (text || "").replace(/\r\n/g, "\n").trimEnd()
      ? ["display:frozen_sot_projection"]
      : [];
  return { text: projected, repairs: [...new Set(repairs)] };
}

/** Display + acceptance prep: section breaks then stale signature tail removal. */
export function preparePaidProReviewDisplayPlain(
  text: string,
  opts?: { frozenDisplayOnly?: boolean },
): {
  text: string;
  repairs: string[];
} {
  if (opts?.frozenDisplayOnly ?? shouldUseFrozenDisplayPrepOnly(opts)) {
    return preparePaidProFrozenDisplayPlain(text);
  }
  const repairs: string[] = [];
  const norm = normalizeFlattenedPaidProDocumentBlocks(text);
  let out = norm.text;
  repairs.push(...norm.repairs);
  // Universal: defuse `…Agreement12. NOTICES` before structure analyze (display path, not freeze-only).
  const fusedNotices = repairFusedNoticesHeadingToPriorClause(out);
  if (fusedNotices.repairs.length > 0) {
    out = fusedNotices.text;
    repairs.push(...fusedNotices.repairs);
  }
  const stripped = stripInlineStaleServerSignatureTailBeforeWitness(out);
  out = stripped.text;
  repairs.push(...stripped.repairs);
  const orphans = normalizePaidProOrphanSubsections(out, { source: "preparePaidProReviewDisplayPlain" });
  if (orphans.orphanSectionsRepaired > 0) {
    out = orphans.text;
    repairs.push(...orphans.repairs);
  }
  const orphanSectionNumbers = repairPaidProOrphanSectionNumbers(out);
  if (orphanSectionNumbers.repairs.length > 0) {
    out = orphanSectionNumbers.text;
    repairs.push(...orphanSectionNumbers.repairs);
  }
  const sectionRender = normalizePaidProSectionRender(out);
  if (sectionRender.fixedHeadingBodyCollapse > 0) {
    out = sectionRender.text;
    repairs.push("normalize:pro_section_heading_body");
  }
  const structure = applySectionStructureIntegrity(out, { source: "preparePaidProReviewDisplayPlain" });
  if (structure.repaired) {
    out = structure.text;
    repairs.push(...structure.repairs.map((tag) => `section_structure:${tag}`));
  }
  const contactAuthority = applyContactAuthorityExecutionBlockIntegrity(out, {
    source: "preparePaidProReviewDisplayPlain",
    ensureNoticesClause: false,
  });
  if (contactAuthority.repaired) {
    out = contactAuthority.text;
    repairs.push(...contactAuthority.repairs.map((tag) => `contact_authority:${tag}`));
  }
  const sectionAny = repairMalformedSectionAnyReference(out);
  if (sectionAny.repaired) {
    out = sectionAny.text;
    repairs.push("normalize:section_any_reference");
  }
  const splitTail = repairSplitPaidProHeadingFragments(out);
  if (splitTail.repairs.length > 0) {
    out = splitTail.text;
    repairs.push(...splitTail.repairs);
  }
  const emptyParents = repairPaidProEmptyParentSectionHierarchy(out);
  if (emptyParents.repairs.length > 0) {
    out = emptyParents.text;
    repairs.push(...emptyParents.repairs);
    const splitAfterDemote = repairSplitPaidProHeadingFragments(out);
    if (splitAfterDemote.repairs.length > 0) {
      out = splitAfterDemote.text;
      repairs.push(...splitAfterDemote.repairs);
    }
  }
  const namedXref = reconcileNamedSectionCrossReferences(out);
  if (namedXref.repairs.length > 0) {
    out = namedXref.text;
    repairs.push(...namedXref.repairs);
  }
  if (detectExecutionBlockRoleInversion(out)) {
    const identities = buildCorpusRoleIdentitiesForExecutionReconcile(out);
    const reconciled = reconcileExecutionBlockToRoleIdentities(out, identities);
    if (reconciled.repairs > 0) {
      out = reconciled.text;
      repairs.push("display:reconcile_execution_block_roles");
    }
  }
  const headingTitle = applyPaidProSectionHeadingTitleAuthority(out);
  if (headingTitle.repairs.length > 0) {
    out = headingTitle.text;
    repairs.push(...headingTitle.repairs.map((r) => `heading_title:${r}`));
  }
  const bareNotices = repairBareEntityOnlyNoticeStanzas(out);
  if (bareNotices.repairs.length > 0) {
    out = bareNotices.text;
    repairs.push(...bareNotices.repairs);
  }
  const collapsedNotices = repairCollapsedInlineNoticeStanzas(out);
  if (collapsedNotices.repairs.length > 0) {
    out = collapsedNotices.text;
    repairs.push(...collapsedNotices.repairs);
  }
  const copyQuality = normalizePaidProCopyQuality(out);
  if (copyQuality.repairs.length > 0) {
    out = copyQuality.text;
    repairs.push(...copyQuality.repairs.map((r) => `copy_quality:${r}`));
  }
  return { text: out, repairs: [...new Set(repairs)] };
}
