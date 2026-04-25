/** Session-stored payment intent (stub — no processor). Mirrors draft `payment_request` on API. */

export type PaymentRequestPayload = {
  amount: string;
  type: "fixed" | "percentage";
  payer: "party_a" | "party_b";
  condition: "before_signing" | "after_signing";
};

export const emptyPaymentRequest = (): PaymentRequestPayload => ({
  amount: "",
  type: "fixed",
  payer: "party_a",
  condition: "before_signing",
});

export function normalizePaymentRequestFromApi(raw: unknown): PaymentRequestPayload | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const amount = String(r.amount ?? "").trim();
  const typeRaw = String(r.type ?? "fixed").toLowerCase();
  const type: PaymentRequestPayload["type"] = typeRaw === "percentage" ? "percentage" : "fixed";
  const payerRaw = String(r.payer ?? "party_a").toLowerCase();
  const payer: PaymentRequestPayload["payer"] = payerRaw === "party_b" ? "party_b" : "party_a";
  const condRaw = String(r.condition ?? "before_signing").toLowerCase();
  const condition: PaymentRequestPayload["condition"] =
    condRaw === "after_signing" ? "after_signing" : "before_signing";
  if (!amount) return null;
  return { amount, type, payer, condition };
}

export function hydratePaymentFormFromApi(raw: unknown): PaymentRequestPayload {
  return normalizePaymentRequestFromApi(raw) ?? emptyPaymentRequest();
}

/** Detect “1% success fee” style hints from free text. */
export function inferPaymentPercentageHint(paymentTerms: string, purpose: string): {
  percent: string;
  suggestionLabel: string;
} | null {
  const blob = `${paymentTerms || ""} ${purpose || ""}`;
  const m = blob.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  return {
    percent: m[1],
    suggestionLabel: `${m[1]}% of deal value (optional tracking)`,
  };
}
