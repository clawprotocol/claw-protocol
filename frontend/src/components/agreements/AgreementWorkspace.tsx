import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AgreementBuilderChat, { type DraftState } from "../AgreementBuilderChat";
import { hashDraftState } from "../../utils/agreements/hash";
import {
  appendAudit,
  loadSession,
  saveSession,
  upsertRevision,
} from "../../utils/agreements/storage";
import type {
  AgreementSession,
  AuditEvent,
  CommentThread,
  Revision,
  SignatureRecord,
} from "../../utils/agreements/sessionTypes";
import { generateContractMarkdown } from "../../utils/agreements/contractRender";

type Props = { model: any };
type AgreementMode = "draft" | "review" | "sign";
type ReviewSection = "document" | "revisions" | "comments" | "audit" | "export";

const MODES: AgreementMode[] = ["draft", "review", "sign"];
const REVIEW_SECTIONS: ReviewSection[] = ["document", "revisions", "comments", "audit", "export"];

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function createEmptySession(sessionId: string, agreementId: string | null | undefined, draft: DraftState): AgreementSession {
  return {
    session_id: sessionId,
    agreement_id: agreementId || null,
    current: draft,
    escrow: {
      mode: "none",
      provider_name: "",
      provider_url: "",
      notes: "",
    },
    version_hash: "",
    revisions: [],
    comments: [],
    signatures: [],
    audit: [],
    updated_at: Date.now(),
  };
}

type ContractLine =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "li"; text: string }
  | { kind: "p"; text: string }
  | { kind: "spacer" };

type ContractBlock =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "spacer" }
  | { kind: "ul"; items: string[] };

function parseContractLines(text: string): ContractLine[] {
  const rawLines = (text || "").split(/\r?\n/);
  return rawLines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return { kind: "spacer" };
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const textPart = heading[2].trim();
      if (level <= 1) return { kind: "h1", text: textPart };
      if (level === 2) return { kind: "h2", text: textPart };
      return { kind: "h3", text: textPart };
    }
    if (trimmed.startsWith("- ")) return { kind: "li", text: trimmed.slice(2).trim() };
    return { kind: "p", text: trimmed };
  });
}

function toContractBlocks(lines: ContractLine[]): ContractBlock[] {
  const blocks: ContractBlock[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length) {
      blocks.push({ kind: "ul", items: listBuffer });
      listBuffer = [];
    }
  };

  for (const line of lines) {
    if (line.kind === "li") {
      listBuffer.push(line.text);
      continue;
    }
    flushList();
    if (line.kind === "h1") blocks.push({ kind: "h1", text: line.text });
    else if (line.kind === "h2") blocks.push({ kind: "h2", text: line.text });
    else if (line.kind === "h3") blocks.push({ kind: "h3", text: line.text });
    else if (line.kind === "p") blocks.push({ kind: "p", text: line.text });
    else blocks.push({ kind: "spacer" });
  }
  flushList();

  return blocks;
}

function escrowLabel(escrow: AgreementSession["escrow"]) {
  if (escrow.mode === "real_estate_escrow") return `${escrow.provider_name || "Escrow.com"} (coming soon)`;
  if (escrow.mode === "crypto_escrow") return "Crypto escrow (coming soon)";
  if (escrow.mode === "external_manual") return escrow.provider_name?.trim() || "External/manual";
  return "No escrow";
}

const AgreementWorkspace: React.FC<Props> = ({ model }) => {
  const [mode, setMode] = useState<AgreementMode>("draft");
  const [reviewSection, setReviewSection] = useState<ReviewSection>("document");
  const [chatDone, setChatDone] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<AgreementSession | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<AgreementSession[]>([]);
  const [loadedBannerTs, setLoadedBannerTs] = useState<number | null>(null);
  const [commentQuote, setCommentQuote] = useState("");
  const [commentText, setCommentText] = useState("");
  const [signName, setSignName] = useState("");
  const [signDate, setSignDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [signAck, setSignAck] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [uiToast, setUiToast] = useState<string | null>(null);
  const [draftFocusToken, setDraftFocusToken] = useState(0);
  const autoSaveTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastHashRef = useRef("");
  const sessionStoragePrefix = "claw.agreement.session.v1.";

  const isDraftComplete = useCallback((draft: DraftState) => {
    return (
      Boolean((draft.title || "").trim()) &&
      Boolean((draft.jurisdiction || "").trim()) &&
      (draft.parties || []).length >= 2 &&
      Boolean((draft.body_md || "").trim())
    );
  }, []);

  const syncModelFromDraft = useCallback(
    (draft: DraftState, agreementId?: string | null) => {
      const nextParties = (draft.parties || []).map((p, idx) => ({
        party_id: p.id || `party_${idx + 1}`,
        name: p.name || "",
        role: p.role || "party",
        contact: p.contact || "",
      }));
      model.setAgreementId?.(agreementId || "");
      model.setAgreementTitle(draft.title || "");
      model.setAgreementJurisdiction(draft.jurisdiction || "");
      model.setAgreementPartyRows(nextParties);
      model.setAgreementParties(nextParties.map((p: any) => p.name).filter(Boolean).join("; "));
      model.setAgreementContent(draft.body_md || "");
      model.setAgreementBodyText(draft.body_md || "");
      model.setAgreementVersionNotes(draft.private_notes || "");
      if (nextParties[0]?.party_id) {
        model.setAgreementAuthorPartyId(nextParties[0].party_id);
      }
    },
    [model]
  );

  const listSavedDrafts = useCallback(() => {
    const out: AgreementSession[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(sessionStoragePrefix)) continue;
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as AgreementSession;
        if (parsed?.session_id) out.push(parsed);
      } catch {
        // ignore malformed local entries
      }
    }
    out.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    setSavedDrafts(out);
  }, []);

  const loadDraft = useCallback(
    (sessionId: string) => {
      const next = loadSession(sessionId);
      if (!next) return;
      if (!next.escrow) {
        next.escrow = { mode: "none", provider_name: "", provider_url: "", notes: "" };
      }
      setSelectedSessionId(sessionId);
      setSession(next);
      syncModelFromDraft(next.current, next.agreement_id || null);
      setChatDone(isDraftComplete(next.current));
      setLoadedBannerTs(next.updated_at || Date.now());
      setMode("draft");
      setReviewSection("document");
      setSignName("");
      setSignAck(false);
      lastHashRef.current = next.version_hash || "";
    },
    [isDraftComplete, syncModelFromDraft]
  );

  const createNewAgreement = useCallback(() => {
    const sessionId = uid("ag_session");
    const blankDraft: DraftState = {
      title: null,
      jurisdiction: null,
      parties: [],
      body_md: null,
      private_notes: null,
    };
    const next = createEmptySession(sessionId, null, blankDraft);
    saveSession(next);
    setSelectedSessionId(sessionId);
    setSession(next);
    syncModelFromDraft(blankDraft, null);
    setChatDone(false);
    setLoadedBannerTs(null);
    setMode("draft");
    setReviewSection("document");
    setSignName("");
    setSignAck(false);
    lastHashRef.current = "";
    listSavedDrafts();
  }, [listSavedDrafts, syncModelFromDraft]);

  useEffect(() => {
    listSavedDrafts();
  }, [listSavedDrafts]);

  const persist = useCallback((next: AgreementSession) => {
    setSession(next);
    saveSession(next);
    listSavedDrafts();
  }, [listSavedDrafts]);

  const handleDraftStateChange = useCallback(
    async (nextDraft: DraftState, meta?: { source: "chat" | "parties" | "manual" }) => {
      if (!session) return;
      const nextHash = await hashDraftState(nextDraft);
      const source = meta?.source || "manual";

      const updated = appendAudit(
        {
          ...session,
          agreement_id: model.agreementId || session.agreement_id || null,
          current: nextDraft,
          version_hash: nextHash,
          updated_at: Date.now(),
        },
        {
          type: "draft_updated",
          message: "Draft updated",
          meta: { source },
        }
      );
      persist(updated);
      setChatDone(isDraftComplete(nextDraft));

      if (nextHash !== lastHashRef.current) {
        lastHashRef.current = nextHash;
        if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = window.setTimeout(() => {
          setSession((prev) => {
            if (!prev) return prev;
            const snap = upsertRevision(prev, nextDraft, "Auto-save", source);
            const withAudit = appendAudit(snap, {
              type: "revision_saved",
              message: "Auto-save revision",
              meta: { source },
            });
            saveSession(withAudit);
            return withAudit;
          });
        }, 800);
      }
    },
    [session, model.agreementId, persist, isDraftComplete]
  );

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setUiToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setUiToast(null), 2200);
  }, []);

  const status = useMemo(() => {
    if (!session) return "Drafting";
    const partyCount = Math.max(1, (session.current.parties || []).length);
    const signedForCurrentHash = session.signatures.filter((s) => s.revision_hash === session.version_hash).length;
    if (session.version_hash && signedForCurrentHash >= partyCount) return "Fully Signed";
    if (mode === "sign" && session.version_hash) return "Ready to Sign";
    if (isDraftComplete(session.current)) return "Ready for Review";
    return "Drafting";
  }, [session, mode, isDraftComplete]);

  const versionLabel = useMemo(() => `v0.${Math.max(1, session?.revisions.length || 0)}`, [session?.revisions.length]);
  const contractMd = useMemo(() => {
    if (!session) return "";
    return generateContractMarkdown({
      draft: session.current,
      escrow: session.escrow,
      effectiveDate: model.agreementEffectiveDate || null,
    });
  }, [session, model.agreementEffectiveDate]);
  const contractLines = useMemo(() => parseContractLines(contractMd), [contractMd]);
  const contractBlocks = useMemo(() => toContractBlocks(contractLines), [contractLines]);
  const shareLink = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("sid", session?.session_id || "agreement");
    return `${url.origin}${url.pathname}?${url.searchParams.toString()}`;
  }, [session?.session_id]);
  const inviteSubject = useMemo(
    () => `CLAW Agreement Review - ${session?.current.title || "Agreement Draft"}`,
    [session?.current.title]
  );
  const inviteBody = useMemo(() => {
    const custom = inviteMessage.trim();
    const intro = custom ? `${custom}\n\n` : "";
    return `${intro}Please review this agreement:\n${shareLink}\n\nVersion hash: ${session?.version_hash || "-"}\n\nLocal-only link works on this browser profile. Use Export JSON when sending to others.`;
  }, [inviteMessage, shareLink, session?.version_hash]);
  const inviteMailto = useMemo(
    () =>
      `mailto:${encodeURIComponent(inviteEmail.trim())}?subject=${encodeURIComponent(inviteSubject)}&body=${encodeURIComponent(inviteBody)}`,
    [inviteEmail, inviteSubject, inviteBody]
  );
  const addNamedSnapshot = () => {
    if (!session) return;
    const label = snapshotLabel.trim() || "Named snapshot";
    const snap = upsertRevision(session, session.current, label, "manual");
    const withAudit = appendAudit(snap, {
      type: "revision_saved",
      message: `Snapshot saved: ${label}`,
    });
    persist(withAudit);
    setSnapshotLabel("");
  };

  const addComment = () => {
    if (!session || !commentText.trim()) return;
    const thread: CommentThread = {
      id: uid("comment"),
      quote: commentQuote.trim(),
      note: commentText.trim(),
      resolved: false,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const next = appendAudit(
      { ...session, comments: [thread, ...session.comments], updated_at: Date.now() },
      { type: "comment_added", message: "Comment added" }
    );
    persist(next);
    setCommentQuote("");
    setCommentText("");
  };

  const toggleCommentResolved = (id: string) => {
    if (!session) return;
    const nextComments = session.comments.map((c) =>
      c.id === id ? { ...c, resolved: !c.resolved, updated_at: Date.now() } : c
    );
    const changed = nextComments.find((c) => c.id === id);
    const next = appendAudit(
      { ...session, comments: nextComments, updated_at: Date.now() },
      {
        type: "comment_resolved",
        message: changed?.resolved ? "Comment resolved" : "Comment reopened",
      }
    );
    persist(next);
  };

  const addSignature = () => {
    if (!session || !signName.trim() || !signAck) return;
    const rec: SignatureRecord = {
      id: uid("sig"),
      name: signName.trim(),
      signed_at: new Date().toISOString(),
      revision_id: session.revisions[0]?.revision_id || "rev_current",
      revision_hash: session.version_hash,
    };
    const next = appendAudit(
      { ...session, signatures: [rec, ...session.signatures], updated_at: Date.now() },
      {
        type: "signature_added",
        message: `Signature recorded for hash ${session.version_hash.slice(0, 12)}...`,
      }
    );
    persist(next);
    const partyCount = Math.max(1, (session.current.parties || []).length);
    const signedForCurrentHash = next.signatures.filter((s) => s.revision_hash === next.version_hash).length;
    if (next.version_hash && signedForCurrentHash >= partyCount) {
      setMode("sign");
    }
    setSignName("");
    setSignAck(false);
  };

  const generateExport = () => {
    if (!session) return;
    const text = [
      `# ${session.current.title || "Agreement Draft"}`,
      `Version: ${versionLabel}`,
      `Version Hash: ${session.version_hash}`,
      `Status: ${status}`,
      "",
      `Jurisdiction: ${session.current.jurisdiction || "-"}`,
      `Parties: ${(session.current.parties || []).map((p) => p.name).join(", ") || "-"}`,
      "",
      "## Body",
      contractMd || session.current.body_md || "",
      "",
      "## Audit",
      ...session.audit.map((e) => `- ${new Date(e.created_at).toISOString()} ${e.message}`),
    ].join("\n");
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(session.current.title || "agreement").replace(/\s+/g, "_").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);

    const next = appendAudit(session, { type: "export_generated", message: "Placeholder export generated" });
    persist(next);
  };

  const updateEscrow = (patch: Partial<AgreementSession["escrow"]>) => {
    if (!session) return;
    const next = {
      ...session,
      escrow: {
        ...session.escrow,
        ...patch,
      },
      updated_at: Date.now(),
    };
    persist(next);
  };

  const recordReviewRequested = (message: string, meta?: Record<string, unknown>) => {
    if (!session) return;
    const next = appendAudit(session, { type: "review_requested", message, meta });
    persist(next);
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      recordReviewRequested("Share link copied", { method: "copy_link", share_link: shareLink });
      showToast("Link copied");
    } catch {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = shareLink;
        textArea.setAttribute("readonly", "true");
        textArea.style.position = "absolute";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (ok) {
          recordReviewRequested("Share link copied", { method: "copy_link_fallback", share_link: shareLink });
          showToast("Link copied");
        } else {
          showToast("Could not copy link");
        }
      } catch {
        showToast("Could not copy link");
      }
    }
  };

  const copyInviteText = async () => {
    const payload = `To: ${inviteEmail || "(recipient)"}\nSubject: ${inviteSubject}\n\n${inviteBody}`;
    try {
      await navigator.clipboard.writeText(payload);
      recordReviewRequested("Invite text generated", { method: "copy_invite", recipient: inviteEmail || null });
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = payload;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      recordReviewRequested("Invite text generated", { method: "copy_invite_fallback", recipient: inviteEmail || null });
    }
  };

  const openEmailApp = () => {
    recordReviewRequested("Invite draft opened", { method: "mailto", recipient: inviteEmail || null });
    window.location.href = inviteMailto;
  };

  const exportSessionJson = () => {
    if (!session) return;
    const payload = {
      session_id: session.session_id,
      agreement_id: session.agreement_id || null,
      draft: session.current,
      version_hash: session.version_hash,
      signatures: session.signatures,
      updated_at: session.updated_at,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(session.current.title || "agreement").replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    recordReviewRequested("Export JSON generated", { method: "export_json" });
    showToast("Export downloaded.");
  };

  if (!session) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-950/40">
        <div className="flex min-h-[520px] flex-col md:flex-row">
          <aside className="w-full border-b border-slate-800 p-3 md:w-72 md:border-b-0 md:border-r">
            <button className="btn w-full bg-emerald-600 text-xs text-white hover:bg-emerald-500" onClick={createNewAgreement}>
              + New Agreement
            </button>
            <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Saved Drafts</div>
            <div className="mt-2 space-y-2">
              {savedDrafts.map((d) => (
                <button
                  key={d.session_id}
                  className="w-full rounded border border-slate-800 bg-slate-900/40 px-2 py-2 text-left"
                  onClick={() => loadDraft(d.session_id)}
                >
                  <div className="truncate text-sm text-slate-100">{d.current.title || "Untitled Agreement"}</div>
                  <div className="text-[11px] text-slate-500">{new Date(d.updated_at).toLocaleString()}</div>
                </button>
              ))}
              {savedDrafts.length === 0 && (
                <div className="rounded border border-dashed border-slate-800 p-2 text-xs text-slate-500">No saved drafts yet.</div>
              )}
            </div>
          </aside>
          <main className="flex flex-1 items-center justify-center p-4">
            <div className="max-w-md rounded border border-slate-800 bg-slate-900/40 p-4 text-center">
              <div className="text-sm font-semibold text-slate-100">Select a draft or create a new agreement.</div>
              <div className="mt-1 text-xs text-slate-400">Nothing is auto-loaded, so your current workspace is always explicit.</div>
            </div>
          </main>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/40">
      <div className="border-b border-slate-800 px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <input
              className="w-full max-w-xl rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm font-semibold text-slate-100 outline-none focus:border-emerald-500"
              value={session.current.title || ""}
              onChange={(e) => {
                const nextTitle = e.target.value;
                const nextDraft = { ...session.current, title: nextTitle || null };
                setSession((prev) => (prev ? { ...prev, current: nextDraft, updated_at: Date.now() } : prev));
                syncModelFromDraft(nextDraft, session.agreement_id || null);
                void handleDraftStateChange(nextDraft, { source: "manual" });
              }}
              placeholder="Untitled Agreement"
            />
            <div className="text-xs text-slate-400">
              <span
                className={`mr-2 inline-flex rounded-full px-2 py-[2px] ${
                  status === "Fully Signed"
                    ? "bg-emerald-700/20 text-emerald-300"
                    : status === "Ready to Sign"
                    ? "bg-blue-700/20 text-blue-300"
                    : status === "Ready for Review"
                    ? "bg-amber-700/20 text-amber-300"
                    : "bg-slate-700/40 text-slate-300"
                }`}
              >
                {status}
              </span>
              Last saved {new Date(session.updated_at).toLocaleString()}
            </div>
          </div>
          <div className="flex gap-1 rounded border border-slate-800 bg-slate-900/40 p-1">
            {MODES.map((m) => {
              const disabled = m === "sign" && !session.version_hash;
              return (
                <button
                  key={m}
                  className={`rounded px-3 py-1.5 text-xs ${
                    mode === m ? "bg-slate-700 text-slate-100" : "text-slate-300 hover:bg-slate-800/50"
                  } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                  onClick={() => !disabled && setMode(m)}
                  disabled={disabled}
                >
                  {m === "draft" ? "Draft" : m === "review" ? "Review" : "Sign"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row">
        <nav className="w-full border-b border-slate-800 p-3 md:w-72 md:border-b-0 md:border-r">
          <button className="btn w-full bg-emerald-600 text-xs text-white hover:bg-emerald-500" onClick={createNewAgreement}>
            + New Agreement
          </button>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Saved Drafts</div>
          <div className="mt-2 space-y-2">
            {savedDrafts.map((d) => (
              <button
                key={d.session_id}
                className={`w-full rounded border px-2 py-2 text-left ${
                  d.session_id === selectedSessionId
                    ? "border-emerald-600/60 bg-emerald-600/10"
                    : "border-slate-800 bg-slate-900/40"
                }`}
                onClick={() => loadDraft(d.session_id)}
              >
                <div className="truncate text-sm text-slate-100">{d.current.title || "Untitled Agreement"}</div>
                <div className="text-[11px] text-slate-500">{new Date(d.updated_at).toLocaleString()}</div>
              </button>
            ))}
            {savedDrafts.length === 0 && (
              <div className="rounded border border-dashed border-slate-800 p-2 text-xs text-slate-500">No saved drafts yet.</div>
            )}
          </div>
        </nav>

        <div className="w-full pb-20 md:pb-3">
          {mode === "draft" && (
            <div className="p-3">
              {loadedBannerTs && (
                <div className="mb-3 rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                  Loaded saved draft from {new Date(loadedBannerTs).toLocaleString()}.
                </div>
              )}
              <AgreementBuilderChat
                key={session.session_id}
                model={model}
                onDraftStateChange={handleDraftStateChange}
                getSessionMeta={() => ({ session_id: session.session_id, agreement_id: session.agreement_id })}
                onChatDoneChange={setChatDone}
                draftOnly
                focusComposerToken={draftFocusToken}
              />
              {chatDone && (
                <div className="mt-3 flex justify-end">
                  <button
                    className="btn bg-emerald-600 text-xs hover:bg-emerald-500"
                    onClick={() => {
                      setReviewSection("document");
                      setMode("review");
                    }}
                  >
                    Review Draft
                  </button>
                </div>
              )}
              {chatDone && (
                <div className="mt-2 text-xs text-slate-400">You are editing this draft. Changes appear in Review immediately.</div>
              )}
            </div>
          )}

          {mode === "review" && (
            <div className="p-3">
              <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/95 p-2">
                <div className="flex flex-wrap gap-2">
                  {REVIEW_SECTIONS.map((s) => (
                    <button
                      key={s}
                      className={`btn text-xs ${reviewSection === s ? "bg-slate-700" : ""}`}
                      onClick={() => setReviewSection(s)}
                    >
                      {s === "document"
                        ? "Document"
                        : s === "revisions"
                        ? "Versions + Redlines"
                        : s === "comments"
                        ? "Comments"
                        : s === "audit"
                        ? "Audit"
                        : "Export"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn text-xs"
                    onClick={() => {
                      setDraftFocusToken((t) => t + 1);
                      setReviewSection("document");
                      setMode("draft");
                    }}
                  >
                    Edit Draft
                  </button>
                  <button className="btn text-xs" onClick={copyShareLink}>Copy share link</button>
                  <button className="btn text-xs" onClick={() => setShowInvitePanel(true)}>Invite by email</button>
                  <button className="btn text-xs" onClick={exportSessionJson}>Export JSON</button>
                  <button
                    className="btn bg-emerald-600 text-xs hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setMode("sign")}
                    disabled={!session.version_hash}
                  >
                    Proceed to Sign
                  </button>
                </div>
              </div>
              <div className="mb-2 text-[11px] text-slate-500">Local-only (v1): share/invite links are browser-local.</div>
              {reviewSection === "document" && (
                <div className="space-y-3">
                  <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Escrow</div>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={session.escrow.mode === "real_estate_escrow"}
                          disabled
                        />
                        Real estate escrow (Escrow.com) - Coming soon
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={session.escrow.mode === "crypto_escrow"}
                          disabled
                        />
                        Crypto escrow (on-chain) - Coming soon
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={session.escrow.mode === "external_manual"}
                          onChange={() => updateEscrow({ mode: "external_manual" })}
                        />
                        External/manual escrow
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={session.escrow.mode === "none"}
                          onChange={() => updateEscrow({ mode: "none" })}
                        />
                        No escrow
                      </label>
                    </div>
                    {session.escrow.mode === "external_manual" && (
                      <div className="mt-3 space-y-2">
                        <input
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                          value={session.escrow.provider_name || ""}
                          onChange={(e) => updateEscrow({ provider_name: e.target.value })}
                          placeholder="Provider name"
                        />
                        <input
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                          value={session.escrow.provider_url || ""}
                          onChange={(e) => updateEscrow({ provider_url: e.target.value })}
                          placeholder="Provider URL"
                        />
                        <textarea
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                          value={session.escrow.notes || ""}
                          onChange={(e) => updateEscrow({ notes: e.target.value })}
                          placeholder="Escrow notes"
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                  <div className="rounded border border-slate-800 bg-white p-6 text-slate-900">
                    <div className="mb-2 inline-flex rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2 py-1 text-[11px] text-emerald-700">
                      Escrow: {escrowLabel(session.escrow)}
                    </div>
                    <h2 className="text-center text-2xl font-semibold tracking-tight">
                      {session.current.title || "Untitled Agreement"}
                    </h2>
                    <div className="mt-3 grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-3">
                      <div>
                        <span className="font-medium">Effective Date:</span>{" "}
                        {model.agreementEffectiveDate || "To be finalized"}
                      </div>
                      <div>
                        <span className="font-medium">Jurisdiction:</span> {session.current.jurisdiction || "-"}
                      </div>
                      <div>
                        <span className="font-medium">Parties:</span>{" "}
                        {(session.current.parties || []).map((p) => p.name).join(", ") || "-"}
                      </div>
                    </div>
                    <div className="mt-5 space-y-2 text-sm leading-7 text-slate-800">
                      {contractBlocks.length === 0 && <p>No agreement text yet.</p>}
                      {contractBlocks.map((block, idx) => {
                        if (block.kind === "spacer") return <div key={`sp_${idx}`} className="h-2" />;
                        if (block.kind === "h1") return <h3 key={`h1_${idx}`} className="pt-2 text-lg font-semibold">{block.text}</h3>;
                        if (block.kind === "h2") return <h4 key={`h2_${idx}`} className="pt-2 text-base font-semibold">{block.text}</h4>;
                        if (block.kind === "h3") return <h5 key={`h3_${idx}`} className="pt-1 text-sm font-semibold uppercase tracking-wide text-slate-700">{block.text}</h5>;
                        if (block.kind === "ul") {
                          return (
                            <ul key={`ul_${idx}`} className="list-disc space-y-1 pl-5">
                              {block.items.map((item, itemIdx) => (
                                <li key={`ul_${idx}_${itemIdx}`}>{item}</li>
                              ))}
                            </ul>
                          );
                        }
                        return <p key={`p_${idx}`}>{block.text}</p>;
                      })}
                    </div>
                    <div className="mt-8 border-t border-slate-200 pt-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        SIGNATURES
                      </div>
                      <div className="mt-2 text-xs text-slate-600">
                        Version hash to be signed: <span className="font-mono">{session.version_hash || "-"}</span>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {(session.current.parties || []).map((party) => (
                          <div key={party.id} className="rounded border border-slate-200 p-3 text-xs text-slate-700">
                            <div className="font-medium">Name: {party.name || "Party"}</div>
                            <div className="text-slate-500">Role: {party.role || "party"}</div>
                            <div className="mt-5 border-b border-slate-400" />
                            <div className="mt-1 text-[11px] text-slate-500">Signature</div>
                            <div className="mt-4 border-b border-slate-300" />
                            <div className="mt-1 text-[11px] text-slate-500">Date</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {reviewSection === "revisions" && (
                <div className="space-y-3">
                  <div className="rounded border border-slate-800 p-3">
                    <div className="text-sm font-semibold text-slate-100">Named snapshot</div>
                    <div className="mt-2 flex gap-2">
                      <input
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                        placeholder="Snapshot label"
                        value={snapshotLabel}
                        onChange={(e) => setSnapshotLabel(e.target.value)}
                      />
                      <button className="btn text-xs" onClick={addNamedSnapshot}>Save</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {session.revisions.map((r: Revision) => (
                      <div key={r.revision_id} className="rounded border border-slate-800 bg-slate-900/40 p-2 text-xs">
                        <div className="text-slate-200">{r.label}</div>
                        <div className="text-slate-400">{r.revision_id} • {new Date(r.created_at).toLocaleString()}</div>
                        <div className="text-slate-500">{r.version_hash.slice(0, 16)}...</div>
                      </div>
                    ))}
                    {session.revisions.length === 0 && <div className="text-xs text-slate-500">No versions yet.</div>}
                  </div>
                </div>
              )}

              {reviewSection === "comments" && (
                <div className="space-y-3">
                  <div className="rounded border border-slate-800 p-3">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <input
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                        placeholder="Quoted text (optional)"
                        value={commentQuote}
                        onChange={(e) => setCommentQuote(e.target.value)}
                      />
                      <input
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                        placeholder="Comment"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                      />
                      <button className="btn text-xs" onClick={addComment} disabled={!commentText.trim()}>Add</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {session.comments.map((c: CommentThread) => (
                      <div key={c.id} className="rounded border border-slate-800 bg-slate-900/40 p-2">
                        <div className="text-xs text-slate-400">{c.quote ? `"${c.quote}"` : "General comment"}</div>
                        <div className="text-sm text-slate-200">{c.note}</div>
                        <button className="btn mt-2 text-xs" onClick={() => toggleCommentResolved(c.id)}>
                          {c.resolved ? "Unresolve" : "Resolve"}
                        </button>
                      </div>
                    ))}
                    {session.comments.length === 0 && <div className="text-xs text-slate-500">No comments yet.</div>}
                  </div>
                </div>
              )}

              {reviewSection === "audit" && (
                <div className="space-y-2">
                  {session.audit.map((e: AuditEvent) => (
                    <div key={e.id} className="rounded border border-slate-800 bg-slate-900/40 p-2 text-xs">
                      <div className="text-slate-200">{e.message}</div>
                      <div className="text-slate-500">{new Date(e.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                  {session.audit.length === 0 && <div className="text-xs text-slate-500">No activity yet.</div>}
                </div>
              )}

              {reviewSection === "export" && (
                <div className="rounded border border-slate-800 p-3 space-y-2">
                  <div className="text-sm font-semibold text-slate-100">Export</div>
                  <div className="text-xs text-slate-400">Generates markdown with current draft + hash + audit.</div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn text-xs" onClick={generateExport}>Download Export (.md)</button>
                    <button className="btn text-xs opacity-60" disabled>Download PDF (coming soon)</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "sign" && (
            <div className="p-3 space-y-3">
              {!session.version_hash && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  A revision hash is required before signing. Complete draft updates, then return to Sign.
                </div>
              )}
              <div className="rounded border border-slate-800 p-3 space-y-2">
                <div className="text-xs text-slate-300">Sign this exact version hash</div>
                <div className="text-xs text-slate-500">Version: {versionLabel}</div>
                <div className="text-xs text-slate-400">{session.version_hash || "-"}</div>
                <input
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                  placeholder="Typed full name"
                  value={signName}
                  onChange={(e) => setSignName(e.target.value)}
                />
                <input
                  type="date"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                  value={signDate}
                  onChange={(e) => setSignDate(e.target.value)}
                />
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={signAck} onChange={(e) => setSignAck(e.target.checked)} />
                  I confirm signing this exact revision hash.
                </label>
                <button
                  className="btn text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={addSignature}
                  disabled={!signName.trim() || !signAck || !session.version_hash}
                >
                  Sign
                </button>
                {status === "Fully Signed" && (
                  <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-2 text-xs text-emerald-300">
                    Signature recorded. This agreement is now fully signed.
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {session.signatures.map((s: SignatureRecord) => (
                  <div key={s.id} className="rounded border border-slate-800 bg-slate-900/40 p-2 text-xs text-slate-300">
                    {s.name} • {s.revision_hash.slice(0, 16)}... • {new Date(s.signed_at).toLocaleString()}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 p-2 md:hidden">
        <div className="grid grid-cols-3 gap-1 text-xs">
          {MODES.map((m) => {
            const disabled = m === "sign" && !session.version_hash;
            return (
              <button
                key={`m_${m}`}
                className={`rounded px-2 py-2 ${mode === m ? "bg-slate-800 text-slate-100" : "text-slate-400"} ${
                  disabled ? "cursor-not-allowed opacity-50" : ""
                }`}
                onClick={() => !disabled && setMode(m)}
                disabled={disabled}
              >
                {m === "draft" ? "Draft" : m === "review" ? "Review" : "Sign"}
              </button>
            );
          })}
        </div>
      </nav>

      {showInvitePanel && (
        <div className="fixed inset-0 z-[230] bg-black/60" onClick={() => setShowInvitePanel(false)}>
          <div
            className="fixed left-1/2 top-1/2 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-700 bg-slate-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-100">Invite by email</div>
              <button className="btn text-xs" onClick={() => setShowInvitePanel(false)}>Close</button>
            </div>
            <div className="space-y-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                placeholder="Recipient email"
              />
              <textarea
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                rows={3}
                placeholder="Optional message"
              />
              <div className="rounded border border-slate-700 bg-slate-950/70 px-2 py-2 text-[11px] text-slate-400 break-all">
                {shareLink}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn text-xs" onClick={copyInviteText}>Copy invite text</button>
                <button className="btn text-xs" onClick={openEmailApp}>Open email app</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {uiToast && (
        <div className="fixed bottom-16 right-3 z-[260] rounded border border-emerald-600/40 bg-slate-950/95 px-3 py-2 text-xs text-emerald-300">
          {uiToast}
        </div>
      )}
    </section>
  );
};

export default AgreementWorkspace;
