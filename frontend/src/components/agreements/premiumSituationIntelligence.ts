/**
 * Situation-aware Pro framing: executive summaries, calm tone, ambiguity acknowledgment.
 * Deterministic — no LLM. Used for readonly HTML, review card copy, and document polish.
 */

import { detectIntakeContradictionHints, type IntakeContradictionKind } from "./intakeContradictionHints";

export type PremiumSituationKind =
  | "creator"
  | "saas"
  | "consulting"
  | "contractor"
  | "nda"
  | "settlement"
  | "licensing"
  | "partnership"
  | "employment"
  | "general";

export type PremiumSituationProfile = {
  kind: PremiumSituationKind;
  /** One-line executive framing (readonly callout / review intro). */
  executiveLine: string;
  /** Short label for review UI ("Influencer deal", etc.). */
  situationLabel: string;
};

export const CONTRADICTION_DOC_NOTES: Record<IntakeContradictionKind, string> = {
  exclusive_scope:
    "Your instructions mentioned both exclusive and non-exclusive rights — this draft uses one clear grant; adjust the usage section if needed.",
  refund_policy:
    "Refund rules in your notes looked mixed — confirm the single policy you want before sending.",
  termination_notice:
    "Termination timing in your notes was inconsistent — this draft uses one notice period; align it with your deal.",
  worker_classification:
    "Employee and contractor signals both appeared — confirm the relationship before relying on this draft.",
  governing_law_venue:
    "Governing law / venue references may conflict — pick one jurisdiction in review before signing.",
};

function normIntake(raw: string): string {
  return (raw || "").replace(/\s+/g, " ").trim();
}

export function detectPremiumSituationKind(intakeRaw: string): PremiumSituationKind {
  const low = normIntake(intakeRaw).toLowerCase();
  if (!low) return "general";
  if (
    /\b(influencer|ugc|creator|tiktok|instagram|youtube|podcast\s+sponsor|brand\s+deal|whitelisting|sponsorship)\b/.test(
      low,
    )
  ) {
    return "creator";
  }
  if (/\b(settlement|mutual\s+release|severance|release\s+of\s+claims|parting\s+ways)\b/.test(low)) {
    return "settlement";
  }
  if (/\b(?:mutual\s+)?(?:nda|non[-\s]?disclosure)\b/.test(low)) return "nda";
  if (/\b(independent\s+contractor|1099|freelance|consultant)\b/.test(low) && !/\bemployee\b/.test(low)) {
    return /\bconsult/.test(low) ? "consulting" : "contractor";
  }
  if (/\b(license|licen[cs]e\s+grant|ip\s+assignment|content\s+license)\b/.test(low)) return "licensing";
  if (/\b(saas|subscription|software\s+as\s+a\s+service|api\s+access|platform\s+terms)\b/.test(low)) {
    return "saas";
  }
  if (/\b(consulting|advisor|retainer|statement\s+of\s+work|sow)\b/.test(low)) return "consulting";
  if (/\b(partnership|joint\s+venture|collaboration\s+agreement)\b/.test(low)) return "partnership";
  if (/\b(employment|offer\s+letter|w-?2)\b/.test(low)) return "employment";
  return "general";
}

function intakeSuggestsEmotionalHighStakes(low: string): boolean {
  return /\b(ex-|ex\s|ghosting|ghosted|scared|betrayal|breakup|ruin|thanksgiving|lawsuit\s+lol|sue\s+them)\b/i.test(
    low,
  );
}

export function buildPremiumSituationProfile(intakeRaw: string): PremiumSituationProfile {
  const intake = normIntake(intakeRaw);
  const low = intake.toLowerCase();
  if (intakeSuggestsEmotionalHighStakes(low)) {
    return {
      kind: "general",
      situationLabel: "Sensitive arrangement",
      executiveLine:
        "Neutral, professional framing for a sensitive situation — confirm facts and amounts with your advisors before anyone signs.",
    };
  }
  const kind = detectPremiumSituationKind(intake);
  switch (kind) {
    case "creator":
      return {
        kind,
        situationLabel: "Creator / brand deal",
        executiveLine:
          "Built for a paid creator or brand collaboration — deliverables, usage window, and payment timing are spelled out for review.",
      };
    case "saas":
      return {
        kind,
        situationLabel: "SaaS / software",
        executiveLine:
          "Software-style commercial terms — subscription, acceptable use, data, and risk limits aligned to what you described.",
      };
    case "consulting":
      return {
        kind,
        situationLabel: "Consulting engagement",
        executiveLine:
          "Professional services shape — scope, acceptance, and how payment ties to deliverables or milestones.",
      };
    case "contractor":
      return {
        kind,
        situationLabel: "Contractor engagement",
        executiveLine:
          "Independent contractor framing — services, payment, IP on delivery, and how either side can end the work.",
      };
    case "nda":
      return {
        kind,
        situationLabel: "Confidentiality",
        executiveLine:
          "Confidentiality-first — who is bound, what is protected, how long it runs, and standard carve-outs.",
      };
    case "settlement":
      return {
        kind,
        situationLabel: "Settlement / release",
        executiveLine:
          "Release-and-payment structure — confirm amounts and claims scope with your advisors before anyone signs.",
      };
    case "licensing":
      return {
        kind,
        situationLabel: "License / IP",
        executiveLine:
          "License-focused — what is granted, for how long, in which channels, and what stays with each party.",
      };
    case "partnership":
      return {
        kind,
        situationLabel: "Partnership",
        executiveLine:
          "Collaboration terms — roles, economics, and how decisions or exits are handled between the parties.",
      };
    case "employment":
      return {
        kind,
        situationLabel: "Employment",
        executiveLine:
          "Employment-style terms — role, compensation hooks, and standard workplace protections to review with counsel.",
      };
    default:
      return {
        kind: "general",
        situationLabel: "Business agreement",
        executiveLine:
          "Drafted from your deal description — confirm party names, dollars, dates, and governing law before you send.",
      };
  }
}

/** Calm in-document note when intake had contradictory signals (max one combined line). */
export function buildPremiumContradictionDocumentNote(intakeRaw: string): string | null {
  const hints = detectIntakeContradictionHints(intakeRaw, 2);
  if (!hints.length) return null;
  if (hints.length === 1) return CONTRADICTION_DOC_NOTES[hints[0]!.kind];
  return "A few instructions pointed in different directions — review the highlighted areas and align them with your actual deal before sending.";
}

/** Review-card intro for Pro summary panel (screenshot-adjacent). */
export function buildPremiumReviewCardIntro(intakeRaw: string): string {
  const profile = buildPremiumSituationProfile(intakeRaw);
  const contradiction = buildPremiumContradictionDocumentNote(intakeRaw);
  const base = `${profile.executiveLine} Key fields below mirror the full Pro document.`;
  if (!contradiction) return base;
  return `${base} ${contradiction}`;
}

/** Panel heading when we can be situational without replacing the legal title. */
export function resolveProReviewDocumentPanelHeading(intakeRaw: string, agreementTitle?: string | null): string {
  const title = (agreementTitle || "").trim();
  if (title && title.length > 8 && !/^agreement$/i.test(title)) {
    return title;
  }
  const label = buildPremiumSituationProfile(intakeRaw).situationLabel;
  return label === "Business agreement" ? "Your Pro agreement" : `${label} — Pro draft`;
}

/** Soften fear-based or overconfident litigation phrasing in generated Pro bodies. */
export function softenProDocumentTone(text: string): string {
  let t = text;
  const rules: [RegExp, string][] = [
    [/\bunder\s+no\s+circumstances\s+shall\b/gi, "Neither party shall"],
    [/\bstrictly\s+prohibited\b/gi, "not permitted under this Agreement"],
    [/\bimmediate\s+injunctive\s+relief\b/gi, "equitable relief available under applicable law"],
    [
      /\b(?:will|shall)\s+be\s+prosecuted\s+to\s+the\s+fullest\s+extent\s+of\s+the\s+law\b/gi,
      "may pursue remedies permitted by applicable law",
    ],
    [/\bzero\s+tolerance\b/gi, "no tolerance"],
    [/\bgrave\s+misconduct\b/gi, "material breach"],
    [/\bdevastating\b/gi, "material"],
    [/\bshall\s+sue\b/gi, "may bring a claim"],
    [/\bguaranteed\s+to\s+win\b/gi, "may be entitled to relief"],
  ];
  for (const [re, rep] of rules) {
    t = t.replace(re, rep);
  }
  return t;
}
