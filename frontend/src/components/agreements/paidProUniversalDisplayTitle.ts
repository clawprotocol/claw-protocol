/**
 * Universal display title for paid Pro / create preview surfaces.
 * Ensures every painted agreement corpus has an appropriate main title derived from
 * draft metadata, intake intent, family, or corpus heuristics — never a blank opening.
 */

import {
  detectAgreementFamily,
  type AgreementFamily,
} from "./agreementFamilyRouter";
import {
  explicitIntentCanonicalTitle,
  isGenericOrEmptyTitle,
  normalizeAgreementDisplayTitle,
  resolveCanonicalAgreementTitle,
} from "./canonicalAgreementTitle";
import { resolveAgreementTitleFromIntakeScope } from "./paidProAgreementTitleScope";

export type PaidProUniversalDisplayTitleResolution = {
  title: string;
  titleUpper: string;
  source: string;
};

const THIS_AGREEMENT_TITLE_RE =
  /\bThis\s+((?:Mutual\s+)?[A-Z][A-Za-z0-9,&'"\-\s]{3,100}Agreement)\b/;

function toTitleCaseAgreement(raw: string): string {
  return normalizeAgreementDisplayTitle(
    raw
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/(^|\s)\S/g, (m) => m.toUpperCase()),
  );
}

function pack(title: string, source: string): PaidProUniversalDisplayTitleResolution {
  const normalized = normalizeAgreementDisplayTitle(title);
  return {
    title: normalized,
    titleUpper: normalized.replace(/\s+/g, " ").trim().toUpperCase(),
    source,
  };
}

function extractTitleFromCorpusPlain(corpusPlain?: string | null): PaidProUniversalDisplayTitleResolution | null {
  const body = String(corpusPlain || "").replace(/\r\n/g, "\n").trim();
  if (body.length < 40) return null;
  const opening = body.slice(0, 2_500);
  const thisMatch = opening.match(THIS_AGREEMENT_TITLE_RE);
  if (thisMatch?.[1]) {
    const phrase = toTitleCaseAgreement(thisMatch[1]);
    if (phrase.length >= 8 && /\bagreement\b/i.test(phrase)) {
      return pack(phrase, "corpus-recital");
    }
  }
  const firstLine =
    opening
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  if (
    firstLine.length >= 8 &&
    firstLine.length <= 160 &&
    /\bagreement\b/i.test(firstLine) &&
    !/^\d+\./.test(firstLine) &&
    firstLine === firstLine.toUpperCase()
  ) {
    return pack(toTitleCaseAgreement(firstLine), "corpus-title-line");
  }
  return null;
}

function inferTitleFromSectionOne(corpusPlain?: string | null): PaidProUniversalDisplayTitleResolution | null {
  const first =
    String(corpusPlain || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  if (!/^1\.\s+(?!\d)/.test(first)) return null;
  const low = first.toLowerCase();
  if (/\bemployment\b|\bemployee\b|\bhire\b|\bwages?\b|\bsalary\b/.test(low)) {
    return pack("Employment Agreement", "section1-employment");
  }
  if (/\bconfidential|\bnon[-\s]?disclosure|\bnda\b/.test(low)) {
    return pack("Non-Disclosure Agreement", "section1-nda");
  }
  if (/\bintellectual\s+property\b|\bip\b|\bwork\s+product\b|\binvention\b/.test(low)) {
    return pack("Intellectual Property Agreement", "section1-ip");
  }
  if (/\bconsulting\b|\badvisor/.test(low)) {
    return pack("Consulting Services Agreement", "section1-consulting");
  }
  if (/\bindependent\s+contractor\b|\bcontractor\b/.test(low)) {
    return pack("Independent Contractor Agreement", "section1-ica");
  }
  if (/\bservices?\b|\bscope\b|\bproject\s+term\b/.test(low)) {
    return pack("Services Agreement", "section1-services");
  }
  return null;
}

/**
 * Best main document title for any agreement prompt / resume corpus.
 * Prefer explicit intake intent and draft title; never invent a specialized word
 * the intake does not support (intake-scope reconciliation).
 */
export function resolvePaidProUniversalDisplayTitle(opts: {
  draftTitle?: string | null;
  intakeText?: string | null;
  family?: AgreementFamily | string | null;
  corpusPlain?: string | null;
}): PaidProUniversalDisplayTitleResolution {
  const intake = String(opts.intakeText || "").trim();
  const family = (opts.family ||
    (intake ? detectAgreementFamily(intake) : "generic_business_agreement")) as AgreementFamily;
  const current = normalizeAgreementDisplayTitle(opts.draftTitle || "").trim();

  const explicit = explicitIntentCanonicalTitle(intake);
  if (explicit) return pack(explicit, "explicit-intent");

  if (current && !isGenericOrEmptyTitle(current, family) && !/^agreement$/i.test(current)) {
    return pack(current, "draft");
  }

  const scoped = resolveAgreementTitleFromIntakeScope(intake);
  if (intake && scoped.source !== "generic-services") {
    return pack(scoped.recitalPhrase, scoped.source);
  }

  const fromCorpus = extractTitleFromCorpusPlain(opts.corpusPlain);
  if (fromCorpus) return fromCorpus;

  const fromSection = inferTitleFromSectionOne(opts.corpusPlain);
  if (fromSection) return fromSection;

  const canonical = resolveCanonicalAgreementTitle({
    currentTitle: current || null,
    liveDocTitle: null,
    family,
    intakeText: intake || null,
  });
  if (canonical.title) return pack(canonical.title, canonical.source || "family");
  if (scoped.recitalPhrase) return pack(scoped.recitalPhrase, scoped.source);
  return pack("Business Agreement", "fallback");
}
