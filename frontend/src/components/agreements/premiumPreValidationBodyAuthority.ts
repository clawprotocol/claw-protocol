/**
 * Select the paid Pro validation / freeze body before validatePaidProOutput.
 * When a substantive server_full_document_text exists and is longer than document_text,
 * validation and SoT establishment must use the adopted server full body — not the short client field.
 */

import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import {
  extractPremiumApiServerCorpusText,
  premiumApiResultHasAuthoritativeServerCorpus,
} from "./premiumApiHandoff";
import { SEND_HANDOFF_AUTHORITATIVE_MIN_LEN } from "./paidProAuthorityConstants";
import {
  PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN,
  SERVER_FULL_DOCUMENT_AUTHORITATIVE_MIN_LEN,
  isDegradedJsonParseWithoutSubstantiveServerFull,
} from "./premiumAcceptancePolicy";
import { scanPremiumOutputForDevContextLeak } from "./premiumOutputDevContextGuard";

export type PremiumPreValidationBodySource = "server_full_document_text" | "document_text";

export function serverFullGenerationHardFailure(effectiveFull: PremiumFullDraftResult): boolean {
  const code = (effectiveFull.server_generation_failure_code || "").trim();
  return code === "airlock_blocked" || code === "dev_context_leak";
}

export function isSubstantivePremiumServerFullDocument(
  serverFullLen: number,
  effectiveFull: PremiumFullDraftResult,
): boolean {
  if (
    isDegradedJsonParseWithoutSubstantiveServerFull({
      generationOutcome: effectiveFull.generation_outcome,
      failureCode: effectiveFull.server_generation_failure_code,
      wireServerFullDocumentText: effectiveFull.server_full_document_text,
    })
  ) {
    return false;
  }
  if (serverFullLen >= PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN) return true;
  if (serverFullLen >= SERVER_FULL_DOCUMENT_AUTHORITATIVE_MIN_LEN) return true;
  return (
    serverFullLen >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN &&
    premiumApiResultHasAuthoritativeServerCorpus(effectiveFull)
  );
}

/**
 * Authoritative candidate order:
 * 1. substantive server_full_document_text when longer than client document_text
 * 2. prepared/adopted server full (safe-display)
 * 3. document_text when no substantive longer server full exists
 */
export function resolvePremiumPreValidationBody(args: {
  clientDocumentText: string;
  effectiveFull: PremiumFullDraftResult;
  draft: ParsedDraftShape;
  intakeText: string;
  /** Wire `server_full_document_text` before pipeline mutations overwrite the field. */
  wireServerFullDocumentText?: string | null;
  safeDisplaySurface?: string;
}): {
  text: string;
  source: PremiumPreValidationBodySource;
  adoptedServerFull: boolean;
  clientLen: number;
  serverFullLen: number;
} {
  const clientTrim = (args.clientDocumentText || "").trim();
  const serverFullRaw =
    (args.wireServerFullDocumentText || "").trim() ||
    (args.effectiveFull.server_full_document_text || "").trim() ||
    extractPremiumApiServerCorpusText(args.effectiveFull);

  if (!serverFullRaw || serverFullGenerationHardFailure(args.effectiveFull)) {
    return {
      text: clientTrim,
      source: "document_text",
      adoptedServerFull: false,
      clientLen: clientTrim.length,
      serverFullLen: serverFullRaw.length,
    };
  }

  if (!scanPremiumOutputForDevContextLeak(serverFullRaw).ok) {
    return {
      text: clientTrim,
      source: "document_text",
      adoptedServerFull: false,
      clientLen: clientTrim.length,
      serverFullLen: serverFullRaw.length,
    };
  }

  const substantive = isSubstantivePremiumServerFullDocument(serverFullRaw.length, args.effectiveFull);
  if (!substantive || serverFullRaw.length <= clientTrim.length) {
    return {
      text: clientTrim,
      source: "document_text",
      adoptedServerFull: false,
      clientLen: clientTrim.length,
      serverFullLen: serverFullRaw.length,
    };
  }

  const adopted = applyAcceptedProCorpusSafeDisplay(serverFullRaw, {
    draft: args.draft,
    intakeText: args.intakeText,
    surface:
      args.safeDisplaySurface ?? "premium_completion_pipeline:pre_validation_server_full_adopt",
  }).text.trim();

  if (adopted.length < clientTrim.length) {
    return {
      text: clientTrim,
      source: "document_text",
      adoptedServerFull: false,
      clientLen: clientTrim.length,
      serverFullLen: serverFullRaw.length,
    };
  }

  return {
    text: adopted,
    source: "server_full_document_text",
    adoptedServerFull: true,
    clientLen: clientTrim.length,
    serverFullLen: serverFullRaw.length,
  };
}
