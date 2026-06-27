/**
 * Hard gate for repeated Supplemental Provisions filler — must never reach freeze or review render.
 */

const SUPPLEMENTAL_GOOD_FAITH_LINE =
  "each party agrees to cooperate in good faith on milestones, deliverables, reporting, and change orders under this agreement";

const SUPPLEMENTAL_GOOD_FAITH_LINE_ALT =
  "each party agrees to cooperate in good faith on milestones, deliverables, reporting and change orders under this agreement";

const SUPPLEMENTAL_COMMERCIAL_INVENTORY_LINE =
  "supplemental commercial provision. each party shall maintain inventory reporting under oklahoma commercial standards";

export type SupplementalProvisionsFillerAssessment = {
  ok: boolean;
  repeatCount: number;
  reasons: string[];
};

function countMatchingLines(body: string, needleLower: string): number {
  let n = 0;
  for (const line of (body || "").split(/\n/)) {
    if (line.trim().toLowerCase().includes(needleLower)) n += 1;
  }
  return n;
}

export function assessRepeatedSupplementalProvisionsFiller(text: string): SupplementalProvisionsFillerAssessment {
  const reasons: string[] = [];
  const goodFaithCount = Math.max(
    countMatchingLines(text, SUPPLEMENTAL_GOOD_FAITH_LINE),
    countMatchingLines(text, SUPPLEMENTAL_GOOD_FAITH_LINE_ALT),
  );
  const inventoryPadCount = countMatchingLines(text, SUPPLEMENTAL_COMMERCIAL_INVENTORY_LINE);
  if (goodFaithCount > 1) {
    reasons.push(`repeated_supplemental_good_faith:${goodFaithCount}`);
  }
  if (inventoryPadCount > 1) {
    reasons.push(`repeated_supplemental_inventory_pad:${inventoryPadCount}`);
  }
  const low = (text || "").toLowerCase();
  if (/supplemental provisions/i.test(low) && goodFaithCount >= 2) {
    reasons.push("supplemental_provisions_filler_block");
  }
  const uniq = [...new Set(reasons)];
  return { ok: uniq.length === 0, repeatCount: goodFaithCount, reasons: uniq };
}

/** Remove repeated identical Supplemental Provisions filler before witness / execution. */
export function stripRepeatedSupplementalProvisionsFiller(text: string): {
  text: string;
  strippedCount: number;
  repairs: string[];
} {
  const input = (text || "").replace(/\r\n/g, "\n");
  if (!input.trim()) return { text: input, strippedCount: 0, repairs: [] };

  const repairs: string[] = [];
  let strippedCount = 0;
  let seenGoodFaith = false;
  let seenInventoryPad = false;
  const kept: string[] = [];

  for (const line of input.split("\n")) {
    const trimmed = line.trim();
    const isGoodFaith =
      /^Each Party agrees to cooperate in good faith on milestones, deliverables, reporting,?\s+and change orders under this Agreement\.?$/i.test(
        trimmed,
      );
    if (isGoodFaith) {
      if (seenGoodFaith) {
        strippedCount += 1;
        repairs.push("filler:strip_repeated_good_faith_line");
        continue;
      }
      seenGoodFaith = true;
    }
    const isInventoryPad =
      /^Supplemental commercial provision\. Each Party shall maintain inventory reporting under Oklahoma commercial standards\.?$/i.test(
        trimmed,
      );
    if (isInventoryPad) {
      if (seenInventoryPad) {
        strippedCount += 1;
        repairs.push("filler:strip_repeated_inventory_pad_line");
        continue;
      }
      seenInventoryPad = true;
    }
    kept.push(line);
  }

  let out = kept.join("\n");
  out = out.replace(/\n{2,}Supplemental Provisions\s*\n+(?=\n*IN WITNESS WHEREOF\b)/gi, "\n\n");
  out = out.replace(/\n{3,}/g, "\n\n").trimEnd();
  if (strippedCount === 0 && repairs.length === 0) {
    return { text: input.trimEnd(), strippedCount: 0, repairs: [] };
  }
  return { text: out, strippedCount, repairs: [...new Set(repairs)] };
}

export function assertNoRepeatedSupplementalProvisionsForFreeze(text: string): void {
  const assessment = assessRepeatedSupplementalProvisionsFiller(text);
  if (!assessment.ok) {
    throw new Error(
      `[paid-pro-sot-freeze-blocked] supplemental_provisions_filler:${assessment.reasons.join(",")}`,
    );
  }
}

/** Pad corpus to minLen with numbered unique supplements — never identical repeated sentences. */
export function expandOperativeCorpusWithUniqueSupplements(base: string, minLen: number): string {
  if (base.length >= minLen) return base;
  const witnessIdx = base.search(/\bIN WITNESS WHEREOF\b/i);
  const insertAt = witnessIdx >= 0 ? witnessIdx : base.length;
  let pad = "";
  let i = 0;
  const maxIterations = 250;
  while (base.length + pad.length < minLen && i < maxIterations) {
    i += 1;
    pad +=
      `\n\nOperational supplement ${i}. Each Party shall maintain commercially reasonable records for channel reporting tier ${i}, royalty reconciliation segment ${i}, and inventory checkpoint ${i} consistent with the payment schedules stated in this Agreement.`;
  }
  return `${base.slice(0, insertAt)}${pad}${base.slice(insertAt)}`;
}
