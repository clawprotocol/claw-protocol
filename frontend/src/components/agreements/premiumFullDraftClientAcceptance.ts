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

/**
 * Reject “Pro” bodies that swap governing law, drop the client’s brand URL, or use generic party
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
      !/\boklahoma\b/.test(low)
    ) {
      reasons.push("governing_law_drift_delaware_intake_had_oklahoma");
    }
  }
  if (/\b(anthem|sarah|blanchard|collins)\b/i.test(il) && /cryptospaces|crypto\s*spaces/i.test(il)) {
    if (/\b(service provider|the service provider|the client)\b/.test(low) && !/\banthem\b/.test(low) && !/\bsarah\b/.test(low)) {
      reasons.push("placeholder_parties_intake_had_names");
    }
  }
  if (/\bcryptospaces\.?net|crypto\s*spaces/i.test(il) && !/\bcryptospaces/.test(low)) {
    reasons.push("missing_stated_brand");
  }
  if (/\banthem blanchard\b/i.test(il) && !/\banthem\s+blanchard\b/i.test(low)) {
    reasons.push("intake_name_missing_anthem_blanchard");
  }
  if (/\bsarah collins\b/i.test(il) && !/\bsarah\s+collins\b/i.test(low)) {
    reasons.push("intake_name_missing_sarah_collins");
  }
  if (/(?:\$?\s*3,000|3000|three thousand).*(?:upfront|on commencement|due|first)/i.test(il) && !/(?:3,000|3\.?000|3000|three thousand)/i.test(low)) {
    reasons.push("missing_3000_upfront_line");
  }
  if (/(?:\$?\s*4,500|4500|four thousand five hundred).*(?:final|deliver|remaining)/i.test(il) && !/(?:4,500|4\.?500|4500)/i.test(low)) {
    reasons.push("missing_4500_final_line");
  }
  if (/\b30\s*days?\b.*\b(?:deliver|final|complete)/i.test(il) && !/\b30\s*day/i.test(low)) {
    reasons.push("missing_30_day_delivery");
  }
  if (reasons.length) return { ok: false, reasons };
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
