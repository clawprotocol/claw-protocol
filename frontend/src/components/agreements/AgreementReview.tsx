import React, { useEffect, useMemo, useState } from "react";

type Party = { name: string; role: string };

type AgreementDraft = {
  id: string;
  title: string;
  jurisdiction: string;
  parties: Party[];
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
  created_at: string;
  updated_at: string;
  versions: Array<{ version: number; created_at: string; note?: string | null }>;
  audit_log: Array<{ event_type: string; at: string; field?: string | null; value?: unknown }>;
};

type Props = {
  agreementId: string;
  onBackToNew?: () => void;
  onGoLegacy?: () => void;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

const AgreementReview: React.FC<Props> = ({ agreementId, onBackToNew, onGoLegacy }) => {
  const [draft, setDraft] = useState<AgreementDraft | null>(null);
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [status, setStatus] = useState<"Draft" | "Complete Draft" | "Signed">("Draft");
  const [editInstruction, setEditInstruction] = useState("");

  const requiredComplete = useMemo(() => {
    if (!draft) return false;
    return (
      Boolean((draft.title || "").trim()) &&
      (draft.parties || []).length >= 2 &&
      Boolean((draft.purpose || "").trim()) &&
      Boolean((draft.payment_terms || "").trim()) &&
      Boolean((draft.duration || "").trim()) &&
      (draft.parties || []).length >= 2 &&
      Boolean((draft.jurisdiction || "").trim()) &&
      Boolean((draft.effective_date || "").trim())
    );
  }, [draft]);

  useEffect(() => {
    const signed = Boolean((draft?.audit_log || []).find((e) => e.event_type === "signed"));
    if (signed) setStatus("Signed");
    else if (requiredComplete) setStatus("Complete Draft");
    else setStatus("Draft");
  }, [draft, requiredComplete]);

  async function loadDraft() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}`);
      if (!res.ok) throw new Error("load_failed");
      const payload = await res.json();
      setDraft(payload?.draft || null);
    } catch (e: any) {
      setError(e?.message || "Could not load agreement.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRendered() {
    try {
      const res = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/render`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("render_failed");
      const payload = await res.json();
      setRenderedHtml(String(payload?.rendered_html || ""));
    } catch {
      setRenderedHtml("");
    }
  }

  useEffect(() => {
    void loadDraft();
    void loadRendered();
  }, [agreementId]);

  async function saveField(field: string, value: unknown) {
    setSavingField(field);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/update-field`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value }),
        }
      );
      if (!res.ok) throw new Error("update_failed");
      const payload = await res.json();
      setDraft(payload?.draft || null);
      await loadRendered();
    } catch (e: any) {
      setError(e?.message || "Could not save field.");
    } finally {
      setSavingField(null);
    }
  }

  function EditableField(props: {
    label: string;
    field: string;
    value: string | null | undefined;
    placeholder?: string;
  }) {
    const [editing, setEditing] = useState(false);
    const [localValue, setLocalValue] = useState(props.value ?? "");

    useEffect(() => {
      setLocalValue(props.value ?? "");
    }, [props.value]);

    if (!editing) {
      return (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{props.label}</div>
          <div className="mt-1 text-sm text-slate-100">{(props.value || "").trim() || "TBD"}</div>
          <button className="btn mt-2 text-xs" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      );
    }
    return (
      <div className="rounded border border-slate-700 bg-slate-900/60 p-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">{props.label}</div>
        <input
          className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          placeholder={props.placeholder || props.label}
        />
        <div className="mt-2 flex gap-2">
          <button
            className="btn text-xs"
            disabled={savingField === props.field}
            onClick={async () => {
              await saveField(props.field, localValue.trim() || null);
              setEditing(false);
            }}
          >
            Save
          </button>
          <button
            className="btn text-xs"
            onClick={() => {
              setLocalValue(props.value ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  async function onExportDocx() {
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/export-docx`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("export_failed");
      await loadDraft();
    } catch (e: any) {
      setError(e?.message || "Could not export.");
    }
  }

  async function saveParties(nextParties: Party[]) {
    await saveField("parties", nextParties);
  }

  async function reviseAgreement() {
    const instruction = editInstruction.trim();
    if (!instruction) return;
    setSavingField("conversation");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      if (!res.ok) throw new Error("revise_failed");
      const payload = await res.json();
      setDraft(payload?.draft || null);
      setRenderedHtml(String(payload?.rendered_html || ""));
      setEditInstruction("");
    } catch (e: any) {
      setError(e?.message || "Could not apply edit.");
    } finally {
      setSavingField(null);
    }
  }

  if (loading && !draft) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
        Loading agreement...
      </section>
    );
  }

  if (!draft) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="text-sm text-rose-300">{error || "Agreement not found."}</div>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs text-slate-500">Agreement ID: {draft.id}</div>
          <div className="mt-1 inline-flex rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
            {status}
          </div>
        </div>
        <div className="flex gap-2">
          {onBackToNew && (
            <button className="btn text-xs" onClick={onBackToNew}>
              New Intake
            </button>
          )}
          {onGoLegacy && (
            <button className="btn text-xs" onClick={onGoLegacy}>
              Open Legacy Builder
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <EditableField label="Title" field="title" value={draft.title} />
        <EditableField label="Jurisdiction" field="jurisdiction" value={draft.jurisdiction} />
        <EditableField
          label="Effective Date"
          field="effective_date"
          value={draft.effective_date || "TBD"}
          placeholder="YYYY-MM-DD"
        />
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Edit Agreement</div>
        <div className="mt-2 text-xs text-slate-400">
          Describe the change naturally (example: "Change payment to $3,000 flat and make term 12 months.").
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            placeholder="Type a drafting instruction..."
            value={editInstruction}
            onChange={(e) => setEditInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void reviseAgreement();
              }
            }}
          />
          <button
            className="btn bg-emerald-600 text-xs text-white hover:bg-emerald-500 disabled:opacity-60"
            disabled={savingField === "conversation" || !editInstruction.trim()}
            onClick={() => void reviseAgreement()}
          >
            Apply
          </button>
        </div>
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Parties</div>
        <div className="space-y-2">
          {(draft.parties || []).map((party, idx) => (
            <PartyRow
              key={`${party.name}_${idx}`}
              index={idx}
              party={party}
              disabled={savingField === "parties"}
              onSave={(nextParty) => {
                const nextParties = [...(draft.parties || [])];
                nextParties[idx] = nextParty;
                void saveParties(nextParties);
              }}
            />
          ))}
          <button
            className="btn text-xs"
            disabled={savingField === "parties"}
            onClick={() => {
              const nextParties = [...(draft.parties || []), { name: "", role: "party" }];
              void saveParties(nextParties);
            }}
          >
            Add party
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded border border-slate-800 bg-slate-900/40 p-3">
        <button className="btn text-xs opacity-70" disabled>
          Versions (stub)
        </button>
        <button className="btn text-xs opacity-70" disabled>
          Redlines (stub)
        </button>
        <button className="btn text-xs opacity-70" disabled>
          Comments (stub)
        </button>
        <button className="btn text-xs" onClick={() => setAuditOpen((v) => !v)}>
          {auditOpen ? "Hide Audit" : "Audit"}
        </button>
        <button className="btn text-xs" onClick={onExportDocx}>
          Export (.docx)
        </button>
        <button
          className="btn bg-emerald-600 text-xs text-white hover:bg-emerald-500 disabled:opacity-60"
          disabled={!requiredComplete}
          title={requiredComplete ? "Proceed to sign" : "Complete core fields first"}
        >
          Proceed to Sign
        </button>
      </div>

      {auditOpen && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Audit</div>
          <div className="mt-2 space-y-1 text-xs text-slate-300">
            {(draft.audit_log || []).map((evt, idx) => (
              <div key={`${evt.at}_${evt.event_type}_${idx}`}>
                {evt.at} - {evt.event_type}
                {evt.field ? ` (${evt.field})` : ""}
              </div>
            ))}
            {(draft.audit_log || []).length === 0 && <div>No audit events yet.</div>}
          </div>
        </div>
      )}

      <div className="rounded border border-slate-800 bg-white p-4 text-slate-900">
        <div className="text-xs uppercase tracking-wide text-slate-600">Agreement Preview</div>
        <div className="mt-1 text-[11px] text-slate-500">Last updated: {new Date(draft.updated_at).toLocaleString()}</div>
        <div
          className="prose mt-2 max-w-none text-sm"
          dangerouslySetInnerHTML={{ __html: renderedHtml || "<p>No rendered document yet.</p>" }}
        />
      </div>

      {error && <div className="text-xs text-rose-300">{error}</div>}
    </section>
  );
};

const PartyRow: React.FC<{
  index: number;
  party: Party;
  disabled?: boolean;
  onSave: (party: Party) => void;
}> = ({ index, party, onSave, disabled }) => {
  const [name, setName] = useState(party.name || "");
  const [role, setRole] = useState(party.role || "party");

  useEffect(() => {
    setName(party.name || "");
    setRole(party.role || "party");
  }, [party.name, party.role]);

  return (
    <div className="grid gap-2 rounded border border-slate-800 bg-slate-950/40 p-2 md:grid-cols-[1fr_1fr_auto]">
      <input
        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
        value={name}
        placeholder={`Party ${index + 1} name`}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
        value={role}
        placeholder="Role"
        onChange={(e) => setRole(e.target.value)}
      />
      <button
        className="btn text-xs"
        disabled={disabled}
        onClick={() => onSave({ name: name.trim(), role: role.trim() || "party" })}
      >
        Save
      </button>
    </div>
  );
};

export default AgreementReview;
