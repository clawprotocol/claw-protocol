import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";

/** First candidate that is long enough to persist as a paid review-first draft row. */
export function resolveLongestPersistablePaidCorpus(candidates: Array<string | null | undefined>): string {
  let best = "";
  for (const raw of candidates) {
    const text = (raw || "").trim();
    if (text.length >= PAID_PRO_AUTHORITY_MIN_LEN && text.length > best.length) {
      best = text;
    }
  }
  return best;
}

export function buildMinimalDraftForPaidPersist(args: {
  corpusPlain: string;
  party1Name: string;
  party2Name: string;
  party1Email?: string;
  party2Email?: string;
  title?: string;
}): ParsedDraftShape | null {
  const corpusPlain = args.corpusPlain.trim();
  if (corpusPlain.length < PAID_PRO_AUTHORITY_MIN_LEN) return null;
  return {
    title: args.title || "Services Agreement",
    jurisdiction: "",
    parties: [
      { name: args.party1Name || "Party 1", role: "Party", email: args.party1Email || "" },
      { name: args.party2Name || "Party 2", role: "Party", email: args.party2Email || "" },
    ],
    purpose: corpusPlain,
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
    premium_full_document_text: corpusPlain,
    premium_server_full_document_text: corpusPlain,
  };
}
