/** Negotiation playbook / posture (strategy dial only — user still approves every apply). */
export type NegotiationPosture =
  | "cooperative"
  | "firm"
  | "protective"
  | "fast_close"
  | "founder_friendly"
  | "investor_friendly";

export const NEGOTIATION_POSTURE_OPTIONS: {
  id: NegotiationPosture;
  label: string;
  preview: string;
}[] = [
  {
    id: "cooperative",
    label: "Cooperative",
    preview: "Smart suggestions favor compromise and relationship-preserving responses.",
  },
  {
    id: "firm",
    label: "Firm",
    preview: "Smart suggestions favor direct, boundary-setting responses.",
  },
  {
    id: "protective",
    label: "Protective",
    preview: "Smart suggestions favor downside protection and tighter safeguards.",
  },
  {
    id: "fast_close",
    label: "Fast-close",
    preview: "Smart suggestions favor simple changes that help close quickly.",
  },
  {
    id: "founder_friendly",
    label: "Founder-friendly",
    preview: "Smart suggestions favor operator flexibility and reduced burden.",
  },
  {
    id: "investor_friendly",
    label: "Investor-friendly",
    preview: "Smart suggestions favor structure, reporting, and explicit obligation language.",
  },
];

export const DEFAULT_NEGOTIATION_POSTURE: NegotiationPosture = "cooperative";

/** One-line preamble prepended to recipient revise instructions (same legal call; frames tone). */
export function recipientPostureInstructionPreamble(posture: NegotiationPosture): string {
  const lines: Record<NegotiationPosture, string> = {
    cooperative:
      "Approach: cooperative—preserve goodwill and use balanced language when applying the requested edits.",
    firm: "Approach: firm—be direct and clear about boundaries when applying the requested edits.",
    protective:
      "Approach: protective—favor clarity on risk and safeguards when applying the requested edits.",
    fast_close: "Approach: fast-close—prefer simple, minimal changes that support signing.",
    founder_friendly:
      "Approach: founder-friendly—favor practical flexibility for operators when applying the requested edits.",
    investor_friendly:
      "Approach: investor-friendly—favor structure, clarity, and explicit obligation language when applying the requested edits.",
  };
  return lines[posture] ?? lines.cooperative;
}

export function postureLabelForHistory(id: NegotiationPosture | undefined): string {
  if (!id) return "";
  const o = NEGOTIATION_POSTURE_OPTIONS.find((p) => p.id === id);
  return o?.label ?? id;
}
