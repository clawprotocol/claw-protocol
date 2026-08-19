import type { NegotiationPosture } from "./negotiationPostures";
import { parseRiskAssessment, type NegotiationRiskAssessment } from "./negotiationRisk";
import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { resolveApiBase } from "../lib/clawApi";

const API_BASE = resolveApiBase();

export type NegotiationAssistOption = {
  id: string;
  label: string;
  summary: string;
  instruction: string;
  posture: NegotiationPosture;
};

export type NegotiateAssistResponse = {
  what_changed: string;
  options: NegotiationAssistOption[];
  risk_assessment: NegotiationRiskAssessment | null;
};

const POSTURES: readonly NegotiationPosture[] = [
  "cooperative",
  "firm",
  "protective",
  "fast_close",
  "founder_friendly",
  "investor_friendly",
];

function normalizePosture(raw: unknown, fallback: NegotiationPosture): NegotiationPosture {
  const s = String(raw || "").trim();
  return (POSTURES as readonly string[]).includes(s) ? (s as NegotiationPosture) : fallback;
}

export type AiSessionType = "owner" | "recipient";

export async function fetchNegotiateAssist(args: {
  agreementId: string;
  recipientInstruction: string;
  priorSnapshot: Record<string, unknown> | null;
  currentSnapshot: Record<string, unknown>;
  mode?: "summary" | "options" | "both";
  negotiationPosture?: NegotiationPosture;
  /** Defaults to owner (workspace). Recipients should pass "recipient" for server rate limits. */
  sessionType?: AiSessionType;
  /** basic | premium — server maps via CLAW_LLM_MODEL_* (defaults gpt-4o-mini / gpt-4o). Do not put model IDs in product logic. */
  aiModelClass?: "basic" | "premium";
}): Promise<NegotiateAssistResponse> {
  const posture = args.negotiationPosture ?? "cooperative";
  const res = await fetch(
    `${API_BASE}/api/agreements/${encodeURIComponent(args.agreementId)}/negotiate-assist`,
    {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        mode: args.mode ?? "both",
        recipient_instruction: args.recipientInstruction,
        prior_snapshot: args.priorSnapshot ?? undefined,
        current_snapshot: args.currentSnapshot,
        negotiation_posture: posture,
        session_type: args.sessionType ?? "owner",
        ai_model_class: args.aiModelClass,
      }),
    }
  );
  if (!res.ok) {
    let msg = "negotiate_assist_failed";
    try {
      const j = (await res.json()) as { message?: string; error?: string };
      if (j.message) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const raw = (await res.json()) as {
    what_changed?: string;
    options?: unknown[];
    risk_assessment?: unknown;
  };
  const what_changed = String(raw?.what_changed ?? "").trim();
  const risk_assessment =
    parseRiskAssessment(raw?.risk_assessment) ??
    null;
  const optionsIn = Array.isArray(raw?.options) ? raw.options : [];
  const options: NegotiationAssistOption[] = optionsIn.slice(0, 3).map((o, i) => {
    if (!o || typeof o !== "object") {
      return { id: `opt_${i}`, label: "", summary: "", instruction: "", posture };
    }
    const r = o as Record<string, unknown>;
    return {
      id: String(r.id ?? `opt_${i}`),
      label: String(r.label ?? `Option ${i + 1}`),
      summary: String(r.summary ?? "").trim(),
      instruction: String(r.instruction ?? "").trim(),
      posture: normalizePosture(r.posture, posture),
    };
  });
  return { what_changed, options, risk_assessment };
}
