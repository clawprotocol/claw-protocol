/**
 * Professional corpus contamination gate — rejects/repairs party-label fragments, notice leakage,
 * signer contact bleed, duplicate notice stanzas, and generic role drift before freeze and render.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import {
  findNoticesSectionStart,
  resolveOperativeNoticesFamilyEnd,
} from "./paidProPartyNoticeDetails";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";

export type ProfessionalCorpusContaminationIssue = {
  code: string;
  message: string;
};

const ALL_CAPS_FRAGMENT_LINE_RE = /^[A-Z][A-Z0-9\s&.'-]{6,}$/;
const IF_TO_STANZA_START_RE = /^If to\s+/i;
const NOTICE_CONTACT_LINE_RE =
  /^(?:Email|Address|E-mail|Attn|Attention|Phone|Fax)(?:\s+for\s+Notice)?\s*:/i;
const INDEPENDENT_CONTRACTOR_LEAK_RE =
  /^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+\s+is\s+an\s+independent\s+contractor/i;
const GENERIC_ROLE_IN_OPERATIVE_RE = /\b(?:Service Provider|the Client|the Service Provider)\b/i;
const NUMBERED_HEADING_RE = /^\d+(?:\.\d+)*\.\s+[A-Z]/;
const ZIP_FRAGMENT_LEAK_RE = /^\d{5}\.\s+/;

function norm(s: string | null | undefined): string {
  return (s || "").replace(/\r\n/g, "\n").trim();
}

function entitySuffixRe(): RegExp {
  return /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|LLP|PLLC)\b/i;
}

export function extractPartyShortLabelTokens(partyNames: readonly string[]): string[] {
  const tokens: string[] = [];
  for (const raw of partyNames) {
    const name = norm(raw);
    if (!name) continue;
    const withoutSuffix = name.replace(entitySuffixRe(), "").trim();
    const short = withoutSuffix.toUpperCase();
    if (short.length >= 4 && !tokens.includes(short)) tokens.push(short);
    const words = withoutSuffix.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const pair = `${words[0]} ${words[1]}`.toUpperCase();
      if (pair.length >= 4 && !tokens.includes(pair)) tokens.push(pair);
    }
    if (words[0] && words[0].length >= 4) {
      const w = words[0].toUpperCase();
      if (!tokens.includes(w)) tokens.push(w);
    }
  }
  return tokens;
}

function isBareConcatenatedPartyFragmentLine(line: string, tokens: readonly string[]): boolean {
  const t = line.trim();
  if (!t || t.length > 120) return false;
  if (!ALL_CAPS_FRAGMENT_LINE_RE.test(t)) return false;
  if (entitySuffixRe().test(t)) return false;
  if (NUMBERED_HEADING_RE.test(t)) return false;
  const matched = tokens.filter((tok) => tok.length >= 4 && t.includes(tok));
  return matched.length >= 2;
}

function splitIfToStanzas(text: string): string[] {
  return text.split(/\n(?=If to\s+)/i).map((s) => s.trim()).filter(Boolean);
}

export function detectProfessionalCorpusContamination(
  corpus: string,
  opts?: {
    partyNames?: readonly string[];
    partyCount?: number;
    intakeText?: string | null;
    signerNames?: readonly string[];
  },
): ProfessionalCorpusContaminationIssue[] {
  const text = norm(corpus);
  if (!text) return [{ code: "empty_corpus", message: "Empty corpus" }];
  const issues: ProfessionalCorpusContaminationIssue[] = [];
  const partyNames =
    opts?.partyNames?.filter((n) => norm(n).length >= 2) ??
    [];
  const partyCount = Math.max(opts?.partyCount ?? partyNames.length, 0);
  const shortTokens = extractPartyShortLabelTokens(partyNames);
  const noticesIdx = findNoticesSectionStart(text);
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const noticesEnd =
    noticesIdx >= 0
      ? resolveOperativeNoticesFamilyEnd(text, noticesIdx)
      : witnessIdx >= 0
        ? witnessIdx
        : text.length;

  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const line = raw.trim();
    const lineStart = offset;
    offset += raw.length + 1;
    const inNotices = noticesIdx >= 0 && lineStart >= noticesIdx && lineStart < noticesEnd;
    const inExecution = witnessIdx >= 0 && lineStart >= witnessIdx;

    if (!inNotices && !inExecution && ZIP_FRAGMENT_LEAK_RE.test(line)) {
      issues.push({
        code: "notice_zip_fragment_operative_leak",
        message: `Zip fragment outside Notices: ${line.slice(0, 60)}`,
      });
    }

    if (shortTokens.length >= 2 && isBareConcatenatedPartyFragmentLine(line, shortTokens)) {
      issues.push({
        code: "bare_party_label_fragment",
        message: `Bare concatenated party labels: ${line.slice(0, 80)}`,
      });
    }

    if (!inNotices && IF_TO_STANZA_START_RE.test(line)) {
      issues.push({
        code: "notice_stanza_outside_notices",
        message: `If-to notice stanza outside Notices: ${line.slice(0, 60)}`,
      });
    }

    if (!inNotices && !inExecution && NOTICE_CONTACT_LINE_RE.test(line)) {
      if (/@/.test(line) || /\d{5}/.test(line)) {
        issues.push({
          code: "notice_contact_outside_notices",
          message: `Notice contact line outside Notices: ${line.slice(0, 60)}`,
        });
      }
    }

    if (!inNotices && !inExecution && INDEPENDENT_CONTRACTOR_LEAK_RE.test(line)) {
      issues.push({
        code: "signer_name_operative_leak",
        message: `Signer independent-contractor leak: ${line.slice(0, 60)}`,
      });
    }
  }

  if (noticesIdx >= 0) {
    const noticesRegion = text.slice(noticesIdx, noticesEnd);
    const stanzas = splitIfToStanzas(noticesRegion).filter((s) => /^If to\s+/i.test(s));
    const seenEntity = new Map<string, number>();
    for (const stanza of stanzas) {
      const entity = (stanza.match(/^If to\s+(.+?):/i)?.[1] ?? "").trim().toLowerCase();
      if (!entity) continue;
      seenEntity.set(entity, (seenEntity.get(entity) ?? 0) + 1);
    }
    for (const [entity, count] of seenEntity) {
      if (count > 1) {
        issues.push({
          code: "duplicate_notice_stanza",
          message: `Duplicate notice stanza for ${entity}`,
        });
      }
    }
    if (partyCount >= 4 && stanzas.length > partyCount + 1) {
      issues.push({
        code: "excess_notice_stanzas",
        message: `Notice stanza count ${stanzas.length} exceeds party count ${partyCount}`,
      });
    }
  }

  if (partyCount >= 4 && partyNames.length >= 4) {
    const namedAgreement =
      partyNames.filter((n) => isAuthoritativeLegalEntityName(n)).length >= 4;
    if (namedAgreement) {
      const operative = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
      const sections = operative.split(/\n(?=\d+\.\s+[A-Z])/);
      const scopeSectionCount = sections.filter((sec) =>
        /^\d+\.\s+.*\bSCOPE\b/i.test((sec.split("\n")[0] ?? "").trim()),
      ).length;
      if (scopeSectionCount > 1) {
        for (const sec of sections) {
          const heading = (sec.split("\n")[0] ?? "").trim();
          const sectionNum = Number((heading.match(/^(\d+)/) ?? [])[1] ?? 0);
          if (
            sectionNum >= 13 &&
            /\bSCOPE\b/i.test(heading) &&
            GENERIC_ROLE_IN_OPERATIVE_RE.test(sec)
          ) {
            issues.push({
              code: "generic_role_drift_named_multiparty",
              message: `Duplicate scope section with generic roles: ${heading.slice(0, 60)}`,
            });
          }
        }
      }
    }
  }

  for (const signer of opts?.signerNames ?? []) {
    const name = norm(signer);
    if (name.length < 4) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const leakRe = new RegExp(`${escaped}\\s+is\\s+an\\s+independent`, "i");
    const operative = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
    const outsideNotices =
      noticesIdx >= 0
        ? operative.slice(0, noticesIdx) + operative.slice(Math.min(noticesEnd, operative.length))
        : operative;
    if (leakRe.test(outsideNotices)) {
      issues.push({
        code: "signer_name_operative_leak",
        message: `Signer name leaked into operative section: ${name}`,
      });
    }
  }

  return issues;
}

function repairDuplicateSynthesizedLateSections(
  corpus: string,
  partyCount: number,
): { text: string; repairs: string[] } {
  if (partyCount < 4) return { text: corpus, repairs: [] };
  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const head = witnessIdx >= 0 ? corpus.slice(0, witnessIdx) : corpus;
  const tail = witnessIdx >= 0 ? corpus.slice(witnessIdx) : "";
  const sections = head.split(/\n(?=\d+\.\s+[A-Z])/);
  const scopeCount = sections.filter((sec) =>
    /\bSCOPE\b/i.test((sec.split("\n")[0] ?? "").trim()),
  ).length;
  if (scopeCount <= 1) return { text: corpus, repairs: [] };

  const kept: string[] = [];
  const repairs: string[] = [];
  for (const sec of sections) {
    const heading = (sec.split("\n")[0] ?? "").trim();
    const sectionNum = Number((heading.match(/^(\d+)/) ?? [])[1] ?? 0);
    const isLateGenericSynthesis =
      sectionNum >= 13 &&
      (/\bSCOPE\b/i.test(heading) || /INDEPENDENT/i.test(heading)) &&
      GENERIC_ROLE_IN_OPERATIVE_RE.test(sec);
    if (isLateGenericSynthesis) {
      repairs.push(`contamination:strip_late_synthesized_section_${sectionNum}`);
      continue;
    }
    kept.push(sec);
  }
  if (!repairs.length) return { text: corpus, repairs: [] };
  const mergedHead = kept.join("").replace(/\n{3,}/g, "\n\n").trimEnd();
  const text = tail ? `${mergedHead}\n\n${tail.trimStart()}`.replace(/\n{3,}/g, "\n\n").trimEnd() : mergedHead;
  return { text, repairs };
}

export function repairProfessionalCorpusContamination(
  corpus: string,
  opts?: {
    partyNames?: readonly string[];
    partyCount?: number;
    signerNames?: readonly string[];
  },
): { text: string; repairs: string[] } {
  let text = norm(corpus);
  const repairs: string[] = [];
  const partyNames = opts?.partyNames ?? [];
  const partyCount = Math.max(opts?.partyCount ?? partyNames.length, 0);
  const lateSectionRepair = repairDuplicateSynthesizedLateSections(text, partyCount);
  if (lateSectionRepair.repairs.length > 0) {
    text = lateSectionRepair.text;
    repairs.push(...lateSectionRepair.repairs);
  }

  const lines = text.split("\n");
  const shortTokens = extractPartyShortLabelTokens(partyNames);
  const noticesIdx = findNoticesSectionStart(text);
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const noticesEnd =
    noticesIdx >= 0
      ? resolveOperativeNoticesFamilyEnd(text, noticesIdx)
      : witnessIdx >= 0
        ? witnessIdx
        : text.length;
  const kept: string[] = [];
  let inIfToOutsideNotices = false;
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const line = raw.trim();
    const lineStart = offset;
    offset += raw.length + 1;
    const inNotices = noticesIdx >= 0 && lineStart >= noticesIdx && lineStart < noticesEnd;
    const inExecution = witnessIdx >= 0 && lineStart >= witnessIdx;

    if (!inNotices && ZIP_FRAGMENT_LEAK_RE.test(line)) {
      repairs.push("contamination:strip_zip_fragment_leak");
      inIfToOutsideNotices = false;
      continue;
    }

    if (shortTokens.length >= 2 && isBareConcatenatedPartyFragmentLine(line, shortTokens)) {
      repairs.push("contamination:strip_bare_party_fragment");
      inIfToOutsideNotices = false;
      continue;
    }

    if (!inNotices && IF_TO_STANZA_START_RE.test(line)) {
      inIfToOutsideNotices = true;
      repairs.push("contamination:strip_if_to_outside_notices");
      continue;
    }

    if (inIfToOutsideNotices && !inNotices) {
      if (NUMBERED_HEADING_RE.test(line) || /^IN WITNESS WHEREOF/i.test(line)) {
        inIfToOutsideNotices = false;
        kept.push(raw);
      } else {
        repairs.push("contamination:strip_notice_stanza_tail");
      }
      continue;
    }

    if (
      !inNotices &&
      !inExecution &&
      (INDEPENDENT_CONTRACTOR_LEAK_RE.test(line) ||
        (NOTICE_CONTACT_LINE_RE.test(line) && (/@/.test(line) || /\d{5}/.test(line))))
    ) {
      repairs.push("contamination:strip_operative_contact_leak");
      continue;
    }

    kept.push(raw);
  }

  text = kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();

  return { text, repairs: [...new Set(repairs)] };
}

export function assertProfessionalCorpusCleanForFreeze(
  corpus: string,
  opts?: {
    partyNames?: readonly string[];
    partyCount?: number;
    intakeText?: string | null;
    draft?: ParsedDraftShape | null;
    signerNames?: readonly string[];
    surface?: string;
  },
): string {
  const repaired = repairProfessionalCorpusContamination(corpus, {
    partyNames: opts?.partyNames,
    partyCount: opts?.partyCount,
    signerNames: opts?.signerNames,
  });
  const issues = detectProfessionalCorpusContamination(repaired.text, {
    partyNames: opts?.partyNames,
    partyCount: opts?.partyCount,
    intakeText: opts?.intakeText,
    signerNames: opts?.signerNames,
  });
  if (issues.length > 0) {
    throw new Error(
      `[paid-pro-professional-corpus-contamination-blocked] ${issues
        .slice(0, 4)
        .map((i) => i.code)
        .join(",")}`,
    );
  }
  return repaired.text;
}

export function evaluateProfessionalCorpusContamination(
  corpus: string,
  opts?: {
    partyNames?: readonly string[];
    partyCount?: number;
    intakeText?: string | null;
    signerNames?: readonly string[];
  },
): { ok: boolean; text: string; issues: ProfessionalCorpusContaminationIssue[]; repairs: string[] } {
  const repaired = repairProfessionalCorpusContamination(corpus, opts);
  const issues = detectProfessionalCorpusContamination(repaired.text, opts);
  return {
    ok: issues.length === 0,
    text: repaired.text,
    issues,
    repairs: repaired.repairs,
  };
}
