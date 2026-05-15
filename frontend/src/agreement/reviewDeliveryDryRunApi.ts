import { apiUrl } from "../lib/clawApi";
import { clawAgreementHeaders } from "./agreementOrgHeaders";

export type ReviewDeliveryDryRunPayload = {
  to: string;
  party_name: string;
  reviewer_name: string;
  agreement_title: string;
  review_url: string | null;
};

export type ReviewDeliveryDryRunResponse = {
  review_delivery_mode: string;
  payload_count: number;
  payloads: ReviewDeliveryDryRunPayload[];
};

export async function postReviewDeliveryDryRun(agreementId: string): Promise<ReviewDeliveryDryRunResponse | null> {
  const id = (agreementId || "").trim();
  if (!id) return null;
  try {
    const res = await fetch(
      apiUrl(`/api/agreements/${encodeURIComponent(id)}/review-delivery-dry-run`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...clawAgreementHeaders() },
        body: "{}",
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as ReviewDeliveryDryRunResponse;
  } catch {
    return null;
  }
}
