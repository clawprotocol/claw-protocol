import { apiUrl, errorMessageFromResponse, readJson } from "../lib/clawApi";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";

export type AwpSourceKind =
  | "agreement"
  | "draft"
  | "signed_record"
  | "upload"
  | "memory_result"
  | "timeline"
  | "document_analysis"
  | "field_review"
  | "workspace_context"
  | "other";

export type AwpSourceItem = {
  id: string;
  kind: AwpSourceKind;
  label: string;
  excerpt?: string | null;
};

export type AwpTemplateSection = { key: string; label: string };

export type AwpTemplate = {
  id: string;
  label: string;
  description: string;
  sections: AwpTemplateSection[];
};

export type AwpMetaResponse = {
  ok: boolean;
  schema: string;
  entitlement_tier: "none" | "limited" | "full";
  allowed_output_types: string[];
  templates: AwpTemplate[];
  disclaimer: string;
};

export type AwpSectionMetadata = {
  source_ids_used: string[];
  support_quality: "high" | "medium" | "low" | "minimal";
  unsupported_or_inferred: boolean;
  conflict_or_gap_notes: string | null;
};

export type AwpMaterialAssessment = {
  tier: string;
  agreement_source_count: number;
  substantive_excerpt_chars: number;
  recommendation: string | null;
};

export type AwpDocument = {
  id: string;
  org_id: string;
  created_at: string;
  updated_at: string;
  output_type: string;
  title: string | null;
  user_instructions: string | null;
  audience: string | null;
  objective: string | null;
  use_workspace_context: boolean;
  sources: AwpSourceItem[];
  sections: Record<string, string>;
  section_grounding: Record<string, string[]>;
  section_metadata?: Record<string, AwpSectionMetadata>;
  caveats: string | null;
  generation_model: string | null;
  is_assistive: boolean;
  disclaimer_version: string | null;
};

export const AWP_REFINE_MODES = [
  {
    id: "more_concise",
    label: "Tighten",
    hint: "Remove redundancy; keep hedges where evidence is weak.",
  },
  {
    id: "expand_analysis",
    label: "Deepen",
    hint: "More analysis and structure; stays within your source excerpts.",
  },
  {
    id: "strengthen_structure",
    label: "Restructure",
    hint: "Clearer flow: takeaway first, then supporting points.",
  },
  {
    id: "competing_views",
    label: "Contrast views",
    hint: "Surface tensions fairly; no forced resolution without sources.",
  },
  {
    id: "unanswered_questions",
    label: "Open questions",
    hint: "Emphasize what remains unsettled and what evidence would help.",
  },
] as const;

export type AwpRefineModeId = (typeof AWP_REFINE_MODES)[number]["id"];

function base(orgId: string): string {
  return `/v1/orgs/${encodeURIComponent(orgId)}/advanced-work-product`;
}

export async function fetchAwpMeta(orgId: string): Promise<AwpMetaResponse> {
  const url = apiUrl(`${base(orgId)}/meta`);
  const res = await fetch(url, { headers: clawAgreementHeaders() });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load work product settings."));
  return readJson<AwpMetaResponse>(res);
}

export async function fetchAwpDrafts(orgId: string): Promise<{ ok: boolean; drafts: unknown[] }> {
  const url = apiUrl(`${base(orgId)}/drafts`);
  const res = await fetch(url, { headers: clawAgreementHeaders() });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not list drafts."));
  return readJson(res);
}

export async function preflightAwp(
  orgId: string,
  body: { use_workspace_context: boolean; sources: AwpSourceItem[] },
): Promise<{ ok: boolean; material_assessment: AwpMaterialAssessment }> {
  const url = apiUrl(`${base(orgId)}/preflight`);
  const res = await fetch(url, {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Preflight failed."));
  return readJson(res);
}

export async function createAwpDraft(
  orgId: string,
  body: {
    output_type: string;
    title?: string | null;
    user_instructions?: string | null;
    audience?: string | null;
    objective?: string | null;
    use_workspace_context: boolean;
    sources: AwpSourceItem[];
  },
): Promise<{
  ok: boolean;
  document: AwpDocument;
  generation?: { used_llm: boolean; model: string | null };
  material_assessment?: AwpMaterialAssessment;
}> {
  const url = apiUrl(`${base(orgId)}/drafts`);
  const res = await fetch(url, {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Generation failed."));
  return readJson(res);
}

export async function getAwpDraft(orgId: string, docId: string): Promise<{ ok: boolean; document: AwpDocument }> {
  const url = apiUrl(`${base(orgId)}/drafts/${encodeURIComponent(docId)}`);
  const res = await fetch(url, { headers: clawAgreementHeaders() });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load draft."));
  return readJson(res);
}

export async function patchAwpDraft(
  orgId: string,
  docId: string,
  patch: {
    title?: string | null;
    sections?: Record<string, string>;
    section_grounding?: Record<string, string[]>;
    section_metadata?: Record<string, AwpSectionMetadata>;
    section_metadata_merge?: boolean;
    caveats?: string | null;
  },
): Promise<{ ok: boolean; document: AwpDocument }> {
  const url = apiUrl(`${base(orgId)}/drafts/${encodeURIComponent(docId)}`);
  const res = await fetch(url, {
    method: "PATCH",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not save changes."));
  return readJson(res);
}

export async function refineAwpSection(
  orgId: string,
  docId: string,
  body: { section_key: string; mode: AwpRefineModeId | string },
): Promise<{
  ok: boolean;
  document: AwpDocument;
  refinement?: { used_llm: boolean; model: string | null; mode: string };
}> {
  const url = apiUrl(`${base(orgId)}/drafts/${encodeURIComponent(docId)}/refine-section`);
  const res = await fetch(url, {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Refinement failed."));
  return readJson(res);
}

export function documentToMarkdown(doc: AwpDocument): string {
  const lines: string[] = [`# ${doc.title || doc.output_type}`, "", `> Assistive work product generated from selected CLAW sources — not a proof or signed record.`, ""];
  const tmpl = doc.output_type;
  lines.push(`- **Type:** ${tmpl}`);
  lines.push(`- **Generated:** ${doc.created_at}`);
  lines.push(`- **Updated:** ${doc.updated_at}`);
  lines.push("");
  lines.push("## Sources");
  if (doc.sources?.length) {
    doc.sources.forEach((s) => {
      lines.push(`- **${s.label}** (\`${s.kind}\` · \`${s.id}\`)`);
    });
  } else {
    lines.push("- _(none attached)_");
  }
  lines.push("");
  if (doc.caveats) {
    lines.push("## Caveats");
    lines.push(doc.caveats);
    lines.push("");
  }
  for (const [k, v] of Object.entries(doc.sections || {})) {
    lines.push(`## ${k.replace(/_/g, " ")}`);
    lines.push(String(v || "").trim() || "_(empty)_");
    lines.push("");
  }
  const exportedAt = new Date().toISOString();
  lines.push("---");
  lines.push("");
  lines.push(
    `_CLAW assistive draft · Assembled from user-selected workspace sources (${doc.sources?.length ?? 0} attached). ` +
      `Output type: \`${doc.output_type}\`. First generated \`${doc.created_at}\`, last updated \`${doc.updated_at}\`, exported \`${exportedAt}\`. ` +
      `This file is not a cryptographic proof, verifier artifact, or formal legal determination._`,
  );
  lines.push("");
  return lines.join("\n");
}
