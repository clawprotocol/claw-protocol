import type { DraftState } from "../../components/AgreementBuilderChat";
import type { AgreementSession, AuditEvent, Revision } from "./sessionTypes";

const KEY_PREFIX = "claw.agreement.session.v1";

function keyFor(sessionId: string) {
  return `${KEY_PREFIX}.${sessionId}`;
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadSession(session_id: string): AgreementSession | null {
  try {
    const raw = window.localStorage.getItem(keyFor(session_id));
    if (!raw) return null;
    return JSON.parse(raw) as AgreementSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AgreementSession): void {
  try {
    window.localStorage.setItem(keyFor(session.session_id), JSON.stringify(session));
  } catch {
    // localStorage capacity errors are non-fatal for v1 local mode
  }
}

export function appendAudit(session: AgreementSession, event: Omit<AuditEvent, "id" | "created_at">): AgreementSession {
  const nextEvent: AuditEvent = {
    id: uid("audit"),
    created_at: Date.now(),
    ...event,
  };
  return {
    ...session,
    audit: [nextEvent, ...session.audit].slice(0, 400),
    updated_at: Date.now(),
  };
}

export function upsertRevision(
  session: AgreementSession,
  draft: DraftState,
  label: string,
  source: Revision["source"]
): AgreementSession {
  const revisionHash = session.version_hash || "";
  const exists = session.revisions[0]?.version_hash === revisionHash && revisionHash.length > 0;
  if (exists) {
    return session;
  }
  const revision: Revision = {
    revision_id: uid("rev"),
    label: label || "Snapshot",
    source,
    created_at: Date.now(),
    draft: JSON.parse(JSON.stringify(draft)) as DraftState,
    version_hash: revisionHash,
  };
  return {
    ...session,
    revisions: [revision, ...session.revisions].slice(0, 200),
    updated_at: Date.now(),
  };
}

