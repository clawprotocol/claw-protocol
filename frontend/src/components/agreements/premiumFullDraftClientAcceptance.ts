/**
 * Client-side acceptance for LawDog Pro full-document body (server output is primary;
 * this rejects obvious contamination / starter-shell masquerading as Pro).
 */

import { finalizeUserVisibleAgreementPlainText } from "./agreementTemplatePlaceholderSafety";
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

/** Server-side degraded fallback artifacts — never treat as a real Pro body. */
const DEGRADED_FALLBACK_BANNED_SUBSTRINGS = [
  "operative terms. the parties intend to document",
  "automated full pass was not available",
  "fill in with counsel as needed",
  "summary from your intake",
  "commercial framework",
  "premium generation detail",
  "below is a structured summary from your notes",
] as const;

const REVIEW_COMPLETION_STUB =
  "specific commercial, payment, and liability terms should be completed in review";

export type PremiumClientAcceptanceResult = { ok: boolean; reasons: string[] };

function countLinesContaining(body: string, needleLower: string): number {
  let n = 0;
  for (const line of (body || "").split(/\n/)) {
    if (line.toLowerCase().includes(needleLower)) n += 1;
  }
  return n;
}

/** Rejects known LawDog Pro degraded-template filler (repeated generic clauses, airlock copy). */
export function rejectPremiumDegradedFiller(body: string): PremiumClientAcceptanceResult {
  const low = (body || "").trim().toLowerCase();
  const reasons: string[] = [];
  for (const b of DEGRADED_FALLBACK_BANNED_SUBSTRINGS) {
    if (low.includes(b)) reasons.push(`degraded_filler:${b.slice(0, 42).replace(/\s+/g, " ")}`);
  }
  const ot = "operative terms. the parties intend to document";
  if (countLinesContaining(body, ot) >= 3) {
    reasons.push("degraded_filler:repeated_operative_terms");
  }
  if (countLinesContaining(body, REVIEW_COMPLETION_STUB) >= 3) {
    reasons.push("degraded_filler:repeated_review_completion_stub");
  }
  const uniq = [...new Set(reasons)];
  return { ok: uniq.length === 0, reasons: uniq };
}

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

export function rejectPremiumBodyForProRender(
  body: string,
  opts?: {
    intakeLower?: string;
    /** Original-case intake for placeholder literal allowlist. */
    intakeText?: string | null;
    partyNames?: readonly (string | null | undefined)[] | null;
  },
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
  const degradedFiller = rejectPremiumDegradedFiller(body);
  if (!degradedFiller.ok) reasons.push(...degradedFiller.reasons);
  if (isLikelyFiveSectionStarterShellPro(body)) reasons.push("starter_shell_five_section");
  const tl = body.trim().split(/\n/)[0]?.replace(/^#+\s*/, "").trim().toLowerCase() || "";
  const titleLine = tl.length < 80 ? tl : tl.slice(0, 80);
  if ((titleLine === "agreement" || titleLine === "agreement.") && SCENARIO_CUES.test(intakeLow)) {
    reasons.push("generic_title_agreement");
  }
  if (/\bschedule\s+a\b/i.test(low)) {
    const schedBlock = /schedule\s+a[\s:.\n]+([\s\S]{120,})/i.exec(body);
    if (!schedBlock) {
      /** Pro agreements often “tee up” Schedule A; long bodies carry terms elsewhere. Thin shells only. */
      if ((body || "").trim().length < 8_000) reasons.push("schedule_a_filler");
    }
  }
  const uniq = [...new Set(reasons)];
  if (uniq.length > 0) return { ok: false, reasons: uniq };
  const intakeRaw = ((opts?.intakeText ?? "") || "").trim() || (opts?.intakeLower ?? "");
  const ph = finalizeUserVisibleAgreementPlainText((body || "").trim(), {
    intakeRaw,
    partyNames: opts?.partyNames ?? null,
    agreementFamily: null,
    surface: "rejectPremiumBodyForProRender",
  });
  if (!ph.ok) {
    return {
      ok: false,
      reasons: ph.remaining.slice(0, 12).map((x) => `placeholder:${x.slice(0, 48)}`),
    };
  }
  return { ok: true, reasons: [] };
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

export type PaidProSourceFactProbe = {
  anthem: boolean;
  sarah: boolean;
  cryptospaces: boolean;
  /** Host/path style “site” for CryptoSpaces. */
  cryptospacesHost: boolean;
  oklahoma: boolean;
  pay7500: boolean;
  pay3000: boolean;
  pay4500: boolean;
  may1_2026: boolean;
  may31_2026: boolean;
  days30: boolean;
  revisions2: boolean;
  preExistToolsLibs: boolean;
  emailNotices: boolean;
  /** Non-exhaustive: own IP, deliverables, assignment after payment. */
  ownDeliverableIp: boolean;
  /** Confidentiality / trade secrets (operative). */
  confidentiality: boolean;
  /** Governing law signal for debug (Oklahoma / Delaware; not legal advice). */
  governingLawDelawareMention: boolean;
  governingLawOklahomaMention: boolean;
};

/**
 * DEV/telemetry: normalized source-fact hits in the body (not full text) for paid-Pro gate debugging.
 */
export function buildPaidProSourceFactProbe(
  text: string,
  _intake: string,
): PaidProSourceFactProbe {
  const s = (text || "").toLowerCase();
  const goOk =
    /oklahoma law|laws? of the state of oklahoma|governed by the laws? of the state of oklahoma|governed by the laws? of oklahoma|state of oklahoma|oklahoma (?:state )?courts?|the state of oklahoma|submits to the jurisdiction of oklahoma|venue in oklahoma(?!,?\s+city)/i.test(
      s,
    );
  return {
    anthem: /\banthem\b/.test(s),
    sarah: /\bsarah\b/.test(s),
    cryptospaces: /\bcryptospaces|crypto[\s-]*space/.test(s),
    cryptospacesHost: /cryptospaces\.(net|com|io|org)\b|cryptospaces\.net website/i.test(s),
    /** Substantive Oklahoma law / state references (avoids over-matching a bare “governed by the laws of … Delaware”. */
    oklahoma: goOk,
    pay7500:
      /(?:\$\s*7[,.]?\s*500|7,500\.\d{2}|\b7[,.]?\s*5\s*0\s*0\b|\b7500\b|seven thousand five hundred|seven-thousand-five-hundred|usd\s*7[,.]?\s*500)/i.test(
        s,
      ),
    pay3000: /(?:\$\s*3,000|3,000(?:\.\d{2})?|\b3[,.]000\b|\b3000\b|three thousand|three-thousand)/i.test(
      s,
    ),
    pay4500: /(?:\$\s*4,500|4,500(?:\.\d{2})?|\b4[,.]500\b|\b4500\b|4\.5\s*k|four thousand five hundred|four-thousand-five-hundred)/i.test(
      s,
    ),
    may1_2026: /(?:may\s*1,?\s*2026|05[\/\-.]0?1[\/\-.]2026|5[\/\-.]0?1[\/\-.]2026|1(?:st)?\s*day\s*of\s*may\s*2026)/i.test(
      s,
    ),
    may31_2026: /(?:may\s*31,?\s*2026|05[\/\-.]31[\/\-.]2026|5[\/\-.]31[\/\-.]2026|31(?:st)?\s+may\s*2026|final date\s+may)/i.test(
      s,
    ),
    days30:
      /(?:(?:\b30\b|thirty)(?:\s*\(\d+\))?\s*days?|(?:\b30\b|thirty)[-\s]*day(?!\s*care)|30\s*calendar\s*days?|within\s*30\s*days?|no\s*later\s*than\s*30|after\s*may[\s,]*1[\s,]*2026,?\s*within|deadline.*30.*day|due\s*within.*30)/i.test(
        s,
      ),
    revisions2:
      /(?:\b2\b|\btwo)\s*(?:\(\d\))?\s*(?:rounds?|revision|rev\.?\s*rounds?)/i.test(s) ||
      /(?:\b2\b)\s*revision(?:\s*rounds?)?/i.test(s) ||
      /two\s*(\(\s*2\s*\))?\s*(?:revision|rounds?|rounds?\s*of)/i.test(s) ||
      /revisions?[^.]{0,20}(?:two|2|Ⅱ)/i.test(s),
    preExistToolsLibs:
      /pre[-\s]*existing|third[-\s]*party (?:code|software|libraries?)|\bframeworks?\b|developer[’']?s?\s*background|retained[^.]{0,32}\bip\b|background\s*ip|tools?[^.]{0,20}libraries?/i.test(
        s,
      ),
    emailNotices:
      /notices?[^.]{0,120}?(?:email|e-?mail|electronic)|notices? by|(?:email|e-?mail)[^.]{0,40}notic|acceptable\s*notices?|notic(?:e|es)\s*may.*mail/i.test(
        s,
      ) ||
      (/\bemail\b/.test(s) && /notic|notif|dispatch|communications?\s*clause/i.test(s)),
    ownDeliverableIp:
      /client shall own|ownership of (?:all )?deliver\w*|assign(?:ment|ed)?\s*to\s*client|works?\s*for[-\s]?hire|full\s*payment,?\s*(?:the|all)?\s*(?:client|purchaser?)|work\s*made for hire/i.test(
        s,
      ),
    confidentiality: /\bconfidentiality\b|\bconfidential\b|trade secret|proprietary|non-?use|disclosure|nda\b/i.test(
      s,
    ),
    governingLawDelawareMention:
      /laws? of the state of delaware|governed by the laws? of the state of delaware|governed by the laws? of (?:\s*the )?state of delaware|state of delaware\b(?!,?\s+llc)|\bdelaware law|delaware courts?|venue[^.]{0,160}delaware|choice of law[^.]{0,160}delaware/i.test(
        s,
      ),
    governingLawOklahomaMention: goOk,
  };
}

/** High-level anchors for [paid-pro-validation-fail] / [premium-completion-debug] (no raw document text). */
export function buildPaidProValidationDiagnostics(
  text: string,
  intake: string,
): {
  sourceFactHits: PaidProSourceFactProbe;
  docLen: number;
  intakeLen: number;
  partyAnchorsSatisfied: boolean;
  projectAnchor: boolean;
  /** Same idea as `partyNameAnchorsPresentInBody` for logging. */
  namePairsInBody: { anthemBlanchard: boolean; sarahCollins: boolean };
} {
  const s = (text || "").toLowerCase();
  const p = buildPaidProSourceFactProbe(text, intake);
  const ab = (/\banthem\b/.test(s) && /\bblanchard\b/.test(s)) || /\banthem\s+blanchard\b/.test(s);
  const sc = (/\bsarah\b/.test(s) && /\bcollins\b/.test(s)) || /\bsarah\s+collins\b/.test(s);
  const party =
    p.cryptospaces ||
    p.cryptospacesHost ||
    ab ||
    sc ||
    (/\bblanchard\b/.test(s) && (/\banthem\b/.test(s) || p.cryptospaces)) ||
    (/\bcollins\b/.test(s) && (/\bsarah\b/.test(s) || p.cryptospaces));
  const project = p.cryptospaces || p.cryptospacesHost || /website|web\s*site|homepage|re[-\s]?design/i.test(s);
  return {
    sourceFactHits: p,
    docLen: (text || "").length,
    intakeLen: (intake || "").length,
    partyAnchorsSatisfied: party,
    projectAnchor: project,
    namePairsInBody: { anthemBlanchard: ab, sarahCollins: sc },
  };
}

/**
 * Intake said “N days to deliver / final by …”; body may say thirty (30) days, 30 calendar days, or a May 31
 * end date instead of a loose “30-day” string.
 */
function bodyHasProjectDeliveryWindow(low: string): boolean {
  return /(?:(?:\b30\b|thirty)(?:\s*\(\d+\))?\s*days?|(?:\b30\b|thirty)[-\s]*day(?!\s*care)|30\s*calendar\s*days?|within\s*30\s*days?|may\s*31,?\s*2026|05[\/\-.]31[\/\-.]2026|31(?:st)?\s+of\s*may,?\s*2026|on\s*or\s*before\s*may\s*31|no\s*later\s*than\s*may\s*31|by\s*may\s*31|not\s*later\s*than\s*may|may\s*1,?\s*2026,?\s*and[^.]{0,80}30|final\s*deliver\w*[^.]{0,120}may)/i.test(
    low,
  );
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
  const wantsSarahCollins = /\bsarah collins\b/i.test(il) || (/\bsarah\b/.test(il) && /\bcollins\b/.test(il));
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
    !bodyHasProjectDeliveryWindow(low)
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
