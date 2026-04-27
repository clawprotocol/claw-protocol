import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { rejectPremiumBodyForProRender, rejectProUpgradeSourceFactDrift } from "./premiumFullDraftClientAcceptance";
import { isAcceptablePremiumFullDocumentText } from "./premiumFullDraftQuality";

const SECTION_SIGNAL_RES = [
  /\bterminat/i,
  /\bconfident/i,
  /\bindemn/i,
  /\b(?:governing|choice\s+of)\s+law|law\s+of\s+the/i,
  /\b(?:fees?|compensation|payment|invoic)/i,
  /\b(?:scope|deliverable|services)\b/i,
  /\b(?:dispute|arbitrat|mediat|jurisdiction|venue)\b/i,
  /\b(?:entire\s+agreement|counterpart|electronic\s+sign)/i,
  /\b(?:liabilit|limitation)\b/i,
  /\b(?:notices?|notice\s+address)\b/i,
];

const INTAKE_STOP = new Set([
  "this",
  "that",
  "with",
  "from",
  "have",
  "been",
  "will",
  "your",
  "need",
  "want",
  "agreement",
  "contract",
  "between",
  "party",
  "parties",
  "please",
  "draft",
  "create",
]);

export type PremiumRenderResolveSource =
  | "server_full_document_text"
  | "server_repair_document_text"
  | "live_generated_preview"
  | "legacy_snapshot"
  | "none";

export type PremiumRenderValidationResult = {
  ok: boolean;
  reasons: string[];
};

function intakeProbeText(draft: ParsedDraftShape | null, intakeText?: string | null): string {
  const raw = (intakeText || "").trim();
  if (raw.length >= 12) return raw;
  if (!draft) return raw;
  return [
    draft.title,
    draft.purpose,
    draft.payment_terms,
    ...(draft.material_asks || []),
    ...(draft.parties || []).map((p) => p.name),
  ]
    .join(" ")
    .trim();
}

function extractScenarioKeywords(intake: string): string[] {
  const low = intake.toLowerCase();
  const out = new Set<string>();
  const addPhrase = (s: string) => {
    const t = s.trim();
    if (t.length >= 4) out.add(t);
  };
  for (const m of low.matchAll(/\b[a-z0-9]{4,}\b/g)) {
    const w = m[0];
    if (!INTAKE_STOP.has(w)) addPhrase(w);
  }
  for (const m of low.matchAll(/\$[\d,]+(?:\.\d{2})?\b/g)) addPhrase(m[0]);
  for (const m of low.matchAll(/\b\d{1,2}\s*%\b/g)) addPhrase(m[0]);
  return [...out].slice(0, 14);
}

function isStrictKnownIntentHint(intake: string): boolean {
  const low = (intake || "").toLowerCase();
  return /\b(logo|design|brand|founder|vesting|equity|cap table|cliff|shares?)\b/.test(low);
}

function countSectionSignals(text: string): number {
  return SECTION_SIGNAL_RES.filter((re) => re.test(text)).length;
}

function countMajorHeadings(text: string): number {
  const numbered = (text.match(/^\s*\d+[\.)]\s+[A-Za-z]/gm) || []).length;
  const articles = (text.match(/^\s*(?:article|section)\s+\d+/gim) || []).length;
  return Math.max(numbered, articles);
}

function substantiveParagraphs(text: string): number {
  return text.split(/\n\n+/).filter((p) => p.trim().length > 55).length;
}

/** Structural checks for premium paper bodies (server + live + snapshot). */
export function validatePremiumRenderBody(
  text: string,
  opts: { intakeText?: string | null; draft?: ParsedDraftShape | null; mode: "server" | "live" },
): PremiumRenderValidationResult {
  const reasons: string[] = [];
  const t = (text || "").replace(/\r\n/g, "\n").trim();
  const probe = intakeProbeText(opts.draft ?? null, opts.intakeText);
  const intakeLow = probe.toLowerCase();

  if (!t) {
    return { ok: false, reasons: ["empty_body"] };
  }

  if (intakeLow.length >= 32) {
    const drift = rejectProUpgradeSourceFactDrift(t, { intakeLower: intakeLow });
    if (!drift.ok) {
      return { ok: false, reasons: ["source_fact_drift", ...drift.reasons] };
    }
  }

  const acc = rejectPremiumBodyForProRender(t, { intakeLower: intakeLow });
  const serverAcceptableFallback = opts.mode === "server" && isAcceptablePremiumFullDocumentText(t);
  if (!acc.ok && !serverAcceptableFallback) {
    return { ok: false, reasons: acc.reasons.length ? acc.reasons : ["rejected_by_client_acceptance"] };
  }
  if (!acc.ok && serverAcceptableFallback) {
    const low = t.toLowerCase();
    for (const frag of [
      "sparse-prompt premium expansion",
      "raw-intent premium protections",
      "your lawdog pro agreement is structured below",
      "your lawdog pro agreement is organized into commercial workstreams",
      "commercial workstreams below",
      "[claw_full_draft_expansion_v1]",
    ] as const) {
      if (low.includes(frag)) reasons.push(`banned_substring:${frag.slice(0, 28)}`);
    }
  }

  const minLen =
    opts.mode === "server"
      ? isStrictKnownIntentHint(probe)
        ? 900
        : 1300
      : 520;
  if (t.length < minLen) reasons.push(`too_short:${t.length}`);

  const firstLine = t.split("\n").find((l) => l.trim()) || "";
  const titleGuess = firstLine.replace(/^#+\s*/, "").trim();
  if (!titleGuess || titleGuess === "[Not yet specified]" || titleGuess.length < 2) {
    reasons.push("missing_title");
  }

  const sigHits = countSectionSignals(t);
  const headings = countMajorHeadings(t);
  const paras = substantiveParagraphs(t);
  const strictKnown = isStrictKnownIntentHint(probe);
  const multiSection =
    sigHits >= 4 || headings >= 4 || (sigHits >= 3 && paras >= 5) || (opts.mode === "live" && headings >= 3 && t.length >= 2200);
  const strictKnownServerSectionOk =
    opts.mode === "server" &&
    strictKnown &&
    (sigHits >= 3 || headings >= 3 || (paras >= 4 && t.length >= 900));
  if (!multiSection && !strictKnownServerSectionOk) reasons.push("insufficient_sections");

  if (probe.length >= 18) {
    const kws = extractScenarioKeywords(probe);
    if (kws.length >= 2) {
      const low = t.toLowerCase();
      const hits = kws.filter((k) => low.includes(k.toLowerCase())).length;
      if (hits === 0) reasons.push("intake_keywords_not_reflected");
    }
  }

  const uniq = [...new Set(reasons)];
  return { ok: uniq.length === 0, reasons: uniq };
}

export type PremiumRenderResolveResult = {
  text: string;
  premium_render_source: PremiumRenderResolveSource;
  premium_render_reason: string;
  premium_validation_result: PremiumRenderValidationResult & { tier_attempted?: string };
};

export type ResolvePremiumRenderSourceArgs = {
  draft: ParsedDraftShape | null;
  /** Raw user intake (optional; draft fields used as fallback probe). */
  intakeText?: string | null;
  /** Primary server full-draft output (first LLM pass). */
  serverFullDocumentText?: string | null;
  /** Repair pass output when the quality gate rejected primary. */
  serverRepairDocumentText?: string | null;
  /**
   * When structured split fields are absent, completion may only have this corpus
   * (maps to tier A validation).
   */
  premiumWinningCorpusFallback?: string | null;
  /** Emergency: persisted snapshot / pipeline buffer (tier D). */
  legacySnapshotText?: string | null;
  /** Tier C: deterministic stitched preview (must not read server fields). */
  buildLivePreview: () => string;
  /**
   * When tier C validates but tier D exists, prefer snapshot (e.g. paid completion corpus)
   * over a thinner live rebuild from a degraded draft.
   */
  preferLegacySnapshotOverLive?: (live: string, snapshot: string) => boolean;
};

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

/**
 * Single deterministic premium plain-text resolver.
 * Order: (A) structurally valid server full → (B) valid repair → (C) live preview → (D) legacy snapshot.
 */
export function resolvePremiumRenderSource(args: ResolvePremiumRenderSourceArgs): PremiumRenderResolveResult {
  const draft = args.draft;
  const intakeProbe = intakeProbeText(draft, args.intakeText);

  const fromDraftFull = draft ? trim(draft.premium_server_full_document_text) : "";
  const fromDraftRepair = draft ? trim(draft.premium_server_repair_document_text) : "";
  const legacySingleFull = draft ? trim(draft.premium_full_document_text) : "";

  const serverFull =
    trim(args.serverFullDocumentText) ||
    fromDraftFull ||
    (!fromDraftRepair && legacySingleFull ? legacySingleFull : "") ||
    trim(args.premiumWinningCorpusFallback);

  const serverRepair = trim(args.serverRepairDocumentText) || fromDraftRepair;

  const tryServer = (body: string, tier: PremiumRenderResolveSource): PremiumRenderResolveResult | null => {
    if (!body) return null;
    const v = validatePremiumRenderBody(body, { intakeText: intakeProbe, draft, mode: "server" });
    if (!v.ok) return null;
    return {
      text: body,
      premium_render_source: tier,
      premium_render_reason: `${tier}_structurally_valid`,
      premium_validation_result: { ...v, tier_attempted: tier },
    };
  };

  const a = tryServer(serverFull, "server_full_document_text");
  if (a) return a;

  const b = tryServer(serverRepair, "server_repair_document_text");
  if (b) return b;

  const liveRaw = (() => {
    try {
      return trim(args.buildLivePreview());
    } catch {
      return "";
    }
  })();
  const snap = trim(args.legacySnapshotText);

  if (liveRaw) {
    const vLive = validatePremiumRenderBody(liveRaw, { intakeText: intakeProbe, draft, mode: "live" });
    if (vLive.ok) {
      if (snap && args.preferLegacySnapshotOverLive?.(liveRaw, snap)) {
        const vSnapPrefer = validatePremiumRenderBody(snap, { intakeText: intakeProbe, draft, mode: "live" });
        if (vSnapPrefer.ok) {
          return {
            text: snap,
            premium_render_source: "legacy_snapshot",
            premium_render_reason: "legacy_snapshot_preferred_over_thinner_valid_live",
            premium_validation_result: { ...vSnapPrefer, tier_attempted: "legacy_snapshot" },
          };
        }
      }
      return {
        text: liveRaw,
        premium_render_source: "live_generated_preview",
        premium_render_reason: "live_generated_preview_structurally_valid",
        premium_validation_result: { ...vLive, tier_attempted: "live_generated_preview" },
      };
    }
  }

  if (snap) {
    const vSnap = validatePremiumRenderBody(snap, { intakeText: intakeProbe, draft, mode: "live" });
    if (vSnap.ok) {
      return {
        text: snap,
        premium_render_source: "legacy_snapshot",
        premium_render_reason: "legacy_snapshot_validated_after_live_failed",
        premium_validation_result: { ...vSnap, tier_attempted: "legacy_snapshot" },
      };
    }
  }

  if (liveRaw) {
    const vLive = validatePremiumRenderBody(liveRaw, { intakeText: intakeProbe, draft, mode: "live" });
    return {
      text: liveRaw,
      premium_render_source: "live_generated_preview",
      premium_render_reason: "live_generated_preview_after_server_tiers_failed",
      premium_validation_result: { ...vLive, tier_attempted: "live_generated_preview" },
    };
  }

  if (snap) {
    const vSnap = validatePremiumRenderBody(snap, { intakeText: intakeProbe, draft, mode: "live" });
    return {
      text: snap,
      premium_render_source: "legacy_snapshot",
      premium_render_reason: "legacy_snapshot_emergency_without_full_structural_pass",
      premium_validation_result: { ...vSnap, tier_attempted: "legacy_snapshot" },
    };
  }

  return {
    text: "",
    premium_render_source: "none",
    premium_render_reason: "empty_all_tiers",
    premium_validation_result: {
      ok: false,
      reasons: ["all_tiers_empty_or_invalid"],
      tier_attempted: "none",
    },
  };
}

export function emitPremiumRenderResolveLog(res: PremiumRenderResolveResult): void {
  console.info("[premium-render-resolve]", {
    premium_render_source: res.premium_render_source,
    premium_render_reason: res.premium_render_reason,
    premium_validation_result: res.premium_validation_result,
  });
}
