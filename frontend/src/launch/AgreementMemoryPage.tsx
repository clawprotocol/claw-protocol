import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { useLaunchNav } from "./LaunchNavContext";
import { triggerPaywall } from "./triggerPaywall";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { postDraftFromPriorAgreement, fetchAgreementDraft } from "../agreement/agreementWorkspaceApi";
import {
  fetchAgreementMemoryRelationships,
  fetchAgreementMemoryStatus,
  postAgreementMemoryReindex,
  postAgreementMemorySearch,
  postAgreementMemorySimilar,
  type AgreementMemoryRelationshipsPayload,
  type AgreementMemoryStatus,
  type MemorySearchResult,
  type SimilarAgreementRow,
} from "../agreement/agreementMemoryApi";
import { usePowerGatedNavigation } from "../monetization/usePowerGatedNavigation";

const SAMPLE_PROMPTS = [
  "Find unsigned contractor agreements",
  "What clauses do I usually use for late payment?",
  "Show every agreement related to Acme Corp",
  "Find contracts with arbitration clauses",
  "Late payment and termination terms",
];

const NO_RESULT_ALTERNATES = [
  "payment terms Net 30",
  "consulting services scope",
  "California governing law",
];

const PAYWALL_LINES = {
  headline: "Remember & reuse — the searchable half of your ladder.",
  body: "Agreement Memory is how paid plans turn a pile of sends into something you can query and branch from. Upgrade to unlock meaning-first search and reuse.",
  cta: "Upgrade for memory & reuse",
};

function useMemorySearchParams(search: string) {
  return useMemo(() => {
    const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    return {
      similarTo: (q.get("similarTo") || "").trim() || null,
      fromDraft: (q.get("fromDraft") || "").trim() || null,
    };
  }, [search]);
}

function formatTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function AgreementMemoryPage() {
  const { navigate, search } = useLaunchNav();
  const { navigateToWorkProduct } = usePowerGatedNavigation();
  const { similarTo: similarSeedId, fromDraft: fromDraftId } = useMemorySearchParams(search);
  const openedLogged = useRef(false);
  const emptySeenLogged = useRef(false);
  const lastNoResultsQuery = useRef<string | null>(null);

  const [status, setStatus] = useState<AgreementMemoryStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [similarFor, setSimilarFor] = useState<string | null>(null);
  const [similarRows, setSimilarRows] = useState<SimilarAgreementRow[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);

  const [relOpen, setRelOpen] = useState(false);
  const [relLoading, setRelLoading] = useState(false);
  const [relData, setRelData] = useState<AgreementMemoryRelationshipsPayload | null>(null);
  const [relError, setRelError] = useState<string | null>(null);
  const [relFocusId, setRelFocusId] = useState<string | null>(null);

  const [hasQueried, setHasQueried] = useState(false);
  const [reuseBusyId, setReuseBusyId] = useState<string | null>(null);
  const [draftContextTitle, setDraftContextTitle] = useState<string | null>(null);

  const premium = status && status.tier !== "none";

  const loadStatus = useCallback(async () => {
    setStatusError(null);
    const s = await fetchAgreementMemoryStatus();
    if (!s.ok || !s.data) {
      setStatusError(s.error || "Could not load Agreement Memory status.");
      setStatus(null);
      return;
    }
    setStatus(s.data);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (openedLogged.current) return;
    openedLogged.current = true;
    logProductEvent("agreement_memory_opened", { fromDraft: fromDraftId, similarSeed: similarSeedId });
  }, [fromDraftId, similarSeedId]);

  useEffect(() => {
    if (!fromDraftId || !premium) return;
    let cancel = false;
    void (async () => {
      const r = await fetchAgreementDraft(fromDraftId);
      if (cancel) return;
      const t = (r.draft?.title || "").trim();
      setDraftContextTitle(t || null);
    })();
    return () => {
      cancel = true;
    };
  }, [fromDraftId, premium]);

  useEffect(() => {
    if (
      !emptySeenLogged.current &&
      premium &&
      status?.embedding_configured &&
      !hasQueried &&
      results.length === 0 &&
      !searching
    ) {
      emptySeenLogged.current = true;
      logProductEvent("memory_empty_state_seen", { indexed: status?.indexed_document_count ?? 0 });
    }
  }, [premium, status?.embedding_configured, status?.indexed_document_count, hasQueried, results.length, searching]);

  useEffect(() => {
    if (!premium || !similarSeedId || !status?.embedding_configured) return;
    let cancel = false;
    setSimilarFor(similarSeedId);
    setSimilarLoading(true);
    setSimilarError(null);
    void (async () => {
      const r = await postAgreementMemorySimilar(similarSeedId);
      if (cancel) return;
      setSimilarLoading(false);
      if (!r.ok) {
        if (r.paywall) {
          triggerPaywall({ code: r.paywall.code, surface: "agreement_memory_similar" });
        }
        setSimilarError(r.error);
        setSimilarRows([]);
        return;
      }
      setSimilarRows(r.similar);
      logProductEvent("similar_agreement_requested", {
        agreement_id: similarSeedId,
        surface: "url_seed",
        count: r.similar.length,
      });
    })();
    return () => {
      cancel = true;
    };
  }, [premium, similarSeedId, status?.embedding_configured]);

  const runSearch = async (rawQuery: string) => {
    const q = rawQuery.trim();
    if (!q) return;

    if (!premium) {
      logProductEvent("memory_paywall_shown", { surface: "search_attempt" });
      triggerPaywall({
        code: "agreement_memory_paywall",
        surface: "agreement_memory_search",
      });
      return;
    }

    logProductEvent("agreement_memory_query_submitted", {
      qlen: q.length,
    });
    setSearching(true);
    setSearchError(null);
    setSearchNote(null);
    const r = await postAgreementMemorySearch(q);
    setSearching(false);
    if (!r.ok) {
      if (r.paywall) {
        logProductEvent("memory_paywall_shown", { surface: "search_api" });
        triggerPaywall({ code: r.paywall.code, surface: "agreement_memory_search" });
      }
      setSearchError(r.error);
      setResults([]);
      setHasQueried(true);
      return;
    }
    setResults(r.results);
    setSearchNote(r.note ?? null);
    setHasQueried(true);
    if (r.results.length === 0 && lastNoResultsQuery.current !== q) {
      lastNoResultsQuery.current = q;
      logProductEvent("memory_no_results_seen", { qlen: q.length });
    }
  };

  const onSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(query);
  };

  const onSync = async () => {
    if (!premium) {
      logProductEvent("memory_paywall_shown", { surface: "sync_attempt" });
      triggerPaywall({ code: "agreement_memory_paywall", surface: "agreement_memory_sync" });
      return;
    }
    logProductEvent("memory_sync_requested", {});
    setSyncing(true);
    setSyncMessage(null);
    const r = await postAgreementMemoryReindex();
    setSyncing(false);
    if (!r.ok) {
      if (r.paywall) {
        logProductEvent("memory_paywall_shown", { surface: "sync_api" });
        triggerPaywall({ code: r.paywall.code, surface: "agreement_memory_sync" });
      }
      setSyncMessage(r.error);
      return;
    }
    const errPart = r.errors.length ? ` Notes: ${r.errors.slice(0, 2).join("; ")}` : "";
    setSyncMessage(
      `Workspace synced to Agreement Memory: ${r.indexed} document(s).${errPart} Assistive index only — proof records unchanged.`
    );
    await loadStatus();
  };

  const openResult = (row: MemorySearchResult | SimilarAgreementRow, action: string) => {
    logProductEvent("agreement_memory_result_clicked", {
      agreement_id: row.agreement_id,
      action,
    });
    navigate(`/app/agreements/${encodeURIComponent(row.agreement_id)}`);
  };

  const onFindSimilar = async (agreementId: string) => {
    if (!premium) {
      logProductEvent("memory_paywall_shown", { surface: "similar_button" });
      triggerPaywall({ code: "agreement_memory_paywall", surface: "similar" });
      return;
    }
    logProductEvent("similar_agreement_requested", { agreement_id: agreementId, surface: "memory_page" });
    setSimilarFor(agreementId);
    setSimilarLoading(true);
    setSimilarError(null);
    const r = await postAgreementMemorySimilar(agreementId);
    setSimilarLoading(false);
    if (!r.ok) {
      if (r.paywall) {
        logProductEvent("memory_paywall_shown", { surface: "similar_api" });
        triggerPaywall({ code: r.paywall.code, surface: "similar" });
      }
      setSimilarError(r.error);
      setSimilarRows([]);
      return;
    }
    setSimilarRows(r.similar);
  };

  const onReuseFromPrior = async (sourceId: string) => {
    if (!premium) {
      logProductEvent("memory_paywall_shown", { surface: "reuse_prior" });
      triggerPaywall({ code: "agreement_memory_paywall", surface: "reuse_prior" });
      return;
    }
    logProductEvent("start_from_similar_clicked", { agreement_id: sourceId });
    setReuseBusyId(sourceId);
    const r = await postDraftFromPriorAgreement(sourceId);
    setReuseBusyId(null);
    if (!r.ok || !r.newAgreementId) {
      setSearchError(r.error || "Could not create draft from prior agreement.");
      return;
    }
    navigate(`/app/agreements/${encodeURIComponent(r.newAgreementId)}`);
  };

  const fetchRelationshipsPanel = async (focusId: string | null) => {
    if (!status?.relationship_view) {
      logProductEvent("memory_paywall_shown", { surface: "relationships_gate" });
      triggerPaywall({ code: "agreement_memory_paywall", surface: "relationship_view" });
      return;
    }
    setRelOpen(true);
    setRelLoading(true);
    setRelError(null);
    logProductEvent("relationship_view_opened", { focus: focusId });
    const r = await fetchAgreementMemoryRelationships(focusId);
    setRelLoading(false);
    if (!r.ok) {
      if (r.paywall) {
        logProductEvent("memory_paywall_shown", { surface: "relationships_api" });
        triggerPaywall({ code: r.paywall.code, surface: "relationship_view" });
      }
      setRelError(r.error);
      setRelData(null);
      return;
    }
    setRelData(r.data);
  };

  const closeRelPanel = () => {
    setRelOpen(false);
    setRelData(null);
    setRelError(null);
  };

  const indexHint =
    status?.index_health === "needs_sync"
      ? "Memory may be stale — run a workspace sync for best results."
      : status?.index_health === "empty"
        ? "Sync indexes your current workspace drafts into Agreement Memory (separate from proof storage)."
        : null;

  return (
    <AppShell
      title="Agreement Memory"
      subtitle="The remember & reuse step: search by meaning across saved work, then branch into the next deal — index is assistive; proofs stay on canonical records."
    >
      {statusError ? (
        <div
          className="mb-4 rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          {statusError}
        </div>
      ) : null}

      {!premium && status ? (
        <div className="mb-6 rounded-lg border border-slate-700/80 bg-slate-950/50 px-4 py-4 text-sm text-slate-300">
          <p className="font-medium text-slate-100">{PAYWALL_LINES.headline}</p>
          <p className="mt-2 text-slate-400">{PAYWALL_LINES.body}</p>
          <p className="mt-1 text-slate-500">{PAYWALL_LINES.cta}</p>
          <button
            type="button"
            className="vs01-btn vs01-btn--primary mt-3"
            onClick={() => {
              triggerPaywall({ code: "agreement_memory_paywall", surface: "memory_cta" });
              navigate("/app/billing");
            }}
          >
            View plans
          </button>
        </div>
      ) : null}

      {premium && status ? (
        <div className="mb-3 rounded-lg border border-slate-800/70 bg-slate-950/35 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          <span className="text-slate-400">Beyond search:</span>{" "}
          <button
            type="button"
            className="font-medium text-teal-400/95 underline-offset-2 hover:text-teal-300 hover:underline"
            onClick={() => navigateToWorkProduct("agreement_memory_page")}
          >
            Create a research memo or issue analysis from workspace materials
          </button>
          <span className="text-slate-600"> — higher tiers.</span>
        </div>
      ) : null}

      {premium && status ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-800/90 bg-slate-950/45 px-3 py-2 text-[11px] text-slate-400">
          <span>
            <span className="font-semibold text-slate-500">Index: </span>
            {syncing ? (
              <span className="text-amber-200/90">Syncing…</span>
            ) : status.index_health === "synced" ? (
              <span className="text-emerald-300/90">Synced</span>
            ) : status.index_health === "needs_sync" ? (
              <span className="text-amber-200/80">Needs sync</span>
            ) : (
              <span className="text-slate-500">Empty</span>
            )}
          </span>
          <span className="text-slate-700" aria-hidden>
            ·
          </span>
          <span>
            {status.indexed_document_count ?? 0} document(s) in memory
            {status.last_sync_at ? (
              <>
                <span className="text-slate-600"> · Last sync </span>
                <span className="text-slate-400">{formatTs(status.last_sync_at)}</span>
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      {indexHint && premium ? (
        <p className="mb-3 text-xs text-slate-500" role="status">
          {indexHint}
        </p>
      ) : null}

      {premium && status && !status.embedding_configured ? (
        <div
          className="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100"
          role="status"
        >
          Semantic search needs embeddings on the server. Configure{" "}
          <code className="rounded bg-slate-900 px-1">OPENAI_API_KEY</code> to enable search.
        </div>
      ) : null}

      {fromDraftId && draftContextTitle ? (
        <p className="mb-3 text-xs text-slate-500">
          Draft context:{" "}
          <span className="text-slate-300">
            {draftContextTitle}
          </span>{" "}
          — search is scoped to your workspace index; similar suggestions anchor to this flow when you use{" "}
          <em>Find similar</em>.
        </p>
      ) : null}

      {premium ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--compact"
            disabled={syncing}
            onClick={() => void onSync()}
          >
            {syncing ? "Syncing…" : "Sync workspace to memory"}
          </button>
          {status?.relationship_view ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              onClick={() =>
                relOpen ? closeRelPanel() : void fetchRelationshipsPanel(relFocusId || results[0]?.agreement_id || null)
              }
            >
              {relOpen ? "Hide workspace map" : "Workspace map"}
            </button>
          ) : (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact opacity-75"
              onClick={() => {
                logProductEvent("memory_paywall_shown", { surface: "workspace_map_pro" });
                triggerPaywall({ code: "agreement_memory_paywall", surface: "relationship_view" });
              }}
            >
              Workspace map (Pro workspace)
            </button>
          )}
        </div>
      ) : null}

      {syncMessage ? (
        <p className="mb-4 text-xs text-slate-400" role="status">
          {syncMessage}
        </p>
      ) : null}

      {relOpen && status?.relationship_view ? (
        <div className="mb-6 rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
          {relData?.disclaimer ? <p className="mb-3 text-[11px] text-slate-500">{relData.disclaimer}</p> : null}
          {relLoading ? <p className="text-slate-400">Loading workspace map…</p> : null}
          {relError ? <p className="text-rose-300">{relError}</p> : null}
          {!relLoading && relData ? (
            <div className="space-y-4">
              {relData.focus ? (
                <div className="rounded-md border border-slate-800/90 bg-slate-950/60 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected agreement</p>
                  <p className="mt-1 font-medium text-slate-100">{relData.focus.title || relData.focus.agreement_id}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Status: {relData.focus.status || "—"} · Versions in index: {relData.focus.versions_count} · Memory
                    updated {formatTs(relData.focus.memory_updated_at)}
                  </p>
                  {relData.focus.related_parties?.length ? (
                    <p className="mt-2 text-xs text-slate-400">
                      <span className="text-slate-500">Parties: </span>
                      {relData.focus.related_parties.join(", ")}
                    </p>
                  ) : null}
                  {relData.focus.clause_tags?.length ? (
                    <p className="mt-2 text-xs text-slate-400">
                      <span className="text-slate-500">Clause themes: </span>
                      {relData.focus.clause_tags.join(", ")}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                      onClick={() => navigate(`/app/agreements/${encodeURIComponent(relData.focus!.agreement_id)}`)}
                    >
                      Open agreement
                    </button>
                    {relData.focus.timeline_has_activity ? (
                      <button
                        type="button"
                        className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                        onClick={() => navigate(relData.focus!.timeline_verify_path)}
                      >
                        View proof summary
                      </button>
                    ) : (
                      <span className="self-center text-[11px] text-slate-600">No timeline activity in index</span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Run a search and open <em>Workspace map</em> from a result, or sync so agreements appear here.
                </p>
              )}
              {relData.related_agreements && relData.related_agreements.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Related agreements</p>
                  <ul className="mt-2 space-y-1.5">
                    {relData.related_agreements.map((r) => (
                      <li key={r.agreement_id}>
                        <button
                          type="button"
                          className="flex w-full flex-col rounded-md border border-slate-800/80 bg-slate-950/40 px-2 py-2 text-left text-xs text-slate-300 hover:border-slate-600"
                          onClick={() => {
                            setRelFocusId(r.agreement_id);
                            void (async () => {
                              setRelLoading(true);
                              const rr = await fetchAgreementMemoryRelationships(r.agreement_id);
                              setRelLoading(false);
                              if (rr.ok) setRelData(rr.data);
                            })();
                          }}
                        >
                          <span className="font-medium text-slate-200">{r.title || r.agreement_id}</span>
                          <span className="text-[11px] text-slate-500">
                            Shared: {(r.shared_parties || []).join(", ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Common clause themes</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {(relData.workspace_clause_themes || []).map((t) => (
                    <li
                      key={t.tag}
                      className="rounded-full border border-slate-800 bg-slate-950/50 px-2 py-0.5 text-[11px] text-slate-400"
                    >
                      {t.tag}{" "}
                      <span className="text-slate-600">
                        ({t.count})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {premium && !hasQueried && results.length === 0 && !searching ? (
        <div className="mb-6 rounded-lg border border-slate-800/80 bg-slate-950/35 px-4 py-5 text-center sm:text-left">
          <p className="text-base font-medium text-slate-100">Find and reuse your agreements</p>
          <p className="mt-2 text-sm text-slate-400">
            Your agreements become easier to reuse over time. This memory layer speeds search and starting points — it
            never replaces receipts or verified timelines.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            {SAMPLE_PROMPTS.slice(0, 3).map((p) => (
              <button
                key={p}
                type="button"
                className="rounded-full border border-slate-800 bg-slate-950/50 px-3 py-1 text-xs text-slate-300 hover:border-slate-600"
                disabled={!status?.embedding_configured}
                onClick={() => {
                  setQuery(p);
                  if (status?.embedding_configured) void runSearch(p);
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmitSearch} className="mb-4">
        <label htmlFor="am-search" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Question or search
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="am-search"
            type="search"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder="Describe the deal, risk, party, or clause you need…"
            className="min-h-[44px] flex-1 rounded-lg border border-slate-800 bg-slate-950/60 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
            disabled={!premium || !status?.embedding_configured}
            autoComplete="off"
          />
          <button
            type="submit"
            className="vs01-btn vs01-btn--primary"
            disabled={!premium || !status?.embedding_configured || searching || !query.trim()}
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {hasQueried || results.length > 0 ? (
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sample searches</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                className="rounded-full border border-slate-800 bg-slate-950/50 px-3 py-1 text-xs text-slate-300 hover:border-slate-600"
                onClick={() => {
                  setQuery(p);
                  if (premium && status?.embedding_configured) void runSearch(p);
                }}
                disabled={!premium || !status?.embedding_configured}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {similarFor ? (
        <div className="mb-6 rounded-lg border border-slate-800/80 bg-slate-950/35 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-200">Similar agreements</h3>
          <p className="mt-1 text-xs text-slate-500">
            Anchored to <code className="text-slate-400">{similarFor}</code> — assistive only.
          </p>
          {similarLoading ? <p className="mt-2 text-sm text-slate-400">Loading…</p> : null}
          {similarError ? <p className="mt-2 text-sm text-rose-300">{similarError}</p> : null}
          {!similarLoading && similarRows.length === 0 && !similarError ? (
            <p className="mt-2 text-sm text-slate-500">Nothing similar in memory yet — run a workspace sync.</p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {similarRows.map((s) => (
              <li key={s.agreement_id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-left text-sm text-slate-200 hover:border-slate-600"
                  onClick={() => openResult(s, "opensimilar")}
                >
                  <span>{s.title || s.agreement_id}</span>
                  <span className="text-xs text-slate-500">{s.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {searchError ? (
        <p className="mb-4 text-sm text-rose-300" role="alert">
          {searchError}
        </p>
      ) : null}
      {searchNote ? (
        <p className="mb-4 text-xs text-amber-100/80" role="status">
          {searchNote}
        </p>
      ) : null}

      {premium && results.length > 0 ? (
        <p className="mb-3 text-[11px] text-slate-600" role="note">
          Build a white paper or brief from a source set in{" "}
          <button
            type="button"
            className="font-medium text-teal-400/95 underline-offset-2 hover:text-teal-300 hover:underline"
            onClick={() => navigateToWorkProduct("agreement_memory_page_results")}
          >
            Advanced Work Product
          </button>
          <span className="text-slate-600"> (Pro / eligible plans).</span>
        </p>
      ) : null}

      <ul className="space-y-4">
        {results.map((row) => (
          <li
            key={row.agreement_id}
            className="rounded-lg border border-slate-800/90 bg-slate-950/45 px-4 py-4 text-sm text-slate-300"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold leading-snug text-slate-50">{row.title || row.agreement_id}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="rounded border border-slate-700/80 bg-slate-900/50 px-1.5 py-0.5 uppercase tracking-wide text-slate-400">
                    {row.status || "unknown"}
                  </span>
                  <span className="ml-2 text-slate-600">· match {row.match_score}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {status?.relationship_view ? (
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--compact text-[11px]"
                    onClick={() => {
                      setRelFocusId(row.agreement_id);
                      void fetchRelationshipsPanel(row.agreement_id);
                    }}
                  >
                    Related items
                  </button>
                ) : null}
              </div>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-400">{row.reason}</p>

            {row.related_parties?.length ? (
              <p className="mt-2 text-xs text-slate-300">
                <span className="font-medium text-slate-500">Parties · </span>
                {row.related_parties.join(", ")}
              </p>
            ) : null}

            {row.relevant_clauses?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {row.relevant_clauses.map((c) => (
                  <span
                    key={c}
                    className="rounded-md border border-emerald-900/40 bg-emerald-950/20 px-2 py-0.5 text-[11px] text-emerald-200/90"
                  >
                    {c}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <span>
                Memory updated: {formatTs(row.memory_updated_at)}
              </span>
              <span>·</span>
              <span>Versions (index): {row.version_count ?? 0}</span>
              <span>·</span>
              <span>
                Timeline:{" "}
                {row.timeline_available ? (
                  <span className="text-emerald-200/80">Linked</span>
                ) : (
                  <span className="text-slate-600">Not linked in index</span>
                )}
              </span>
            </div>

            {row.ai_summary ? (
              <details
                className="mt-3 rounded-md border border-slate-800/80 bg-slate-950/30 px-2 py-2 text-xs"
                onToggle={(ev) => {
                  if (ev.currentTarget.open && row.relevant_clauses?.length) {
                    logProductEvent("clause_reuse_suggested", {
                      agreement_id: row.agreement_id,
                      relevant_clause_count: row.relevant_clauses?.length ?? 0,
                      surface: "memory_ai_summary_open",
                    });
                  }
                }}
              >
                <summary className="cursor-pointer select-none text-slate-400 hover:text-slate-200">
                  AI summary (assistive)
                </summary>
                <p className="mt-2 border-l-2 border-slate-700 pl-2 italic text-slate-500">{row.ai_summary}</p>
              </details>
            ) : null}

            <div className="mt-4 border-t border-slate-800/80 pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Primary</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="vs01-btn vs01-btn--primary vs01-btn--compact"
                  onClick={() => openResult(row, "open")}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--primary vs01-btn--compact"
                  onClick={() => void onFindSimilar(row.agreement_id)}
                >
                  Find similar
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--primary vs01-btn--compact"
                  disabled={reuseBusyId === row.agreement_id}
                  onClick={() => void onReuseFromPrior(row.agreement_id)}
                >
                  {reuseBusyId === row.agreement_id ? "Creating…" : "Reuse as starting point"}
                </button>
              </div>
              <p className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Secondary</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  onClick={() => openResult(row, "compare")}
                >
                  Compare
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  disabled={!row.actions?.timeline}
                  title={
                    row.actions?.timeline
                      ? "Open read-only proof summary"
                      : "No indexed timeline activity for this agreement"
                  }
                  onClick={() =>
                    row.actions?.timeline
                      ? navigate(row.actions.timeline)
                      : logProductEvent("agreement_memory_result_clicked", {
                          agreement_id: row.agreement_id,
                          action: "timeline_unavailable",
                        })
                  }
                >
                  View timeline
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {premium && hasQueried && results.length === 0 && !searching && !searchError ? (
        <div className="mt-8 rounded-lg border border-slate-800/80 bg-slate-950/40 px-4 py-4 text-center text-sm text-slate-400">
          <p className="text-slate-200">No strong matches in memory.</p>
          <p className="mt-2 text-xs text-slate-500">
            Try a narrower phrase, one of the suggestions below, or sync if you added agreements recently. Memory is a
            separate index from proof.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {NO_RESULT_ALTERNATES.map((p) => (
              <button
                key={p}
                type="button"
                className="rounded-full border border-slate-800 bg-slate-950/50 px-3 py-1 text-xs text-slate-300 hover:border-slate-600"
                onClick={() => {
                  setQuery(p);
                  void runSearch(p);
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-4"
            onClick={() => void onSync()}
          >
            Sync workspace to memory
          </button>
        </div>
      ) : null}
    </AppShell>
  );
}
