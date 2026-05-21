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
  "creator_influencer",
  "saas_subscription",
  "settlement_release",
  "mutual_nda",
  "loan",
  "founder_equity",
  "growth_advisor",
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

const CREATOR: DeterministicIntentResolution = {
  id: "creator_influencer",
  title: "Influencer Marketing Agreement",
  clausePackSeed: [
    "This is a paid creator/brand collaboration—not generic consulting or employment.",
    "Deliverables (posts, reels, whitelisting window), approval workflow, and revision limits;",
    "usage/license scope and term for brand use of content; exclusivity only if intake states it;",
    "payment trigger (on post, on approval, milestones) and invoicing;",
    "FTC-style disclosure / sponsored-content duties if ads or affiliate links are mentioned;",
    "confidentiality on unreleased campaigns; termination and kill-fee only if stated.",
  ].join(" "),
};

const SAAS: DeterministicIntentResolution = {
  id: "saas_subscription",
  title: "SaaS Subscription Agreement",
  clausePackSeed: [
    "Software-as-a-service or platform access—not a one-off design or loan.",
    "Subscription term, fees, renewal, and payment method;",
    "scope of access, seats/users, acceptable use, and support/SLA level if stated;",
    "data use, security, and confidentiality for customer data;",
    "limitation of liability and service credits only as appropriate to the intake;",
    "suspension/termination for non-payment and export of customer data on exit.",
  ].join(" "),
};

const SETTLEMENT: DeterministicIntentResolution = {
  id: "settlement_release",
  title: "Settlement and Mutual Release Agreement",
  clausePackSeed: [
    "Mutual release of claims related to the described dispute—no admission of liability unless intake says otherwise;",
    "payment amount and schedule placeholders tied to stated figures;",
    "confidentiality of settlement terms if requested;",
    "no future claims/representations about the underlying matter except as carved out in intake;",
    "governing law and dispute resolution for enforcing the settlement only.",
  ].join(" "),
};

const NDA: DeterministicIntentResolution = {
  id: "mutual_nda",
  title: "Mutual Non-Disclosure Agreement",
  clausePackSeed: [
    "Mutual or one-way confidentiality as the intake implies;",
    "definition of confidential information and standard exclusions;",
    "permitted disclosures (advisors, legal compulsion) and return/destruction;",
    "term of confidentiality obligations and survival;",
    "no license to IP beyond what is necessary to evaluate the relationship.",
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

const REFERRAL: DeterministicIntentResolution = {
  id: "creator_influencer",
  title: "Referral Agreement",
  clausePackSeed: [
    "Referral or channel introduction economics — not founder equity vesting.",
    "Commission or revenue-share formula, payout timing, clawbacks, and audit if stated;",
    "definition of qualified referral / introduced customer; tail period;",
    "no side deals; confidentiality; term and termination.",
  ].join(" "),
};

const GROWTH_ADVISOR: DeterministicIntentResolution = {
  id: "growth_advisor",
  title: "Growth Advisor Agreement",
  clausePackSeed: [
    "Advisory / growth advisor engagement — not founder cap-table vesting.",
    "Scope of advisory services, time commitment, and deliverables;",
    "fee structure: retainer, hourly, success fee, or revenue share as stated;",
    "confidentiality; IP in work product; term and termination.",
  ].join(" "),
};

const JOINT_VENTURE: DeterministicIntentResolution = {
  id: "settlement_release",
  title: "Joint Venture Agreement",
  clausePackSeed: [
    "Multi-party project collaboration — contributions, profit splits, governance.",
    "Each party's role, capital or sweat contributions, and approval rights;",
    "profit allocation by project; deadlock resolution;",
    "IP ownership of project work product; exit / buyout if a party withdraws.",
  ].join(" "),
};

const SOFTWARE_LICENSE: DeterministicIntentResolution = {
  id: "saas_subscription",
  title: "Software License Agreement",
  clausePackSeed: [
    "Software license grant — not a custom development MSA unless intake says build.",
    "Permitted use, restrictions, and sublicense policy;",
    "fees and payment; support level if any;",
    "IP ownership of licensed materials; confidentiality; term and termination.",
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

function testCreatorInfluencer(low: string): boolean {
  return /\b(influencer|ugc|creator|tiktok|instagram|youtube|brand\s+deal|sponsorship|paid\s+post|whitelisting)\b/.test(
    low,
  );
}

function testSaasSubscription(low: string): boolean {
  return /\b(saas|subscription|software\s+as\s+a\s+service|api\s+access|platform\s+terms)\b/.test(low);
}

function testSettlementRelease(low: string): boolean {
  return /\b(settlement|mutual\s+release|release\s+of\s+claims)\b/.test(low);
}

function testMutualNda(low: string): boolean {
  if (/\bmutual\s+(?:nda|non[-\s]?disclosure)\b/.test(low)) return true;
  return /\b(?:nda|non[-\s]?disclosure)\b/.test(low) && !/\bemployment\b/.test(low);
}

function testLoan(low: string): boolean {
  return /\b(loan|loans|lent|lend(ing|s|ed)?|borrow(ing|s|ed|er|ers)?|borrows|iou|promissory|principal\s+and\s+interest)\b/i.test(
    low,
  );
}

function testReferral(low: string): boolean {
  if (/\b(?:growth\s+advisor|advisory\s+agreement|consulting\s+advisor)\b/i.test(low)) return false;
  return (
    /\b(referral\s+agreement|referral\s+fee|channel\s+partner)\b/i.test(low) ||
    (/\brevenue\s+share\b/i.test(low) &&
      /\b(?:referral|introduc(?:e|es|ing)\s+(?:leads?|accounts?|deals?))\b/i.test(low))
  ) && !/\b(?:founder\s+vesting|cap\s+table|60\s*\/\s*40\s+vesting)\b/i.test(low);
}

function testGrowthAdvisor(low: string): boolean {
  return (
    /\b(growth\s+advisor|advisory\s+agreement|consulting\s+advisor|board\s+advisor)\b/i.test(low) &&
    !/\b(?:founder\s+vesting|cap\s+table|60\s*\/\s*40\s+vesting)\b/i.test(low)
  );
}

function testJointVenture(low: string): boolean {
  return (
    /\b(joint\s+venture\s+agreement|jv\s+agreement)\b/i.test(low) ||
    (/\b(joint\s+venture|jv\b)\b/i.test(low) &&
      /\b(profit\s+split|deadlock|contribu|earnest\s+money|rehab|distressed)\b/i.test(low))
  );
}

function testSoftwareLicense(low: string): boolean {
  return (
    /\b(software\s+)?license\s+agreement\b/i.test(low) ||
    (/\bsoftware\s+licen[cs]e\b/i.test(low) && !/\b(?:develop|implementation|integration)\b/i.test(low))
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
  if (testCreatorInfluencer(low)) return CREATOR;
  if (testSaasSubscription(low)) return SAAS;
  if (testSettlementRelease(low)) return SETTLEMENT;
  if (testMutualNda(low)) return NDA;
  if (testLoan(low)) return LOAN;
  if (testGrowthAdvisor(low)) return GROWTH_ADVISOR;
  if (testReferral(low)) return REFERRAL;
  if (testJointVenture(low)) return JOINT_VENTURE;
  if (testSoftwareLicense(low)) return SOFTWARE_LICENSE;
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