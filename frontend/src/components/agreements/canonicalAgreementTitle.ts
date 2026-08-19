/**
 * Single canonical-title resolver for starter / family shell rendering.
 *
 * Rules (universal — never family-specific):
 *   1. If the parsed/server title is a substantive non-generic value, KEEP IT.
 *   2. Otherwise, fall back to the live preview docTitle (already keyword-derived).
 *   3. Otherwise, derive from the routed agreement family.
 *
 * Generic/empty titles that must be replaced: "", "Agreement", "[Not yet specified]".
 *
 * NEVER overwrite a substantive title (anything else) — this preserves canonical headings
 * already set by upstream parsing or family shells (e.g. "Mutual Non-Disclosure Agreement").
 */
import type { AgreementFamily } from "./agreementFamilyRouter";

export const CANONICAL_TITLE_FOR_FAMILY: Record<AgreementFamily, string> = {
  operating_agreement: "Operating Agreement",
  nda: "Non-Disclosure Agreement",
  consulting_agreement: "Consulting Agreement",
  services_agreement: "Services Agreement",
  independent_contractor_agreement: "Independent Contractor Agreement",
  confidentiality_commercial_protections_agreement: "Confidentiality & Commercial Protections Agreement",
  generic_business_agreement: "Business Agreement",
};

/**
 * Fixes clearly accidental title corruption (duplicate leading letter, repeated first word,
 * duplicated full title string) without touching substantive custom headings or body text.
 *
 * Callers must pass **document title fields only** — not agreement body paragraphs.
 */
export function normalizeAgreementDisplayTitle(raw: string | null | undefined): string {
  const input = (raw || "").replace(/\s+/g, " ").trim();
  if (input.length < 4) return input;

  let t = input;

  // 1) Entire title duplicated back-to-back (case-insensitive), e.g. two pasted copies.
  if (t.length >= 24 && t.length % 2 === 0) {
    const h = t.length / 2;
    const a = t.slice(0, h).trimEnd();
    const b = t.slice(h).trimStart();
    if (a.length >= 10 && a.toLowerCase() === b.toLowerCase()) {
      t = a;
    }
  }

  // 2) Repeated leading word before a document-type tail (e.g. "Services Services Agreement").
  const wordDup = t.match(/^([\w&.'\-]{3,48})\s+\1(\s+(?:Agreement|Contract|Deal|Pact)\b[\s\S]*)$/i);
  if (wordDup) {
    t = `${wordDup[1]}${wordDup[2]}`;
  }

  // 3) Double leading alphabetic character (e.g. "SServices Agreement" → "Services Agreement").
  // Never strip the first two letters of a genuine "LLC …" title start.
  if (t.length >= 6 && /^([A-Za-z])\1/.test(t)) {
    if (/^LLC\b/i.test(t)) {
      return t;
    }
    const candidate = t.slice(1);
    if (candidate.length >= 5 && /^[A-Za-z]/.test(candidate)) {
      if (/^[a-z]/.test(candidate)) {
        return candidate.charAt(0).toUpperCase() + candidate.slice(1);
      }
      return candidate;
    }
  }

  return t;
}

const GENERIC_TITLE_PATTERNS: RegExp[] = [
  /^\s*$/,
  /^agreement$/i,
  /^\[not yet specified\]$/i,
  /^untitled$/i,
  // Imperative phrasings ("Create an LLC", "Draft an NDA", etc.) are intent verbs not titles.
  /^(?:create|draft|build|form|generate|make|prepare|start|set\s+up|setup)\b/i,
];

/**
 * Family-specific legacy titles that should be replaced with the canonical heading.
 * E.g. NDA family must always read "Non-Disclosure Agreement" — never the legacy
 * "Confidentiality Agreement" / "Mutual Confidentiality Agreement" labels.
 */
const FAMILY_LEGACY_TITLE_PATTERNS: Partial<Record<AgreementFamily, RegExp[]>> = {
  nda: [/^confidentiality\s+agreement$/i, /^mutual\s+confidentiality\s+agreement$/i],
  // For consulting family, "Consulting Agreement" / "Business Agreement" are replaceable when
  // the intake clearly says "advisor" — see resolveCanonicalAgreementTitle's advisor override.
  consulting_agreement: [/^business\s+agreement$/i, /^lease\s+agreement$/i],
  // Operating-agreement legacy titles that snuck in from imperative parses.
  operating_agreement: [/^operating\s+agreement\b\s*[—-]\s*create\b/i],
};

export function isGenericOrEmptyTitle(title: string | null | undefined, family?: AgreementFamily): boolean {
  const t = (title || "").trim();
  if (!t) return true;
  if (GENERIC_TITLE_PATTERNS.some((re) => re.test(t))) return true;
  if (family) {
    const familyLegacy = FAMILY_LEGACY_TITLE_PATTERNS[family];
    if (familyLegacy && familyLegacy.some((re) => re.test(t))) return true;
  }
  return false;
}

export type CanonicalTitleResolution = {
  title: string;
  /** "preserved" = upstream title kept; "live" = derived from live docTitle; "family" = family canonical. */
  source: "preserved" | "live" | "family" | "advisor" | "nda-mutual" | "explicit-intent";
};

/**
 * Explicit document-intent → canonical title.
 *
 * Universal invariant 2: when intake plainly says "lease agreement" / "purchase agreement" /
 * "co-ownership agreement" / "property management agreement" / etc., that intent should drive
 * the title — even if the routed family is the catch-all "generic_business_agreement".
 *
 * Returns null when no explicit intent phrase is found (callers fall back to family canonical).
 */
export function explicitIntentCanonicalTitle(rawIntake: string | null | undefined): string | null {
  const low = (rawIntake || "").toLowerCase();
  if (!low) return null;
  // Lease: distinguish commercial vs residential when the intake is explicit; otherwise
  // fall back to the neutral "Lease Agreement" canonical.
  if (/\bcommercial\s+lease\s+(?:agreement|contract)\b/.test(low)) return "Commercial Lease Agreement";
  if (/\bresidential\s+lease\s+(?:agreement|contract)\b/.test(low)) return "Residential Lease Agreement";
  if (/\b(?:residential|commercial)?\s*lease\s+(?:agreement|contract)\b/.test(low)) return "Lease Agreement";
  if (/\bsublease\s+(?:agreement|contract)\b/.test(low)) return "Sublease Agreement";
  if (/\b(?:real\s+estate\s+)?purchase\s+(?:and\s+sale\s+)?(?:agreement|contract)\b/.test(low)) {
    return /\breal\s+estate\b/.test(low) ? "Real Estate Purchase Agreement" : "Purchase Agreement";
  }
  if (/\bco[-\s]?ownership\s+(?:agreement|contract)\b/.test(low)) return "Co-Ownership Agreement";
  if (/\bproperty\s+management\s+(?:agreement|contract)\b/.test(low)) return "Property Management Agreement";
  if (/\breferral\s+agreement\b/.test(low)) return "Referral Agreement";
  if (/\b(?:growth\s+advisor|advisory)\s+agreement\b/.test(low)) return "Growth Advisor Agreement";
  if (/\bjoint\s+venture\b/.test(low) && /\b(?:agreement|contract|jv)\b/.test(low)) return "Joint Venture Agreement";
  if (/\blicense\s+agreement\b/.test(low)) return "License Agreement";
  if (/\bcontent\s+license\s+agreement\b/.test(low)) return "Content License Agreement";
  if (/\bdistribution\s+agreement\b/.test(low)) return "Distribution Agreement";
  if (/\b(?:influencer|creator|ugc|brand)\s+(?:services|partnership|collaboration)\s+agreement\b/.test(low)) {
    return "Influencer Services Agreement";
  }
  if (/\bsettlement\s+(?:and\s+)?release\s+agreement\b/.test(low)) return "Settlement and Release Agreement";
  if (/\bmutual\s+release\s+agreement\b/.test(low)) return "Mutual Release Agreement";

  // Event-family explicit intents (post-hardening polish #3). Order: most specific first
  // so "commercial event production agreement" beats plain "event production agreement".
  if (/\bcommercial\s+event\s+production\s+(?:agreement|contract)\b/.test(low)) return "Commercial Event Production Agreement";
  if (/\bevent\s+production\s+(?:agreement|contract)\b/.test(low)) return "Event Production Agreement";
  if (/\bevent\s+services?\s+(?:agreement|contract)\b/.test(low)) return "Event Services Agreement";
  if (/\bconference\s+services?\s+(?:agreement|contract)\b/.test(low)) return "Conference Services Agreement";
  if (/\bvenue\s+(?:agreement|contract)\b/.test(low)) return "Venue Agreement";
  if (/\bsponsorship\s+(?:agreement|contract)\b/.test(low)) return "Sponsorship Agreement";
  if (/\bvendor\s+coordination\s+(?:agreement|contract)\b/.test(low)) return "Vendor Coordination Agreement";
  // "Staffing agreement" only counts as event when the intake also has clear event/conference
  // /venue/production context — never for plain employment-staffing.
  if (
    /\bstaffing\s+(?:agreement|contract)\b/.test(low) &&
    /\b(?:event|events|conference|venue|production|festival|tour)\b/.test(low)
  ) {
    return "Event Staffing Agreement";
  }

  // Strategic-partnership / collaboration explicit intents (post-hardening polish #2).
  // Note: ordinary "partner" wording must NOT route here — these patterns require the
  // explicit "<phrase> agreement" anchor.
  if (/\bstrategic\s+partnership\s+(?:agreement|contract)\b/.test(low)) return "Strategic Partnership Agreement";
  if (/\bmulti[-\s]?party\s+partnership\s+(?:agreement|contract)\b/.test(low)) return "Multi-Party Partnership Agreement";
  if (/\bjoint\s+collaboration\s+(?:agreement|contract)\b/.test(low)) return "Joint Collaboration Agreement";
  if (/\bcommercial\s+collaboration\s+(?:agreement|contract)\b/.test(low)) return "Commercial Collaboration Agreement";
  if (/\bproject\s+collaboration\s+(?:agreement|contract)\b/.test(low)) return "Project Collaboration Agreement";
  if (/\bcollaboration\s+(?:agreement|contract)\b/.test(low)) return "Collaboration Agreement";
  if (/\bco[-\s]?development\s+(?:agreement|contract)\b/.test(low)) return "Co-Development Agreement";
  if (/\bpartnership\s+agreement\b/.test(low)) return "Partnership Agreement";
  if (/\bjoint\s+venture\s+agreement\b/.test(low)) return "Joint Venture Agreement";
  if (/\bequipment\s+(?:rental|lease)\s+agreement\b/.test(low)) return "Equipment Lease Agreement";
  if (/\b(?:employment|employee)\s+(?:agreement|contract)\b/.test(low)) return "Employment Agreement";
  if (/\bindependent\s+contractor\s+(?:agreement|contract)\b/.test(low)) return "Independent Contractor Agreement";
  if (
    /\bintellectual\s+property\s+(?:assignment\s+)?(?:agreement|contract)\b/.test(low) ||
    /\bip\s+assignment\s+(?:agreement|contract)\b/.test(low)
  ) {
    return /\bassignment\b/.test(low)
      ? "Intellectual Property Assignment Agreement"
      : "Intellectual Property Agreement";
  }
  if (/\bproprietary\s+information\s+(?:agreement|contract)\b/.test(low)) {
    return "Proprietary Information Agreement";
  }

  // Tripartite / multi-party software + revenue share (regression: LLC party names must not force OA shell).
  if (
    /\b(?:tripartite|tri[-\s]?party|three[-\s]?party|3[-\s]?party)\b/.test(low) &&
    /\bsoftware\s+development\b/.test(low) &&
    /\brevenue\s+sharing\b/.test(low)
  ) {
    return "Tripartite Software Development and Revenue Sharing Agreement";
  }
  if (/\bsoftware\s+development\b/.test(low) && /\brevenue\s+sharing\b/.test(low) && /\bagreement\b/.test(low)) {
    return "Software Development and Revenue Sharing Agreement";
  }
  if (/\brevenue\s+sharing\s+agreement\b/.test(low)) return "Revenue Sharing Agreement";

  // Software / tech / integration / implementation explicit intents (post-hardening polish #1).
  // Layered most-specific first so "software integration and deployment agreement" yields
  // "Software Integration Agreement", "saas implementation agreement" yields "SaaS
  // Implementation Agreement", etc. Ordering also guarantees these dominate the consulting
  // fallback when an intake mentions a "Consulting" entity name in the party list.
  if (/\bsoftware\s+integration(?:\s+(?:and|&)\s+(?:deployment|implementation|migration|support))*\s+(?:agreement|contract)\b/.test(low)) {
    return "Software Integration Agreement";
  }
  if (/\bsoftware\s+deployment(?:\s+(?:and|&)\s+(?:integration|implementation|migration|support))*\s+(?:agreement|contract)\b/.test(low)) {
    return "Software Deployment Agreement";
  }
  if (/\bsoftware\s+implementation(?:\s+(?:and|&)\s+(?:integration|deployment|migration|support))*\s+(?:agreement|contract)\b/.test(low)) {
    return "Software Implementation Agreement";
  }
  if (/\bsoftware\s+services?\s+(?:agreement|contract)\b/.test(low)) return "Software Services Agreement";
  if (/\bweb\s+development\s+(?:agreement|contract)\b/.test(low)) return "Web Development Agreement";
  if (/\b(?:mobile|app)\s+development\s+(?:agreement|contract)\b/.test(low)) return "Mobile Development Agreement";
  if (/\bsoftware\s+development(?:\s+and\s+[\w\s,/&'-]{0,96}?)?\s+(?:agreement|contract)\b/.test(low)) {
    return "Software Development Agreement";
  }
  if (/\bsoftware\s+development\s+(?:agreement|contract)\b/.test(low)) return "Software Development Agreement";
  if (/\bsaas\s+implementation\s+(?:agreement|contract)\b/.test(low)) return "SaaS Implementation Agreement";
  if (/\bsaas\s+services?\s+(?:agreement|contract)\b/.test(low)) return "SaaS Services Agreement";
  if (/\bapi\s+integration\s+(?:agreement|contract)\b/.test(low)) return "API Integration Agreement";
  if (/\bcloud\s+migration\s+(?:agreement|contract)\b/.test(low)) return "Cloud Migration Agreement";
  if (/\btechnology\s+services?\s+(?:agreement|contract)\b/.test(low)) return "Technology Services Agreement";
  // Prefer consulting+implementation over bare "implementation agreement" — otherwise
  // "...consulting and implementation agreement..." collapses to Implementation Agreement.
  if (/\b(?:mutual\s+)?consulting\s+(?:and|&)\s+implementation\s+(?:agreement|contract)\b/.test(low)) {
    // Require mutual agreement-type intent — ignore "mutual confidentiality" clause language.
    const mutualAgreementIntent =
      /\bmutual\s+consulting\b/.test(low) ||
      /\bcreate\s+(?:a\s+)?mutual\s+(?:consulting|services|agreement)\b/.test(low);
    return mutualAgreementIntent
      ? "Mutual Consulting and Implementation Agreement"
      : "Consulting and Implementation Agreement";
  }
  if (/\bimplementation\s+(?:agreement|contract)\b/.test(low)) return "Implementation Agreement";
  if (/\bsupport\s+services\s+(?:agreement|contract)\b/.test(low)) return "Support Services Agreement";
  if (/\bdevelopment\s+(?:agreement|contract)\b/.test(low)) return "Development Agreement";
  if (/\b(?:mutual\s+)?(?:nda|non[-\s]?disclosure)\s+(?:agreement|contract)\b/.test(low)) {
    return /\bmutual\b/.test(low) ? "Mutual Non-Disclosure Agreement" : "Non-Disclosure Agreement";
  }
  if (
    /\bsaas\s+reseller\b/.test(low) &&
    /\bwhite[-\s]?label\b/.test(low) &&
    /\bservices?\s+agreement\b/.test(low)
  ) {
    return "SaaS Reseller and White-Label Services Agreement";
  }
  // Consulting before generic "services agreement" so "consulting services agreement"
  // does not collapse to plain Services Agreement.
  if (/\bconsulting\s+services?\s+(?:agreement|contract)\b/.test(low)) {
    return "Consulting Services Agreement";
  }
  if (/\bconsulting\s+(?:agreement|contract)\b/.test(low)) return "Consulting Agreement";
  if (/\bservices?\s+(?:agreement|contract)\b/.test(low)) return "Services Agreement";
  return null;
}

/**
 * Detects "advisor" intent in raw intake — used by canonical title resolution to choose
 * "Advisor Agreement" over a generic "Consulting Agreement" / "Business Agreement" heading.
 */
function intakeSaysAdvisor(rawIntake: string | null | undefined): boolean {
  const low = (rawIntake || "").toLowerCase();
  if (!low) return false;
  return (
    /\badvisor(?:y|s)?\s+agreement\b/.test(low) ||
    /\bboard\s+advisor\b/.test(low) ||
    /\b(?:strategic|technical|product)\s+advisor\b/.test(low) ||
    /\badvisor\s+(?:between|for|to)\b/.test(low)
  );
}

/**
 * Detects mutual NDA intent for canonical title selection ("Mutual Non-Disclosure Agreement"
 * vs. "Non-Disclosure Agreement").
 */
function intakeSaysMutualNda(rawIntake: string | null | undefined): boolean {
  const low = (rawIntake || "").toLowerCase();
  if (!low) return false;
  if (/\b(?:one[-\s]?way|unilateral)\b/.test(low)) return false;
  return /\bmutual\b/.test(low) || /\bbetween\s+\w/.test(low);
}

function resolveCanonicalAgreementTitleCore(opts: {
  currentTitle: string | null | undefined;
  liveDocTitle: string | null | undefined;
  family: AgreementFamily;
  /** Optional raw intake — enables advisor + mutual-NDA canonical overrides. */
  intakeText?: string | null;
}): CanonicalTitleResolution {
  const current = (opts.currentTitle || "").trim();
  const intake = opts.intakeText ?? null;

  // Advisor override: when intake clearly says "advisor", canonical title is "Advisor Agreement"
  // even if family routes through consulting_agreement (P3).
  if (
    (opts.family === "consulting_agreement" || opts.family === "generic_business_agreement") &&
    intakeSaysAdvisor(intake)
  ) {
    if (
      !current ||
      isGenericOrEmptyTitle(current, opts.family) ||
      /^business\s+agreement$/i.test(current) ||
      /^consulting\s+agreement$/i.test(current)
    ) {
      return { title: "Advisor Agreement", source: "advisor" };
    }
  }

  // Mutual NDA override: prefer the mutual heading when intake clearly says NDA + mutual / between-multiparty.
  if (opts.family === "nda" && intakeSaysMutualNda(intake)) {
    if (
      !current ||
      isGenericOrEmptyTitle(current, opts.family) ||
      /^non[-\s]?disclosure\s+agreement$/i.test(current)
    ) {
      return { title: "Mutual Non-Disclosure Agreement", source: "nda-mutual" };
    }
  }

  // Universal invariant 2 (P1): explicit document-intent phrases dominate routing for the
  // catch-all "generic_business_agreement" family (lease, purchase, co-ownership, property
  // management, license, distribution, partnership, JV, equipment lease, etc.). For specific
  // family routes (consulting, services, ICA), the explicit-intent title still wins so a
  // "Commercial Lease Agreement" intake never renders as plain "Consulting Agreement" when
  // a stray role token elsewhere in the intake nudged the family detector.
  // Operating-agreement and NDA families keep their specialized title pipelines.
  if (
    opts.family === "generic_business_agreement" ||
    opts.family === "consulting_agreement" ||
    opts.family === "services_agreement" ||
    opts.family === "independent_contractor_agreement" ||
    opts.family === "confidentiality_commercial_protections_agreement"
  ) {
    const intentTitle = explicitIntentCanonicalTitle(intake);
    if (intentTitle) {
      // "Replaceable canonical" titles: titles that are the family default placeholder
      // (or a near-default like generic "Development Agreement" / "Partnership Agreement")
      // and should be upgraded when a more specific explicit-intent phrase is present in
      // the raw intake. We never overwrite a substantive custom title (e.g. an upstream
      // "Apollo Strategic Partnership Agreement 2026") set by the parser.
      const replaceableCanonical =
        /^business\s+agreement$/i.test(current) ||
        /^consulting\s+agreement$/i.test(current) ||
        /^services\s+agreement$/i.test(current) ||
        /^independent\s+contractor\s+agreement$/i.test(current) ||
        /^development\s+agreement$/i.test(current) ||
        /^partnership\s+agreement$/i.test(current) ||
        /^collaboration\s+agreement$/i.test(current);
      if (!current || isGenericOrEmptyTitle(current, opts.family) || replaceableCanonical) {
        return { title: intentTitle, source: "explicit-intent" };
      }
    }
  }

  if (current && !isGenericOrEmptyTitle(current, opts.family)) {
    return { title: current, source: "preserved" };
  }
  const live = (opts.liveDocTitle || "").trim();
  if (live && !isGenericOrEmptyTitle(live, opts.family)) {
    return { title: live, source: "live" };
  }
  return { title: CANONICAL_TITLE_FOR_FAMILY[opts.family] ?? "Business Agreement", source: "family" };
}

/**
 * Single canonical title resolver for preview + draft.title persistence: applies
 * {@link normalizeAgreementDisplayTitle} to every non-empty resolved heading so accidental
 * duplicate leading characters (e.g. "SServices Agreement") never reach render surfaces.
 */
export function resolveCanonicalAgreementTitle(opts: {
  currentTitle: string | null | undefined;
  liveDocTitle: string | null | undefined;
  family: AgreementFamily;
  intakeText?: string | null;
}): CanonicalTitleResolution {
  const r = resolveCanonicalAgreementTitleCore(opts);
  return { ...r, title: normalizeAgreementDisplayTitle(r.title) };
}
