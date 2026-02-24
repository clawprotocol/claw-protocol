import React, { useMemo, useRef, useState } from "react";
import {
  isVoiceIntakeSupported,
  startVoiceIntake,
  stopVoiceIntake,
} from "../../utils/voice/realtimeVoice";

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

const AgreementBuilderIntake: React.FC<Props> = ({ onCreated }) => {
  const [intakeText, setIntakeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [patchValues, setPatchValues] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<ParsedDraft | null>(null);
  const [listening, setListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const voiceSupported = useMemo(() => VOICE_FLAG && isVoiceIntakeSupported(), []);

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

  function computeMissing(next: ParsedDraft): string[] {
    const out: string[] = [];
    if (!(next.title || "").trim()) out.push("title");
    if (!(next.jurisdiction || "").trim()) out.push("jurisdiction");
    if ((next.parties || []).length < 2) out.push("parties");
    if (!(next.purpose || "").trim()) out.push("purpose");
    if (!(next.payment_terms || "").trim()) out.push("payment_terms");
    if (!(next.duration || "").trim() && !(next.due_date || "").trim()) out.push("duration");
    return out;
  }

  const onGenerate = async () => {
    if (!intakeText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = await parseDraft(intakeText.trim());
      setDraft(parsed);
      const nextMissing = computeMissing(parsed);
      setMissing(nextMissing);
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

  const onSubmitMissing = async () => {
    if (!draft) return;
    const patched: ParsedDraft = {
      ...draft,
      title: patchValues.title ?? draft.title,
      jurisdiction: patchValues.jurisdiction ?? draft.jurisdiction,
      parties:
        patchValues.parties && patchValues.parties.trim()
          ? patchValues.parties
              .split(",")
              .map((name) => name.trim())
              .filter(Boolean)
              .slice(0, 2)
              .map((name, idx) => ({ name, role: idx === 0 ? "party_a" : "party_b" }))
          : draft.parties,
      purpose: patchValues.purpose ?? draft.purpose,
      payment_terms: patchValues.payment_terms ?? draft.payment_terms,
      duration: patchValues.duration ?? draft.duration,
    };
    const nextMissing = computeMissing(patched);
    setMissing(nextMissing);
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

  const onMicClick = () => {
    if (!voiceSupported) return;
    if (listening) {
      stopVoiceIntake();
      setListening(false);
      return;
    }
    const ok = startVoiceIntake(
      (text) => {
        setIntakeText((prev) => [prev.trim(), text].filter(Boolean).join(" "));
        setListening(false);
        textareaRef.current?.focus();
      },
      () => setListening(false)
    );
    setListening(ok);
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
          className={`btn text-xs ${voiceSupported ? "" : "opacity-50"}`}
          onClick={onMicClick}
          disabled={!voiceSupported}
          title={voiceSupported ? "Voice intake" : "Voice coming soon"}
        >
          {listening ? "Stop Mic" : "Mic"}
        </button>
        {!VOICE_FLAG && <span className="text-xs text-slate-500">Voice coming soon</span>}
      </div>
      {missing.length > 0 && (
        <div className="mt-4 rounded border border-amber-600/40 bg-amber-600/10 p-3">
          <div className="text-xs font-semibold text-amber-200">Missing fields</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {missing.map((k) => (
              <input
                key={k}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                placeholder={k === "parties" ? "parties (comma separated, e.g. Acme, John Smith)" : k}
                value={patchValues[k] ?? ""}
                onChange={(e) => setPatchValues((prev) => ({ ...prev, [k]: e.target.value }))}
              />
            ))}
          </div>
          <div className="mt-2">
            <button className="btn text-xs" onClick={onSubmitMissing} disabled={loading}>
              Save Missing Fields
            </button>
          </div>
        </div>
      )}
      {error && <div className="mt-3 text-xs text-rose-300">{error}</div>}
    </section>
  );
};

export default AgreementBuilderIntake;
