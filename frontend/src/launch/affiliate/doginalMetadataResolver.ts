/**
 * Narrow Doginal metadata helpers — enrichment + plausibility only.
 * Does **not** prove wallet ownership. No broad marketplace crawling.
 *
 * PATCH (launch follow-up): when policy allows, add a **single-origin** safe GET behind
 * `VITE_DOGINAL_METADATA_FETCH_ENABLED` and parse **only** agreed fields from a stable JSON/HTML slice.
 */

export type DoginalTraitHint = { trait_type: string; value: string };

/** Normalized hints from local parsing or future fetch. */
export type DoginalMetadataNormalized = {
  doginal_number: string | null;
  inscription_id: string | null;
  marketplace_url: string | null;
  image_url: string | null;
  traits: DoginalTraitHint[];
};

export type DoginalResolvePlausibility = "unknown" | "weak_hint" | "parsed_locally";

export type DoginalMetadataResolveResult = {
  normalized: DoginalMetadataNormalized;
  /** Best-effort only — never treated as holder proof. */
  plausibility: DoginalResolvePlausibility;
  exists: boolean | null;
};

export type DoginalMetadataResolveInput = {
  doginal_number?: string | null;
  doginal_inscription_id?: string | null;
  doginal_marketplace_url?: string | null;
};

const INSCRIPTION_LIKE = /\b([a-f0-9]{64})i0\b/i;
const NUMERIC_DOG = /\bdog(?:inal)?\s*#?\s*(\d{1,8})\b/i;

/**
 * Pull inscription-like id from free text (e.g. page snippets, pasted URLs).
 */
export function parseInscriptionIdFromText(text: string): string | null {
  const m = INSCRIPTION_LIKE.exec(text);
  return m ? m[1].toLowerCase() + "i0" : null;
}

/**
 * Pull a Doginal-style number from free text (heuristic).
 */
export function parseDoginalNumberFromText(text: string): string | null {
  const m = NUMERIC_DOG.exec(text);
  return m ? m[1] : null;
}

/**
 * Minimal URL heuristics — no network I/O.
 */
export function extractHintsFromMarketplaceUrl(url: string): Partial<DoginalMetadataNormalized> {
  const out: Partial<DoginalMetadataNormalized> = {};
  try {
    const u = new URL(url);
    const joined = `${u.pathname} ${u.search} ${u.hash}`;
    const ins = parseInscriptionIdFromText(joined) || parseInscriptionIdFromText(url);
    if (ins) out.inscription_id = ins;
    const num = parseDoginalNumberFromText(joined) || parseDoginalNumberFromText(url);
    if (num) out.doginal_number = num;
    out.marketplace_url = u.toString();
  } catch {
    /* ignore */
  }
  return out;
}

function mergeNormalized(
  base: DoginalMetadataNormalized,
  partial: Partial<DoginalMetadataNormalized>
): DoginalMetadataNormalized {
  return {
    doginal_number: partial.doginal_number ?? base.doginal_number,
    inscription_id: partial.inscription_id ?? base.inscription_id,
    marketplace_url: partial.marketplace_url ?? base.marketplace_url,
    image_url: partial.image_url ?? base.image_url,
    traits: partial.traits?.length ? partial.traits : base.traits,
  };
}

const emptyNormalized = (): DoginalMetadataNormalized => ({
  doginal_number: null,
  inscription_id: null,
  marketplace_url: null,
  image_url: null,
  traits: [],
});

/**
 * Best-effort resolver — **local + stubbed**. Safe to call at runtime; never blocks on network.
 * FUTURE: optional bounded fetch when `import.meta.env.VITE_DOGINAL_METADATA_FETCH_ENABLED === '1'`.
 */
export async function resolveDoginalMetadataBestEffort(
  input: DoginalMetadataResolveInput
): Promise<DoginalMetadataResolveResult> {
  let n = emptyNormalized();

  if (input.doginal_number?.trim()) {
    n = mergeNormalized(n, { doginal_number: input.doginal_number.trim() });
  }
  if (input.doginal_inscription_id?.trim()) {
    const raw = input.doginal_inscription_id.trim();
    n = mergeNormalized(n, { inscription_id: parseInscriptionIdFromText(raw) ?? raw });
  }
  if (input.doginal_marketplace_url?.trim()) {
    const hints = extractHintsFromMarketplaceUrl(input.doginal_marketplace_url.trim());
    n = mergeNormalized(n, hints);
  }

  const hasAny = Boolean(n.doginal_number || n.inscription_id || n.marketplace_url || n.image_url);
  return {
    normalized: n,
    plausibility: hasAny ? "parsed_locally" : "unknown",
    exists: hasAny ? null : null,
  };
}
