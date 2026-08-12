/**
 * Agreement title selection from explicit intake scope — no specialized title words
 * unless intake supports them.
 */

import { explicitIntentCanonicalTitle } from "./canonicalAgreementTitle";

const LOG_PREFIX = "[agreement-title-scope-decision]";

export type AgreementTitleScopeDecision = {
  titleUpper: string;
  recitalPhrase: string;
  source: string;
};

export const BRAND_LICENSING_AGREEMENT_TITLE_UPPER =
  "MANUFACTURING, DISTRIBUTION, LICENSING AND MARKETING SERVICES AGREEMENT";

const AGREEMENT_DOCUMENT_TITLE_BODY_VERB_RE =
  /\b(?:will|shall|must|may|should|are|is|was|were|have|has|had|agrees?|represents?)\b/i;

/** Document title line (not a numbered section) — exempt from orphan heading-fragment heuristics. */
export function isAuthoritativePaidProAgreementDocumentTitleLine(line: string): boolean {
  const t = line.replace(/\s+/g, " ").trim();
  if (!t || t.length < 12 || t.length > 240) return false;
  if (/^\d+\.\s/.test(t)) return false;
  if (/MANUFACTURING,\s+DISTRIBUTION,\s+LICENSING/i.test(t) && /\bAGREEMENT\b/i.test(t)) return true;
  if (/^MANUFACTURING,\s+DISTRIBUTION,?\s*$/i.test(t)) return true;
  if (/^LICENSING AND MARKETING SERVICES AGREEMENT$/i.test(t)) return true;
  if (
    /\bAGREEMENT\b/i.test(t) &&
    /^[A-Z0-9][A-Z0-9\s,&'"\-–—]+$/.test(t) &&
    !AGREEMENT_DOCUMENT_TITLE_BODY_VERB_RE.test(t) &&
    !/["“”]/.test(t) &&
    t.split(/\s+/).filter(Boolean).length <= 24
  ) {
    return true;
  }
  return false;
}

import {
  isPaidProMultilineAgreementTitleCompletionLine,
  isPaidProMultilineAgreementTitleStartLine,
} from "./paidProDocumentOpeningAuthority";

/** Merge split all-caps agreement title lines before section-heading scans. */
export function repairMultilinePaidProAgreementDocumentTitle(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    const nextTrimmed = (lines[i + 1] ?? "").trim();
    if (
      /^MANUFACTURING,\s+DISTRIBUTION,?\s*$/i.test(trimmed) &&
      /^LICENSING AND MARKETING SERVICES AGREEMENT$/i.test(nextTrimmed)
    ) {
      out.push(BRAND_LICENSING_AGREEMENT_TITLE_UPPER);
      repairs.push("merge_multiline_brand_licensing_title");
      i += 1;
      continue;
    }
    if (
      isPaidProMultilineAgreementTitleStartLine(trimmed) &&
      isPaidProMultilineAgreementTitleCompletionLine(nextTrimmed)
    ) {
      out.push(`${trimmed} ${nextTrimmed}`.replace(/\s+/g, " ").trim());
      repairs.push("merge_multiline_agreement_title");
      i += 1;
      continue;
    }
    out.push(lines[i]!);
  }
  if (repairs.length === 0) return { text, repairs };
  return { text: out.join("\n"), repairs };
}

export const SPECIALIZED_TITLE_WORD_RES: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "implementation", pattern: /\bimplementation\b/i },
  { id: "software", pattern: /\bsoftware\b/i },
  { id: "platform", pattern: /\bplatform\b/i },
  { id: "saas", pattern: /\bsaas\b/i },
  { id: "ai", pattern: /\b(?:\bai\b|artificial intelligence)\b/i },
  { id: "workflow", pattern: /\bworkflow\b/i },
  { id: "automation", pattern: /\bautomation\b/i },
  { id: "configuration", pattern: /\bconfiguration\b/i },
  { id: "integration", pattern: /\bintegration\b/i },
  { id: "development", pattern: /\bdevelopment\b/i },
  { id: "licensing", pattern: /\blicensing\b/i },
  { id: "revenue_share", pattern: /\brevenue\s+shar(?:e|ing)\b/i },
  { id: "joint_venture", pattern: /\bjoint\s+venture\b/i },
  { id: "consortium", pattern: /\bconsortium\b/i },
];

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

export function logAgreementTitleScopeDecision(
  decision: AgreementTitleScopeDecision,
  intakePreview?: string,
): void {
  if (isTestMode()) return;
  // eslint-disable-next-line no-console
  console.info(LOG_PREFIX, {
    title: decision.titleUpper,
    source: decision.source,
    intakePreview: (intakePreview || "").slice(0, 160),
  });
}

/** Scope-bearing intake text — excludes party legal names when possible. */
function intakeScopeBlob(intake: string): string {
  const lines = intake
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const scopeLines = lines.filter((line) =>
    /^(?:scope|purpose|services?|deliverables?|objective|background)\s*:/i.test(line),
  );
  if (scopeLines.length) return scopeLines.join(" ");
  // Exclude per-party signer metadata lines — role titles like "Marketing" / "Licensing"
  // must not trigger brand-licensing stack heuristics on revenue-share intakes.
  const proseLines = lines.filter((line) => !/\bsigner:\s/i.test(line));
  if (proseLines.length) return proseLines.join(" ");
  return intake;
}

export function intakeDescribesBrandLicensingDistributionManufacturingStack(intake: string): boolean {
  const scope = intakeScopeBlob(intake).toLowerCase();
  const licensing =
    /\b(?:brand\s+licensing|licensing\s+and\s+distribution)\b/.test(scope) ||
    (/\blicensing\b/.test(scope) && /\b(?:brand|manufactur|distribut)/.test(scope));
  const distribution = /\bdistribut/.test(scope);
  const manufacturing = /\bmanufactur/.test(scope);
  const marketing = /\bmarketing\b|\be-?commerce\b/.test(scope);
  if (licensing && distribution) return true;
  const hits = [licensing, distribution, manufacturing, marketing].filter(Boolean).length;
  return hits >= 3;
}

export function intakeExplicitlyRequestsImplementationTitleScope(intake: string): boolean {
  const blob = intakeScopeBlob(intake);
  if (!blob.trim()) return false;
  return (
    /\bconsulting\s+and\s+implementation\b/i.test(blob) ||
    /\bimplementation\s+services\b/i.test(blob) ||
    /\b(?:CRM|ERP|SAP|platform|system|software)\s+implementation\b/i.test(blob) ||
    /\bimplementation\s+consortium\b/i.test(blob) ||
    /\bfour[-\s]?party\s+implementation\b/i.test(blob) ||
    /\bimplementation\s+agreement\b/i.test(blob)
  );
}

function titleWordSupportedInIntake(wordId: string, intake: string): boolean {
  const scope = intakeScopeBlob(intake);
  const full = intake;
  switch (wordId) {
    case "implementation":
      return intakeExplicitlyRequestsImplementationTitleScope(full);
    case "software":
      return /\bsoftware\b/i.test(scope) || /\bsoftware\s+development\b/i.test(full);
    case "platform":
      return /\bplatform\b/i.test(scope);
    case "saas":
      return /\bsaas\b/i.test(scope) || /\bsaas\b/i.test(full);
    case "ai":
      return /\b(?:\bai\b|artificial intelligence)\b/i.test(scope);
    case "workflow":
      return /\bworkflow\b/i.test(scope);
    case "automation":
      return /\bautomation\b/i.test(scope);
    case "configuration":
      return /\bconfiguration\b/i.test(scope);
    case "integration":
      return /\bintegration\b/i.test(scope);
    case "development":
      return /\b(?:software|web|mobile|app)\s+development\b/i.test(full) || /\bdevelopment\b/i.test(scope);
    case "licensing":
      return /\blicensing\b/i.test(scope) || /\blicense\b/i.test(full);
    case "revenue_share":
      return /\brevenue\s+shar(?:e|ing)\b/i.test(full);
    case "joint_venture":
      return /\bjoint\s+venture\b/i.test(full);
    case "consortium":
      return /\bconsortium\b/i.test(full);
    default:
      return false;
  }
}

export function intakeTitleIncludesUnsupportedSpecializedWord(
  title: string,
  intake: string,
): boolean {
  const upper = (title || "").toUpperCase();
  for (const { id, pattern } of SPECIALIZED_TITLE_WORD_RES) {
    if (!pattern.test(upper)) continue;
    if (!titleWordSupportedInIntake(id, intake)) return true;
  }
  return false;
}

export function resolveAgreementTitleFromIntakeScope(
  intakeText?: string | null,
): AgreementTitleScopeDecision {
  const intake = String(intakeText || "").trim();
  const scope = intakeScopeBlob(intake);
  // Require mutual agreement-type intent — do not treat "mutual confidentiality"
  // (or similar clause language) as a Mutual Consulting / Mutual Services title.
  const mutual =
    /\bmutual\s+consulting\b/i.test(intake) ||
    /\bmutual\s+services\b/i.test(intake) ||
    /\bcreate\s+(?:a\s+)?mutual\s+(?:consulting|services|agreement)\b/i.test(intake);

  const explicit = explicitIntentCanonicalTitle(intake);
  const genericExplicitServices = explicit && /^services agreement$/i.test(explicit);

  const hasConsultingScope =
    /\b(?:business\s+)?consulting\b/i.test(scope) ||
    /\bconsulting\s+services\b/i.test(scope) ||
    /\bstrategic\s+business\s+consulting\b/i.test(scope);

  const hasSoftwareDevelopmentScope =
    /\bsoftware\s+development\b/i.test(scope) || /\bsoftware\s+development\b/i.test(intake);

  if (hasSoftwareDevelopmentScope && (!explicit || genericExplicitServices)) {
    const decision = {
      titleUpper: "SOFTWARE DEVELOPMENT SERVICES AGREEMENT",
      recitalPhrase: "Software Development Services Agreement",
      source: "software-development",
    };
    logAgreementTitleScopeDecision(decision, intake);
    return decision;
  }

  if (hasConsultingScope && (!explicit || genericExplicitServices)) {
    const decision = mutual
      ? {
          titleUpper: "MUTUAL CONSULTING SERVICES AGREEMENT",
          recitalPhrase: "Mutual Consulting Services Agreement",
          source: "consulting-services",
        }
      : {
          titleUpper: "CONSULTING SERVICES AGREEMENT",
          recitalPhrase: "Consulting Services Agreement",
          source: "consulting-services",
        };
    logAgreementTitleScopeDecision(decision, intake);
    return decision;
  }

  if (
    intakeDescribesBrandLicensingDistributionManufacturingStack(intake) &&
    (!explicit || genericExplicitServices || /^distribution agreement$/i.test(explicit))
  ) {
    const decision = {
      titleUpper: "MANUFACTURING, DISTRIBUTION, LICENSING AND MARKETING SERVICES AGREEMENT",
      recitalPhrase: "Manufacturing, Distribution, Licensing and Marketing Services Agreement",
      source: "brand-licensing-distribution-manufacturing",
    };
    logAgreementTitleScopeDecision(decision, intake);
    return decision;
  }

  if (explicit && !genericExplicitServices) {
    const decision = {
      titleUpper: explicit.toUpperCase(),
      recitalPhrase: explicit,
      source: "explicit-intent",
    };
    logAgreementTitleScopeDecision(decision, intake);
    return decision;
  }

  if (intakeExplicitlyRequestsImplementationTitleScope(intake)) {
    const decision = {
      titleUpper: mutual
        ? "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT"
        : "CONSULTING AND IMPLEMENTATION AGREEMENT",
      recitalPhrase: mutual
        ? "Mutual Consulting and Implementation Agreement"
        : "Consulting and Implementation Agreement",
      source: "implementation-scope",
    };
    logAgreementTitleScopeDecision(decision, intake);
    return decision;
  }

  if (explicit) {
    const decision = {
      titleUpper: explicit.toUpperCase(),
      recitalPhrase: explicit,
      source: "explicit-intent",
    };
    logAgreementTitleScopeDecision(decision, intake);
    return decision;
  }

  if (/\b(?:business\s+)?consulting\b/i.test(intake) || /\bconsulting\s+services\b/i.test(intake)) {
    const business = /\bbusiness\s+consulting\b/i.test(intake);
    const decision = mutual
      ? {
          titleUpper: "MUTUAL CONSULTING SERVICES AGREEMENT",
          recitalPhrase: "Mutual Consulting Services Agreement",
          source: "consulting-services",
        }
      : business
        ? {
            titleUpper: "BUSINESS CONSULTING AGREEMENT",
            recitalPhrase: "Business Consulting Agreement",
            source: "business-consulting",
          }
        : {
            titleUpper: "CONSULTING SERVICES AGREEMENT",
            recitalPhrase: "Consulting Services Agreement",
            source: "consulting-services",
          };
    logAgreementTitleScopeDecision(decision, intake);
    return decision;
  }

  const decision = {
    titleUpper: mutual ? "MUTUAL SERVICES AGREEMENT" : "SERVICES AGREEMENT",
    recitalPhrase: mutual ? "Mutual Services Agreement" : "Services Agreement",
    source: "generic-services",
  };
  logAgreementTitleScopeDecision(decision, intake);
  return decision;
}

/** Normalize an upstream title when it includes unsupported specialized words. */
export function reconcileAgreementTitleWithIntakeScope(
  currentTitle: string | null | undefined,
  intakeText?: string | null,
): AgreementTitleScopeDecision {
  const current = String(currentTitle || "").trim();
  const scoped = resolveAgreementTitleFromIntakeScope(intakeText);
  if (!current || /^agreement$/i.test(current)) return scoped;
  if (intakeTitleIncludesUnsupportedSpecializedWord(current, String(intakeText || ""))) {
    return { ...scoped, source: `${scoped.source}:reconciled` };
  }
  return {
    titleUpper: current.toUpperCase(),
    recitalPhrase: current.replace(/\s+AGREEMENT$/i, " Agreement").replace(/^./, (c) => c.toUpperCase()),
    source: "preserved",
  };
}
