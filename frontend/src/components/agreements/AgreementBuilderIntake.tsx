import React, { useMemo, useRef, useState } from "react";
import { useSpeechController } from "../../hooks/useSpeechController";

type ParsedDraft = {
  title: string;
  jurisdiction: string;
  parties: { name: string; role: string }[];
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
};

type Props = {
  onCreated: (agreementId: string) => void;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";
const VOICE_FLAG = String((import.meta as any).env?.VITE_CLAW_VOICE_REALTIME || "0") === "1";
type MissingKey =
  | "title"
  | "jurisdiction"
  | "parties"
  | "purpose"
  | "payment_terms"
  | "duration"
  | "effective_date";

const FIELD_QUESTION: Record<MissingKey, string> = {
  title: "What should the agreement title be?",
  jurisdiction: "Which governing law / jurisdiction should apply?",
  parties: "Who are the two parties? (e.g., Acme Inc, John Smith)",
  purpose: "What is the scope of services or purpose?",
  payment_terms: "What are the payment terms?",
  duration: "How long should this agreement last?",
  effective_date: "When does it become effective?",
};

const FIELD_CHIPS: Record<MissingKey, string[]> = {
  title: [],
  jurisdiction: ["Delaware", "New York", "California", "Texas"],
  parties: [],
  purpose: [],
  payment_terms: ["$3,000 flat", "$500 on signing + $2,000 on delivery", "$2,000 monthly"],
  duration: ["30 days", "90 days", "1 year", "until delivery date"],
  effective_date: ["today", "next Monday", "on signing", "2026-03-01"],
};

const AgreementBuilderIntake: React.FC<Props> = ({ onCreated }) => {
  const [intakeText, setIntakeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<MissingKey[]>([]);
  const [missingAnswer, setMissingAnswer] = useState("");
  const [draft, setDraft] = useState<ParsedDraft | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const finalTranscriptRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const voiceSupported = useMemo(() => VOICE_FLAG, []);
  const speech = useSpeechController({
    onPartialTranscript: (text) => {
      const merged = `${finalTranscriptRef.current} ${text}`.trim();
      setIntakeText(merged);
    },
    onFinalTranscript: (text) => {
      finalTranscriptRef.current = `${finalTranscriptRef.current} ${text}`.trim();
      setIntakeText(finalTranscriptRef.current);
      textareaRef.current?.focus();
    },
    onError: (message) => setVoiceError(message),
  });

  async function parseDraft(rawText: string): Promise<ParsedDraft> {
    const res = await fetch(`${API_BASE}/api/agreements/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intake_text: rawText }),
    });
    if (!res.ok) throw new Error("parse_failed");
    const payload = await res.json();
    return payload?.draft as ParsedDraft;
  }

  async function createDraft(parsed: ParsedDraft): Promise<string> {
    const res = await fetch(`${API_BASE}/api/agreements/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
    if (!res.ok) throw new Error("create_failed");
    const payload = await res.json();
    return String(payload?.id || "");
  }

  function computeMissing(next: ParsedDraft): MissingKey[] {
    const out: MissingKey[] = [];
    if (!(next.title || "").trim()) out.push("title");
    if (!(next.jurisdiction || "").trim() || (next.jurisdiction || "").trim().toLowerCase() === "tbd") out.push("jurisdiction");
    if ((next.parties || []).length < 2) out.push("parties");
    if (!(next.purpose || "").trim()) out.push("purpose");
    if (!(next.payment_terms || "").trim()) out.push("payment_terms");
    if (!(next.duration || "").trim() && !(next.due_date || "").trim()) out.push("duration");
    if (!(next.effective_date || "").trim()) out.push("effective_date");
    return out;
  }

  function applyMissingValue(next: ParsedDraft, key: MissingKey, value: string): ParsedDraft {
    const v = (value || "").trim();
    if (!v) return next;
    if (key === "title") return { ...next, title: v };
    if (key === "jurisdiction") return { ...next, jurisdiction: v };
    if (key === "purpose") return { ...next, purpose: v };
    if (key === "payment_terms") return { ...next, payment_terms: v };
    if (key === "duration") return { ...next, duration: v };
    if (key === "effective_date") return { ...next, effective_date: v };
    if (key === "parties") {
      const items = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 2);
      if (items.length < 2) return next;
      return {
        ...next,
        parties: items.map((name, idx) => ({ name, role: idx === 0 ? "party_a" : "party_b" })),
      };
    }
    return next;
  }

  const onGenerate = async () => {
    if (!intakeText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      finalTranscriptRef.current = intakeText.trim();
      const parsed = await parseDraft(intakeText.trim());
      setDraft(parsed);
      const nextMissing = computeMissing(parsed);
      setMissing(nextMissing);
      setMissingAnswer("");
      if (nextMissing.length === 0) {
        const id = await createDraft(parsed);
        if (!id) throw new Error("missing_id");
        onCreated(id);
      }
    } catch (e: any) {
      setError(e?.message || "Could not generate draft.");
    } finally {
      setLoading(false);
    }
  };

  const applyMissingAnswer = async (value: string) => {
    if (!draft || missing.length === 0) return;
    const target = missing[0];
    const patched = applyMissingValue(draft, target, value);
    setDraft(patched);
    const nextMissing = computeMissing(patched);
    setMissing(nextMissing);
    setMissingAnswer("");
    if (nextMissing.length > 0) return;
    setLoading(true);
    setError(null);
    try {
      const id = await createDraft(patched);
      if (!id) throw new Error("missing_id");
      onCreated(id);
    } catch (e: any) {
      setError(e?.message || "Could not create draft.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="text-xs text-slate-400">
        Draft is non-binding by default. Not legal advice.
      </div>
      <textarea
        ref={textareaRef}
        className="mt-3 h-52 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
        placeholder="Describe your agreement..."
        value={intakeText}
        onChange={(e) => setIntakeText(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="btn bg-emerald-600 text-xs text-white hover:bg-emerald-500 disabled:opacity-60"
          onClick={onGenerate}
          disabled={loading || !intakeText.trim()}
        >
          {loading ? "Generating..." : "Generate Draft"}
        </button>
        <button
          className={`btn text-xs ${voiceSupported && speech.isSupported ? "" : "opacity-50"}`}
          onClick={() => {
            if (!voiceSupported || !speech.isSupported) return;
            if (speech.isListening) {
              speech.stopRecording();
            } else {
              finalTranscriptRef.current = intakeText.trim();
              speech.startRecording();
            }
          }}
          disabled={!voiceSupported || !speech.isSupported}
          title={voiceSupported && speech.isSupported ? "Voice intake" : "Voice coming soon"}
        >
          {speech.isListening ? "Stop Recording" : "Start Recording"}
        </button>
        {!VOICE_FLAG && <span className="text-xs text-slate-500">Voice coming soon</span>}
        {VOICE_FLAG && speech.isSupported && (
          <label className="ml-2 flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={speech.autoStopAfterSilence}
              onChange={(e) => speech.setAutoStopAfterSilence(e.target.checked)}
            />
            Auto-stop after silence
          </label>
        )}
        {speech.isListening && (
          <span className="text-xs text-emerald-300">Listening... {speech.elapsedLabel}</span>
        )}
        {speech.warningShown && speech.isListening && (
          <span className="text-xs text-amber-300">Approaching max 5:00 recording limit.</span>
        )}
      </div>
      {missing.length > 0 && (
        <div className="mt-4 rounded border border-amber-600/40 bg-amber-600/10 p-3">
          <div className="text-xs font-semibold text-amber-200">
            We need {missing.length} more {missing.length === 1 ? "detail" : "details"} to generate a complete draft.
          </div>
          <div className="mt-2 text-sm text-amber-100">{FIELD_QUESTION[missing[0]]}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {FIELD_CHIPS[missing[0]].map((chip) => (
              <button
                key={chip}
                className="rounded-full border border-amber-400/30 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/10"
                onClick={() => void applyMissingAnswer(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
              placeholder="Type your answer..."
              value={missingAnswer}
              onChange={(e) => setMissingAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void applyMissingAnswer(missingAnswer);
                }
              }}
            />
            <button
              className="btn text-xs"
              onClick={() => void applyMissingAnswer(missingAnswer)}
              disabled={!missingAnswer.trim() || loading}
            >
              Continue
            </button>
          </div>
        </div>
      )}
      {error && <div className="mt-3 text-xs text-rose-300">{error}</div>}
      {voiceError && <div className="mt-2 text-xs text-rose-300">{voiceError}</div>}
    </section>
  );
};

export default AgreementBuilderIntake;
