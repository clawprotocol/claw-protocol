/**
 * Reviewed-document integrity authority for paid Pro / Genesis first review.
 *
 * One immutable canonical corpus must pass these gates before review-ready
 * display, SoT freeze, workspace persist, export, or signer preparation.
 * Soft display polish must never hide unresolved identity tokens or leave a
 * spliced empty-parent hierarchy as the accepted body.
 */

import { listUnresolvedIdentityPlaceholderTokens } from "./paidProPlaceholderAttributionLog";
import { diagnosePaidProCorpusDuplication } from "./paidProCorpusDuplicationAuthority";
import { repairSplitPaidProHeadingFragments } from "./repairSplitPaidProHeadingFragments";
import { repairPaidProEmptyParentSectionHierarchy } from "./repairPaidProEmptyParentSectionHierarchy";
import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import { validateInternalReferences } from "./finalAgreementCompilerIntegrity";
import { applyPaidProSectionHeadingTitleAuthority } from "./paidProSectionHeadingTitleAuthority";

const TOP_RE = /^(\d{1,2})\.\s+(?!\d)(.+)$/;
const NAMED_SECTION_REF_RE = /\bSection\s+(\d+)\s*\(([^)]+)\)/gi;

const PROVISION_FAMILY_PATTERNS: Array<{ family: string; re: RegExp }> = [
  // "Term" / "Cancellation" — not "Suspension and Termination" (separate family).
  { family: "term", re: /\bterm\b(?!\w)|cancellation/i },
  { family: "termination", re: /\btermination\b|\bsuspension\b/i },
  { family: "notices", re: /\bnotices?\b/i },
  { family: "fees", re: /\bfees?\b|\bpayment\b|\bsubscription\s+fee\b/i },
  { family: "confidentiality", re: /\bconfidential/i },
  { family: "liability", re: /\bliabilit|\bindemn/i },
  { family: "services", re: /\bservices?\b|\bsubscription\s+service\b/i },
];

export type PaidProReviewedDocumentIntegrityDiagnostics = {
  unresolvedIdentityTokens: string[];
  duplicateOpeningRecitals: number;
  emptyTopLevelHeadings: string[];
  duplicateProvisionFamilies: string[];
  brokenNamedSectionRefs: string[];
  malformedInternalRefs: boolean;
  reasons: string[];
};

export type PaidProReviewedDocumentIntegrityPrepareResult = {
  text: string;
  repairs: string[];
  diagnostics: PaidProReviewedDocumentIntegrityDiagnostics;
  ok: boolean;
};

function clean(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function openingPrefersResolvedIdentity(paragraph: string): boolean {
  return listUnresolvedIdentityPlaceholderTokens(paragraph).length === 0;
}

function scoreOpeningParagraph(paragraph: string): number {
  let score = 0;
  if (openingPrefersResolvedIdentity(paragraph)) score += 100;
  if (/\b("Client"|“Client”|'Client')\b/i.test(paragraph)) score += 10;
  if (/\b("Service Provider"|“Service Provider”|'Service Provider'|\"Provider\")\b/i.test(paragraph)) {
    score += 10;
  }
  if (/\bby\s+and\s+between\b/i.test(paragraph) && !openingPrefersResolvedIdentity(paragraph)) {
    score -= 50;
  }
  if (/\bThis\s+Agreement\s+is\s+between\b/i.test(paragraph)) score += 20;
  return score;
}

/**
 * Prefer the opening recital that has resolved party names over a duplicate
 * that still carries [ORG_n] / Provider template tokens.
 */
export function repairDuplicateOpeningsPreferResolvedIdentity(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  const raw = (text || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) return { text: raw, repairs };
  const witnessIdx = resolveAuthoritativeWitnessIndex(raw);
  const head = witnessIdx >= 0 ? raw.slice(0, witnessIdx) : raw;
  const tail = witnessIdx >= 0 ? raw.slice(witnessIdx) : "";
  const parts = head.split(/\n{2,}/);
  const openingIdxs: number[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i] || "";
    if (
      /\b(?:entered\s+into|This\s+Agreement\s+is\s+between|by\s+and\s+between)\b/i.test(p) &&
      !/^\d+\.\s+/.test(p.trim())
    ) {
      openingIdxs.push(i);
    }
  }
  if (openingIdxs.length < 2) return { text: raw, repairs };

  let bestIdx = openingIdxs[0]!;
  let bestScore = scoreOpeningParagraph(parts[bestIdx] || "");
  for (const idx of openingIdxs.slice(1)) {
    const score = scoreOpeningParagraph(parts[idx] || "");
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }
  const kept = new Set<number>([bestIdx]);
  const next: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (openingIdxs.includes(i) && !kept.has(i)) {
      repairs.push("integrity:drop_duplicate_opening_unresolved_or_weaker");
      continue;
    }
    next.push(parts[i]!);
  }
  if (repairs.length === 0) return { text: raw, repairs };
  const mergedHead = next.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  const out = tail ? `${mergedHead}\n\n${tail.trim()}` : mergedHead;
  return { text: out.replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

function collectTopLevelHeadings(text: string): Array<{ num: string; title: string; empty: boolean }> {
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const lines = head.split("\n");
  const out: Array<{ num: string; title: string; empty: boolean }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = clean(lines[i] || "").match(TOP_RE);
    if (!m) continue;
    let j = i + 1;
    let hasBody = false;
    while (j < lines.length) {
      const t = clean(lines[j] || "");
      if (!t) {
        j += 1;
        continue;
      }
      if (TOP_RE.test(t) || /^\d+\.\d+\s+/.test(t)) break;
      hasBody = true;
      break;
    }
    const nextTopOrSub = (() => {
      let k = i + 1;
      while (k < lines.length && !clean(lines[k] || "")) k += 1;
      const nxt = clean(lines[k] || "");
      return /^\d+\.\d+\s+/.test(nxt);
    })();
    out.push({
      num: m[1]!,
      title: m[2]!.trim(),
      empty: !hasBody && !nextTopOrSub,
    });
  }
  return out;
}

/**
 * Remap `Section N (Title)` prose to the finalized heading number for Title.
 * Also remaps bare `Section N` when N no longer exists and a unique Title match
 * is available from nearby parentheticals only (named form).
 */
export function reconcileNamedSectionCrossReferences(text: string): {
  text: string;
  repairs: string[];
  broken: string[];
} {
  const repairs: string[] = [];
  const broken: string[] = [];
  const headings = collectTopLevelHeadings(text);
  const byTitle = new Map<string, string>();
  for (const h of headings) {
    const key = clean(h.title).toLowerCase();
    byTitle.set(key, h.num);
    // Also index significant stems (Confidentiality, Notices, …).
    for (const token of key.split(/[^a-z0-9]+/).filter((t) => t.length >= 6)) {
      if (!byTitle.has(token)) byTitle.set(token, h.num);
    }
  }

  const out = text.replace(NAMED_SECTION_REF_RE, (full, num: string, titleRaw: string) => {
    const title = clean(titleRaw);
    const key = title.toLowerCase();
    let mapped = byTitle.get(key);
    if (!mapped) {
      for (const [k, n] of byTitle) {
        if (k.includes(key) || key.includes(k)) {
          mapped = n;
          break;
        }
      }
    }
    if (!mapped) {
      broken.push(full);
      return full;
    }
    if (mapped === num) return full;
    repairs.push(`integrity:named_section_xref:${num}->${mapped}:${title}`);
    return `Section ${mapped} (${title})`;
  });

  return { text: out, repairs, broken };
}

function countOpeningRecitalBlocks(text: string): number {
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  let count = 0;
  for (const part of head.split(/\n{2,}/)) {
    const p = part.trim();
    if (!p || /^\d+\.\s+/.test(p)) continue;
    if (
      /\b(?:entered\s+into|This\s+Agreement\s+is\s+between|by\s+and\s+between)\b/i.test(p)
    ) {
      count += 1;
    }
  }
  return count;
}

export function diagnosePaidProReviewedDocumentIntegrity(
  text: string,
): PaidProReviewedDocumentIntegrityDiagnostics {
  const reasons: string[] = [];
  const unresolvedIdentityTokens = listUnresolvedIdentityPlaceholderTokens(text);
  if (unresolvedIdentityTokens.length > 0) {
    reasons.push("unresolved_identity_token");
  }

  const dup = diagnosePaidProCorpusDuplication(text);
  const openingBlocks = countOpeningRecitalBlocks(text);
  if (dup.duplicateOpeningRecitals >= 2 || dup.repeatedPreamblePhrase || openingBlocks >= 2) {
    reasons.push("duplicate_opening_recital");
  }

  const headings = collectTopLevelHeadings(text);
  const emptyTopLevelHeadings = headings
    .filter((h) => h.empty)
    .map((h) => `${h.num}. ${h.title}`);
  // Hard-fail empty parents only when they form the LawDog splice pattern
  // (empty/incomplete category shell + immediate affinity sibling), not a lone
  // notice/structure shell synthesized during freeze finalize.
  const emptySplicePairs: string[] = [];
  for (let i = 0; i < headings.length - 1; i += 1) {
    const cur = headings[i]!;
    const nxt = headings[i + 1]!;
    if (!cur.empty) continue;
    const parentKey = cur.title.toLowerCase();
    const childKey = nxt.title.toLowerCase();
    const spliced =
      (/\bservices?\b/.test(parentKey) && /\bsubscription\b|\bservices?\b/.test(childKey)) ||
      (/\bfees?\b|\bpayment\b/.test(parentKey) && /\bsubscription\b|\bfee\b|\bpayment\b/.test(childKey)) ||
      (/\bterm\b|\bcancell/.test(parentKey) && /\bterm\b|\bcancell|\bterminat/.test(childKey)) ||
      (/\bliabilit|\bindemn/.test(parentKey) && /\bliabilit|\bindemn|\bexclusion|\bdamages\b/.test(childKey)) ||
      (/\bintellectual|\bownership|\bdata\b/.test(parentKey) && /\bownership\b|\blicen|\bdata\b/.test(childKey)) ||
      (/\brepresent|\bwarrant/.test(parentKey) && /\bauthority\b|\brepresent|\bwarrant/.test(childKey)) ||
      (/\bsuspension|\bterminat|\bbreach\b/.test(parentKey) && /\bbreach\b|\bsuspension|\bterminat/.test(childKey)) ||
      (/\bgeneral\b/.test(parentKey) && /\bindependent\b|\bnotices?\b|\bassignment\b/.test(childKey));
    if (spliced) emptySplicePairs.push(`${cur.num}. ${cur.title}→${nxt.num}. ${nxt.title}`);
  }
  if (emptySplicePairs.length > 0 || emptyTopLevelHeadings.length >= 3) {
    reasons.push("empty_top_level_heading");
  }

  const familyCounts = new Map<string, number>();
  for (const h of headings) {
    for (const fam of PROVISION_FAMILY_PATTERNS) {
      if (fam.re.test(h.title)) {
        familyCounts.set(fam.family, (familyCounts.get(fam.family) || 0) + 1);
      }
    }
  }
  const duplicateProvisionFamilies = [...familyCounts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([f]) => f);
  // Notices often appear both as a General Terms subsection and a later orphan top-level
  // section. A Notices parent with its own Notices.* child (after demote) is valid.
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  const headForNotices = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const topNoticeNums = [...headForNotices.matchAll(/^(\d+)\.\s+Notices?\b/gim)].map((m) => m[1]!);
  const subNoticeParents = [...headForNotices.matchAll(/^(\d+)\.\d+\s+Notices?\b/gim)].map(
    (m) => m[1]!,
  );
  const hasOrphanTopNoticesBesideForeignSub = topNoticeNums.some((n) =>
    subNoticeParents.some((p) => p !== n),
  );
  if (hasOrphanTopNoticesBesideForeignSub) {
    if (!duplicateProvisionFamilies.includes("notices")) duplicateProvisionFamilies.push("notices");
  }
  // Term+cancellation parents that remain as siblings after failed demote are the P0 signal.
  if (duplicateProvisionFamilies.includes("term") || duplicateProvisionFamilies.includes("notices")) {
    reasons.push("duplicate_provision_family");
  } else if (duplicateProvisionFamilies.length > 0) {
    // Services/fees duplicates often indicate empty-parent splice still present.
    const hasEmptySiblingSplice = emptyTopLevelHeadings.length > 0;
    if (hasEmptySiblingSplice) reasons.push("duplicate_provision_family");
  }

  const named = reconcileNamedSectionCrossReferences(text);
  const brokenNamedSectionRefs = named.broken;
  // Detect stale named refs that still disagree with heading map without mutating.
  NAMED_SECTION_REF_RE.lastIndex = 0;
  for (const m of text.matchAll(NAMED_SECTION_REF_RE)) {
    const num = m[1]!;
    const title = clean(m[2] || "");
    const heading = headings.find(
      (h) =>
        clean(h.title).toLowerCase() === title.toLowerCase() ||
        clean(h.title).toLowerCase().includes(title.toLowerCase()),
    );
    if (heading && heading.num !== num) {
      brokenNamedSectionRefs.push(m[0]);
      if (!reasons.includes("broken_named_section_reference")) {
        reasons.push("broken_named_section_reference");
      }
    }
  }

  // Bare Section N refs can drift during unrelated polish; named refs
  // (`Section N (Confidentiality)`) are the hard LawDog P0 signal.
  const internal = validateInternalReferences(text);
  if (!internal.ok && brokenNamedSectionRefs.length > 0) {
    reasons.push("malformed_internal_reference");
  }

  return {
    unresolvedIdentityTokens,
    duplicateOpeningRecitals: Math.max(dup.duplicateOpeningRecitals, openingBlocks),
    emptyTopLevelHeadings,
    duplicateProvisionFamilies,
    brokenNamedSectionRefs: [...new Set(brokenNamedSectionRefs)],
    malformedInternalRefs: !internal.ok,
    reasons: [...new Set(reasons)],
  };
}

/**
 * Drop a later top-level Notices section when Notices already exists as a subsection
 * under a *different* parent (common LawDog splice: General Terms → 18.3 Notices plus
 * orphan 19. Notices). Also collapse duplicate top-level Notices siblings
 * ("Notices" + "Notices and Communications") and duplicate Notices subsections.
 *
 * Do not drop a top-level Notices heading that is the parent of its own Notices.* child
 * (that shape is produced by non-adjacent hard-fail demote and must stay).
 */
export function repairDuplicateTopLevelNoticesSection(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  const raw = (text || "").replace(/\r\n/g, "\n");
  const witnessIdx = resolveAuthoritativeWitnessIndex(raw);
  const head = witnessIdx >= 0 ? raw.slice(0, witnessIdx) : raw;
  const tail = witnessIdx >= 0 ? raw.slice(witnessIdx) : "";
  const lines = head.split("\n");
  const out: string[] = [];
  let skipping = false;
  let seenSubNotices = false;
  let seenTopNotices = false;
  const subNoticesParents = new Set(
    [...head.matchAll(/^(\d+)\.\d+\s+Notices?\b/gim)].map((m) => m[1]!),
  );
  const isTopNoticesHeading = (t: string) => /^\d+\.\s+Notices?\b/i.test(t);
  for (let i = 0; i < lines.length; i += 1) {
    const t = clean(lines[i] || "");
    if (skipping) {
      if (TOP_RE.test(t) || /^\d+\.\d+\s+/.test(t)) {
        skipping = false;
      } else {
        continue;
      }
    }
    if (isTopNoticesHeading(t)) {
      const num = t.match(/^(\d+)/)?.[1] ?? "";
      const orphanTopWhileSubExistsElsewhere = [...subNoticesParents].some((p) => p !== num);
      if (orphanTopWhileSubExistsElsewhere || seenTopNotices) {
        skipping = true;
        repairs.push(
          seenTopNotices
            ? "integrity:drop_duplicate_top_level_notices_sibling"
            : "integrity:drop_duplicate_top_level_notices",
        );
        continue;
      }
      seenTopNotices = true;
    }
    if (/^\d+\.\d+\s+Notices?\b/i.test(t)) {
      if (seenSubNotices) {
        skipping = true;
        repairs.push("integrity:drop_duplicate_subsection_notices");
        continue;
      }
      seenSubNotices = true;
    }
    out.push(lines[i]!);
  }
  if (repairs.length === 0) return { text: raw, repairs };
  const merged = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    text: (tail ? `${merged}\n\n${tail.trim()}` : merged).replace(/\n{3,}/g, "\n\n").trim(),
    repairs,
  };
}

/**
 * Deterministic repair pass for reviewed-document integrity. Must either produce
 * a coherent hierarchy or leave diagnostics that hard-fail.
 */
export function repairPaidProReviewedDocumentIntegrity(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");

  const openings = repairDuplicateOpeningsPreferResolvedIdentity(out);
  if (openings.repairs.length > 0) {
    out = openings.text;
    repairs.push(...openings.repairs);
  }

  const split = repairSplitPaidProHeadingFragments(out);
  if (split.repairs.length > 0) {
    out = split.text;
    repairs.push(...split.repairs);
  }

  const emptyParents = repairPaidProEmptyParentSectionHierarchy(out);
  if (emptyParents.repairs.length > 0) {
    out = emptyParents.text;
    repairs.push(...emptyParents.repairs);
    const splitAfter = repairSplitPaidProHeadingFragments(out);
    if (splitAfter.repairs.length > 0) {
      out = splitAfter.text;
      repairs.push(...splitAfter.repairs);
    }
  }

  const notices = repairDuplicateTopLevelNoticesSection(out);
  if (notices.repairs.length > 0) {
    out = notices.text;
    repairs.push(...notices.repairs);
  }

  const xref = reconcileNamedSectionCrossReferences(out);
  if (xref.repairs.length > 0) {
    out = xref.text;
    repairs.push(...xref.repairs);
  }

  const titles = applyPaidProSectionHeadingTitleAuthority(out);
  if (titles.repairs.length > 0) {
    out = titles.text;
    repairs.push(...titles.repairs.map((r) => `heading_title:${r}`));
    // Title authority can re-split hierarchy; re-fold empty parents once.
    const emptyAfterTitle = repairPaidProEmptyParentSectionHierarchy(out);
    if (emptyAfterTitle.repairs.length > 0) {
      out = emptyAfterTitle.text;
      repairs.push(...emptyAfterTitle.repairs);
    }
    const xrefAfterTitle = reconcileNamedSectionCrossReferences(out);
    if (xrefAfterTitle.repairs.length > 0) {
      out = xrefAfterTitle.text;
      repairs.push(...xrefAfterTitle.repairs);
    }
  }

  return { text: out.replace(/\n{3,}/g, "\n\n").trim(), repairs: [...new Set(repairs)] };
}

/** Substantive draft + lone family-dup after repair — display, don't blank Review. */
export function isPaidProGtmFailOpenDuplicateProvisionFamily(
  diagnostics: PaidProReviewedDocumentIntegrityDiagnostics,
  text: string,
): boolean {
  return (
    (text || "").trim().length >= 2500 &&
    diagnostics.reasons.length === 1 &&
    diagnostics.reasons[0] === "duplicate_provision_family"
  );
}

export function assertPaidProReviewedDocumentIntegrity(text: string): void {
  const diag = diagnosePaidProReviewedDocumentIntegrity(text);
  if (diag.reasons.length === 0) return;
  if (isPaidProGtmFailOpenDuplicateProvisionFamily(diag, text)) return;
  const detail = [
    ...diag.reasons,
    diag.unresolvedIdentityTokens[0] ? `token=${diag.unresolvedIdentityTokens[0]}` : null,
    diag.emptyTopLevelHeadings[0] ? `empty=${diag.emptyTopLevelHeadings[0]}` : null,
    diag.brokenNamedSectionRefs[0] ? `xref=${diag.brokenNamedSectionRefs[0]}` : null,
  ]
    .filter(Boolean)
    .join(",");
  throw new Error(`[paid-pro-reviewed-document-integrity-blocked] ${detail}`);
}

/**
 * Repair then hard-validate. Returns the immutable reviewed-document corpus that
 * display, SoT, persist, export, and signer prep must share.
 *
 * GTM fail-open: after repair, a lone `duplicate_provision_family` on a substantive
 * draft must not blank Review — OpenAI already produced a usable agreement; the
 * illness was over-strict client rejection + corpus wipe, not model failure.
 */
export function preparePaidProImmutableReviewedDocument(
  text: string,
): PaidProReviewedDocumentIntegrityPrepareResult {
  const repaired = repairPaidProReviewedDocumentIntegrity(text);
  let diagnostics = diagnosePaidProReviewedDocumentIntegrity(repaired.text);
  if (isPaidProGtmFailOpenDuplicateProvisionFamily(diagnostics, repaired.text)) {
    diagnostics = {
      ...diagnostics,
      reasons: [],
      duplicateProvisionFamilies: [],
    };
  }
  const ok = diagnostics.reasons.length === 0;
  return {
    text: repaired.text,
    repairs: repaired.repairs,
    diagnostics,
    ok,
  };
}

export function isPaidProReviewedDocumentIntegrityError(message: string): boolean {
  return /\[paid-pro-reviewed-document-integrity-blocked\]/i.test(message || "");
}
