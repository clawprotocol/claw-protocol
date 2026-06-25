/**
 * Dev/QA diagnostic trace for paid Pro acceptance pipeline stages (TEST432).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { assessConciseCommercialServicesProQuality } from "./paidProConciseServicesQuality";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import {
  detectPaidProSectionHeadingTitleAnomalies,
  formatPaidProSectionHeadingTitleAnomalyDetails,
} from "./paidProSectionHeadingTitleAuthority";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

export type PaidProAcceptancePipelineTraceStage =
  | "raw_server_full_draft_received"
  | "after_preparePaidProServerDocumentForAcceptance"
  | "after_applyPaidProDocumentBoundaryAuthority"
  | "after_heading_title_authority"
  | "after_buildPaidProFreezeCandidate"
  | "validatePaidProOutput_validation_input"
  | "after_establishPaidProSourceOfTruth"
  | "premium_completion_pipeline_final";

export type PaidProAcceptancePipelineTracePayload = {
  stage: PaidProAcceptancePipelineTraceStage;
  source: string;
  len: number;
  hash: string;
  headingAnomalyCount: number;
  headingAnomalyDetails: ReturnType<typeof formatPaidProSectionHeadingTitleAnomalyDetails>;
  missingSections: string[];
  executionSignatureDetected: boolean;
  witnessCount: number;
  executionBlockCount: number;
  noticeStanzaCount: number;
  partyCount: number;
  rejectReason: string | null;
};

export function paidProAcceptancePipelineTraceEnabled(): boolean {
  if (import.meta.env.MODE === "test") return true;
  if (import.meta.env.DEV) return true;
  return import.meta.env.VITE_PAID_PRO_ACCEPTANCE_TRACE === "1";
}

export function buildPaidProAcceptancePipelineTracePayload(args: {
  stage: PaidProAcceptancePipelineTraceStage;
  source: string;
  text: string;
  rejectReason?: string | null;
  rawIntake?: string | null;
  draft?: ParsedDraftShape | null;
}): PaidProAcceptancePipelineTracePayload {
  const text = (args.text || "").trim();
  const headingAnomalies = detectPaidProSectionHeadingTitleAnomalies(text);
  const witnessMatches = text.match(/\bin\s+witness\s+whereof\b/gi) ?? [];
  const executionBlockCount = countPaidProExecutionBlocks(text);
  const noticeStanzaCount = countOperativeIfToNoticeStanzas(text);
  const parties = (args.draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((n) => n.length >= 2);
  const substance =
    args.rawIntake
      ? assessConciseCommercialServicesProQuality({
          text,
          rawIntake: args.rawIntake,
          draft: args.draft ?? null,
        })
      : null;

  return {
    stage: args.stage,
    source: args.source,
    len: text.length,
    hash: text.length >= 80 ? hashPaidProCorpus(text) : text.length > 0 ? `len:${text.length}` : "empty",
    headingAnomalyCount: headingAnomalies.length,
    headingAnomalyDetails: formatPaidProSectionHeadingTitleAnomalyDetails(text, headingAnomalies).slice(0, 12),
    missingSections: substance?.missingSections ?? [],
    executionSignatureDetected: executionBlockCount > 0 || witnessMatches.length > 0,
    witnessCount: witnessMatches.length,
    executionBlockCount,
    noticeStanzaCount,
    partyCount: parties.length,
    rejectReason: args.rejectReason ?? null,
  };
}

export function tracePaidProAcceptancePipelineStage(args: {
  stage: PaidProAcceptancePipelineTraceStage;
  source: string;
  text: string;
  rejectReason?: string | null;
  rawIntake?: string | null;
  draft?: ParsedDraftShape | null;
}): PaidProAcceptancePipelineTracePayload {
  const payload = buildPaidProAcceptancePipelineTracePayload(args);
  if (!paidProAcceptancePipelineTraceEnabled()) return payload;
  if (import.meta.env.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[paid-pro-acceptance-pipeline-trace]", payload);
  }
  return payload;
}
