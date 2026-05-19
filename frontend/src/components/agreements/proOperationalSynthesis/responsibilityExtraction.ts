/**
 * Extract structured operational responsibilities from intake before / after generation.
 */

import { extractBetweenPartyNameList } from "../partyBetweenParse";
import { definedShortNameFromLegalEntity } from "../paidProAgreementPolish";
import {
  isAuthoritativeLegalEntityName,
  resolveAuthoritativePartiesForRecitalPolish,
} from "../paidProPartyNamePreserve";
import type { PartyResponsibilityProfile } from "./types";

const ROLE_CUES: readonly { re: RegExp; role: string }[] = [
  { re: /\b(?:platform\s+provider|saas\s+provider|software\s+vendor)\b/i, role: "Platform Provider" },
  { re: /\b(?:implementation\s+partner|systems\s+integrator)\b/i, role: "Implementation Partner" },
  { re: /\b(?:reseller|channel\s+partner)\b/i, role: "Reseller" },
  { re: /\b(?:client|customer|buyer)\b/i, role: "Client" },
  { re: /\b(?:vendor|supplier|provider)\b/i, role: "Vendor" },
  { re: /\b(?:licensor|licensee)\b/i, role: "Licensor" },
  { re: /\b(?:contractor|consultant|freelancer)\b/i, role: "Contractor" },
  { re: /\b(?:managed\s+services|msp)\b/i, role: "Managed Services Provider" },
];

const VERB_PHRASE_RE =
  /\b(?:shall|will|must|agrees?\s+to|responsible\s+for|provide|deliver|maintain|host|operate|implement|deploy|license|resell|support|coordinate|manage|develop|design|build|integrate|migrate)\s+[^.;]{8,120}/gi;

const SERVICE_NOUN_RE =
  /\b(?:white[-\s]?label|workflow|platform|api|infrastructure|maintenance|support|hosting|migration|integration|rollout|implementation|licensing|resale|saas|software|deliverables?|milestones?|acceptance\s+testing|governance|sla|uptime)\b/gi;

function inferRoleForParty(partyName: string, intake: string, index: number, total: number): string {
  const short = definedShortNameFromLegalEntity(partyName);
  const window = intake.slice(0, 4_000);
  const near = new RegExp(
    `${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.]{0,180}`,
    "i",
  );
  const chunk = window.match(near)?.[0] ?? "";
  for (const { re, role } of ROLE_CUES) {
    if (re.test(chunk)) return role;
  }
  if (total >= 3 && index === 0) return "Lead Platform Provider";
  if (total >= 3) return "Implementation Partner";
  if (index === 0) return "Service Provider";
  return "Counterparty";
}

function extractResponsibilityPhrasesNear(text: string, partyShort: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const esc = partyShort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nearRe = new RegExp(
    `(?:${esc}|${esc.replace(/\s+/g, "\\s+")})[^.]{0,220}`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = nearRe.exec(text)) !== null) {
    const chunk = m[0];
    let vp: RegExpExecArray | null;
    const local = new RegExp(VERB_PHRASE_RE.source, "gi");
    while ((vp = local.exec(chunk)) !== null) {
      const phrase = vp[0].replace(/\s+/g, " ").trim().slice(0, 140);
      if (phrase.length < 12) continue;
      const k = phrase.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(phrase);
    }
    const nouns = chunk.match(SERVICE_NOUN_RE) ?? [];
    for (const n of nouns) {
      const phrase = n.trim();
      const k = phrase.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(phrase);
    }
  }
  return out.slice(0, 6);
}

function extractGlobalOperationalPhrases(intake: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const sentences = intake.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 20);
  for (const s of sentences) {
    if (!SERVICE_NOUN_RE.test(s) && !VERB_PHRASE_RE.test(s)) continue;
    const cleaned = s.replace(/\s+/g, " ").trim().slice(0, 160);
    const k = cleaned.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(cleaned);
  }
  return out.slice(0, 8);
}

/**
 * Build per-party responsibility profiles from intake + authoritative party list.
 */
export function extractPartyResponsibilities(
  intakeRaw: string,
  partyNames: readonly string[] | null | undefined,
): PartyResponsibilityProfile[] {
  const intake = String(intakeRaw || "").replace(/\s+/g, " ").trim();
  const explicit = (partyNames || []).map((n) => String(n || "").trim()).filter((n) => n.length >= 2);
  const explicitAuthoritative = explicit.filter(isAuthoritativeLegalEntityName);
  let parties = resolveAuthoritativePartiesForRecitalPolish(partyNames, intake);
  if (explicit.length >= 2) {
    parties = explicitAuthoritative.length >= 2 ? explicitAuthoritative : explicit;
  } else if (parties.length > explicit.length + 1 && explicit.length >= 2) {
    parties = explicit;
  }
  if (parties.length < 1) {
    const fallback = extractBetweenPartyNameList(intake);
    if (fallback.length >= 2) {
      return fallback.map((party, i) => ({
        party,
        shortName: definedShortNameFromLegalEntity(party),
        inferredRole: inferRoleForParty(party, intake, i, fallback.length),
        responsibilities: extractResponsibilityPhrasesNear(intake, definedShortNameFromLegalEntity(party)),
      }));
    }
    return [];
  }

  const global = extractGlobalOperationalPhrases(intake);
  return parties.map((party, i) => {
    const shortName = definedShortNameFromLegalEntity(party);
    let responsibilities = extractResponsibilityPhrasesNear(intake, shortName);
    if (responsibilities.length < 2 && global.length > 0) {
      responsibilities = [...responsibilities, ...global.slice(0, 3 - responsibilities.length)];
    }
    return {
      party,
      shortName,
      inferredRole: inferRoleForParty(party, intake, i, parties.length),
      responsibilities: responsibilities.filter((r) => r.length >= 4 && r.split(/\s+/).length < 12).slice(0, 6),
    };
  });
}
