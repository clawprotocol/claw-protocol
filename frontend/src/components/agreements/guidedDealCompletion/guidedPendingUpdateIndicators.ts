import type { GuidedCompletionSession } from "./types";

export type GuidedPendingUpdateIndicator = {
  id: string;
  label: string;
};

function labelForVariable(id: string, label: string): string {
  const blob = `${id} ${label}`.toLowerCase();
  if (/\bip|ownership|work product|deliverable/.test(blob)) return "Ownership clause pending confirmation";
  if (/\bgoverning|jurisdiction|venue|law\b/.test(blob)) return "Governing law pending selection";
  if (/\bpayment|fee|compensation|milestone|invoice\b/.test(blob)) return "Payment terms pending confirmation";
  if (/\btermination|renewal|notice\b/.test(blob)) return "Termination terms pending confirmation";
  if (/\bconfidential/.test(blob)) return "Confidentiality clause pending confirmation";
  if (/\bsupport|uptime|sla|service level\b/.test(blob)) return "Support expectations pending confirmation";
  return `${label || "Business term"} pending confirmation`;
}

export function buildGuidedPendingUpdateIndicators(
  session: GuidedCompletionSession | null | undefined,
  max = 3,
): GuidedPendingUpdateIndicator[] {
  if (!session) return [];
  const out: GuidedPendingUpdateIndicator[] = [];
  for (const id of session.queue) {
    if (out.length >= max) break;
    if (session.answered[id] || session.skipped.has(id)) continue;
    const variable = session.variables.find((v) => v.id === id);
    if (!variable) continue;
    out.push({
      id,
      label: labelForVariable(id, variable.label || variable.question),
    });
  }
  return out;
}
