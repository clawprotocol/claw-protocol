/**
 * Paid Pro pipeline stage trace — evidence chain from raw server draft through SoT freeze.
 */

import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { validateClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import { countStandaloneClauseFamilyHeadings } from "./clauseFamilyRegistry";
import { applyPaidProDocumentBoundaryAuthority } from "./paidProDocumentBoundaryAuthority";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { hasInlineMalformedNoticeStanzas } from "./paidProPartyNoticeDetails";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export type PaidProPipelineStageId =
  | "server_full_draft"
  | "accepted_corpus"
  | "post_boundary_authority"
  | "pre_sot_freeze"
  | "frozen_sot"
  | "review_render"
  | "signer_setup";

export type PaidProPipelineStageSnapshot = {
  stage: PaidProPipelineStageId;
  hash: string;
  len: number;
  noticesHeading: string | null;
  noticesFamilyPreview: string;
  inlineMalformedNotices: boolean;
  governingLawHeadingCount: number;
  executionBlockCount: number;
  clauseFamilyStructuralOk: boolean;
  clauseFamilyViolationCodes: string[];
};

export type PaidProPipelineTraceReport = {
  stages: PaidProPipelineStageSnapshot[];
  divergenceStage: PaidProPipelineStageId | null;
  origin: "generation" | "mutation" | "mixed" | "unknown";
  originEvidence: string;
};

const NOTICES_HEADING_LINE_RE = /^\s*\d*\.?\s*.*\bNotices\b.*$/im;

function snapshotFromText(
  stage: PaidProPipelineStageId,
  text: string,
  opts?: { parties?: readonly PaidProSignerMetadataParty[] },
): PaidProPipelineStageSnapshot {
  const body = (text || "").replace(/\r\n/g, "\n");
  const noticesIdx = body.search(/\bNotices\b/i);
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  const noticesEnd = witnessIdx >= 0 ? witnessIdx : body.length;
  const noticesRegion = noticesIdx >= 0 ? body.slice(noticesIdx, noticesEnd) : "";
  const headingMatch = body.match(NOTICES_HEADING_LINE_RE);
  const structural = validateClauseFamilyStructuralIntegrity(body, {
    parties: opts?.parties,
    requireNotices: noticesIdx >= 0,
  });

  return {
    stage,
    hash: body.length >= 80 ? hashPaidProCorpus(body) : `len:${body.length}`,
    len: body.length,
    noticesHeading: headingMatch?.[0]?.trim() ?? null,
    noticesFamilyPreview: noticesRegion.slice(0, 300),
    inlineMalformedNotices: hasInlineMalformedNoticeStanzas(body),
    governingLawHeadingCount: countStandaloneClauseFamilyHeadings(body, "governing_law"),
    executionBlockCount: countPaidProExecutionBlocks(body),
    clauseFamilyStructuralOk: structural.ok,
    clauseFamilyViolationCodes: structural.violations.map((v) => v.code),
  };
}

function classifyOrigin(
  server: PaidProPipelineStageSnapshot,
  accepted: PaidProPipelineStageSnapshot,
): { origin: PaidProPipelineTraceReport["origin"]; evidence: string } {
  if (server.inlineMalformedNotices && !accepted.inlineMalformedNotices) {
    return {
      origin: "generation",
      evidence:
        "server_full_draft contained inline malformed notices; accepted_corpus repair cleared them",
    };
  }
  if (!server.inlineMalformedNotices && accepted.inlineMalformedNotices) {
    return {
      origin: "mutation",
      evidence: "inline malformed notices appeared after server_full_draft (post-generation mutation)",
    };
  }
  if (server.inlineMalformedNotices && accepted.inlineMalformedNotices) {
    return {
      origin: server.clauseFamilyStructuralOk ? "mutation" : "generation",
      evidence:
        "inline malformed notices present at server_full_draft and persisted through acceptance",
    };
  }
  if (!server.clauseFamilyStructuralOk && accepted.clauseFamilyStructuralOk) {
    return {
      origin: "generation",
      evidence: `server draft structural violations (${server.clauseFamilyViolationCodes.join(",")}) repaired before freeze`,
    };
  }
  return {
    origin: "unknown",
    evidence: "no notice-structure divergence detected between server and accepted stages",
  };
}

function firstDivergentStage(stages: PaidProPipelineStageSnapshot[]): PaidProPipelineStageId | null {
  if (stages.length < 2) return null;
  const baseline = stages[0]!;
  for (let i = 1; i < stages.length; i += 1) {
    const cur = stages[i]!;
    if (
      cur.inlineMalformedNotices !== baseline.inlineMalformedNotices ||
      cur.clauseFamilyStructuralOk !== baseline.clauseFamilyStructuralOk ||
      (cur.stage === "frozen_sot" && cur.hash !== stages[i - 1]?.hash)
    ) {
      return cur.stage;
    }
  }
  return null;
}

export type RunPaidProPipelineTraceArgs = {
  serverFullDraft: string;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  parties?: readonly PaidProSignerMetadataParty[];
  frozenSot?: string;
};

/**
 * Trace production-equivalent mutation layers without requiring a live LLM call.
 * Stages 1–4 are deterministic; pass `frozenSot` to include stage 5 from an establish call.
 */
export function runPaidProAuthoritativePipelineTrace(
  args: RunPaidProPipelineTraceArgs,
): PaidProPipelineTraceReport {
  const stages: PaidProPipelineStageSnapshot[] = [];
  const partyOpts = { parties: args.parties };

  const server = (args.serverFullDraft || "").trim();
  stages.push(snapshotFromText("server_full_draft", server, partyOpts));

  const accepted = applyAcceptedProCorpusSafeDisplay(server, {
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
    surface: "pipeline_trace_accepted",
  }).text;
  stages.push(snapshotFromText("accepted_corpus", accepted, partyOpts));

  const boundary = applyPaidProDocumentBoundaryAuthority(accepted, {
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
    parties: args.parties,
    surface: "pipeline_trace_boundary",
    blockOnUnresolved: false,
  }).text;
  stages.push(snapshotFromText("post_boundary_authority", boundary, partyOpts));

  stages.push(snapshotFromText("pre_sot_freeze", boundary, partyOpts));

  const frozen = (args.frozenSot ?? boundary).trim();
  stages.push(snapshotFromText("frozen_sot", frozen, partyOpts));

  const review = preparePaidProReviewDisplayPlain(frozen).text;
  stages.push(snapshotFromText("review_render", review, partyOpts));

  const signer =
    args.parties && args.parties.length >= 2
      ? finalizePaidProSigningCorpusText(frozen, args.parties, {
          intakeText: args.intakeText ?? null,
          draftPartyNames: args.parties.map((p) => p.partyLegalName),
        }).text
      : frozen;
  stages.push(snapshotFromText("signer_setup", signer, partyOpts));

  const { origin, evidence } = classifyOrigin(stages[0]!, stages[1]!);

  return {
    stages,
    divergenceStage: firstDivergentStage(stages),
    origin,
    originEvidence: evidence,
  };
}

export function formatPipelineTraceReport(report: PaidProPipelineTraceReport): string {
  const lines = report.stages.map(
    (s) =>
      `${s.stage}: hash=${s.hash} len=${s.len} notices="${s.noticesHeading ?? "—"}" inlineMalformed=${s.inlineMalformedNotices} structuralOk=${s.clauseFamilyStructuralOk} violations=[${s.clauseFamilyViolationCodes.join(",")}]`,
  );
  return [
    ...lines,
    `origin=${report.origin}`,
    `originEvidence=${report.originEvidence}`,
    `divergenceStage=${report.divergenceStage ?? "none"}`,
  ].join("\n");
}
