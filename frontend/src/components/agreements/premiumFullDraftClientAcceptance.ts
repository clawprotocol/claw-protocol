/**
 * Client-side acceptance for LawDog Pro full-document body (server output is primary;
 * this rejects obvious contamination / starter-shell masquerading as Pro).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";

const BANNED_SUBSTRINGS = [
  "sparse-prompt premium expansion",
  "raw-intent premium protections",
  "your lawdog pro agreement is structured below",
  "your lawdog pro agreement is organized into commercial workstreams",
  "commercial workstreams below",
  "where commercial details are unspecified",
  "[claw_full_draft_expansion_v1]",
  "internal generation",
  "gap-trace",
] as const;

const SCENARIO_CUES = /\b(logo|revision|vesting|founder|estate|sibling|probate|loan|lend|repay|installment)\b/i;

/** True when body looks like the five-slot starter shell (title + 5 short sections, little operative depth). */
export function isLikelyFiveSectionStarterShellPro(body: string): boolean {
  const t = (body || "").trim();
  if (t.length > 6500) return false;
  const low = t.toLowerCase();
  if (low.includes("commercial workstreams") || low.includes("structured below")) return true;
  const numbered = (t.match(/^\s*\d+[\.)]\s+/gm) || []).length;
  if (numbered >= 4 && numbered <= 7 && t.length < 4200) {
    const hasThinSlots =
      /scope of services\s*\/\s*purpose/i.test(t) &&
      /payment terms/i.test(t) &&
      /term and effective date/i.test(t) &&
      /governing law/i.test(t) &&
      /termination/i.test(t);
    if (hasThinSlots) return true;
  }
  return false;
}

export type PremiumClientAcceptanceResult = { ok: boolean; reasons: string[] };

export function rejectPremiumBodyForProRender(
  body: string,
  opts?: { intakeLower?: string },
): PremiumClientAcceptanceResult {
  const reasons: string[] = [];
  const low = (body || "").trim().toLowerCase();
  const intakeLow = (opts?.intakeLower || "").toLowerCase();
  if (!low) {
    reasons.push("empty_body");
    return { ok: false, reasons };
  }
  for (const b of BANNED_SUBSTRINGS) {
    if (low.includes(b)) reasons.push(`banned_substring:${b.slice(0, 32)}`);
  }
  if (isLikelyFiveSectionStarterShellPro(body)) reasons.push("starter_shell_five_section");
  const tl = body.trim().split(/\n/)[0]?.replace(/^#+\s*/, "").trim().toLowerCase() || "";
  const titleLine = tl.length < 80 ? tl : tl.slice(0, 80);
  if ((titleLine === "agreement" || titleLine === "agreement.") && SCENARIO_CUES.test(intakeLow)) {
    reasons.push("generic_title_agreement");
  }
  if (/\bschedule\s+a\b/i.test(low)) {
    const schedBlock = /schedule\s+a[\s:.\n]+([\s\S]{120,})/i.exec(body);
    if (!schedBlock) reasons.push("schedule_a_filler");
  }
  const uniq = [...new Set(reasons)];
  return { ok: uniq.length === 0, reasons: uniq };
}

/** Stated people + project anchors: tolerate split names, Client/Developer labels, and brand. */
function partyNameAnchorsPresentInBody(b: string): boolean {
  if (/\bcryptospaces|crypto[\s-]*space/i.test(b)) return true;
  if (/\banthem\s+blanchard\b/.test(b) || (/\banthem\b/.test(b) && /\bblanchard\b/.test(b))) return true;
  if (/\bsarah\s+collins\b/.test(b) || (/\bsarah\b/.test(b) && /\bcollins\b/.test(b))) return true;
  if (/\bblanchard\b/.test(b) && (/\banthem\b/.test(b) || /\bcryptospaces|crypto/.test(b))) return true;
  if (/\bcollins\b/.test(b) && (/\bsarah\b/.test(b) || /\bcryptospaces|crypto/.test(b))) return true;
  return false;
}

/**
 * DEV/telemetry: normalized source-fact hits in the body (not full text) for paid-Pro gate debugging.
 */
export function buildPaidProSourceFactProbe(
  text: string,
  _intake: string,
): {
  anthem: boolean;
  sarah: boolean;
  cryptospaces: boolean;
  oklahoma: boolean;
  pay7500: boolean;
  pay3000: boolean;
  pay4500: boolean;
  may1_2026: boolean;
  days30: boolean;
  revisions2: boolean;
  preExistToolsLibs: boolean;
  emailNotices: boolean;
} {
  const s = (text || "").toLowerCase();
  return {
    anthem: /\banthem\b/.test(s),
    sarah: /\bsarah\b/.test(s),
    cryptospaces: /\bcryptospaces|crypto[\s-]*space/i.test(s),
    oklahoma: /(?:\boklahoma\b|oklahoma\s+law|state of oklahoma|governed by (?:\s*the )?laws? of (?:\s*the )?state of oklahoma)/i.test(s),
    pay7500: /(?:\$\s*7[,.]?\s*500|7500|7\s*500|seven thousand five hundred)/i.test(s),
    pay3000: /(?:\$\s*3[,.]?\s*000|3000|three thousand)/i.test(s),
    pay4500: /(?:\$\s*4[,.]?\s*500|4500|four thousand five hundred)/i.test(s),
    may1_2026: /(?:may\s*1,?\s*2026|05\/01\/2026|5\/1\/2026|1(?:st)?\s+may\s*2026)/i.test(s),
    days30: /(?:(?:\b30\b|thirty)(?:\s*\(\d+\))?\s*days?|(?:\b30\b|thirty)[-\s]*day)/i.test(s),
    revisions2:
      /(?:\b2\b|\btwo)\s*(?:\(\d\))?\s*(?:revision|rounds?)/i.test(s) ||
      /two\s*revision\s*rounds?/i.test(s) ||
      /two\s+\(?2\)?\s*revisions?/i.test(s),
    preExistToolsLibs: /pre[-\s]*existing|third[-\s]*party (?:code|software|libraries?)|\btools?\s*and\s*libraries?/i.test(s),
    emailNotices:
      /notices?.*\bemail|notices?.*\belectronic|notices? by (?:e-?mail|email|electronic)|email.*notic|electronic (?:mail|notices?)|notic(?:e|es) by (?:e-?mail|electronic)|(?:\bnotices?[^\n]{0,200}\bemail|\bemail[^\n]{0,200}\bnoti)/i.test(
        s,
      ),
  };
}

/**
 * Reject "Pro" bodies that swap governing law, drop the client's brand URL, or use generic party
 * lines when the intake named people + project (kept aligned with server premium quality gate).
 */
export function rejectProUpgradeSourceFactDrift(
  body: string,
  opts: { intakeLower: string },
): PremiumClientAcceptanceResult {
  const low = (body || "").trim().toLowerCase();
  const il = (opts.intakeLower || "").toLowerCase();
  const reasons: string[] = [];
  if (/\boklahoma\b/.test(il) && !/\bdelaware\b/.test(il)) {
    if (
      /\b(laws of the state of delaware|governed by the laws of (the state of )?delaware|state of delaware|delaware law)\b/i.test(
        low,
      ) &&
      !/oklahoma|state of oklahoma|governed by (?:\s*the )?laws? of (?:\s*the )?state of oklahoma|laws? of the state of oklahoma|oklahoma law/i.test(
        low,
      )
    ) {
      reasons.push("governing_law_drift_delaware_intake_had_oklahoma");
    }
  }
  if (
    /\bparty\s+a\b/i.test(low) &&
    /\bparty\s+b\b/i.test(low) &&
    (/\b(anthem|sarah|blanchard|collins|cryptospaces|crypto)\b/i.test(il) || /\b(anthem\s+blanchard|sarah\s+collins)\b/.test(il)) &&
    !partyNameAnchorsPresentInBody(low)
  ) {
    reasons.push("party_a_b_no_named_party_anchors");
  }
  if (/\b(anthem|sarah|blanchard|collins)\b/i.test(il) && /cryptospaces|crypto\s*spaces/i.test(il) && !partyNameAnchorsPresentInBody(low)) {
    if (/\b(?:the\s+)?service provider\b/.test(low) || /\bthe\s+client\b/.test(low) || /\bthe\s+developer\b/.test(low)) {
      reasons.push("placeholder_parties_intake_had_names");
    }
  }
  if (/\bcryptospaces\.?net|crypto\s*spaces/i.test(il) && !/\bcryptospaces|crypto[\s-]*space/i.test(low)) {
    reasons.push("missing_stated_brand");
  }
  const wantsAnthemBlanchar = /\banthem blanchard\b/i.test(il) || (/\banthem\b/.test(il) && /\bblanchard\b/.test(il));
  if (wantsAnthemBlanchar) {
    if (!/\banthem\s+blanchard\b/.test(low) && !(/\banthem\b/.test(low) && /\bblanchard\b/.test(low))) {
      reasons.push("intake_name_missing_anthem_blanchard");
    }
  }
  const wantsSarahCollins =
    /\bsarah collins\b/i.test(il) ||
    (/\bsarah\b/.test(il) && /\bcollins\b/.test(il) && /(sarah.*collins|collins.*sarah|sarah,\s*collins)/i.test(il));
  if (wantsSarahCollins) {
    if (!/\bsarah\s+collins\b/.test(low) && !(/\bsarah\b/.test(low) && /\bcollins\b/.test(low))) {
      reasons.push("intake_name_missing_sarah_collins");
    }
  }
  if (
    /(?:\$?\s*3,000|3000|three thousand)(?:[\s\S]*?)(?:upfront|on commencement|due|first|deposit)/i.test(il) &&
    !/(?:3,000|3\.?0{2,3}|\b3000\b|three thousand)/i.test(low)
  ) {
    reasons.push("missing_3000_upfront_line");
  }
  if (
    /(?:\$?\s*4,500|4500|four thousand five hundred)(?:[\s\S]*?)(?:final|deliver|remaining|balance|closing)/i.test(il) &&
    !/(?:4,500|4[,.]500|4\.5\s*k|\b4500\b|four thousand five hundred)/i.test(low)
  ) {
    reasons.push("missing_4500_final_line");
  }
  if (
    /\b30\s*days?\b(?:[\s\S]*?)(?:\bdeliver(?:y)?|\bfinal\w*|\bcomplete\w*|\bmilestone\w*|\bpayment\w*|\bbalance\w*)/i.test(
      il,
    ) &&
    !/(?:(?:\b30\b|thirty)(?:\s*\(\d+\))?\s*days?|(?:\b30\b|thirty)[-\s]*day)/i.test(low)
  ) {
    reasons.push("missing_30_day_delivery");
  }
  if (
    /(?:7[,.]?\s*500|7500|seven thousand five hundred)/i.test(il) &&
    !/(?:7[,.]?\s*500|7500|7\.5k|seven thousand five hundred)/.test(low) &&
    (/(3[,.]000|3\.?000|3000|4500|4[,.]500|4\.?5\s*k|milestone|deposit|final|tranche|balance|deliver|thirty|30|schedule)/i.test(
      low,
    ) || /(3000|4500)/.test(low))
  ) {
    if (/(?:3[,.]000|3000|milestone|deposit|final|deliver|thirty|30|4500|4[,.]500)/.test(low)) {
      reasons.push("intake_pricing_missing_7500_milestone_trio");
    }
  }
  if (reasons.length) return { ok: false, reasons: [...new Set(reasons)] };
  return { ok: true, reasons: [] };
}

/** Strip deterministic client packs that must never ship as part of server full-draft display. */
export function stripClientPremiumArtifactBlocksFromDraft(draft: ParsedDraftShape): ParsedDraftShape {
  let add = (draft.additional_terms || "").trim();
  if (!add) return draft;
  const chunks = add.split(/\n\n+/);
  const kept = chunks.filter((c) => {
    const x = c.trim().toLowerCase();
    if (!x) return false;
    if (x.startsWith("sparse-prompt premium expansion")) return false;
    if (x.startsWith("raw-intent premium protections")) return false;
    return true;
  });
  const next = kept.join("\n\n").trim();
  if (next === add) return draft;
  return { ...draft, additional_terms: next || null };
}
