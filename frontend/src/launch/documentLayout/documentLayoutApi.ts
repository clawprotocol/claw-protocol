import { apiUrl, errorMessageFromResponse, readJson } from "../../lib/clawApi";
import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";

export type LayoutBboxNormalized = {
  x: number;
  y: number;
  width: number;
  height: number;
  space?: string;
};

export type LayoutFieldCandidateEnriched = {
  candidate_id: string;
  page_number: number;
  field_type_guess: string;
  review_state: string;
  confidence?: number;
  geometry_confidence?: number;
  confidence_score?: number;
  effective_confidence?: number;
  confidence_band?: "high" | "medium" | "low";
  placement_threshold?: number;
  meets_placement_threshold?: boolean;
  critical_field?: boolean;
  low_confidence?: boolean;
  auto_usable?: boolean;
  ambiguous_overlap?: boolean;
  review_required?: boolean;
  safety_reason?: string;
  safety_reasons?: string[];
  ux_label?: string;
  confidence_user_guidance?: string;
  label_text?: string | null;
  nearby_text_context?: string;
  line_text_snippet?: string;
  bbox_normalized: LayoutBboxNormalized;
  bbox_pdf?: Record<string, number>;
  user_field_type?: string | null;
  user_label?: string | null;
  signer_role?: string | null;
};

export type ManualLayoutField = {
  manual_field_id: string;
  review_state: string;
  page_number: number;
  bbox_normalized: LayoutBboxNormalized;
  field_type: string;
  label?: string;
  signer_role?: string;
};

export type SigningReadiness = {
  signing_ready?: boolean;
  headline?: string;
  handoff_line?: string;
  summary_messages?: string[];
  readiness_highlights?: string[];
  blocking_prompts?: string[];
  role_clarity_note?: string;
  unknown_role_placement_count?: number;
  critical_ready_unknown_role_count?: number;
  placement_ready_count?: number;
  review_required_unresolved_count?: number;
  critical_fields_missing_count?: number;
  critical_types_unconfirmed?: string[];
  blockers?: string[];
};

export type LayoutAnalysisResponse = {
  ok: boolean;
  analysis_id?: string;
  document_id_ref?: string | null;
  page_count?: number;
  layout_confidence_summary?: {
    policy_version?: number;
    low_confidence_count?: number;
    critical_review_required_count?: number;
    auto_usable_count?: number;
    ambiguous_overlap_count?: number;
  };
  field_candidates_enriched?: LayoutFieldCandidateEnriched[];
  manual_fields?: ManualLayoutField[];
  downstream_field_manifest?: {
    field_count: number;
    fields: unknown[];
    disclaimer?: string;
    blocked_by_confidence_previously?: number;
  };
  signing_readiness?: SigningReadiness;
  [key: string]: unknown;
};

export type ReviewAction = {
  action: "confirm" | "correct" | "reject" | "add_manual" | "reject_manual";
  candidate_id?: string;
  manual_field_id?: string;
  field_type?: string;
  label?: string;
  page_number?: number;
  bbox_normalized?: LayoutBboxNormalized;
  acknowledge_low_confidence?: boolean;
  signer_role?: string;
};

export async function fetchLayoutAnalysis(analysisId: string): Promise<LayoutAnalysisResponse> {
  const res = await fetch(
    apiUrl(`/v1/document-layout/analysis/${encodeURIComponent(analysisId)}`),
    { headers: clawAgreementHeaders() },
  );
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load layout analysis."));
  return readJson<LayoutAnalysisResponse>(res);
}

export async function postFieldReviewOpen(analysisId: string): Promise<void> {
  const res = await fetch(
    apiUrl(`/v1/document-layout/analysis/${encodeURIComponent(analysisId)}/field-review/open`),
    { method: "POST", headers: clawAgreementHeaders() },
  );
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not open field review."));
}

export async function putReviewManifest(
  analysisId: string,
  actions: ReviewAction[],
): Promise<LayoutAnalysisResponse> {
  const res = await fetch(apiUrl(`/v1/document-layout/analysis/${encodeURIComponent(analysisId)}/review-manifest`), {
    method: "PUT",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ actions }),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not save review."));
  return readJson<LayoutAnalysisResponse>(res);
}
