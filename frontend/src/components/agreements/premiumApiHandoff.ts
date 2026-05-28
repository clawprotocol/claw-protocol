/**
 * Premium-full-draft API response → paid Pro authority handoff.
 * Keeps server corpus on the draft and blocks live preview / purpose fallbacks after checkout.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { SEND_HANDOFF_AUTHORITATIVE_MIN_LEN } from "./paidProAuthorityConstants";
import { draftServerFullDocumentExists } from "./paidProRuntimeAuthorityEstablishment";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { hasUsablePremiumBodyText } from "./premiumPostCheckoutApplyEligible";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { readPremiumCompletionSnapshot } from "./premiumCompletionStorage";

export type PremiumApiResultLog = {
  ok: boolean;
  status: number | null;
  hasServerFullDocumentText: boolean;
  serverLen: number;
  documentLen: number;
  keys: string[];
  error: string | null;
  generationOutcome: string | null;
};

export function extractPremiumApiServerCorpusText(result: Partial<PremiumFullDraftResult> | null | undefined): string {
  if (!result) return "";
  const serverFull = String(result.server_full_document_text ?? "").trim();
  if (serverFull.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) return serverFull;
  const repair = String(result.server_repair_document_text ?? "").trim();
  if (repair.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) return repair;
  const doc = String(result.document_text ?? "").trim();
  if (doc.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) return doc;
  return serverFull || repair || doc;
}

export function premiumApiResultHasAuthoritativeServerCorpus(
  result: Partial<PremiumFullDraftResult> | null | undefined,
): boolean {
  return extractPremiumApiServerCorpusText(result).length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN;
}

export function logPremiumApiResult(payload: PremiumApiResultLog): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[premium-api-result]", payload);
}

export function logPremiumApiResultFromWire(args: {
  ok: boolean;
  status: number | null;
  wire: Partial<PremiumFullDraftResult> | null | undefined;
  error?: string | null;
}): void {
  const serverFull = String(args.wire?.server_full_document_text ?? "").trim();
  logPremiumApiResult({
    ok: args.ok,
    status: args.status,
    hasServerFullDocumentText: serverFull.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN,
    serverLen: serverFull.length,
    documentLen: String(args.wire?.document_text ?? "").trim().length,
    keys: args.wire ? Object.keys(args.wire).slice(0, 24) : [],
    error: args.error ?? null,
    generationOutcome: String(args.wire?.generation_outcome ?? "").trim() || null,
  });
}

/** Paid Pro chrome / review shell may only show when server or frozen authority exists. */
export function hasPaidProChromeAuthority(args?: {
  draft?: ParsedDraftShape | null;
}): boolean {
  if (hasPaidProSourceOfTruth()) return true;
  if (draftServerFullDocumentExists(args?.draft ?? null)) return true;
  const snap = readPremiumCompletionSnapshot();
  if (!snap?.premiumAccepted) return false;
  if (!hasUsablePremiumBodyText(snap.premiumWinningBodyText)) return false;
  return isAuthoritativePremiumPipelineRenderSource(snap.premiumPipelineRenderSource);
}

export function mergePremiumDraftWithServerCorpusFields(
  draft: ParsedDraftShape,
  args: {
    authoritativePlain: string;
    serverFullFromApi?: string | null;
    premiumRenderSource: string;
  },
): ParsedDraftShape {
  const body = args.authoritativePlain.trim();
  if (body.length < SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) return draft;
  const serverFull = String(args.serverFullFromApi ?? body).trim() || body;
  const renderSource = isAuthoritativePremiumPipelineRenderSource(args.premiumRenderSource)
    ? args.premiumRenderSource
    : "server_full_document_text";
  return {
    ...draft,
    premium_full_document_text: body,
    premium_server_full_document_text: serverFull,
    premium_render_source: renderSource,
  };
}
