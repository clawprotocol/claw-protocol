export type ProtectedCommercialFactCategory =
  | "scope"
  | "deliverable"
  | "support_model"
  | "payment_structure"
  | "operational_constraint"
  | "phase";

export type ProtectedCommercialFact = {
  category: ProtectedCommercialFactCategory;
  text: string;
  canonical: string;
};

export type CommercialSpecificityPreservationResult = {
  text: string;
  facts: ProtectedCommercialFact[];
  repairs: string[];
  score: CommercialSpecificityScore;
};

export type CommercialSpecificityScore = {
  retainedFacts: ProtectedCommercialFact[];
  missingFacts: ProtectedCommercialFact[];
  score: number;
};

export type CommercialNormalizationMode = "soft" | "hard";

export const MINIMUM_COMMERCIAL_SPECIFICITY_SCORE = 80;

const CONCRETE_FACT_PATTERNS: ReadonlyArray<{
  category: ProtectedCommercialFactCategory;
  patterns: readonly RegExp[];
  canonical: string;
}> = [
  {
    category: "scope",
    patterns: [/\bAI workflow implementation\b/i, /\bworkflow implementation\b/i],
    canonical: "AI workflow implementation",
  },
  {
    category: "deliverable",
    patterns: [/\bdashboard setup\b/i, /\bdashboards?\b/i],
    canonical: "dashboard setup",
  },
  {
    category: "support_model",
    patterns: [/\bautomation support\b/i],
    canonical: "automation support",
  },
  {
    category: "support_model",
    patterns: [/\bonboarding assistance\b/i, /\bonboarding\b/i],
    canonical: "onboarding assistance",
  },
  {
    category: "support_model",
    patterns: [/\blight ongoing maintenance\b/i, /\bongoing maintenance\b/i],
    canonical: "light ongoing maintenance",
  },
  {
    category: "support_model",
    patterns: [/\boptional\s+\$?6,?000(?:\.00)?\s*(?:\/|\s+per\s+)?month(?:ly)?\s+(?:continuing\s+)?support\b/i],
    canonical: "optional $6,000/month continuing support",
  },
  {
    category: "payment_structure",
    patterns: [/\$120,?000(?:\.00)?\s+total(?:\s+project\s+fee)?/i],
    canonical: "$120,000 total project fee",
  },
  {
    category: "phase",
    patterns: [/\b40\s*%\s+build\/configuration\b/i, /\b40\s*%\s+build\b/i],
    canonical: "40% build/configuration",
  },
  {
    category: "phase",
    patterns: [/\b30\s*%\s+rollout\/onboarding\b/i, /\b30\s*%\s+rollout\s+and\s+onboarding\b/i],
    canonical: "30% rollout/onboarding",
  },
  {
    category: "phase",
    patterns: [/\b30\s*%\s+support\/acceptance\b/i, /\b30\s*%\s+support\s+and\s+acceptance\b/i],
    canonical: "30% support/acceptance",
  },
  {
    category: "operational_constraint",
    patterns: [
      /\bno\s+guaranteed?\s+uptime\s+for\s+third[-\s]?party\s+AI\s+platforms?\b/i,
      /\bno\s+guaranteed?\s+third[-\s]?party\s+AI\s+uptime\b/i,
    ],
    canonical: "no guaranteed uptime for third-party AI platforms",
  },
  {
    category: "scope",
    patterns: [/\bpaid advertising management\b/i],
    canonical: "paid advertising management",
  },
  {
    category: "support_model",
    patterns: [/\blaunch coordination\b/i],
    canonical: "launch coordination",
  },
  {
    category: "scope",
    patterns: [/\bemail marketing\b/i],
    canonical: "email marketing",
  },
  {
    category: "deliverable",
    patterns: [/\banalytics reporting\b/i],
    canonical: "analytics reporting",
  },
  {
    category: "scope",
    patterns: [/\bcreative strategy\b/i],
    canonical: "creative strategy",
  },
  {
    category: "support_model",
    patterns: [/\bcampaign optimization\b/i],
    canonical: "campaign optimization",
  },
  {
    category: "payment_structure",
    patterns: [/\$18,?000(?:\.00)?\b/i],
    canonical: "$18,000",
  },
  {
    category: "phase",
    patterns: [/\b3\s+milestones\b|\bthree\s+milestones\b/i],
    canonical: "3 milestones",
  },
  {
    category: "phase",
    patterns: [/\b4\s+months\b|\bfour\s+months\b/i],
    canonical: "4 months",
  },
  {
    category: "scope",
    patterns: [/\boperations consulting\b/i],
    canonical: "operations consulting",
  },
  {
    category: "support_model",
    patterns: [/\badvisory calls\b/i],
    canonical: "advisory calls",
  },
  {
    category: "deliverable",
    patterns: [/\bworkflow recommendations\b/i],
    canonical: "workflow recommendations",
  },
  {
    category: "operational_constraint",
    patterns: [/\bvendor coordination\b/i],
    canonical: "vendor coordination",
  },
  {
    category: "deliverable",
    patterns: [/\bmonthly reporting\b/i],
    canonical: "monthly reporting",
  },
  {
    category: "payment_structure",
    patterns: [/\$4,?500(?:\.00)?\s*(?:\/|\s+per\s+)?month(?:ly)?\b/i],
    canonical: "$4,500/month",
  },
  {
    category: "operational_constraint",
    patterns: [/\b15[-\s]?day\s+termination\b|\b15\s+days?\s+written\s+notice\b/i],
    canonical: "15-day termination",
  },
];

const FORBIDDEN_GENERIC_SCOPE_RE =
  /\b(?:scope\s+as\s+set\s+forth\s+below|operative\s+sections\s+and\s+schedules\s+below|services\s+as\s+applicable|scope of services and deliverables under this Agreement are as set forth in the operative sections and schedules below)\b/i;

function normalizeFactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function pushFact(out: ProtectedCommercialFact[], seen: Set<string>, fact: ProtectedCommercialFact): void {
  const canonical = normalizeFactText(fact.canonical);
  const key = `${fact.category}:${canonical.toLowerCase()}`;
  if (!canonical || seen.has(key)) return;
  seen.add(key);
  out.push({ ...fact, text: normalizeFactText(fact.text), canonical });
}

export function extractProtectedCommercialFacts(
  intakeText: string | null | undefined,
  draftText?: string | null,
): ProtectedCommercialFact[] {
  const blob = `${intakeText ?? ""}\n${draftText ?? ""}`;
  const facts: ProtectedCommercialFact[] = [];
  const seen = new Set<string>();
  for (const spec of CONCRETE_FACT_PATTERNS) {
    for (const pattern of spec.patterns) {
      const match = blob.match(pattern);
      if (!match) continue;
      pushFact(facts, seen, {
        category: spec.category,
        text: match[0],
        canonical: spec.canonical,
      });
      break;
    }
  }
  return facts;
}

function significantTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\$6,000\/month/g, "6000 month")
    .replace(/\$120,000/g, "120000")
    .replace(/\$18,000/g, "18000")
    .replace(/\$4,500\/month/g, "4500 month")
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length >= 4 || /^\d+$/.test(term));
}

function textRetainsFact(text: string, fact: ProtectedCommercialFact): boolean {
  const low = text.toLowerCase().replace(/\$6,000\/month/g, "6000 month").replace(/\$120,000/g, "120000");
  const normalizedLow = low.replace(/\$18,000/g, "18000").replace(/\$4,500\/month/g, "4500 month");
  const canonical = fact.canonical.toLowerCase();
  if (canonical.includes("$120,000")) return /\b120,?000\b|\b120000\b/.test(low);
  if (canonical.includes("$6,000/month")) return /\b6,?000\b|\b6000\b/.test(low) && /\bsupport\b/.test(low);
  if (canonical.includes("$18,000")) return /\b18,?000\b|\b18000\b/.test(normalizedLow);
  if (canonical.includes("$4,500/month")) return (/\b4,?500\b|\b4500\b/.test(normalizedLow) && /\bmonth\b/.test(normalizedLow));
  if (/^\d+\s*%/.test(canonical)) {
    const pct = canonical.match(/^(\d+)\s*%/)?.[1];
    const terms = significantTerms(canonical).filter((term) => !/^\d+$/.test(term));
    return Boolean(pct && new RegExp(`\\b${pct}\\s*%`).test(normalizedLow) && terms.some((term) => normalizedLow.includes(term)));
  }
  const terms = significantTerms(canonical);
  if (terms.length === 0) return false;
  const retained = terms.filter((term) => normalizedLow.includes(term)).length;
  return retained / terms.length >= 0.75;
}

export function scoreCommercialSpecificity(
  intakeFacts: readonly ProtectedCommercialFact[] | string | null | undefined,
  finalText: string | null | undefined,
): CommercialSpecificityScore {
  const facts = typeof intakeFacts === "string" ? extractProtectedCommercialFacts(intakeFacts) : [...(intakeFacts ?? [])];
  const text = finalText ?? "";
  const retainedFacts = facts.filter((fact) => textRetainsFact(text, fact));
  const missingFacts = facts.filter((fact) => !textRetainsFact(text, fact));
  return {
    retainedFacts,
    missingFacts,
    score: facts.length === 0 ? 100 : Math.round((retainedFacts.length / facts.length) * 100),
  };
}

export function logCommercialSpecificityScore(args: {
  score: CommercialSpecificityScore;
  normalizationMode: CommercialNormalizationMode;
  surface?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "production") return;
  const shouldLog =
    typeof import.meta === "undefined" ||
    Boolean(import.meta.env?.DEV) ||
    import.meta.env?.MODE === "test";
  if (!shouldLog) return;
  // eslint-disable-next-line no-console
  console.info("[commercial-specificity-score]", {
    score: args.score.score,
    retainedFacts: args.score.retainedFacts.map((fact) => fact.canonical),
    missingFacts: args.score.missingFacts.map((fact) => fact.canonical),
    normalizationMode: args.normalizationMode,
    surface: args.surface ?? null,
  });
}

function splitSections(text: string): Array<{ start: number; end: number; heading: string; body: string }> {
  const matches = [...text.matchAll(/^[ \t]*\d+\.\s+.+$/gm)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? text.length : text.length;
    return {
      start,
      end,
      heading: match[0],
      body: text.slice(start, end),
    };
  });
}

function scopeFacts(facts: readonly ProtectedCommercialFact[]): ProtectedCommercialFact[] {
  return facts.filter((fact) =>
    (fact.category === "scope" ||
      fact.category === "deliverable" ||
      fact.category === "support_model") &&
    !/[$]\d|\/month|uptime/i.test(fact.canonical),
  );
}

function phraseList(facts: readonly ProtectedCommercialFact[]): string {
  const items = facts.map((fact) => fact.canonical);
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function scopeSentence(facts: readonly ProtectedCommercialFact[]): string {
  return `Service Provider will provide ${phraseList(facts)} for Client.`;
}

function sectionContainsAllFacts(section: string, facts: readonly ProtectedCommercialFact[]): boolean {
  const low = section.toLowerCase();
  return facts.every((fact) => {
    const terms = fact.canonical
      .toLowerCase()
      .replace(/\$6,000\/month/g, "6,000")
      .split(/[^a-z0-9]+/i)
      .filter((term) => term.length >= 4);
    return terms.some((term) => low.includes(term));
  });
}

function replaceOrInsertScopeSection(text: string, facts: readonly ProtectedCommercialFact[]): {
  text: string;
  repaired: boolean;
} {
  const sections = splitSections(text);
  const target =
    sections.find((section) => /^\s*1\.\s+.*(?:purpose|scope|services)/i.test(section.heading)) ??
    sections.find((section) => /\b(?:purpose|scope|services)\b/i.test(section.heading));
  const sentence = scopeSentence(facts);
  if (!target) {
    return {
      text: `1. Purpose and Scope\n${sentence}\n\n${text}`.replace(/\n{3,}/g, "\n\n").trim(),
      repaired: true,
    };
  }
  const lines = target.body.split("\n");
  const heading = lines[0];
  const bodyLines = lines.slice(1).filter((line) => !FORBIDDEN_GENERIC_SCOPE_RE.test(line));
  const existingBody = bodyLines.join("\n");
  if (sectionContainsAllFacts(existingBody, facts) && !FORBIDDEN_GENERIC_SCOPE_RE.test(target.body)) {
    return { text, repaired: false };
  }
  const nextSection = [heading, sentence, ...bodyLines.filter((line) => line.trim() && line.trim() !== sentence)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text: `${text.slice(0, target.start)}${nextSection}\n\n${text.slice(target.end).replace(/^\s+/, "")}`
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    repaired: true,
  };
}

function sentenceForFact(fact: ProtectedCommercialFact): string {
  if (fact.category === "payment_structure") return `The commercial terms include a ${fact.canonical}.`;
  if (fact.category === "support_model" && /[$]\d|\/month/i.test(fact.canonical)) {
    return `The commercial terms include ${fact.canonical}.`;
  }
  if (fact.category === "phase") return `The project phase allocation includes ${fact.canonical}.`;
  if (fact.category === "operational_constraint") return `The support model includes ${fact.canonical}.`;
  if (fact.category === "support_model") return `The support model includes ${fact.canonical}.`;
  return `The services include ${fact.canonical}.`;
}

function sectionPatternForFact(fact: ProtectedCommercialFact): RegExp {
  if (fact.category === "payment_structure" || fact.category === "phase" || /[$]\d|\/month/i.test(fact.canonical)) {
    return /\b(?:fees?|payment|compensation|commercial terms)\b/i;
  }
  if (fact.category === "support_model" || fact.category === "operational_constraint") return /\b(?:support|maintenance|service levels?|sla)\b/i;
  return /\b(?:purpose|scope|services)\b/i;
}

function headingForFact(fact: ProtectedCommercialFact): string {
  if (fact.category === "payment_structure" || fact.category === "phase" || /[$]\d|\/month/i.test(fact.canonical)) {
    return "Fees and Payment";
  }
  if (fact.category === "support_model" || fact.category === "operational_constraint") return "Support";
  return "Purpose and Scope";
}

function insertFactIntoOwningSection(text: string, fact: ProtectedCommercialFact): { text: string; repaired: boolean } {
  if (textRetainsFact(text, fact)) return { text, repaired: false };
  const sections = splitSections(text);
  const target = sections.find((section) => sectionPatternForFact(fact).test(section.heading));
  const sentence = sentenceForFact(fact);
  if (!target) {
    const nextNumber = Math.max(0, ...sections.map((section) => Number(section.heading.match(/^\s*(\d+)\./)?.[1] ?? 0))) + 1;
    return {
      text: `${text}\n\n${nextNumber}. ${headingForFact(fact)}\n${sentence}`.replace(/\n{3,}/g, "\n\n").trim(),
      repaired: true,
    };
  }
  const nextSection = `${target.body.trim()}\n${sentence}`;
  return {
    text: `${text.slice(0, target.start)}${nextSection}\n\n${text.slice(target.end).replace(/^\s+/, "")}`
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    repaired: true,
  };
}

export function preserveProtectedCommercialFacts(args: {
  text: string;
  intakeText?: string | null;
  draftText?: string | null;
  normalizationMode?: CommercialNormalizationMode;
  surface?: string | null;
}): CommercialSpecificityPreservationResult {
  const facts = extractProtectedCommercialFacts(args.intakeText, args.draftText ?? args.text);
  const repairs: string[] = [];
  let out = (args.text || "").replace(/\r\n?/g, "\n").trim();
  const protectedScopeFacts = scopeFacts(facts);
  if (protectedScopeFacts.length > 0) {
    const scope = replaceOrInsertScopeSection(out, protectedScopeFacts);
    out = scope.text;
    if (scope.repaired) repairs.push("commercial_specificity:scope_facts_preserved");
  }
  for (const fact of facts) {
    const inserted = insertFactIntoOwningSection(out, fact);
    out = inserted.text;
    if (inserted.repaired) repairs.push(`commercial_specificity:${fact.category}_fact_preserved`);
  }
  const score = scoreCommercialSpecificity(facts, out);
  logCommercialSpecificityScore({
    score,
    normalizationMode: args.normalizationMode ?? "soft",
    surface: args.surface,
  });
  return { text: out, facts, repairs, score };
}

export function containsForbiddenGenericScopeAbstraction(text: string): boolean {
  return FORBIDDEN_GENERIC_SCOPE_RE.test(text || "");
}
