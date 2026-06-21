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
import {
  ensurePaidProAcceptanceExecutionBlockInvariant,
  isGenericPaidProAcceptanceManifestFallback,
  manifestRecordsForPaidProAcceptance,
} from "./paidProAcceptanceExecutionBlockInvariant";
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
import { tracePaidProQaPassWithText } from "./paidProQaPerfTrace";
import {
  buildAcceptedProCorpusSafeDisplayCacheKey,
  logPaidProSafeDisplayCacheHit,
  readAcceptedProCorpusSafeDisplayCache,
  writeAcceptedProCorpusSafeDisplayCache,
} from "./paidProAcceptedCorpusSafeDisplayCache";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";

export type AcceptedProCorpusSafeDisplayOpts = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  /** When true, append execution/signature block only if missing (VS01 signing). */
  appendExecutionBlockIfMissing?: boolean;
  /** QA perf trace label only — does not affect output. */
  surface?: string;
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
  draft: ParsedDraftShape | null | undefined,
): ReturnType<typeof resolveCanonicalPartyIdentitiesFromSources> {
  if (!paidProSafeDisplayHasAuthoritativeParties(intakeRaw, partyNames)) return [];
  const roleLabels = (draft?.parties ?? [])
    .map((p) => String(p?.role ?? "").trim())
    .filter((r) => r.length >= 2);
  return resolveCanonicalPartyIdentitiesFromSources({
    rawIntake: intakeRaw,
    starterNames: partyNames,
    generatedBody: null,
    roleLabels: roleLabels.length >= 2 ? roleLabels : undefined,
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
  const surface = opts?.surface ?? "accepted_pro_corpus_safe_display";
  const input = String(raw || "").replace(/\s+$/g, "");
  const cacheKey = buildAcceptedProCorpusSafeDisplayCacheKey(input, { ...opts, surface });
  const cached = readAcceptedProCorpusSafeDisplayCache(cacheKey);
  if (cached) {
    const inputHash =
      input.length >= 80 ? hashPaidProCorpus(input) : input.length > 0 ? `len:${input.length}` : "empty";
    const outputHash =
      cached.text.length >= 80
        ? hashPaidProCorpus(cached.text)
        : cached.text.length > 0
          ? `len:${cached.text.length}`
          : "empty";
    logPaidProSafeDisplayCacheHit({ surface, cacheKey, inputHash, outputHash });
    return tracePaidProQaPassWithText("applyAcceptedProCorpusSafeDisplay", `${surface}:cache_hit`, input, () => cached);
  }
  const result = tracePaidProQaPassWithText("applyAcceptedProCorpusSafeDisplay", surface, input, () =>
    applyAcceptedProCorpusSafeDisplayCore(raw, opts),
  );
  writeAcceptedProCorpusSafeDisplayCache(cacheKey, result);
  return result;
}

function applyAcceptedProCorpusSafeDisplayCore(
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
  const records = resolvePaidProSafeDisplayPartyRecords(intakeRaw, partyNames, opts?.draft);

  if (hasAuthoritativeParties && records.length >= 2) {
    const partyRepair = repairFullAgreementPartyIdentity({
      text: out,
      intakeRaw,
      partyNames: records.map((r) => r.fullLegalName),
      roleLabels: records.map((r) => r.roleLabel),
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

  const executionRecords =
    records.length >= 2
      ? records
      : manifestRecordsForPaidProAcceptance({
          draft: opts?.draft ?? null,
          intakeText: intakeRaw,
        });
  if (
    executionRecords.length >= 2 &&
    !isGenericPaidProAcceptanceManifestFallback(executionRecords)
  ) {
    const execInvariant = ensurePaidProAcceptanceExecutionBlockInvariant(out, executionRecords);
    if (execInvariant.text !== out) {
      out = execInvariant.text;
      repairs.push(...execInvariant.repairs);
    }
  } else if (opts?.appendExecutionBlockIfMissing) {
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

  const prepared = preparePaidProServerDocumentForAcceptance(out, opts?.draft ?? null, intakeRaw ?? "", {
    surface: opts?.surface ? `${opts.surface}:prepare` : "accepted_pro_corpus_safe_display:prepare",
  });
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

  const mayNormalizeExecutionBlock =
    /\bIN WITNESS WHEREOF\b/i.test(out) ||
    (executionRecords.length >= 2 &&
      !isGenericPaidProAcceptanceManifestFallback(executionRecords));
  if (mayNormalizeExecutionBlock) {
    const execution = enforcePaidProSingleExecutionBlock(out);
    if (execution.text !== out) {
      out = execution.text;
      repairs.push(...execution.repairs);
    }
  }

  const contactAuthority = applyPaidProNoticeContactAuthority(out, {
    draft: opts?.draft ?? null,
    intakeText: intakeRaw,
    surface: opts?.surface ? `${opts.surface}:notice_contact_authority` : "accepted_pro_corpus_safe_display:notice_contact_authority",
    blockOnUnresolved: false,
  });
  if (contactAuthority.text !== out) {
    out = contactAuthority.text;
    repairs.push(...contactAuthority.repairs.map((r) => `contact_authority:${r}`));
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
