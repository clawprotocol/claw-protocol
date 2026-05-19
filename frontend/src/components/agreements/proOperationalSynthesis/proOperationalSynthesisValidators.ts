/**
 * Shared validators for Pro operational synthesis batch QA.
 */

import { collectForbiddenTemplateFragments } from "../agreementTemplatePlaceholderSafety";
import { definedShortNameFromLegalEntity } from "../paidProAgreementPolish";
import { STALE_PRO_TRANSFORMATION_PREVIEW_STRINGS } from "../../../launch/simpleProduct/proTransformationCopy";
import { extractIntakeEmailsOrdered } from "../paidProIntakeContactSubstitution";
import { isDisallowedPartyPhrase } from "../paidProPartyNamePreserve";
import { parseAgreementSections } from "./sectionPurityValidator";

export type ProQaValidationIssue = {
  code: string;
  message: string;
};

const FORBIDDEN_DEFINED_SHORT_RE =
  /\(\s*["']?(?:ownership\s+of|collectively|the\s+Parties|implementation|milestone\s+approvals?|technical\s+specifications?|project\s+deliverables?|deliverables?|or\s+other)\s*["']?\s*\)/gi;

const PLACEHOLDER_LEAK_RE =
  /\[(?:EMAIL|INSERT|SIGNER|PARTY|CONTACT|NAME|TBD)[_\d]*\]|Example\s+Upgrade\s+Preview/i;

const DISPUTE_ESCALATION_IN_NOTICES_RE =
  /\b(?:fifteen\s*\(\s*15\s*\)\s+business\s+days\s+before\s+commencing|binding\s+arbitration|dispute\s+shall\s+be\s+resolved)\b/i;

const SLA_IN_SIGNATURES_RE = /\btarget\s+monthly\s+uptime\b/i;

const DUPLICATE_HEADING_MAX = 2;
const COMMERCIALLY_REASONABLE_MAX = 4;

export function extractSectionHeadings(text: string): string[] {
  return parseAgreementSections(text).map((s) => s.heading.trim()).filter(Boolean);
}

export function findForbiddenDefinedShorts(text: string): string[] {
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(FORBIDDEN_DEFINED_SHORT_RE.source, "gi");
  while ((m = re.exec(text)) !== null) {
    hits.push(m[0]);
  }
  return [...new Set(hits)];
}

export function findMutatedEmails(
  inputEmails: readonly string[],
  output: string,
): { missing: string[]; corrupted: boolean } {
  const missing = inputEmails.filter((e) => !output.includes(e));
  const corrupted = /@(?:Ironclad|Harborline|Systems\s+Group|LLC|Inc\.)/i.test(
    output.replace(/@[\w.-]+\.[\w.-]+/g, ""),
  );
  return { missing, corrupted };
}

export function assertNoPlaceholderLeakage(
  text: string,
  intakeRaw: string,
  partyNames: readonly string[],
): ProQaValidationIssue[] {
  const issues: ProQaValidationIssue[] = [];
  if (PLACEHOLDER_LEAK_RE.test(text)) {
    issues.push({ code: "placeholder_bracket", message: "Bracket placeholder tokens remain in output" });
  }
  const forbidden = collectForbiddenTemplateFragments(text, intakeRaw, { partyNames: [...partyNames] });
  if (forbidden.length) {
    issues.push({
      code: "placeholder_fatal",
      message: `Forbidden template fragments: ${forbidden.slice(0, 4).join(", ")}`,
    });
  }
  for (const stale of STALE_PRO_TRANSFORMATION_PREVIEW_STRINGS) {
    if (text.includes(stale)) {
      issues.push({ code: "stale_pro_sample", message: `Stale Pro sample text: ${stale}` });
    }
  }
  if (/\bAcme\s+Widgets\s+LLC\b/.test(text) && !intakeRaw.includes("Acme Widgets")) {
    issues.push({ code: "fake_acme", message: "Unexpected Acme Widgets LLC sample text" });
  }
  if (/\bBeta\s+Supply\s+Inc\.?\b/i.test(text) && !intakeRaw.includes("Beta Supply")) {
    issues.push({ code: "fake_beta", message: "Unexpected Beta Supply sample text" });
  }
  return issues;
}

export function assertNoRecitalPartyExplosion(
  text: string,
  authoritativePartyCount: number,
): ProQaValidationIssue[] {
  const opening = text.slice(0, 2_500);
  const issues: ProQaValidationIssue[] = [];
  const badDefined = findForbiddenDefinedShorts(opening);
  if (badDefined.length) {
    issues.push({
      code: "recital_junk_defined",
      message: `Forbidden defined-short labels: ${badDefined.slice(0, 4).join(", ")}`,
    });
  }
  const among = opening.match(/\bamong\s+([^.;]{3,420})[.;]/i)?.[1] ?? "";
  const between = opening.match(/\bbetween\s+([^.;]{3,420})[.;]/i)?.[1] ?? "";
  const list = (among || between)
    .split(/\s*,\s*|\s+and\s+/i)
    .map((s) => s.replace(/\s*\([^)]*\)\s*/g, "").trim())
    .filter((s) => s.length >= 3 && !isDisallowedPartyPhrase(s));
  if (list.length > Math.max(authoritativePartyCount + 2, 14)) {
    issues.push({
      code: "recital_party_explosion",
      message: `Recital lists ${list.length} names (expected ~${authoritativePartyCount})`,
    });
  }
  return issues;
}

export function assertNoDuplicatedSections(text: string): ProQaValidationIssue[] {
  const headings = extractSectionHeadings(text).map((h) => h.toLowerCase());
  const counts = new Map<string, number>();
  for (const h of headings) {
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const dupes = [...counts.entries()].filter(([, n]) => n > DUPLICATE_HEADING_MAX);
  if (!dupes.length) return [];
  return [
    {
      code: "duplicate_sections",
      message: `Duplicate headings: ${dupes.map(([h, n]) => `${h}×${n}`).join(", ")}`,
    },
  ];
}

export function assertDisputeNotInContacts(text: string): ProQaValidationIssue[] {
  const notices = text.match(/\n\s*NOTICES\s*\n([\s\S]*?)(?=\n\s*KEY\s+CONTACTS\s*\n)/i)?.[1] ?? "";
  const contacts = text.match(/\n\s*KEY\s+CONTACTS\s*\n([\s\S]*?)(?=\n\s*IN WITNESS WHEREOF\b)/i)?.[1] ?? "";
  const region = `${notices}\n${contacts}`;
  if (!region.trim()) return [];
  if (DISPUTE_ESCALATION_IN_NOTICES_RE.test(region)) {
    return [{ code: "dispute_in_contacts", message: "Dispute escalation language in Notices/Contacts" }];
  }
  return [];
}

export function assertSectionPurity(text: string): ProQaValidationIssue[] {
  const issues = [...assertDisputeNotInContacts(text)];
  const sig = text.match(/\b(?:IN WITNESS WHEREOF|SIGNATURES?)\b\s*([\s\S]*)$/i)?.[1] ?? "";
  if (sig && SLA_IN_SIGNATURES_RE.test(sig)) {
    issues.push({ code: "sla_in_signatures", message: "SLA/uptime language in signature block" });
  }
  const noticesBody = text.match(/\bNOTICES?\b\s*([\s\S]*?)(?=\bSIGNATURES?\b|$)/i)?.[1] ?? "";
  if (noticesBody && /\bintellectual\s+property\s+license\s+grant\b/i.test(noticesBody)) {
    issues.push({ code: "ip_in_notices", message: "IP license language in Notices" });
  }
  return issues;
}

export function assertSignatureFullNames(text: string, parties: readonly string[]): ProQaValidationIssue[] {
  const sigIdx = text.search(/\b(?:IN WITNESS WHEREOF|SIGNATURES?)\b/i);
  if (sigIdx < 0) return [{ code: "no_signature_block", message: "Missing signature block" }];
  const sig = text.slice(sigIdx);
  const above = text.slice(0, sigIdx);
  const missing = parties.filter((p) => {
    if (sig.includes(p)) return false;
    const short = definedShortNameFromLegalEntity(p);
    if (sig.includes(short) && above.includes(p)) return false;
    return true;
  });
  if (!missing.length) return [];
  return [
    {
      code: "signature_short_names",
      message: `Full legal names missing in signatures: ${missing.slice(0, 3).join("; ")}`,
    },
  ];
}

export function assertOpeningFullLegalNames(
  text: string,
  parties: readonly string[],
): ProQaValidationIssue[] {
  const opening = text.slice(0, 2_000);
  const missing = parties.filter((p) => {
    const core = p.replace(/\.\s*$/g, "").trim();
    if (opening.includes(p) || opening.includes(core)) return false;
    const short = definedShortNameFromLegalEntity(p);
    if (opening.includes(short)) return false;
    if (new RegExp(`\\(\\s*["']?${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*\\)`, "i").test(opening)) {
      return false;
    }
    return true;
  });
  if (!missing.length) return [];
  return [
    {
      code: "opening_missing_legal",
      message: `Opening missing full legal names: ${missing.slice(0, 3).join("; ")}`,
    },
  ];
}

export function assertOperationalSignals(
  text: string,
  expectedSignals: readonly RegExp[],
  minHits = 1,
): ProQaValidationIssue[] {
  const hits = expectedSignals.filter((re) => re.test(text)).length;
  if (hits >= minHits) return [];
  return [
    {
      code: "missing_operational_signals",
      message: `Expected ≥${minHits} operational signal(s); matched ${hits}/${expectedSignals.length}`,
    },
  ];
}

export function assertReadabilityThresholds(text: string): ProQaValidationIssue[] {
  const issues: ProQaValidationIssue[] = [];
  const creCount = (text.match(/\bcommercially\s+reasonable\s+efforts\b/gi) ?? []).length;
  if (creCount > COMMERCIALLY_REASONABLE_MAX) {
    issues.push({
      code: "filler_repetition",
      message: `"commercially reasonable efforts" repeated ${creCount} times`,
    });
  }
  const headings = extractSectionHeadings(text);
  if (headings.length < 2 && text.length > 800) {
    issues.push({ code: "weak_structure", message: "Few section headings for document length" });
  }
  return issues;
}

export function assertEmailsPreserved(intake: string, text: string): ProQaValidationIssue[] {
  const emails = extractIntakeEmailsOrdered(intake);
  if (!emails.length) return [];
  const { missing } = findMutatedEmails(emails, text);
  if (!missing.length) return [];
  return [
    {
      code: "email_mutation",
      message: `Intake emails missing from output: ${missing.slice(0, 3).join(", ")}`,
    },
  ];
}

export function runAllProQaValidators(args: {
  text: string;
  intake: string;
  parties: readonly string[];
  expectedSignals: readonly RegExp[];
  minSignalHits?: number;
}): ProQaValidationIssue[] {
  const { text, intake, parties, expectedSignals, minSignalHits = 1 } = args;
  return [
    ...assertNoPlaceholderLeakage(text, intake, parties),
    ...assertNoRecitalPartyExplosion(text, parties.length),
    ...assertNoDuplicatedSections(text),
    ...assertSectionPurity(text),
    ...assertOpeningFullLegalNames(text, parties),
    ...assertSignatureFullNames(text, parties),
    ...assertEmailsPreserved(intake, text),
    ...assertOperationalSignals(text, expectedSignals, minSignalHits),
    ...assertReadabilityThresholds(text),
  ];
}
