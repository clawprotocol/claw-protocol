/**
 * Groups instruction-intent rows into calm semantic buckets for default signer UI.
 */

import type { RecipientInstructionIntent, RecipientInstructionIntentCategory } from "./recipientInstructionIntents";

export type IntentSemanticBucketKey =
  | "payment_terms"
  | "scope_deliverables"
  | "ownership_ip"
  | "acceptance_review"
  | "timeline_protections"
  | "third_party_risk"
  | "other";

const CATEGORY_TO_BUCKET: Partial<Record<RecipientInstructionIntentCategory, IntentSemanticBucketKey>> = {
  payment_timing: "payment_terms",
  late_fee: "payment_terms",
  scope_change_management: "scope_deliverables",
  delivery_timeline: "timeline_protections",
  client_delay_timeline: "timeline_protections",
  ip_ownership: "ownership_ip",
  acceptance_criteria: "acceptance_review",
  defect_correction_period: "acceptance_review",
  suspend_pause_work: "timeline_protections",
  third_party_services: "third_party_risk",
  post_launch_support: "acceptance_review",
  termination: "other",
  governing_law: "other",
  confidentiality: "other",
  signature_execution: "other",
  notices: "other",
  dispute_process: "other",
  uncategorized: "other",
};

const BUCKET_ORDER: IntentSemanticBucketKey[] = [
  "payment_terms",
  "scope_deliverables",
  "ownership_ip",
  "acceptance_review",
  "timeline_protections",
  "third_party_risk",
  "other",
];

const BUCKET_LABEL: Record<IntentSemanticBucketKey, string> = {
  payment_terms: "Payment terms",
  scope_deliverables: "Scope and deliverables",
  ownership_ip: "Ownership and IP",
  acceptance_review: "Acceptance and review process",
  timeline_protections: "Timeline and delay protections",
  third_party_risk: "Third-party and platform risk",
  other: "Other requested updates",
};

export type IntentSemanticBucketRow = {
  key: IntentSemanticBucketKey;
  label: string;
  applied: number;
  pending: number;
  failed: number;
};

export function buildIntentSemanticBucketRows(intents: readonly RecipientInstructionIntent[]): IntentSemanticBucketRow[] {
  const acc = new Map<
    IntentSemanticBucketKey,
    { applied: number; pending: number; failed: number }
  >();
  for (const k of BUCKET_ORDER) {
    acc.set(k, { applied: 0, pending: 0, failed: 0 });
  }
  for (const it of intents) {
    const bk = CATEGORY_TO_BUCKET[it.category] ?? "other";
    const cur = acc.get(bk)!;
    if (it.status === "applied") cur.applied++;
    else if (it.status === "failed") cur.failed++;
    else cur.pending++;
  }
  const rows: IntentSemanticBucketRow[] = [];
  for (const key of BUCKET_ORDER) {
    const c = acc.get(key)!;
    if (c.applied + c.pending + c.failed === 0) continue;
    rows.push({
      key,
      label: BUCKET_LABEL[key],
      applied: c.applied,
      pending: c.pending,
      failed: c.failed,
    });
  }
  return rows.slice(0, 8);
}
