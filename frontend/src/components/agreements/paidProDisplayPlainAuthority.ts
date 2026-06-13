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
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { enrichPaidProPostFinalizeDisplayCorpus } from "./paidProPostFinalizeReviewSurface";
import type { PaidProDocumentSurface } from "./paidProSourceOfTruth";

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

/** Display-only section/heading normalization — idempotent on well-formatted corpora. */
export function applyPaidProUserVisibleDisplayPrep(plain: string): string {
  const body = (plain || "").trim();
  if (body.length < 80) return body;
  return preparePaidProReviewDisplayPlain(body).text.trimEnd();
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
