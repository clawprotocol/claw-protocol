/**
 * Dynamic upgrade teaser copy: agreement-type base + detected intent + party count.
 * Avoid generic “premium” / “unlock” phrasing — concrete outcomes only.
 */

export type UpgradeTeaserAgreementType = "LLC" | "NDA" | "Contractor";

export type UpgradeIntentSignal = "profit" | "exit" | "voting" | "liability";

export type UpgradeTeaserInput = {
  agreementType: UpgradeTeaserAgreementType;
  intentSignals: UpgradeIntentSignal[];
  partyCount: number;
};

export type UpgradeTeaserResult = {
  title: string;
  bullets: string[];
  riskLine: string;
};

/** Always one visible bullet — collaboration + final sign/proof (never dropped by intent ordering). */
export const UPGRADE_TEASER_COLLABORATION_BULLET =
  "Collaborate on edits before signing, then send for tracked e‑signature with proof when you’re ready";

const INTENT_ORDER: UpgradeIntentSignal[] = ["profit", "exit", "voting", "liability"];

const INTENT_BULLETS: Record<UpgradeIntentSignal, string> = {
  profit: "How payments are calculated and enforced",
  exit: "Exit terms and buyout structure",
  voting: "Who controls decisions and how votes work",
  liability: "Liability limits and protections",
};

const MULTI_PARTY_BULLET = "Roles and protections across multiple parties";

const BASE: Record<UpgradeTeaserAgreementType, Omit<UpgradeTeaserResult, "bullets"> & { bullets: string[] }> = {
  LLC: {
    title: "This affects how money and control actually work",
    bullets: [
      "Profit distribution tied to ownership",
      "Voting thresholds and decision control",
      "What happens if a member leaves",
    ],
    riskLine: "Without this, ownership and payouts can become unclear or contested.",
  },
  NDA: {
    title: "This affects what information is actually protected",
    bullets: [
      "What counts as confidential",
      "Duration of protection",
      "What happens if information is misused",
    ],
    riskLine: "",
  },
  Contractor: {
    title: "This affects what you're responsible for",
    bullets: ["Scope boundaries", "Payment terms", "Ownership of work"],
    riskLine: "",
  },
};

function uniquePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of items) {
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Visible teaser body: title + up to 3 bullets + riskLine (max 5 lines of copy).
 */
export function getUpgradeTeaser({
  agreementType,
  intentSignals,
  partyCount,
}: UpgradeTeaserInput): UpgradeTeaserResult {
  const base = BASE[agreementType] ?? BASE.Contractor;
  const intentSet = new Set(intentSignals);

  const intentBullets = INTENT_ORDER.filter((k) => intentSet.has(k)).map((k) => INTENT_BULLETS[k]);
  const multi = partyCount > 2 ? [MULTI_PARTY_BULLET] : [];

  const merged = uniquePreserveOrder([
    UPGRADE_TEASER_COLLABORATION_BULLET,
    ...intentBullets,
    ...multi,
    ...base.bullets,
  ]);
  const bullets = merged.slice(0, 3);

  return {
    title: base.title,
    bullets,
    riskLine: base.riskLine,
  };
}

export function detectUpgradeIntentSignals(sourceText: string): UpgradeIntentSignal[] {
  const raw = (sourceText || "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const low = raw.toLowerCase();
  const found = new Set<UpgradeIntentSignal>();

  if (
    /\b(profit\s+distribution|distributable|allocation|allocate\s+profits|dividend|revenue\s*share|carried\s+interest|distribution\s+waterfall|preferred\s+return)\b/i.test(
      low,
    ) ||
    (/\bprofit\b/i.test(low) && /\b(distribution|allocate|split|share)\b/i.test(low))
  ) {
    found.add("profit");
  }

  if (
    /\b(exit|buy-?out|buyout|redemption|withdrawal|dissolution|repurchase|tag[\s-]+along|drag[\s-]+along|sell\s+(?:his|her|their|your)\s+interest)\b/i.test(
      low,
    )
  ) {
    found.add("exit");
  }

  if (/\b(vote|voting|quorum|unanimous\s+consent|written\s+consent|member\s+meeting|managers?\s+vote)\b/i.test(low)) {
    found.add("voting");
  }

  if (/\b(liabilit|indemnif|limitation\s+of\s+liability|cap\s+on\s+damages|hold\s+harmless)\b/i.test(low)) {
    found.add("liability");
  }

  return INTENT_ORDER.filter((k) => found.has(k));
}

/** Map guided flow + parsed family to teaser agreement category. */
export function resolveUpgradeTeaserAgreementType(
  agreementFamily: string | null | undefined,
  guidedFlowId: string,
): UpgradeTeaserAgreementType {
  if (agreementFamily === "operating_agreement") return "LLC";
  if (guidedFlowId === "nda") return "NDA";
  return "Contractor";
}

/**
 * Best-effort party count for teaser rules (draft array vs. “A and B and …” line).
 */
export function resolveUpgradePartyCount(
  draft: { parties?: unknown[] } | null | undefined,
  partiesLine: string | null | undefined,
): number {
  const fromDraft = draft?.parties?.length ?? 0;
  const pl = (partiesLine || "").trim();
  if (!pl) return fromDraft;
  const andParts = pl.split(/\s+and\s+/i).filter(Boolean);
  const fromLine = andParts.length >= 2 ? andParts.length : 0;
  return Math.max(fromDraft, fromLine);
}
