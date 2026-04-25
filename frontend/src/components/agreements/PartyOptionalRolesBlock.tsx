import { useEffect, useId, useMemo, useState } from "react";
import {
  defaultIntakePartyRoleLabels,
  inferRelationshipOptionOrder,
  presetLabelsFor,
  type IntakePartyRelationship,
  type IntakePartyRoleLabels,
} from "./partyRoleIntake";

type PartyRoleIntakeProps = {
  party1: string;
  party2: string;
  value: IntakePartyRoleLabels;
  onChange: (next: IntakePartyRoleLabels) => void;
  corpus: string;
  disabled?: boolean;
};

function relationshipTitle(r: IntakePartyRelationship): string {
  switch (r) {
    case "services":
      return "Services";
    case "collaboration":
      return "Collaboration";
    case "confidentiality_one_way":
      return "Confidentiality (one-way)";
    case "confidentiality_mutual":
      return "Confidentiality (mutual)";
    case "custom":
      return "Custom roles";
    default:
      return "";
  }
}

export function PartyOptionalRolesBlock(props: PartyRoleIntakeProps) {
  const { party1, party2, value, onChange, corpus, disabled } = props;
  const headingId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const optionOrder = useMemo(() => inferRelationshipOptionOrder(corpus), [corpus]);

  const close = () => {
    setOpen(false);
  };

  const applyPreset = (rel: Exclude<IntakePartyRelationship, "unset" | "custom">) => {
    const [l1, l2] = presetLabelsFor(rel);
    onChange({ relationship: rel, label1: l1, label2: l2 });
    close();
  };

  const swap = () => {
    if (value.relationship === "unset") return;
    onChange({ ...value, label1: value.label2, label2: value.label1 });
  };

  const clear = () => {
    onChange(defaultIntakePartyRoleLabels());
  };

  const optionCopy: Record<"services" | "collaboration" | "confidentiality", { title: string; hint: string }> = {
    services: {
      title: "One provides services",
      hint: "Maps to Service Provider and Client.",
    },
    collaboration: {
      title: "Both are collaborating",
      hint: "Symmetric Party A and Party B.",
    },
    confidentiality: {
      title: "Sharing confidential information",
      hint: "Pick one-way (discloser/recipient) or mutual.",
    },
  };

  const showSummary = value.relationship !== "unset";

  return (
    <div className="mt-3 border-t border-slate-800/60 pt-3">
      {!showSummary ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Add roles (optional)</p>
          <button
            type="button"
            disabled={disabled}
            className="rounded-md border border-slate-600/60 bg-slate-900/50 px-2.5 py-1 text-[11px] font-semibold text-emerald-200/95 transition enabled:hover:border-emerald-500/45 enabled:hover:bg-slate-900/80 disabled:cursor-not-allowed disabled:opacity-45 sm:text-xs"
            onClick={() => setOpen(true)}
          >
            Set roles
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Roles</p>
              <p className="text-xs font-medium text-slate-200 sm:text-sm">
                {relationshipTitle(value.relationship)}
                {value.label1 || value.label2 ? (
                  <>
                    <span className="text-slate-500"> — </span>
                    <span className="text-emerald-100/90">
                      {value.label1}
                      <span className="text-slate-500"> · </span>
                      {value.label2}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={disabled}
                className="rounded-md border border-slate-600/55 px-2 py-1 text-[10px] font-semibold text-slate-300 transition enabled:hover:border-emerald-500/40 enabled:hover:text-emerald-50 disabled:opacity-45 sm:text-[11px]"
                onClick={() => setOpen(true)}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={disabled}
                className="rounded-md border border-slate-600/55 px-2 py-1 text-[10px] font-semibold text-slate-300 transition enabled:hover:border-emerald-500/40 enabled:hover:text-emerald-50 disabled:opacity-45 sm:text-[11px]"
                onClick={swap}
              >
                Swap roles
              </button>
              <button
                type="button"
                disabled={disabled}
                className="rounded-md border border-slate-600/55 px-2 py-1 text-[10px] font-semibold text-slate-400 transition enabled:hover:border-rose-500/35 enabled:hover:text-rose-100 disabled:opacity-45 sm:text-[11px]"
                onClick={clear}
              >
                Clear
              </button>
            </div>
          </div>
          {showSummary ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[10px] font-medium text-slate-500 sm:text-[11px]">
                Label for {party1 || "first party"}
                <input
                  type="text"
                  disabled={disabled}
                  value={value.label1}
                  onChange={(e) => onChange({ ...value, label1: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-600/55 bg-[#141d32] px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-emerald-500/45 disabled:opacity-50 sm:text-sm"
                />
              </label>
              <label className="block text-[10px] font-medium text-slate-500 sm:text-[11px]">
                Label for {party2 || "second party"}
                <input
                  type="text"
                  disabled={disabled}
                  value={value.label2}
                  onChange={(e) => onChange({ ...value, label2: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-600/55 bg-[#141d32] px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-emerald-500/45 disabled:opacity-50 sm:text-sm"
                />
              </label>
            </div>
          ) : null}
        </div>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-3 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className="max-h-[min(90vh,520px)] w-full max-w-md overflow-y-auto rounded-xl border border-slate-600/60 bg-slate-950 p-4 shadow-2xl shadow-black/40 sm:p-5"
          >
            <h2 id={headingId} className="text-base font-semibold text-slate-50 sm:text-lg">
              How are these parties related?
            </h2>
            <p className="mt-1 text-xs leading-snug text-slate-400 sm:text-sm">Optional — skip to keep neutral wording everywhere.</p>

            <div className="mt-4 space-y-2">
              {optionOrder.map((key) => {
                const copy = optionCopy[key];
                if (key === "confidentiality") {
                  return (
                    <div key={key} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
                      <p className="text-sm font-semibold text-slate-100">{copy.title}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{copy.hint}</p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          className="flex-1 rounded-md border border-slate-600/55 bg-slate-900/70 px-2 py-2 text-left text-xs font-medium text-slate-100 transition hover:border-emerald-500/40"
                          onClick={() => applyPreset("confidentiality_one_way")}
                        >
                          One-way
                          <span className="mt-0.5 block text-[10px] font-normal text-slate-400">Disclosing Party / Receiving Party</span>
                        </button>
                        <button
                          type="button"
                          className="flex-1 rounded-md border border-slate-600/55 bg-slate-900/70 px-2 py-2 text-left text-xs font-medium text-slate-100 transition hover:border-emerald-500/40"
                          onClick={() => applyPreset("confidentiality_mutual")}
                        >
                          Mutual
                          <span className="mt-0.5 block text-[10px] font-normal text-slate-400">Both sides labeled Party</span>
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <button
                    key={key}
                    type="button"
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2.5 text-left text-sm font-semibold text-slate-100 transition hover:border-emerald-500/40 hover:bg-slate-900/80"
                    onClick={() => applyPreset(key)}
                  >
                    {copy.title}
                    <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{copy.hint}</span>
                  </button>
                );
              })}
              <button
                type="button"
                className="w-full rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2.5 text-left text-sm font-semibold text-slate-100 transition hover:border-emerald-500/40 hover:bg-slate-900/80"
                onClick={() => {
                  onChange({ relationship: "custom", label1: "Party A", label2: "Party B" });
                  setOpen(false);
                }}
              >
                Custom
                <span className="mt-0.5 block text-[11px] font-normal text-slate-400">Edit labels yourself after closing.</span>
              </button>
            </div>

            <div className="mt-4 flex justify-end border-t border-slate-800/70 pt-3">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:text-slate-100"
                onClick={close}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
