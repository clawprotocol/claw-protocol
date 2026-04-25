/** Short progression hint — use next to proof surfaces for consistency. */
export const PROOF_LADDER_SUBTITLE = "Recorded → Ready to verify → Anchored externally";

/** Single calm message under the proof card (primary surface). */
export const PROOF_CARD_MICRO_TRUST =
  "Recorded in LawDog now. You can verify this record independently. External anchoring is optional and may finish later — it is not required for your record to exist and is not legal advice.";

/** Secondary line under the Recorded row (timestamp or fallback). */
export function proofRecordedRowSecondary(
  recordedLabel: string | null,
  recordedComplete: boolean
): string {
  if (recordedLabel) return recordedLabel;
  if (recordedComplete) return "Saved in LawDog.";
  return "Not on file yet.";
}

/** Secondary line under the “Ready to verify” row. */
export function proofVerifiableRowDetail(status: "ready" | "processing" | "unavailable"): string {
  switch (status) {
    case "ready":
      return "You can check this record yourself — no trust in us required for the check.";
    case "processing":
      return "Verify materials are preparing…";
    case "unavailable":
    default:
      return "Not ready yet.";
  }
}

/** Secondary line under the “Anchored externally” row. */
export function proofAnchorRowDetail(
  status:
    | "not_started"
    | "available"
    | "queued"
    | "pending"
    | "confirmed"
    | "failed"
): string {
  switch (status) {
    case "not_started":
      return "Optional external timestamp — not required for your record.";
    case "available":
      return "Optional anchoring available if you choose it.";
    case "queued":
      return "Queued for external anchoring…";
    case "pending":
      return "External anchoring in progress…";
    case "confirmed":
      return "Anchored externally — complete.";
    case "failed":
      return "Anchoring did not complete — your LawDog record still stands.";
    default:
      return "Optional external timestamp — not required for your record.";
  }
}

/** Row title is “Ready to verify” — pills are short state, not a repeat of the title. */
export function proofVerifiablePill(status: "ready" | "processing" | "unavailable"): string {
  switch (status) {
    case "ready":
      return "Yes";
    case "processing":
      return "Preparing";
    case "unavailable":
    default:
      return "Waiting";
  }
}

export function proofAnchorPill(
  status:
    | "not_started"
    | "available"
    | "queued"
    | "pending"
    | "confirmed"
    | "failed"
): string {
  switch (status) {
    case "confirmed":
      return "Yes";
    case "queued":
    case "pending":
      return "In progress";
    case "failed":
      return "Issue";
    case "available":
      return "Optional";
    case "not_started":
    default:
      return "—";
  }
}

/** Tucked under “View details” — slightly more literal. */
export function proofVerificationDetailTechnical(status: "ready" | "processing" | "unavailable"): string {
  switch (status) {
    case "ready":
      return "Verification package available";
    case "processing":
      return "Verification package preparing";
    case "unavailable":
    default:
      return "Not available yet";
  }
}

export function proofAnchorDetailTechnical(
  status:
    | "not_started"
    | "available"
    | "queued"
    | "pending"
    | "confirmed"
    | "failed"
): string {
  switch (status) {
    case "not_started":
      return "No external anchor requested";
    case "available":
      return "External anchor available (optional)";
    case "queued":
      return "Queued for external network";
    case "pending":
      return "External network pending";
    case "confirmed":
      return "Confirmed on external network";
    case "failed":
      return "External anchoring did not complete";
    default:
      return "No external anchor requested";
  }
}
