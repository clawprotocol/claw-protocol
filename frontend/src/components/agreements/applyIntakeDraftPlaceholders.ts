/**
 * Universal intake→corpus placeholder fill for clarification-style brackets the model
 * often echoes ([Your Company Legal Name], [Customer Legal Name], [State], …).
 * Product-wide: no account / tier branching. Never invents parties — only substitutes
 * when intake (or explicit party names) already resolve them.
 */

import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { isPlaceholderPartyName } from "./starterPartyLimits";

const GOV_LAW_RE =
  /\b(?:Governing\s+law|governed\s+by(?:\s+the\s+laws?\s+of)?|laws?\s+of)\s*[:\-]?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?|[A-Z]{2})\b/;
const GOV_LAW_LABEL_RE = /\bGoverning\s+law\s*:\s*([A-Za-z][A-Za-z\s]{1,40})/i;

/** Party-0 (first between / “your company” / provider-as-vendor) bracket forms. */
const PARTY0_BRACKET_RES: readonly RegExp[] = [
  /\[\s*Your\s+Company\s+Legal\s+Name\s*\]/gi,
  /\[\s*Your\s+Company\s+Name\s*\]/gi,
  /\[\s*Provider\s+Legal\s+Name\s*\]/gi,
  /\[\s*Company\s+Legal\s+Name\s*\]/gi,
  /\[\s*Party\s+A\s+Legal\s+Name\s*\]/gi,
];

/** Party-1 (counterparty / customer / service provider) bracket forms. */
const PARTY1_BRACKET_RES: readonly RegExp[] = [
  /\[\s*Customer\s+Legal\s+Name\s*\]/gi,
  /\[\s*Customer\s+Name\s*\]/gi,
  /\[\s*Client\s+Legal\s+Name\s*\]/gi,
  /\[\s*Client(?:'s)?(?:\s+Full)?\s+Legal\s+Name\s*\]/gi,
  /\[\s*Service\s+Provider\s+(?:Legal\s+)?Name\s*\]/gi,
  /\[\s*Counterparty\s+(?:Legal\s+)?Name\s*\]/gi,
  /\[\s*Party\s+B\s+Legal\s+Name\s*\]/gi,
];

export function extractGoverningLawFromIntake(raw: string | null | undefined): string | null {
  const text = String(raw || "");
  if (!text.trim()) return null;
  const m = text.match(GOV_LAW_RE);
  if (m?.[1]) {
    const v = m[1].trim().replace(/[.;,]+$/, "");
    if (v && !/^state$/i.test(v) && !/^\[/.test(v)) return v;
  }
  const m2 = text.match(GOV_LAW_LABEL_RE);
  if (m2?.[1]) {
    const v = m2[1].trim().replace(/[.;,]+$/, "");
    if (v && !/^state$/i.test(v) && !/^\[/.test(v)) return v;
  }
  return null;
}

function usablePartyName(name: string | null | undefined): string {
  const t = String(name || "").replace(/\s+/g, " ").trim();
  if (t.length < 2) return "";
  if (isPlaceholderPartyName(t)) return "";
  if (/^Party\s+\d+$/i.test(t)) return "";
  if (/^\[/.test(t)) return "";
  if (
    /^(?:your\s+company(?:\s+legal)?\s+name|customer(?:\s+legal)?\s+name|service\s+provider(?:\s+legal)?\s+name|client(?:\s+legal)?\s+name)$/i.test(
      t,
    )
  ) {
    return "";
  }
  // Prefer authoritative entities; still allow short entity / sole-prop names.
  if (isAuthoritativeLegalEntityName(t)) return t;
  if (/^(?:LLC|Inc|Corp|Ltd)\.?$/i.test(t)) return "";
  if (t.split(/\s+/).length >= 1 && t.length >= 3) return t;
  return "";
}

export function resolveIntakeDraftPartyNames(
  intakeText: string | null | undefined,
  explicitNames?: readonly string[] | null,
): [string, string] | null {
  const fromExplicit = (explicitNames || []).map(usablePartyName).filter(Boolean);
  if (fromExplicit.length >= 2) return [fromExplicit[0]!, fromExplicit[1]!];

  const between = extractBetweenPartyNameList(String(intakeText || ""))
    .map(usablePartyName)
    .filter(Boolean);
  if (between.length >= 2) return [between[0]!, between[1]!];

  return null;
}

function replaceAll(re: RegExp, value: string, text: string): { text: string; hit: boolean } {
  if (!value) return { text, hit: false };
  re.lastIndex = 0;
  if (!re.test(text)) return { text, hit: false };
  re.lastIndex = 0;
  return { text: text.replace(re, value), hit: true };
}

/**
 * Soft-patch excluded-data language when intake named children’s/COPPA but the model dropped it.
 * Deal-family agnostic: matches common exclusion list tails across SaaS / services / DPA prose.
 */
function ensureChildrenDataExclusion(text: string, intake: string): { text: string; repairs: string[] } {
  if (!/\bchildren[''\u2019]?s\s+data\b|\bCOPPA\b|\bminors?[''\u2019]?s?\s+data\b/i.test(intake)) {
    return { text, repairs: [] };
  }
  if (/\bchildren[''\u2019]?s\s+data\b|\bCOPPA\b/i.test(text)) {
    return { text, repairs: [] };
  }
  const listTailRes: readonly RegExp[] = [
    // “… HIPAA, … PCI …, classified … or controlled government data”
    /((?:will not|must not|shall not)\s+(?:submit|include|process|accept)[\s\S]{0,320}?)(classified information(?:\s*,?\s*or\s+controlled(?:\s+government)?\s+data)?)/i,
    // “Out of scope: PHI/HIPAA, PCI, … classified …”
    /(Out of scope:\s*[^.\n]{0,200}?)(classified(?:\s*\/\s*controlled(?:\s+gov)?\s+data)?|controlled(?:\s+government)?\s+data)/i,
    // Generic exclusion lists ending in classified / controlled gov data
    /((?:Excluded Data|excludes?|does not include)[^\n.]{0,240}?)(classified information(?:\s*,?\s*or\s+controlled(?:\s+government)?\s+data)?)/i,
  ];
  for (const re of listTailRes) {
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    return {
      text: text.replace(re, "$1children's data, $2"),
      repairs: ["data_scope:children_exclusion_restored"],
    };
  }
  return { text, repairs: [] };
}

export type ApplyIntakeDraftPlaceholdersResult = {
  text: string;
  repairs: string[];
};

/**
 * Fill clarification-style identity / governing-law brackets from intake facts.
 * Safe to run early on every Pro acceptance / display path.
 */
export function applyIntakeDraftPlaceholders(args: {
  text: string;
  intakeText?: string | null;
  partyNames?: readonly string[] | null;
}): ApplyIntakeDraftPlaceholdersResult {
  let out = String(args.text || "");
  const repairs: string[] = [];
  if (!out.trim()) return { text: out, repairs };

  const parties = resolveIntakeDraftPartyNames(args.intakeText, args.partyNames);
  if (parties) {
    const [party0, party1] = parties;
    for (const re of PARTY0_BRACKET_RES) {
      const next = replaceAll(re, party0, out);
      if (next.hit) {
        out = next.text;
        repairs.push(`intake_placeholder:party0:${re.source}`);
      }
    }
    for (const re of PARTY1_BRACKET_RES) {
      const next = replaceAll(re, party1, out);
      if (next.hit) {
        out = next.text;
        repairs.push(`intake_placeholder:party1:${re.source}`);
      }
    }
  }

  const gov = extractGoverningLawFromIntake(args.intakeText);
  if (gov && /\[State\]/i.test(out)) {
    // Fill governing-law / venue [State] before harmless-metadata neutralization strips them.
    out = out.replace(/\[State\]/gi, gov);
    repairs.push(`intake_placeholder:governing_law:${gov}`);
  }

  const children = ensureChildrenDataExclusion(out, String(args.intakeText || ""));
  out = children.text;
  repairs.push(...children.repairs);

  return { text: out, repairs: [...new Set(repairs)] };
}

/** True when clarification-style identity brackets remain (for review UX). */
export function corpusHasClarificationStyleIdentityPlaceholders(text: string): boolean {
  const t = String(text || "");
  return (
    /\[\s*Your\s+Company\s+(?:Legal\s+)?Name\s*\]/i.test(t) ||
    /\[\s*Customer\s+(?:Legal\s+)?Name\s*\]/i.test(t) ||
    /\[\s*Client\s+(?:Legal\s+)?Name\s*\]/i.test(t) ||
    /\[\s*Service\s+Provider\s+(?:Legal\s+)?Name\s*\]/i.test(t) ||
    /\[\s*Provider\s+Legal\s+Name\s*\]/i.test(t)
  );
}
