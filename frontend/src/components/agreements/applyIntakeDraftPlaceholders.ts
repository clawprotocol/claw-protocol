/**
 * Universal intake→corpus placeholder fill for clarification-style brackets the model
 * often echoes ([Your Company Legal Name], [Customer Legal Name], [Party N Legal Name], [State], …).
 * Product-wide: no account / tier branching. Never invents parties — only substitutes
 * when intake (or explicit party names) already resolve them. Supports ordered N = 2–4.
 */

import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { PAID_PRO_GTM_MAX_SIGNING_PARTIES } from "./paidProAuthorityLimits";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { isPlaceholderPartyName } from "./starterPartyLimits";

const GOV_LAW_RE =
  /\b(?:Governing\s+law|governed\s+by(?:\s+the\s+laws?\s+of)?|laws?\s+of)\s*[:\-]?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?|[A-Z]{2})\b/;
const GOV_LAW_LABEL_RE = /\bGoverning\s+law\s*:\s*([A-Za-z][A-Za-z\s]{1,40})/i;

/** Role / legacy brackets mapped by ordered slot index (0-based). */
const ROLE_BRACKET_RES_BY_INDEX: ReadonlyArray<readonly RegExp[]> = [
  [
    /\[\s*Your\s+Company\s+Legal\s+Name\s*\]/gi,
    /\[\s*Your\s+Company\s+Name\s*\]/gi,
    /\[\s*Provider\s+Legal\s+Name\s*\]/gi,
    /\[\s*Company\s+Legal\s+Name\s*\]/gi,
    /\[\s*Party\s+A\s+Legal\s+Name\s*\]/gi,
    /\[\s*Licensor\s+Legal\s+Name\s*\]/gi,
    /\[\s*Lender\s+Legal\s+Name\s*\]/gi,
    /\[\s*Landlord\s+Legal\s+Name\s*\]/gi,
  ],
  [
    /\[\s*Customer\s+Legal\s+Name\s*\]/gi,
    /\[\s*Customer\s+Name\s*\]/gi,
    /\[\s*Client\s+Legal\s+Name\s*\]/gi,
    /\[\s*Client(?:'s)?(?:\s+Full)?\s+Legal\s+Name\s*\]/gi,
    /\[\s*Service\s+Provider\s+(?:Legal\s+)?Name\s*\]/gi,
    /\[\s*Counterparty\s+(?:Legal\s+)?Name\s*\]/gi,
    /\[\s*Party\s+B\s+Legal\s+Name\s*\]/gi,
    /\[\s*Licensee\s+Legal\s+Name\s*\]/gi,
    /\[\s*Contractor\s+Legal\s+Name\s*\]/gi,
    /\[\s*Borrower\s+Legal\s+Name\s*\]/gi,
    /\[\s*Tenant\s+Legal\s+Name\s*\]/gi,
  ],
];

function partyNLegalNameBracketRe(oneBased: number): RegExp {
  return new RegExp(`\\[\\s*Party\\s+${oneBased}\\s+Legal\\s+Name\\s*\\]`, "gi");
}

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

function extractLabeledPartyNames(intakeText: string): string[] {
  const labeled: string[] = [];
  const lineRe = /(?:^|\n)\s*Party\s*[1-9]\s*[:\-]\s*([^\n]{2,80})/gim;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(intakeText))) {
    const name = usablePartyName((m[1] || "").replace(/[.;,]+$/, ""));
    if (name) labeled.push(name);
  }
  return labeled;
}

/**
 * Ordered signing-party names from intake / explicit list, length 2–4 when resolvable.
 * Never invents Party 3/4 — returns only names present in intake or explicitNames.
 */
export function resolveIntakeDraftPartyNames(
  intakeText: string | null | undefined,
  explicitNames?: readonly string[] | null,
): string[] | null {
  const fromExplicit = (explicitNames || []).map(usablePartyName).filter(Boolean);
  const between = extractBetweenPartyNameList(String(intakeText || ""))
    .map(usablePartyName)
    .filter(Boolean);
  const labeled = extractLabeledPartyNames(String(intakeText || ""));
  const ordered =
    fromExplicit.length >= 2
      ? fromExplicit
      : between.length >= 2
        ? between
        : labeled.length >= 2
          ? labeled
          : [];
  if (ordered.length < 2) return null;
  return ordered.slice(0, PAID_PRO_GTM_MAX_SIGNING_PARTIES);
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * When OpenAI ships demo/wrong opening identities that do not match the intake
 * between/among names, overlay intake names onto the corpus.
 * Prose stays the oracle; clear legal names stay intake-authoritative.
 */
function overlayIntakePartyIdentitiesOntoCorpus(
  text: string,
  intakeParties: readonly string[],
): { text: string; repairs: string[] } {
  if (intakeParties.length < 2) return { text, repairs: [] };
  const opening = extractBetweenPartyNameList(text.slice(0, 1400))
    .map(usablePartyName)
    .filter(Boolean);
  if (opening.length < 2) return { text, repairs: [] };

  const n = Math.min(intakeParties.length, opening.length, PAID_PRO_GTM_MAX_SIGNING_PARTIES);
  const intakeSlice = intakeParties.slice(0, n);
  const openingSlice = opening.slice(0, n);
  const alreadyAligned = openingSlice.every((name, i) =>
    partyLegalNamesMatch(name, intakeSlice[i]!) ||
    intakeSlice.some((intake) => partyLegalNamesMatch(name, intake)),
  );
  if (alreadyAligned) return { text, repairs: [] };

  // Only overlay when none of the opening entities appear in intake (true wrong demo set).
  const openingForeign = openingSlice.every(
    (name) => !intakeSlice.some((intake) => partyLegalNamesMatch(name, intake)),
  );
  if (!openingForeign) return { text, repairs: [] };

  let out = text;
  const repairs: string[] = [];
  // Replace longer names first so multi-word entities win over shorter prefixes.
  const pairs = openingSlice
    .map((from, i) => ({ from, to: intakeSlice[i]! }))
    .filter((p) => p.from && p.to && !partyLegalNamesMatch(p.from, p.to))
    .sort((a, b) => b.from.length - a.from.length);
  for (const { from, to } of pairs) {
    const re = new RegExp(`(?<![\\w])${escapeRegExp(from)}(?![\\w])`, "g");
    if (!re.test(out)) continue;
    re.lastIndex = 0;
    out = out.replace(re, to);
    repairs.push(`intake_identity_overlay:${from}→${to}`);
  }
  return { text: out, repairs };
}

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
    for (let i = 0; i < parties.length; i++) {
      const name = parties[i]!;
      const roleRes = ROLE_BRACKET_RES_BY_INDEX[i] || [];
      for (const re of roleRes) {
        const next = replaceAll(re, name, out);
        if (next.hit) {
          out = next.text;
          repairs.push(`intake_placeholder:party${i}:${re.source}`);
        }
      }
      const nRe = partyNLegalNameBracketRe(i + 1);
      const nextN = replaceAll(nRe, name, out);
      if (nextN.hit) {
        out = nextN.text;
        repairs.push(`intake_placeholder:party${i}:Party_${i + 1}_Legal_Name`);
      }
    }
    const overlay = overlayIntakePartyIdentitiesOntoCorpus(out, parties);
    out = overlay.text;
    repairs.push(...overlay.repairs);
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
    /\[\s*Provider\s+Legal\s+Name\s*\]/i.test(t) ||
    /\[\s*Party\s+[1-4]\s+Legal\s+Name\s*\]/i.test(t)
  );
}
