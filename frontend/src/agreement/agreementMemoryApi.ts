import { apiUrl } from "../lib/clawApi";
import { clawAgreementHeaders } from "./agreementOrgHeaders";

export type AgreementMemoryTier = "none" | "standard" | "full";

export type AgreementMemoryStatus = {
  tier: AgreementMemoryTier;
  semantic_search: boolean;
  similar_agreements: boolean;
  clause_reuse_hints: boolean;
  relationship_view: boolean;
  embedding_configured: boolean;
  indexed_document_count?: number;
  last_sync_at?: string | null;
  index_health?: "empty" | "synced" | "needs_sync" | string;
};

export type MemorySearchResult = {
  agreement_id: string;
  title: string | null;
  status: string | null;
  match_score: number;
  reason: string;
  related_parties: string[];
  relevant_clauses: string[];
  ai_summary: string | null;
  memory_updated_at?: string | null;
  version_count?: number;
  linked_timeline_id?: string | null;
  timeline_available?: boolean;
  actions: { open: string; compare: string; timeline: string | null };
};

export type MemoryPaywallError = {
  paywall: true;
  code: string;
  message: string;
};

function parseDetail(res: Response, raw: unknown): MemoryPaywallError | null {
  if (res.status !== 403 || !raw || typeof raw !== "object") return null;
  const d = raw as { detail?: unknown };
  const det = d.detail;
  if (!det || typeof det !== "object") return null;
  const o = det as Record<string, unknown>;
  if (o.code === "agreement_memory_paywall" && o.paywall === true) {
    return {
      paywall: true,
      code: String(o.code),
      message: typeof o.message === "string" ? o.message : "",
    };
  }
  return null;
}

export async function fetchAgreementMemoryStatus(): Promise<{
  ok: boolean;
  data?: AgreementMemoryStatus;
  error?: string;
}> {
  try {
    const res = await fetch(apiUrl("/api/agreement-memory/status"), {
      headers: clawAgreementHeaders(),
    });
    const raw = (await res.json()) as AgreementMemoryStatus & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return {
      ok: true,
      data: {
        tier: (raw.tier as AgreementMemoryTier) || "none",
        semantic_search: !!raw.semantic_search,
        similar_agreements: !!raw.similar_agreements,
        clause_reuse_hints: !!raw.clause_reuse_hints,
        relationship_view: !!raw.relationship_view,
        embedding_configured: !!raw.embedding_configured,
        indexed_document_count: Number(raw.indexed_document_count) || 0,
        last_sync_at: raw.last_sync_at ?? null,
        index_health: raw.index_health,
      },
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function postAgreementMemorySearch(
  query: string,
  limit = 12
): Promise<
  | { ok: true; results: MemorySearchResult[]; note?: string; model?: string }
  | { ok: false; error: string; paywall?: MemoryPaywallError }
> {
  try {
    const res = await fetch(apiUrl("/api/agreement-memory/search"), {
      method: "POST",
      headers: { ...clawAgreementHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim(), limit }),
    });
    const raw = (await res.json()) as {
      detail?: unknown;
      results?: MemorySearchResult[];
      note?: string;
      model?: string;
    };
    const pw = parseDetail(res, raw);
    if (pw) return { ok: false, error: pw.message, paywall: pw };
    if (!res.ok) {
      const msg =
        typeof raw.detail === "string"
          ? raw.detail
          : `Search failed (HTTP ${res.status})`;
      return { ok: false, error: msg };
    }
    return {
      ok: true,
      results: Array.isArray(raw.results) ? raw.results : [],
      note: raw.note,
      model: raw.model,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function postAgreementMemoryReindex(): Promise<
  | { ok: true; indexed: number; last_sync_at?: string | null; errors: string[] }
  | { ok: false; error: string; paywall?: MemoryPaywallError }
> {
  try {
    const res = await fetch(apiUrl("/api/agreement-memory/reindex-workspace"), {
      method: "POST",
      headers: clawAgreementHeaders(),
    });
    const raw = (await res.json()) as {
      detail?: unknown;
      ok?: boolean;
      indexed?: number;
      last_sync_at?: string | null;
      errors?: string[];
    };
    const pw = parseDetail(res, raw);
    if (pw) return { ok: false, error: pw.message, paywall: pw };
    if (!res.ok) {
      return { ok: false, error: `Sync failed (HTTP ${res.status})` };
    }
    return {
      ok: true,
      indexed: Number(raw.indexed) || 0,
      last_sync_at: raw.last_sync_at ?? null,
      errors: Array.isArray(raw.errors) ? raw.errors : [],
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export type SimilarAgreementRow = {
  agreement_id: string;
  title: string | null;
  status: string | null;
  match_score: number;
  reason: string;
};

export async function postAgreementMemorySimilar(
  agreementId: string,
  limit = 8
): Promise<
  | { ok: true; similar: SimilarAgreementRow[]; model?: string }
  | { ok: false; error: string; paywall?: MemoryPaywallError }
> {
  try {
    const res = await fetch(
      apiUrl(
        `/api/agreement-memory/similar/${encodeURIComponent(agreementId)}?limit=${encodeURIComponent(String(limit))}`
      ),
      { method: "POST", headers: clawAgreementHeaders() }
    );
    const raw = (await res.json()) as {
      detail?: unknown;
      similar?: SimilarAgreementRow[];
      model?: string;
    };
    const pw = parseDetail(res, raw);
    if (pw) return { ok: false, error: pw.message, paywall: pw };
    if (!res.ok) {
      return { ok: false, error: `Similar search failed (HTTP ${res.status})` };
    }
    return {
      ok: true,
      similar: Array.isArray(raw.similar) ? raw.similar : [],
      model: raw.model,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export type WorkspaceClauseTheme = { tag: string; count: number };

export type IndexedAgreementSummary = {
  agreement_id: string;
  title: string | null;
  status: string | null;
  party_count: number;
  top_clauses: string[];
};

export type RelationshipFocusPanel = {
  agreement_id: string;
  title: string | null;
  status: string | null;
  related_parties: string[];
  clause_tags: string[];
  versions: string[];
  versions_count: number;
  linked_timeline_id?: string | null;
  timeline_has_activity: boolean;
  timeline_verify_path: string;
  memory_updated_at?: string | null;
  receipt_links: string[];
};

export type RelatedAgreementMemoryRow = {
  agreement_id: string;
  title: string | null;
  status: string | null;
  shared_parties: string[];
};

export type AgreementMemoryRelationshipsPayload = {
  disclaimer?: string;
  workspace_clause_themes: WorkspaceClauseTheme[];
  indexed_agreements: IndexedAgreementSummary[];
  focus?: RelationshipFocusPanel;
  related_agreements?: RelatedAgreementMemoryRow[];
};

export async function fetchAgreementMemoryRelationships(
  forAgreementId?: string | null
): Promise<
  { ok: true; data: AgreementMemoryRelationshipsPayload } | { ok: false; error: string; paywall?: MemoryPaywallError }
> {
  try {
    const q = forAgreementId?.trim()
      ? `?for_agreement_id=${encodeURIComponent(forAgreementId.trim())}`
      : "";
    const res = await fetch(apiUrl(`/api/agreement-memory/relationships${q}`), {
      headers: clawAgreementHeaders(),
    });
    const raw = (await res.json()) as { detail?: unknown } & AgreementMemoryRelationshipsPayload;
    const pw = parseDetail(res, raw);
    if (pw) return { ok: false, error: pw.message, paywall: pw };
    if (!res.ok) {
      return { ok: false, error: `Relationships failed (HTTP ${res.status})` };
    }
    return {
      ok: true,
      data: {
        disclaimer: raw.disclaimer,
        workspace_clause_themes: Array.isArray(raw.workspace_clause_themes) ? raw.workspace_clause_themes : [],
        indexed_agreements: Array.isArray(raw.indexed_agreements) ? raw.indexed_agreements : [],
        focus: raw.focus,
        related_agreements: Array.isArray(raw.related_agreements) ? raw.related_agreements : [],
      },
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
