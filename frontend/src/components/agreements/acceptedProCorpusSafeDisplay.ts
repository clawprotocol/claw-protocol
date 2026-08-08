/**
 * Emergency-only formatting for accepted paid Pro `server_full_draft` corpus.
 * No renumbering, dedupe, canonical reconstruction, or enterprise polish.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  intakeHasFullLegalEntityParties,
  resolveCanonicalPartyIdentitiesFromSources,
  resolveCommercialPartyRecordsForOpeningRepair,
} from "./canonicalPartyIdentityResolver";
import { readFrozenCanonicalManifestPartyNames } from "./frozenCanonicalManifestAuthority";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES } from "./paidProNPartySignerSetup";
import { appendProExecutionBlockIfMissing } from "./proExecutionBlockAppend";
import {
  ensurePaidProAcceptanceExecutionBlockInvariant,
  isGenericPaidProAcceptanceManifestFallback,
  manifestRecordsForPaidProAcceptance,
} from "./paidProAcceptanceExecutionBlockInvariant";
import { neutralizeHarmlessEntityMetadataPlaceholders } from "./harmlessEntityMetadataPlaceholders";
import { applyIntakeDraftPlaceholders } from "./applyIntakeDraftPlaceholders";
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
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import { reconcileExecutionBlockToRoleIdentities } from "./paidProSignerMetadataMergeGate";
import { tracePaidProQaPassWithText } from "./paidProQaPerfTrace";
import {
  buildAcceptedProCorpusSafeDisplayCacheKey,
  logPaidProSafeDisplayCacheHit,
  readAcceptedProCorpusSafeDisplayCache,
  writeAcceptedProCorpusSafeDisplayCache,
} from "./paidProAcceptedCorpusSafeDisplayCache";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { readPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { hasPaidProPipelineSessionAcceptance } from "./paidProPostAcceptanceValidatorCache";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { applyPaidProDocumentBoundaryAuthority } from "./paidProDocumentBoundaryAuthority";
import { repairAgreementTemplatePlaceholders, repairPaidProFreezePlaceholderAuthority } from "./agreementTemplatePlaceholderSafety";
import { applyPaidProCanonicalDocumentStructureAuthority } from "./paidProCanonicalDocumentStructureAuthority";
import { intakeDescribesBrandLicensingDistributionManufacturingStack } from "./paidProAgreementTitleScope";
import { applyBrandLicensingFrozenCorpusAuthority } from "./paidProBrandLicensingFreezeAuthority";

export type AcceptedProCorpusSafeDisplayOpts = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  /** When true, append execution/signature block only if missing (VS01 signing). */
  appendExecutionBlockIfMissing?: boolean;
  /** QA perf trace label only — does not affect output. */
  surface?: string;
  /** Session generation id — prevents starter/free corpus cache poisoning Pro path. */
  agreementGenerationId?: string | null;
  /** Recovery render source or pipeline recovery kind for cache namespacing. */
  recoveryKind?: string | null;
  /** Pipeline or corpus source kind — prevents starter cache poisoning Pro path. */
  sourceKind?: string | null;
  /** Authoritative party count for cache namespacing. */
  partyCount?: number | null;
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
  const beforeInvariant = analyzePaidProExecutionBlockInvariant(text, { expectedParties: 2 });
  const identities = buildCorpusRoleIdentitiesForExecutionReconcile(text);
  const reconciled = reconcileExecutionBlockToRoleIdentities(text, identities);
  if (reconciled.repairs <= 0 || reconciled.text === text) return { text, repaired: false };
  const afterInvariant = analyzePaidProExecutionBlockInvariant(reconciled.text, { expectedParties: 2 });
  if (beforeInvariant.ok && !afterInvariant.ok) return { text, repaired: false };
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

function canonicalPartyNamesFromAcceptanceContext(
  draft: ParsedDraftShape | null | undefined,
  intakeText: string | null | undefined,
): string[] {
  const frozen = readFrozenCanonicalManifestPartyNames();
  if (frozen.length >= 2) return frozen;

  const fromIntake = labeledPartyLegalEntities(intakeText ?? "")
    .map((n) => n.trim())
    .filter((n) => isAuthoritativeLegalEntityName(n));
  if (fromIntake.length >= 2) {
    return fromIntake.slice(0, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES);
  }
  return (draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((name) => name.length >= 2)
    .slice(0, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES);
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
    const pipelineAcceptedHash = readPaidProPipelineAcceptedCorpusHash();
    const pipelineAcceptedSubstantive =
      input.length >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN &&
      (hasPaidProPipelineSessionAcceptance({ text: input, source: opts?.sourceKind ?? "server_full_draft" }) ||
        (pipelineAcceptedHash && pipelineAcceptedHash === inputHash));
    const staleStarterCache =
      pipelineAcceptedSubstantive &&
      cached.text.length < Math.floor(input.length * 0.85) &&
      pipelineAcceptedHash &&
      outputHash !== pipelineAcceptedHash;
    const substantiveWireStaleCache =
      input.length >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN &&
      cached.text.length < Math.floor(input.length * 0.85);
    if (!staleStarterCache && !substantiveWireStaleCache) {
      logPaidProSafeDisplayCacheHit({ surface, cacheKey, inputHash, outputHash });
      return tracePaidProQaPassWithText("applyAcceptedProCorpusSafeDisplay", `${surface}:cache_hit`, input, () => cached);
    }
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

  const intakeRaw = opts?.intakeText ?? null;
  // Fill clarification-style brackets from intake BEFORE harmless [State]/[Address] neutralization.
  const intakePlaceholders = applyIntakeDraftPlaceholders({
    text: out,
    intakeText: intakeRaw,
    partyNames: (opts?.draft?.parties ?? [])
      .map((p) => String(p?.name ?? "").trim())
      .filter((n) => n.length >= 2),
  });
  if (intakePlaceholders.text !== out) {
    out = intakePlaceholders.text;
    repairs.push(...intakePlaceholders.repairs);
  }

  const entityNeutral = neutralizeHarmlessEntityMetadataPlaceholders(out);
  out = entityNeutral.text;
  repairs.push(...entityNeutral.repairs);
  if (intakeRaw && intakeDescribesBrandLicensingDistributionManufacturingStack(intakeRaw)) {
    const brandAuthority = applyBrandLicensingFrozenCorpusAuthority(out, opts?.draft ?? null, intakeRaw);
    if (brandAuthority.text !== out) {
      out = brandAuthority.text;
      repairs.push(...brandAuthority.repairs);
    }
  }

  const partyNames = canonicalPartyNamesFromAcceptanceContext(opts?.draft, intakeRaw);
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

  if (
    (opts?.draft?.parties ?? []).filter((p) => String(p?.name ?? "").trim().length >= 2).length <= 2 &&
    !intakeDescribesBrandLicensingDistributionManufacturingStack(intakeRaw ?? "")
  ) {
    // Opening title repair for LLC/Inc and sole-prop/brand commercial parties.
    // Do not reuse this for full party-identity repair (that path stays entity-gated above).
    const openingRecords =
      records.length >= 2
        ? records
        : resolveCommercialPartyRecordsForOpeningRepair(
            intakeRaw,
            partyNames,
            (opts?.draft?.parties ?? [])
              .map((p) => String(p?.role ?? "").trim())
              .filter((r) => r.length >= 2),
          );
    if (openingRecords.length >= 2) {
      const openingGuard = ensurePaidProServicesAgreementOpening(out, openingRecords, intakeRaw);
      if (openingGuard.text !== out) {
        out = openingGuard.text;
        repairs.push(...openingGuard.repairs);
      }
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
    if (wouldMateriallyShrinkAcceptedCorpus(input.length, prepared.text.length)) {
      repairs.push("safe:prepare_shrink_blocked");
    } else {
      out = prepared.text;
      repairs.push(...prepared.repairs);
    }
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
    const expectedParties = Math.max(executionRecords.length, 2);
    const beforeInvariant = analyzePaidProExecutionBlockInvariant(out, { expectedParties });
    const execution = enforcePaidProSingleExecutionBlock(out, {
      authorityParties: executionRecords.map((r) => ({ partyLegalName: r.fullLegalName })),
      intakeText: intakeRaw,
      draftPartyNames: partyNames,
    });
    if (execution.text !== out) {
      const afterInvariant = analyzePaidProExecutionBlockInvariant(execution.text, {
        expectedParties,
      });
      if (!beforeInvariant.ok || afterInvariant.ok) {
        out = execution.text;
        repairs.push(...execution.repairs);
      } else {
        repairs.push("safe:enforce_execution_skipped_regression");
      }
    }
  }

  const boundary = applyPaidProDocumentBoundaryAuthority(out, {
    draft: opts?.draft ?? null,
    intakeText: intakeRaw,
    surface: opts?.surface
      ? `${opts.surface}:document_boundary_authority`
      : "accepted_pro_corpus_safe_display:document_boundary_authority",
    blockOnUnresolved: false,
  });
  if (boundary.text !== out) {
    out = boundary.text;
    repairs.push(...boundary.repairs.map((r) => `boundary:${r}`));
  }

  const partyNamesForRepair =
    records.length >= 2
      ? records.map((r) => r.fullLegalName).filter((n) => n.length >= 2)
      : partyNames;
  if (partyNamesForRepair.length >= 2 && out.length >= 400) {
    const placeholderRepair = repairAgreementTemplatePlaceholders(out, {
      intakeRaw: intakeRaw ?? "",
      partyNames: partyNamesForRepair,
    });
    if (placeholderRepair.repaired.length > 0) {
      out = placeholderRepair.text;
      repairs.push(...placeholderRepair.repaired.map((r) => `placeholder:${r}`));
    }
    const freezeExpansion = repairPaidProFreezePlaceholderAuthority(out, {
      intakeRaw: intakeRaw ?? "",
      partyNames: partyNamesForRepair,
    });
    if (freezeExpansion.repaired.length > 0) {
      out = freezeExpansion.text;
      repairs.push(...freezeExpansion.repaired.map((r) => `placeholder_freeze:${r}`));
    }
  }

  const canonicalStructure = applyPaidProCanonicalDocumentStructureAuthority(out, {
    source: opts?.surface
      ? `${opts.surface}:canonical_structure_authority`
      : "accepted_pro_corpus_safe_display:canonical_structure_authority",
    phase: "pre_freeze",
  });
  if (canonicalStructure.repairs.length > 0) {
    out = canonicalStructure.text;
    repairs.push(...canonicalStructure.repairs.map((r) => `structure:${r}`));
  }

  if (wouldMateriallyShrinkAcceptedCorpus(input.length, out.length)) {
    return {
      text: input,
      repairs: [...repairs, "safe:final_shrink_blocked"],
    };
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
