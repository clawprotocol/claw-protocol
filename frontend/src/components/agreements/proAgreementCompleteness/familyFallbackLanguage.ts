import type { CommercialFamilyHint } from "./types";

const FALLBACK_BY_TOPIC: Record<string, string> = {
  sla:
    "Service levels will be commercially reasonable for the services described, with maintenance windows and remedies to be confirmed before execution.",
  payment: "Fees and payment timing will be confirmed in writing before execution.",
  milestone:
    "Milestones and deliverables will be defined in a mutually agreed implementation schedule attached or confirmed before launch.",
  referral:
    "Referral compensation, clawbacks, and payout timing will be set out in a schedule or side letter confirmed by the Parties.",
  licensing:
    "License scope, sublicensing, and permitted use restrictions will be as described in this Agreement and any attached schedule.",
  confidentiality:
    "Confidential information remains protected during and after the term as set forth in this Agreement.",
  termination:
    "Either Party may terminate for material breach not cured within a commercially reasonable cure period, or as otherwise stated herein.",
  governing_law:
    "This Agreement is governed by the law identified in the Notices or Governing Law section, as confirmed by the Parties.",
  audit:
    "Audit rights, if any, will be limited to records reasonably necessary to verify compliance with this Agreement on reasonable notice.",
  exclusivity:
    "Any exclusivity or territory limitations will be defined in a schedule or amendment confirmed by the Parties.",
  ip:
    "Intellectual property and work product ownership will follow the allocation stated in this Agreement or a confirmed schedule.",
  support:
    "Support and response commitments will be commercially reasonable unless specific targets are confirmed in writing.",
  general:
    "The Parties shall perform their obligations in good faith and in accordance with this Agreement.",
};

export function neutralFallbackForTopic(topic: string, family?: CommercialFamilyHint): string {
  const key = topic.toLowerCase();
  if (family === "saas_msa" && /sla|uptime|support/.test(key)) {
    return FALLBACK_BY_TOPIC.sla;
  }
  if (family === "referral" && /commission|referral|payout/.test(key)) {
    return FALLBACK_BY_TOPIC.referral;
  }
  if (family === "licensing" && /license|sublicen/.test(key)) {
    return FALLBACK_BY_TOPIC.licensing;
  }
  return FALLBACK_BY_TOPIC[key] ?? FALLBACK_BY_TOPIC.general;
}

export function scrubVisiblePlaceholderLexemes(text: string): { text: string; repairs: string[] } {
  let out = text;
  const repairs: string[] = [];
  const replacements: readonly [RegExp, string, string][] = [
    [/\bTBD\b/gi, "to be confirmed in a supplemental schedule", "TBD→schedule"],
    [/\[ORG_\d+\]/gi, "the applicable Party", "ORG_slot"],
    [/\blorem ipsum\b/gi, "", "lorem_removed"],
    [/\bdraft implementation framework\b/gi, "implementation plan", "draft_framework"],
    [/\bplaceholder\b/gi, "schedule item", "placeholder_word"],
    [/\bto be mutually agreed\b/gi, "as the Parties confirm in writing", "tba_mutual"],
    [/\bif applicable\b/gi, "where relevant to the services", "if_applicable"],
  ];
  for (const [re, rep, tag] of replacements) {
    if (re.test(out)) {
      re.lastIndex = 0;
      out = out.replace(re, rep);
      repairs.push(tag);
    }
    re.lastIndex = 0;
  }
  return { text: out, repairs };
}
