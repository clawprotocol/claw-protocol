import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { readJson, resolveApiBase } from "../../lib/clawApi";
import type { PremiumFullDraftContextPayload } from "./premiumFullDraftApi";

export type PremiumMissingFactsResult = {
  questions: string[];
};

async function postOnce(args: {
  intakeText: string;
  context: PremiumFullDraftContextPayload;
}): Promise<PremiumMissingFactsResult> {
  const base = resolveApiBase().replace(/\/$/, "");
  const res = await fetch(`${base}/api/agreements/premium-missing-facts`, {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      intake_text: args.intakeText,
      context: args.context,
    }),
  });
  if (!res.ok) {
    return { questions: [] };
  }
  const j = await readJson<Record<string, unknown>>(res);
  const q = j.questions;
  if (!Array.isArray(q)) return { questions: [] };
  return {
    questions: q
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .slice(0, 5),
  };
}

/**
 * Pre–full-draft gap questions. Fail-open: returns { questions: [] } on any error.
 * Skipped in Vitest test mode.
 */
export async function postPremiumMissingFactsWithRetry(args: {
  intakeText: string;
  context: PremiumFullDraftContextPayload;
}): Promise<PremiumMissingFactsResult> {
  if (import.meta.env.MODE === "test") {
    return { questions: [] };
  }
  try {
    return await postOnce(args);
  } catch {
    return { questions: [] };
  }
}
