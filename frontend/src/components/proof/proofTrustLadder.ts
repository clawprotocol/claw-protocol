/** Short progression hint — use next to proof surfaces for consistency. */
export const PROOF_LADDER_SUBTITLE = "Recorded → Ready to verify → Timestamped";

/** Single calm message under the proof card (primary surface). */
export const PROOF_CARD_MICRO_TRUST =
  "Saved in LawDog now. Optional public blockchain timestamping may be added later.";

/** Secondary line under the Recorded row (timestamp or fallback). */
export function proofRecordedRowSecondary(
  recordedLabel: string | null,
  recordedComplete: boolean
): string {
  if (recordedLabel) return recordedLabel;
  if (recordedComplete) return "Saved in LawDog.";
  return "Not on file yet.";
}

/** Secondary line under the \u201cReady to verify\u201d row. */
export function proofVerifiableRowDetail(status: "ready" | "processing" | "unavailable"): string {
  switch (status) {
    case "ready":
      return "You can check this record yourself \u2014 no trust in us required for the check.";
    case "processing":
      return "Verify materials are preparing\u2026";
    case "unavailable":
    default:
      return "Not ready yet.";
  }
}

/** Secondary line under the \u201cTimestamped\u201d row. */
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
      return "Optional \u2014 not required for your record.";
    case "available":
      return "Optional timestamping available if you choose it.";
    case "queued":
      return "Queued for timestamping\u2026";
    case "pending":
      return "Timestamping in progress\u2026";
    case "confirmed":
      return "Timestamped \u2014 complete.";
    case "failed":
      return "Timestamping did not complete \u2014 your LawDog record still stands.";
    default:
      return "Optional \u2014 not required for your record.";
  }
}

/** Row title is \u201cReady to verify\u201d \u2014 pills are short state, not a repeat of the title. */
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
      return "\u2014";
  }
}

/** Tucked under \u201cView details\u201d \u2014 slightly more literal. */
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
      return "No external timestamp requested";
    case "available":
      return "External timestamping available (optional)";
    case "queued":
      return "Queued for external network";
    case "pending":
      return "External network pending";
    case "confirmed":
      return "Confirmed on external network";
    case "failed":
      return "Timestamping did not complete";
    default:
      return "No external timestamp requested";
  }
}
