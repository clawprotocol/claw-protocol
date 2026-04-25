import { isFounderEquityVestingIntent } from "./founderIntentRouter";
import type { PremiumFullDraftContextPayload } from "./premiumFullDraftApi";

/**
 * First matching rule wins (order is product-defined).
 * Drives a canonical `title` + `clause_pack_seed` on the LawDog Pro full-draft request, before the LLM.
 */
export const DETERMINISTIC_INTENT_IDS = [
  "logo_brand",
  "graphic_design",
  "web_presence",
  "loan",
  "founder_equity",
] as const;

export type DeterministicIntentId = (typeof DETERMINISTIC_INTENT_IDS)[number];

export type DeterministicIntentResolution = {
  id: DeterministicIntentId;
  title: string;
  clausePackSeed: string;
};

const LOGO: DeterministicIntentResolution = {
  id: "logo_brand",
  title: "Logo Design Agreement",
  clausePackSeed: [
    "This is a logo/brand creative engagement, not software development; creative revision rounds are not the same as compliance, QA, or ‘review’ consulting.",
    "IP ownership and assignment of the final delivered logo/brand mark and work product;",
    "deliverables, file formats, color usage, and brand guidelines handoff;",
    "included revision rounds, out-of-scope / additional revision billing, acceptance/approval, and the stated flat fee (e.g. $1,500) / kill fee if applicable;",
    "warranty on originality / non-infringement of the designer's work;",
    "confidentiality; portfolio/use-in-marketing display rights (if any).",
  ].join(" "),
};

const GRAPHIC: DeterministicIntentResolution = {
  id: "graphic_design",
  title: "Design Services Agreement",
  clausePackSeed: [
    "project scope, phases, and acceptance criteria for design deliverables;",
    "change requests / additional rounds and how billed;",
    "fees, expenses, and invoicing;",
    "IP in commissioned work (client ownership vs. licensed use);",
    "confidentiality; term and termination.",
  ].join(" "),
};

const WEB: DeterministicIntentResolution = {
  id: "web_presence",
  title: "Web Development Agreement",
  clausePackSeed: [
    "build scope: pages, features, integrations, hosting, CMS, and acceptance testing;",
    "content responsibilities (text/assets), timelines, and dependency risks;",
    "change orders, billing milestones, and late / rush fees (if any);",
    "IP: client-owned site and materials vs. third-party and developer pre-existing tools;",
    "warranty and support / maintenance period after launch.",
  ].join(" "),
};

const LOAN: DeterministicIntentResolution = {
  id: "loan",
  title: "Loan Agreement",
  clausePackSeed: [
    "parties; principal amount; interest; repayment schedule; demand vs. installment (as stated);",
    "prepayment; default and remedies; late fees; notices;",
    "collateral/ guaranty only if the intake says so; otherwise keep neutral optional placeholders.",
  ].join(" "),
};

const FOUNDER: DeterministicIntentResolution = {
  id: "founder_equity",
  title: "Founder Vesting Agreement",
  clausePackSeed: [
    "grants, vesting schedule, cliff, and acceleration only if the intake says so (otherwise neutral TBD/schedule);",
    "leaver / good-bad or repurchase levers in plain commercial language;",
    "IP and confidential information; roles and pre-incorporation expectations where relevant;",
    "no invented cap table; use schedules or TBD for specifics unless given.",
  ].join(" "),
};

function testLogoDesign(low: string): boolean {
  if (/\b(brand\s+mark|logo\s+design|logotype)\b/i.test(low)) return true;
  return /\blogo(s|ged|ging)?\b/i.test(low);
}

function testGraphicDesign(low: string): boolean {
  return /\bgraphic\s+design\b/.test(low);
}

function testWebsite(low: string): boolean {
  return /\b(website|web-?site|web\s+builds?|web\s+design|webapp|web\s+app|website\s+builds?|site\s+builds?)\b/.test(
    low,
  );
}

function testLoan(low: string): boolean {
  return /\b(loan|loans|lent|lend(ing|s|ed)?|borrow(ing|s|ed|er|ers)?|borrows|iou|promissory|principal\s+and\s+interest)\b/i.test(
    low,
  );
}

/**
 * Resolves a deterministic (title, clause pack) pair from raw intake, or `null` if no rule matches.
 */
export function resolveDeterministicIntentTitleAndSeed(intakeText: string | null | undefined): DeterministicIntentResolution | null {
  const s = (intakeText || "").replace(/\r\n/g, "\n");
  if (!s.trim()) return null;
  const low = s.toLowerCase();
  if (testLogoDesign(low)) return LOGO;
  if (testGraphicDesign(low)) return GRAPHIC;
  if (testWebsite(low)) return WEB;
  if (testLoan(low)) return LOAN;
  if (isFounderEquityVestingIntent(s)) return FOUNDER;
  return null;
}

/**
 * Merges deterministic title + `clause_pack_seed` into the payload sent to POST /api/agreements/premium-full-draft.
 * Call **before** the model; keeps other draft fields, overrides `title` when a rule matches.
 */
export function applyDeterministicIntentToPremiumFullDraftContext(
  rawIntake: string | null | undefined,
  context: PremiumFullDraftContextPayload,
): PremiumFullDraftContextPayload {
  const hit = resolveDeterministicIntentTitleAndSeed(rawIntake);
  if (!hit) {
    return { ...context };
  }
  return {
    ...context,
    title: hit.title,
    clause_pack_seed: hit.clausePackSeed,
    deterministic_intent_id: hit.id,
  };
}