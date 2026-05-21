/**
 * Detect and suppress repeated long boilerplate sentences before final render.
 */

import { parseAgreementSections } from "../proOperationalSynthesis/sectionPurityValidator";
import { BOILERPLATE_REPEAT_ALLOWED_KINDS } from "./types";

export const KNOWN_BOILERPLATE_SENTENCES: readonly string[] = [
  "the parties shall perform their obligations in good faith and in accordance with this agreement",
  "invoices shall reference the applicable milestone or service period and are due within thirty (30) days of receipt",
  "invoices shall reference the applicable milestone or service period",
  "fees and invoicing follow the payment schedule in this agreement",
  "each party represents that it has authority to enter into this agreement",
  "services are provided in a professional manner",
  "except as expressly stated in this agreement",
  "operative terms. the parties intend to document",
  "specific commercial, payment, and liability terms should be completed in review",
  "needs details",
  "to be completed in review",
  "commercial details are unspecified",
  "direct damages are limited to fees paid",
  "survival and wind-down obligations apply as stated herein",
  "compensation, invoicing, and payment timing will be documented in a schedule",
];

function normalizeSentenceKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s$.,()%-]/g, "")
    .trim();
}

function sentenceAllowedInSection(sentenceNorm: string, sectionKind: string): boolean {
  if (!BOILERPLATE_REPEAT_ALLOWED_KINDS.has(sectionKind as never)) return false;
  if (sectionKind === "signatures" || sectionKind === "contacts") return true;
  if (sectionKind === "parties" && sentenceNorm.length < 120) return true;
  return false;
}

function isBoilerplateSentence(sentence: string): string | null {
  const norm = normalizeSentenceKey(sentence);
  if (norm.length < 40) return null;
  for (const b of KNOWN_BOILERPLATE_SENTENCES) {
    if (norm.includes(b) || b.includes(norm.slice(0, Math.min(norm.length, 80)))) return b;
  }
  return null;
}

export type BoilerplateGuardResult = {
  text: string;
  removedCount: number;
  duplicateKeys: string[];
};

function dedupeBoilerplateSentences(
  body: string,
  sectionKind: string,
  globalSeen: Map<string, number>,
  duplicateKeys: string[],
): { text: string; removedCount: number } {
  const sentences = body.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  let removedCount = 0;
  for (const sent of sentences) {
    const t = sent.trim();
    if (t.length < 24) {
      kept.push(sent);
      continue;
    }
    const boiler = isBoilerplateSentence(t);
    if (!boiler) {
      kept.push(sent);
      continue;
    }
    const key = normalizeSentenceKey(t);
    const count = globalSeen.get(key) ?? 0;
    if (count === 0 || sentenceAllowedInSection(key, sectionKind)) {
      globalSeen.set(key, count + 1);
      kept.push(sent);
      continue;
    }
    removedCount += 1;
    if (!duplicateKeys.includes(boiler)) duplicateKeys.push(boiler);
  }
  const joined = kept.join(" ");
  const text = joined.includes("\n") ? joined.replace(/[ \t]+/g, " ").trim() : joined.replace(/\s+/g, " ").trim();
  return { text, removedCount };
}

function dedupeBoilerplatePreservingLines(body: string, sectionKind: string, globalSeen: Map<string, number>, duplicateKeys: string[]): { text: string; removedCount: number } {
  if (!body.includes("\n")) {
    return dedupeBoilerplateSentences(body, sectionKind, globalSeen, duplicateKeys);
  }
  const lines = body.split("\n");
  let removed = 0;
  const out = lines.map((line) => {
    const r = dedupeBoilerplateSentences(line, sectionKind, globalSeen, duplicateKeys);
    removed += r.removedCount;
    return r.text;
  });
  return { text: out.join("\n"), removedCount: removed };
}

/**
 * Remove duplicate boilerplate sentences (keep first occurrence outside allowed sections).
 */
export function suppressRepeatedBoilerplate(
  text: string,
  opts?: { sectionPass?: boolean },
): BoilerplateGuardResult {
  const globalSeen = new Map<string, number>();
  let removedCount = 0;
  const duplicateKeys: string[] = [];
  let out = text;

  if (opts?.sectionPass !== false) {
    const sections = parseAgreementSections(text);
    for (const sec of sections) {
      const cleaned = dedupeBoilerplatePreservingLines(sec.body, sec.kind, globalSeen, duplicateKeys);
      removedCount += cleaned.removedCount;
      if (cleaned.text !== sec.body) {
        out = out.replace(sec.body, cleaned.text);
      }
    }
  }

  const paras = out.split(/\n\n+/);
  const rebuilt: string[] = [];
  for (const para of paras) {
    const cleaned = dedupeBoilerplatePreservingLines(para, "general", globalSeen, duplicateKeys);
    removedCount += cleaned.removedCount;
    rebuilt.push(cleaned.text);
  }

  return { text: rebuilt.join("\n\n").replace(/\n{3,}/g, "\n\n"), removedCount, duplicateKeys };
}
