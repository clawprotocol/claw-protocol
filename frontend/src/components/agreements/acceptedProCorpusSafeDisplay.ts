/**
 * Emergency-only formatting for accepted paid Pro `server_full_draft` corpus.
 * No renumbering, dedupe, canonical reconstruction, or enterprise polish.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  intakeHasFullLegalEntityParties,
  resolveCanonicalPartyIdentitiesFromSources,
} from "./canonicalPartyIdentityResolver";
import { appendProExecutionBlockIfMissing } from "./proExecutionBlockAppend";
import { neutralizeHarmlessEntityMetadataPlaceholders } from "./harmlessEntityMetadataPlaceholders";
import { repairFullAgreementPartyIdentity } from "./canonicalPartyIdentityResolver";
import { ensurePaidProServicesAgreementOpening } from "./paidProOpeningRecitalGuard";
import { stripTrailingLegacyEntitySignatureLines } from "./paidProReviewRenderCorpus";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { repairPaidProSignatureSectionOrdering } from "./paidProSignatureSectionOrdering";
import {
  buildCorpusRoleIdentitiesForExecutionReconcile,
  detectExecutionBlockRoleInversion,
} from "./paidProAcceptedCorpusPartyRoles";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { reconcileExecutionBlockToRoleIdentities } from "./paidProSignerMetadataMergeGate";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";

export type AcceptedProCorpusSafeDisplayOpts = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  /** When true, append execution/signature block only if missing (VS01 signing). */
  appendExecutionBlockIfMissing?: boolean;
};

export type AcceptedProCorpusSafeDisplayResult = {
  text: string;
  repairs: string[];
};

function wouldMateriallyShrinkAcceptedCorpus(before: number, after: number): boolean {
  return before >= 1_500 && after < before * 0.8;
}

export function basicAcceptedProCorpusNormalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\s+$/g, "");
}

/** Strip markdown heading/bold artifacts without restructuring clauses. */
export function stripAcceptedProMarkdownArtifacts(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = text;
  const before = out;
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  out = out.replace(/__([^_\n]+)__/g, "$1");
  if (out !== before) repairs.push("safe:strip_markdown_artifacts");
  return { text: out, repairs };
}

function reconcileAcceptedCorpusExecutionRolesIfInverted(text: string): { text: string; repaired: boolean } {
  if (!detectExecutionBlockRoleInversion(text)) return { text, repaired: false };
  const identities = buildCorpusRoleIdentitiesForExecutionReconcile(text);
  const reconciled = reconcileExecutionBlockToRoleIdentities(text, identities);
  if (reconciled.repairs <= 0 || reconciled.text === text) return { text, repaired: false };
  return { text: reconciled.text, repaired: true };
}

function paidProSafeDisplayHasAuthoritativeParties(
  intakeRaw: string | null | undefined,
  partyNames: readonly string[],
): boolean {
  if (partyNames.filter(isAuthoritativeLegalEntityName).length >= 2) return true;
  return intakeHasFullLegalEntityParties(intakeRaw, partyNames);
}

function resolvePaidProSafeDisplayPartyRecords(
  intakeRaw: string | null | undefined,
  partyNames: readonly string[],
  generatedBody: string,
): ReturnType<typeof resolveCanonicalPartyIdentitiesFromSources> {
  if (!paidProSafeDisplayHasAuthoritativeParties(intakeRaw, partyNames)) return [];
  return resolveCanonicalPartyIdentitiesFromSources({
    rawIntake: intakeRaw,
    starterNames: partyNames,
    generatedBody,
  });
}

function canonicalPartyNamesFromDraft(draft: ParsedDraftShape | null | undefined): string[] {
  return (draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((name) => name.length >= 2)
    .slice(0, 2);
}

/**
 * Deterministic safe display for accepted Pro corpus — must not materially change body length or structure.
 */
export function applyAcceptedProCorpusSafeDisplay(
  raw: string,
  opts?: AcceptedProCorpusSafeDisplayOpts,
): AcceptedProCorpusSafeDisplayResult {
  const input = String(raw || "").replace(/\s+$/g, "");
  if (!input.trim()) return { text: "", repairs: [] };
  const repairs: string[] = [];
  let out = basicAcceptedProCorpusNormalize(input);

  const md = stripAcceptedProMarkdownArtifacts(out);
  out = md.text;
  repairs.push(...md.repairs);

  const entityNeutral = neutralizeHarmlessEntityMetadataPlaceholders(out);
  out = entityNeutral.text;
  repairs.push(...entityNeutral.repairs);

  const partyNames = canonicalPartyNamesFromDraft(opts?.draft);
  const intakeRaw = opts?.intakeText ?? null;
  const hasAuthoritativeParties = paidProSafeDisplayHasAuthoritativeParties(intakeRaw, partyNames);
  const records = resolvePaidProSafeDisplayPartyRecords(intakeRaw, partyNames, out);

  if (hasAuthoritativeParties && records.length >= 2) {
    const partyRepair = repairFullAgreementPartyIdentity({
      text: out,
      intakeRaw,
      partyNames: records.map((r) => r.fullLegalName),
    });
    if (partyRepair.text !== out) {
      out = partyRepair.text;
      repairs.push(...partyRepair.repairs);
    }
    const roleRepair = reconcileAcceptedCorpusExecutionRolesIfInverted(out);
    if (roleRepair.repaired) {
      out = roleRepair.text;
      repairs.push("safe:reconcile_execution_block_roles");
    }
  }

  if (opts?.appendExecutionBlockIfMissing && records.length >= 2) {
    const exec = appendProExecutionBlockIfMissing(out, records);
    if (exec.text !== out) {
      out = exec.text;
      repairs.push("safe:append_execution_block");
    }
  }

  if (wouldMateriallyShrinkAcceptedCorpus(input.length, out.length)) {
    return {
      text: input,
      repairs: [...repairs, "safe:shrink_blocked"],
    };
  }

  if (hasAuthoritativeParties && records.length >= 2) {
    const openingGuard = ensurePaidProServicesAgreementOpening(out, records, intakeRaw);
    if (openingGuard.text !== out) {
      out = openingGuard.text;
      repairs.push(...openingGuard.repairs);
    }
  }

  const legacySig = stripTrailingLegacyEntitySignatureLines(out);
  if (legacySig.removed > 0) {
    out = legacySig.text;
    repairs.push("safe:strip_legacy_entity_signature_lines");
  }

  const prepared = preparePaidProServerDocumentForAcceptance(out, opts?.draft ?? null, intakeRaw ?? "");
  if (prepared.text !== out) {
    out = prepared.text;
    repairs.push(...prepared.repairs);
  }

  const preSigRoleRepair = reconcileAcceptedCorpusExecutionRolesIfInverted(out);
  if (preSigRoleRepair.repaired) {
    out = preSigRoleRepair.text;
    repairs.push("safe:reconcile_execution_block_roles");
  }

  const sigOrder = repairPaidProSignatureSectionOrdering(out);
  if (sigOrder.text !== out) {
    out = sigOrder.text;
    repairs.push(...sigOrder.repairs);
  }

  const postSigRoleRepair = reconcileAcceptedCorpusExecutionRolesIfInverted(out);
  if (postSigRoleRepair.repaired) {
    out = postSigRoleRepair.text;
    repairs.push("safe:reconcile_execution_block_roles");
  }

  if (
    (hasAuthoritativeParties && records.length >= 2) ||
    /\bIN WITNESS WHEREOF\b/i.test(out)
  ) {
    const execution = enforcePaidProSingleExecutionBlock(out);
    if (execution.text !== out) {
      out = execution.text;
      repairs.push(...execution.repairs);
    }
  }

  return { text: out, repairs: [...new Set(repairs)] };
}

/** VS01 may differ from review display only by a safely appended execution block. */
export function applyAcceptedProCorpusForVs01Signing(
  raw: string,
  opts?: AcceptedProCorpusSafeDisplayOpts,
): AcceptedProCorpusSafeDisplayResult {
  return applyAcceptedProCorpusSafeDisplay(raw, { ...opts, appendExecutionBlockIfMissing: true });
}
