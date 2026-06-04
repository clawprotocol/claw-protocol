/**
 * DEV/test diagnostics for signer name/title handoff across authority → hydration → preview → execution block → copy.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildPaidProSignerMetadataParties, type LiveSignerMetadataUiState } from "./paidProSignerMetadataAuthority";
import { resolveUniversalSignerMetadataBySlot } from "./universalSignerMetadataAuthority";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { extractExecutionBlockSignerLines } from "./paidProSignerMetadataHandoffExtract";

export type PaidProSignerMetadataHandoffPartyDiagnostic = {
  partyIndex: number;
  universalAuthority: { signerName: string; signerTitle: string };
  reviewHydrationParties: { signerName: string; signerTitle: string };
  previewBuildParties: { signerName: string; signerTitle: string };
  executionBlockRendered: { nameLine: string; titleLine: string };
  copiedPlainText: { nameLine: string; titleLine: string };
};

export type CollectPaidProSignerMetadataHandoffDiagnosticsArgs = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  liveSignerMetadataUi?: LiveSignerMetadataUiState | null;
  previewPlain?: string | null;
  copyPlain?: string | null;
};

export function collectPaidProSignerMetadataHandoffDiagnostics(
  args: CollectPaidProSignerMetadataHandoffDiagnosticsArgs,
): PaidProSignerMetadataHandoffPartyDiagnostic[] {
  const legalEntities = resolvePartiesForReviewRender(args).map((p) => p.partyLegalName);
  const universal = resolveUniversalSignerMetadataBySlot({
    legalEntities,
    intakeText: args.intakeText ?? null,
    draftParties: args.draft?.parties?.map((p) => ({
      name: String((p as { name?: string }).name ?? ""),
      signerName: (p as { signerName?: string }).signerName,
      signerTitle: (p as { signerTitle?: string }).signerTitle,
    })),
    uiSignerNames: args.liveSignerMetadataUi?.partySignerNames,
    uiSignerTitles: args.liveSignerMetadataUi?.partySignerTitles,
  });
  const hydrationParties = resolvePartiesForReviewRender(args);
  const previewParties = args.liveSignerMetadataUi
    ? buildPaidProSignerMetadataParties(args.liveSignerMetadataUi)
    : hydrationParties;
  const previewPlain = (args.previewPlain ?? "").trim();
  const copyPlain = (args.copyPlain ?? previewPlain).trim();

  return hydrationParties.map((party, partyIndex) => {
    const u = universal[partyIndex];
    const execPreview = extractExecutionBlockSignerLines(previewPlain, partyIndex);
    const execCopy = extractExecutionBlockSignerLines(copyPlain, partyIndex);
    return {
      partyIndex,
      universalAuthority: {
        signerName: u?.signerName?.trim() ?? "",
        signerTitle: u?.signerTitle?.trim() ?? "",
      },
      reviewHydrationParties: {
        signerName: party.signerName.trim(),
        signerTitle: party.signerTitle.trim(),
      },
      previewBuildParties: {
        signerName: (previewParties[partyIndex]?.signerName ?? "").trim(),
        signerTitle: (previewParties[partyIndex]?.signerTitle ?? "").trim(),
      },
      executionBlockRendered: execPreview,
      copiedPlainText: execCopy,
    };
  });
}

export function logPaidProSignerMetadataHandoffDiagnostics(
  args: CollectPaidProSignerMetadataHandoffDiagnosticsArgs & { surface: string },
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  const rows = collectPaidProSignerMetadataHandoffDiagnostics(args);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signer-metadata-handoff]", { surface: args.surface, parties: rows });
}
