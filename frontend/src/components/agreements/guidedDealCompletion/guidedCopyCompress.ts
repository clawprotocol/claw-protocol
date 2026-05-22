/** High-signal, low-word copy for Genesis Dogs guided UX. */

const SHORT_WILL_BY_TOPIC: Record<string, string> = {
  fees: "Add payment timing and invoice protections.",
  ip: "Clarify ownership of deliverables.",
  sla: "Add support response expectations.",
  confidentiality: "Add practical confidentiality duties.",
  termination: "Add termination notice language.",
  general: "Fill remaining open deal terms.",
};

function topicKey(variableId: string): string {
  if (/fee|payment|phase/i.test(variableId)) return "fees";
  if (/ip|ownership/i.test(variableId)) return "ip";
  if (/sla|support/i.test(variableId)) return "sla";
  if (/confidential|security|nda/i.test(variableId)) return "confidentiality";
  if (/terminat|renewal/i.test(variableId)) return "termination";
  return "general";
}

function firstSentence(text: string, maxWords: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  const sentence = (one.split(/(?<=[.!?])\s+/)[0] || one).trim();
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return sentence.replace(/\.$/, "");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

export function compressGuidedWhy(text: string | null | undefined): string | null {
  const t = (text || "").trim();
  if (!t) return null;
  const stripped = t
    .replace(/^Recommended because\s*/i, "")
    .replace(/^Why:\s*/i, "")
    .replace(/^Your intake\s+/i, "Your prompt ")
    .trim();
  return firstSentence(stripped, 14);
}

export function compressLawDogWill(variableId: string, raw: string): string {
  const topic = topicKey(variableId);
  const fallback = SHORT_WILL_BY_TOPIC[topic] ?? SHORT_WILL_BY_TOPIC.general;
  let t = (raw || "").trim();
  if (!t) return fallback;
  t = t
    .replace(/^Adds?\s+/i, "")
    .replace(/^Add\s+/i, "")
    .replace(/\s+to Section \d+[^.]*\.?/gi, ".")
    .replace(/\s+\(and Schedule A[^)]*\)/gi, "")
    .replace(/\s+reflecting:.*$/i, "")
    .replace(/\s+in Section \d+[^.]*\.?/gi, ".")
    .trim();
  if (t.length > 72 || /Section \d/i.test(t)) {
    return fallback;
  }
  const short = firstSentence(t, 12);
  if (!short) return fallback;
  const normalized = short.charAt(0).toUpperCase() + short.slice(1);
  return normalized.endsWith(".") ? normalized : `${normalized}.`;
}
