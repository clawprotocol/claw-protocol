/**
 * Canonical user-visible Pro plain-text display prep — display-only, never mutates SoT / snapshot / handoff.
 */

import type { AgreementDraft } from "../../agreement/agreementTypes";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { ReviewReadyHydratedDisplayCorpusSurface } from "../../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";
import {
  applyReviewReadyMetadataBackfill,
  collectReviewReadyCorpusHints,
  isReviewTrackHydrationSurface,
} from "../../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";
import {
  detectExecutionHeadingMetadataLeak,
  repairExecutionBlockEntityHeadingLines,
} from "./paidProExecutionBlockEntityHeading";
import { repairSplitPaidProHeadingFragments } from "./repairSplitPaidProHeadingFragments";
import { repairMalformedSectionAnyReference } from "./paidProFrozenManifestDisplayAuthority";
import { repairPaidProDocumentTitleOpening } from "./paidProDocumentTitleOpeningRepair";
import { repairCollapsedInlineNoticeStanzas } from "./paidProPartyNoticeDetails";
import { ensureBlankLineBeforeWitnessBlock } from "./paidProExecutionBlockNormalization";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { shouldUsePaidProSourceOfTruthDisplayOnly, resolvePaidProAuthoritativeDisplayPlain, type ResolvePaidProAuthoritativeDisplayPlainArgs } from "./paidProAuthoritativeRenderGate";
import { enrichPaidProPostFinalizeDisplayCorpus } from "./paidProPostFinalizeReviewSurface";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import { hashPaidProCorpus, type PaidProDocumentSurface } from "./paidProSourceOfTruthState";
import { repairJoinedTopLevelSectionHeadings } from "./sectionStructureAuthority";

export type PaidProUserVisibleDisplaySurface =
  | PaidProDocumentSurface
  | ReviewReadyHydratedDisplayCorpusSurface
  | "handoff_mint"
  | "transport";

const TRANSPORT_ONLY_SURFACES = new Set<string>(["vs01", "handoff_mint", "transport", "review_link_payload"]);

/** True when surface is shown to users (not VS01 seed / mint / handoff transport bytes). */
export function isPaidProUserVisibleDocumentSurface(surface: string): boolean {
  return !TRANSPORT_ONLY_SURFACES.has(surface);
}

/**
 * Paid Pro Frozen SoT display projection (ADR-020):
 * Deterministic, non-persistent, presentation-only transforms on the frozen corpus.
 * Must not hydrate notices, rebuild execution blocks, or add substantive legal text.
 * Idempotent: project(project(SoT)) === project(SoT).
 */
export function projectPaidProFrozenSoTDisplayPlain(text: string): string {
  let out = (text || "").replace(/\r\n/g, "\n").trimEnd();
  if (!out) return out;

  // Presentation-only: letter-glued subsections (`General Terms9.1`) and mis-nested N.x.
  // Does not persist; keeps frozen SoT store intact while every visible surface paints cleanly.
  const structureJoined = repairJoinedTopLevelSectionHeadings(out);
  if (structureJoined.repairs.length > 0) out = structureJoined.text;

  const titleOpening = repairPaidProDocumentTitleOpening(out);
  if (titleOpening.repairs.length > 0) out = titleOpening.text;

  const splitTail = repairSplitPaidProHeadingFragments(out);
  if (splitTail.repairs.length > 0) out = splitTail.text;

  const sectionAny = repairMalformedSectionAnyReference(out);
  if (sectionAny.repaired) out = sectionAny.text;

  if (isPaidProPostFinalizeHydratedCorpusLocked()) {
    const inlineSignatures = out.replace(/([.!?])\s+\bSIGNATURES\b\s*$/gim, "$1");
    if (inlineSignatures !== out) out = inlineSignatures;
  }

  const witnessSep = ensureBlankLineBeforeWitnessBlock(out);
  if (witnessSep.repairs.length > 0) out = witnessSep.text;

  const collapsedNotices = repairCollapsedInlineNoticeStanzas(out);
  if (collapsedNotices.repairs.length > 0) out = collapsedNotices.text;

  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** Display-only section/heading normalization — idempotent on well-formatted corpora. */
export function applyPaidProUserVisibleDisplayPrep(plain: string): string {
  const body = (plain || "").trim();
  if (body.length < 80) return body;
  if (isPaidProPostFinalizeHydratedCorpusLocked() || shouldUsePaidProSourceOfTruthDisplayOnly()) {
    return projectPaidProFrozenSoTDisplayPlain(body);
  }
  return preparePaidProReviewDisplayPlain(body).text.trimEnd();
}

/** Frozen SoT review plain after authorized display prep and user-visible finishing. */
export function resolvePaidProFrozenUserVisibleReviewDisplayPlain(
  args?: ResolvePaidProAuthoritativeDisplayPlainArgs,
): string {
  if (!shouldUsePaidProSourceOfTruthDisplayOnly()) return "";
  return applyPaidProUserVisibleDisplayPrep(resolvePaidProAuthoritativeDisplayPlain(args)).trim();
}

export function resolvePaidProFrozenUserVisibleReviewDisplayHash(
  args?: ResolvePaidProAuthoritativeDisplayPlainArgs,
): string | null {
  const plain = resolvePaidProFrozenUserVisibleReviewDisplayPlain(args);
  return plain.length >= 80 ? hashPaidProCorpus(plain) : null;
}

export type ResolvePaidProDisplayPlainForSurfaceArgs = {
  surface: PaidProUserVisibleDisplaySurface | string;
  sourcePlain: string;
  draft?: AgreementDraft | ParsedDraftShape | null;
  /** When true (default), run review-track / post-finalize metadata backfill before display prep. */
  applySignerHydration?: boolean;
  selectedSource?: string;
};

/**
 * User-visible Pro plain from any source corpus — optional hydration, always ends in display prep.
 * Never writes to SoT, snapshot, pinned handoff, or mint payload stores.
 */
export function resolvePaidProDisplayPlainForSurface(args: ResolvePaidProDisplayPlainForSurfaceArgs): string {
  const surface = String(args.surface ?? "").trim() || "review";
  let body = (args.sourcePlain || "").trim();
  if (body.length < 80) return body;

  if (args.applySignerHydration !== false) {
    if (isReviewTrackHydrationSurface(surface as ReviewReadyHydratedDisplayCorpusSurface)) {
      const corpusHints = collectReviewReadyCorpusHints(body, args.draft as AgreementDraft | null);
      body = applyReviewReadyMetadataBackfill(body, args.draft as AgreementDraft | null, {
        corpusHints,
        surface: surface as ReviewReadyHydratedDisplayCorpusSurface,
        selectedSource: args.selectedSource,
      });
    } else {
      body = enrichPaidProPostFinalizeDisplayCorpus(body, args.draft as AgreementDraft | null);
    }
    if (detectExecutionHeadingMetadataLeak(body).leak) {
      const parties = readConsumedPaidProSignerMetadataAuthority()?.parties;
      body = repairExecutionBlockEntityHeadingLines(body, parties).text.trim();
    }
  }

  if (!isPaidProUserVisibleDocumentSurface(surface)) {
    return body;
  }
  return applyPaidProUserVisibleDisplayPrep(body);
}

/** Post-finalize enriched snapshot plain with canonical user-visible display prep. */
export function resolvePaidProPostFinalizeUserVisiblePlain(
  enrichedPlain: string,
  draft?: AgreementDraft | ParsedDraftShape | null,
): string {
  return resolvePaidProDisplayPlainForSurface({
    surface: "review",
    sourcePlain: enrichedPlain,
    draft,
    applySignerHydration: false,
    selectedSource: "authoritative_signing_snapshot",
  });
}
