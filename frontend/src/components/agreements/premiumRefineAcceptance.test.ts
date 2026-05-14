import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  classifyPremiumRefineRevisionIntent,
  computeMajorHeadingPreservationRatio,
  deriveStructuredAdvisoryKeys,
  effectivePremiumRefineApplyLogRevisionIntent,
  evaluatePremiumRefineCandidate,
  extractMajorHeadingFingerprints,
  formatProRefineRejectedShortInline,
  instructionAllowsExtremeShrink,
  isProRefineRejectedShortMessage,
  isProRefineSurgicalExhaustedMessage,
  normalizePremiumRefineTextForCompare,
  pickAuthoritativeProCorpusForRefine,
  premiumRefineSummaryIsUnchangedFailOpen,
  PREMIUM_REFINE_AUTHORITATIVE_PIPELINE_SOURCE,
  PREMIUM_REFINE_SURGICAL_HEADING_CHECK_MAX_RATIO,
  PREMIUM_REFINE_SURGICAL_MIN_LENGTH_RATIO,
  PREMIUM_REFINE_TRANSFORMATIONAL_HARD_REJECT_RATIO,
  PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY,
  PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE,
  PRO_REFINE_REJECTED_SHORT_PRIMARY,
  PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED,
  resolveStructuredAdvisoryKeysForAppend,
  shouldUseProRefineAdvisoryAppendSuccessCopy,
  STRUCTURED_ADVISORY_ITEMS,
  STRUCTURED_ADVISORY_KEY_ORDER,
} from "./premiumRefineAcceptance";
import { PRO_REFINE_UNAVAILABLE_USER_MESSAGE } from "./premiumRefineApi";
import { resolvePremiumRefineApplyOutcome } from "./premiumRefineLateFeeFallback";
import {
  candidatePassesTerminationConvenienceNoticeDaysPostcondition,
} from "./premiumRefineTerminationConveniencePostcondition";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function baseDraft(over: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "Services",
    jurisdiction: "CA",
    parties: [
      { name: "A", role: "party" },
      { name: "B", role: "party" },
    ],
    purpose: "Consulting",
    payment_terms: "$1",
    duration: "12m",
    due_date: null,
    effective_date: null,
    payment: emptyPayment,
    ...over,
  };
}

const SECTION_SPINE = `
THIS SERVICES AGREEMENT (this "Agreement") is entered into as of January 1, 2025 by and between Acme LLC ("Client") and Beta Corp ("Vendor").

1. Scope of Services. Vendor will deliver consulting services and deliverables described in Exhibit A.

2. Payment. Client shall pay fees of $5,000 within thirty (30) days of invoice.

3. Term. The initial term is twelve (12) months from the effective date with termination as set forth herein.

4. Confidentiality and Ownership. Each party acknowledges confidential information. All intellectual property and work product shall be owned by Client after full payment.
`.trim();

function padDocToLength(body: string, totalLen: number, fill: string): string {
  const b = body.trimEnd();
  if (b.length >= totalLen) return b.slice(0, totalLen);
  return b + fill.repeat(totalLen - b.length);
}

function docWithMarkdownHeadings(targetLen: number): string {
  const parts = [
    "## General Terms\n\n",
    "a".repeat(300),
    "\n\n## Payment Schedule\n\n",
    "b".repeat(300),
    "\n\n## Confidentiality\n\n",
    "c".repeat(300),
    "\n\n## Termination Rights\n\n",
    "d".repeat(300),
    "\n\n",
  ];
  let s = parts.join("");
  while (s.length < targetLen) s += "fill ";
  return s.slice(0, targetLen);
}

describe("evaluatePremiumRefineCandidate", () => {
  it("rejects ~15k → ~3.9k truncation (surgical)", () => {
    const cur = 15_000;
    const cand = "x".repeat(3900);
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur, undefined, "Add a governing-law footnote.");
    expect(r.decision).toBe("rejected_short");
    expect(r.revisionIntent).toBe("surgical_revision");
    expect(r.ratio).toBeLessThan(PREMIUM_REFINE_SURGICAL_MIN_LENGTH_RATIO);
  });

  it("rejects surgical add-clause instruction when ratio ~0.54 even with agreement spine present", () => {
    const cur = 15_900;
    const target = Math.floor(cur * 0.54);
    const cand = padDocToLength(SECTION_SPINE, target, "z");
    const r = evaluatePremiumRefineCandidate(
      cand,
      undefined,
      cur,
      undefined,
      "Add a change order approval clause and clarify acceptance.",
    );
    expect(r.revisionIntent).toBe("surgical_revision");
    expect(r.ratio).toBeLessThan(PREMIUM_REFINE_SURGICAL_MIN_LENGTH_RATIO);
    expect(r.decision).toBe("rejected_short");
  });

  it("accepts transformational summarize at ~0.54 when agreement spine is still present", () => {
    const cur = 15_900;
    const target = Math.floor(cur * 0.54);
    const cand = padDocToLength(SECTION_SPINE, target, "z");
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur, undefined, "Summarize this agreement.");
    expect(r.revisionIntent).toBe("transformational_revision");
    expect(r.ratio).toBeLessThan(PREMIUM_REFINE_SURGICAL_MIN_LENGTH_RATIO);
    expect(r.requiredSectionsPresent).toBe(true);
    expect(r.decision).toBe("accepted");
  });

  it("rejects ~15.7k → ~10.1k surgical shrink (preserve-first) even when spine heuristics pass", () => {
    const cur = 15_759;
    const target = 10_143;
    const cand = padDocToLength(SECTION_SPINE, target, "z");
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur);
    expect(r.revisionIntent).toBe("surgical_revision");
    expect(r.ratio).toBeLessThan(PREMIUM_REFINE_SURGICAL_MIN_LENGTH_RATIO);
    expect(r.decision).toBe("rejected_short");
  });

  it("rejects ~15.7k → ~10.1k when spine heuristics fail", () => {
    const cur = 15_759;
    const filler = `
Payment invoice amount due $500 within thirty days term duration twelve months termination upon notice.
Fees compensation for term of 90 calendar days.
`.trim();
    const target = 10_143;
    const cand = padDocToLength(filler, target, "n");
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur);
    expect(r.decision).toBe("rejected_short");
    expect(r.requiredSectionsPresent).toBe(false);
  });

  it("accepts surgical revision with ratio ~0.92 and major headings preserved vs baseline", () => {
    const baseline = docWithMarkdownHeadings(20_000);
    const cur = baseline.length;
    const target = Math.floor(cur * 0.92);
    let cand = baseline.slice(0, target);
    if (cand.length < target) cand += "y".repeat(target - cand.length);
    expect(cand.length / cur).toBeLessThan(PREMIUM_REFINE_SURGICAL_HEADING_CHECK_MAX_RATIO);
    expect(cand.length / cur).toBeGreaterThanOrEqual(PREMIUM_REFINE_SURGICAL_MIN_LENGTH_RATIO);
    const hp = computeMajorHeadingPreservationRatio(baseline, cand);
    expect(hp).toBeGreaterThanOrEqual(0.85);
    const r = evaluatePremiumRefineCandidate(cand, baseline, cur, undefined, "Add a Delaware choice-of-law sentence.");
    expect(r.revisionIntent).toBe("surgical_revision");
    expect(r.decision).toBe("accepted");
    expect(r.headingPreservationRatio).toBeGreaterThanOrEqual(0.85);
  });

  it("rejects surgical revision in 0.80–0.95 band when major heading preservation falls below 85%", () => {
    const baseline = docWithMarkdownHeadings(20_000);
    const cur = baseline.length;
    const mangled = baseline.replace(
      /## Payment Schedule\n\nb{300}/,
      "## Fee Arrangements\n\n" + "b".repeat(300),
    );
    const target = Math.floor(cur * 0.9);
    let cand = mangled.slice(0, target);
    if (cand.length < target) cand += "q".repeat(target - cand.length);
    expect(cand.length / cur).toBeLessThan(PREMIUM_REFINE_SURGICAL_HEADING_CHECK_MAX_RATIO);
    expect(cand.length / cur).toBeGreaterThanOrEqual(PREMIUM_REFINE_SURGICAL_MIN_LENGTH_RATIO);
    expect(computeMajorHeadingPreservationRatio(baseline, cand)).toBeLessThan(0.85);
    const r = evaluatePremiumRefineCandidate(cand, baseline, cur, undefined, "Tighten wording only.");
    expect(r.decision).toBe("rejected_short");
  });

  it("accepts ~15k → ~15.2k marginal expansion", () => {
    const cur = 15_000;
    const cand = "y".repeat(15_200);
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur);
    expect(r.decision).toBe("accepted");
    expect(r.ratio).toBeGreaterThanOrEqual(PREMIUM_REFINE_SURGICAL_HEADING_CHECK_MAX_RATIO);
  });

  it("rejects empty candidate", () => {
    expect(evaluatePremiumRefineCandidate("   ", undefined, 5000).decision).toBe("rejected_empty");
  });

  it("accepts marginal expansion when late-fee language is appended (mirrors server narrow patch)", () => {
    const cur = 16_083;
    const base = "x".repeat(cur);
    const block =
      "\n\nLate Payment. Any undisputed amount not paid within ten (10) days after it becomes due may accrue a late fee equal to five percent (5%) of the overdue amount.\n\n";
    const r = evaluatePremiumRefineCandidate(base + block, undefined, cur);
    expect(r.decision).toBe("accepted");
    expect(r.ratio).toBeGreaterThan(1);
  });

  it("accepts extreme shrink for transformational summarize below 0.50 when spine is present", () => {
    const cur = 12_000;
    const pad = "q".repeat(5000);
    const cand = `${SECTION_SPINE}\n\n${pad}`;
    expect(cand.length / cur).toBeLessThan(0.5);
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur, undefined, "Please summarize this agreement.");
    expect(r.revisionIntent).toBe("transformational_revision");
    expect(r.requiredSectionsPresent).toBe(true);
    expect(r.decision).toBe("accepted");
  });

  it("rejects transformational shrink below hard ratio even with spine", () => {
    const cur = 12_000;
    const pad = "q".repeat(1000);
    const cand = `${SECTION_SPINE}\n\n${pad}`;
    expect(cand.length / cur).toBeLessThan(PREMIUM_REFINE_TRANSFORMATIONAL_HARD_REJECT_RATIO);
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur, undefined, "Summarize this agreement.");
    expect(r.decision).toBe("rejected_short");
  });

  it("rejects identical refined text vs current Pro (no false-positive apply)", () => {
    const body = "Same\nparagraph\ncontent\n".repeat(200);
    const cur = body.length;
    const r = evaluatePremiumRefineCandidate(`${body}\n`, body, cur);
    expect(r.decision).toBe("rejected_unchanged");
    expect(r.refinedLen).toBeGreaterThan(cur - 5);
  });

  it("rejects when summary_changes contains fail-open unchanged message", () => {
    const cur = 5000;
    const same = "y".repeat(cur);
    const r = evaluatePremiumRefineCandidate(same, same, cur, [
      PRO_REFINE_UNAVAILABLE_USER_MESSAGE,
    ]);
    expect(r.decision).toBe("rejected_unchanged");
  });

  it("normalizePremiumRefineTextForCompare collapses whitespace for equality", () => {
    expect(normalizePremiumRefineTextForCompare("a  \n\tb")).toBe(normalizePremiumRefineTextForCompare(" a b "));
  });

  it("premiumRefineSummaryIsUnchangedFailOpen matches exact fail-open line", () => {
    expect(premiumRefineSummaryIsUnchangedFailOpen([PRO_REFINE_UNAVAILABLE_USER_MESSAGE])).toBe(true);
    expect(premiumRefineSummaryIsUnchangedFailOpen(["Some other summary"])).toBe(false);
  });
});

describe("classifyPremiumRefineRevisionIntent", () => {
  it("defaults to surgical_revision for normal edit instructions", () => {
    expect(classifyPremiumRefineRevisionIntent("Add an indemnity cap.")).toBe("surgical_revision");
    expect(classifyPremiumRefineRevisionIntent("")).toBe("surgical_revision");
  });

  it("detects transformational_revision for shorten / rewrite / replace / convert phrasing", () => {
    expect(classifyPremiumRefineRevisionIntent("Please shorten the whole agreement")).toBe("transformational_revision");
    expect(classifyPremiumRefineRevisionIntent("Rewrite from scratch as an NDA")).toBe("transformational_revision");
    expect(classifyPremiumRefineRevisionIntent("Replace the entire document with a memo")).toBe("transformational_revision");
    expect(classifyPremiumRefineRevisionIntent("Convert this to bullet points")).toBe("transformational_revision");
  });

  it("classifies realistic human review-note prompts as advisory_note_or_comment", () => {
    const qaPrompt = `Can you add some notes for review?

like:
- payment timing?
- what happens if they stop mid project
- do we need anything about bugs after launch`;
    expect(classifyPremiumRefineRevisionIntent(qaPrompt)).toBe("advisory_note_or_comment");
    expect(classifyPremiumRefineRevisionIntent("Anything I should double check before sending this?")).toBe(
      "advisory_note_or_comment",
    );
    expect(
      classifyPremiumRefineRevisionIntent(
        "Feels like payment and delivery might be unclear — can you flag anything?",
      ),
    ).toBe("advisory_note_or_comment");
  });

  it("keeps explicit operative edits as surgical_revision", () => {
    expect(
      classifyPremiumRefineRevisionIntent("Add a 5% late fee if payment is more than 10 days late."),
    ).toBe("surgical_revision");
    expect(classifyPremiumRefineRevisionIntent("Add confidentiality clause.")).toBe("surgical_revision");
    expect(classifyPremiumRefineRevisionIntent("Change governing law to Oklahoma.")).toBe("surgical_revision");
  });
});

describe("instructionAllowsExtremeShrink", () => {
  it("detects shorten / summarize intent", () => {
    expect(instructionAllowsExtremeShrink("Please shorten the agreement")).toBe(true);
    expect(instructionAllowsExtremeShrink("Summarize payment only")).toBe(true);
    expect(instructionAllowsExtremeShrink("Add a governing-law clause")).toBe(false);
  });
});

describe("extractMajorHeadingFingerprints", () => {
  it("captures markdown headings from a long baseline", () => {
    const d = docWithMarkdownHeadings(5000);
    const fp = extractMajorHeadingFingerprints(d);
    expect(fp).toContain("general terms");
    expect(fp).toContain("payment schedule");
    expect(fp.length).toBeGreaterThanOrEqual(4);
  });
});

describe("formatProRefineRejectedShortInline", () => {
  it("includes primary copy for UI", () => {
    const t = formatProRefineRejectedShortInline();
    expect(t).toContain(PRO_REFINE_REJECTED_SHORT_PRIMARY);
    expect(t).toContain("Edit wording");
    expect(t).toContain("LawDog tried to change too much");
  });
});

describe("surgical exhausted vs generic rejected_short copy", () => {
  it("treats surgical exhausted message as refine alert class alongside generic short reject", () => {
    expect(isProRefineSurgicalExhaustedMessage(PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED)).toBe(true);
    expect(isProRefineRejectedShortMessage(PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED)).toBe(true);
    expect(isProRefineRejectedShortMessage(PRO_REFINE_REJECTED_SHORT_PRIMARY)).toBe(true);
    expect(isProRefineSurgicalExhaustedMessage(PRO_REFINE_REJECTED_SHORT_PRIMARY)).toBe(false);
  });
});

describe("PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE", () => {
  it("tells the user to review before sending", () => {
    expect(PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE).toContain("Revision applied");
    expect(PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE).toContain("Review before sending");
  });
});

describe("effectivePremiumRefineApplyLogRevisionIntent", () => {
  it("reports advisory_note_or_comment for accepted append-shaped output with advisory user prompt", () => {
    const baseline = "A".repeat(5000);
    const doc =
      `${baseline}\n\n---\n\n## REVIEWER NOTE / REQUESTED REVIEW ITEMS\n\n` +
      "**Requested by drafting party:** Reviewer requested a list of items the other party should review.\n\n" +
      "**Flagged / readiness items (from LawDog review):**\n- Clarify acceptance criteria, review window, and what constitutes final delivery.\n";
    const acc = evaluatePremiumRefineCandidate(doc, baseline, baseline.length, undefined, "List items the other party should review.");
    expect(acc.decision).toBe("accepted");
    expect(acc.revisionIntent).toBe("advisory_note_or_comment");
    expect(
      effectivePremiumRefineApplyLogRevisionIntent({
        userInstruction: "List items the other party should review.",
        acceptance: acc,
        refineApplyDecision: "append_reviewer_note_preserve_document",
        usedAppendReviewerNotePreserve: true,
      }),
    ).toBe("advisory_note_or_comment");
  });
});

describe("structured deterministic advisory derivation", () => {
  it("maps invoicing + payment timing from instruction text", () => {
    const keys = deriveStructuredAdvisoryKeys("Add reviewer note with items: Clarify invoicing and payment timing", undefined);
    expect(keys).toContain("invoicing");
    expect(keys).toContain("payment_timing");
  });

  it("returns empty derive for meaningless input then resolve applies default keys", () => {
    expect(deriveStructuredAdvisoryKeys("List items the other party should review.", undefined)).toEqual([]);
    expect(resolveStructuredAdvisoryKeysForAppend("List items the other party should review.", undefined)).toEqual([
      "acceptance",
      "payment_timing",
      "scope",
    ]);
  });

  it("maps checklist-only topics without echoing checklist (keys only)", () => {
    const keys = resolveStructuredAdvisoryKeysForAppend("", [
      "Discuss IP assignment with counsel",
      "NDA / confidentiality obligations",
      "Termination for convenience and refunds",
    ]);
    expect(keys).toEqual(["confidentiality", "ip_ownership", "termination"]);
  });

  it("stable sort follows STRUCTURED_ADVISORY_KEY_ORDER and truncates to seven", () => {
    const spam =
      "payment invoice acceptance scope confidential IP terminate support access law venue dispute notice arbitration";
    const keys = resolveStructuredAdvisoryKeysForAppend(spam, undefined);
    expect(keys).toHaveLength(7);
    expect(keys).toEqual(STRUCTURED_ADVISORY_KEY_ORDER.slice(0, 7));
  });

  it("structured item copy is fixed enterprise strings", () => {
    expect(STRUCTURED_ADVISORY_ITEMS.payment_timing).toContain("due dates");
    expect(STRUCTURED_ADVISORY_ITEMS.governing_law).toContain("dispute-resolution");
  });
});

describe("PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY + shouldUseProRefineAdvisoryAppendSuccessCopy", () => {
  it("uses the unified advisory append success line", () => {
    expect(PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY).toBe(
      "Appended reviewer note; full agreement preserved.",
    );
  });

  it("detects advisory UX from intent, append flag, or apply decision", () => {
    expect(
      shouldUseProRefineAdvisoryAppendSuccessCopy({
        userInstruction: "List items the other party should review.",
        usedAppendReviewerNotePreserve: false,
        refineApplyDecision: null,
      }),
    ).toBe(true);
    expect(
      shouldUseProRefineAdvisoryAppendSuccessCopy({
        userInstruction: "Add late fee of 5% after 10 days overdue",
        usedAppendReviewerNotePreserve: true,
        refineApplyDecision: null,
      }),
    ).toBe(true);
    expect(
      shouldUseProRefineAdvisoryAppendSuccessCopy({
        userInstruction: "Add late fee of 5% after 10 days overdue",
        usedAppendReviewerNotePreserve: false,
        refineApplyDecision: "append_reviewer_note_preserve_document",
      }),
    ).toBe(true);
    expect(
      shouldUseProRefineAdvisoryAppendSuccessCopy({
        userInstruction: "Add late fee of 5% after 10 days overdue",
        usedAppendReviewerNotePreserve: false,
        refineApplyDecision: null,
      }),
    ).toBe(false);
  });
});

describe("pickAuthoritativeProCorpusForRefine", () => {
  it("prefers longest draft premium field over short agreement buffer", () => {
    const full = "p".repeat(15_000);
    const d = baseDraft({
      premium_server_full_document_text: full,
      premium_full_document_text: null,
    });
    const p = pickAuthoritativeProCorpusForRefine({
      draft: d,
      agreementDocumentText: "short preview only",
    });
    expect(p.len).toBe(15_000);
    expect(p.chosenSource).toBe("premium_server_full_document_text");
  });

  it("surfaces authoritative pipeline constant", () => {
    expect(PREMIUM_REFINE_AUTHORITATIVE_PIPELINE_SOURCE).toBe("server_full_document_text");
  });
});

const TERMINATION_CONVENIENCE_45_INSTR =
  "Revise the termination section to require forty-five (45) days' prior written notice for termination for convenience instead of thirty (30) days. Keep all other commercial, payment, ownership, confidentiality, governing law, dispute resolution, signature, party identity, and project scope terms unchanged.";

function buildTerminationConvenienceDoc(uponInner: string, padTotal: number): string {
  const core = `## Termination

### Termination for Cause

A party may terminate for material breach, subject to a cure period of twenty-one (21) calendar days following written notice of the breach.

### Termination for Convenience

Any Party may terminate its participation in this Agreement for convenience ${uponInner} to the other Parties.

## Signatures

IN WITNESS WHEREOF.
`;
  const pad = "p".repeat(Math.max(0, padTotal - core.length));
  return `${core}\n${pad}`;
}

/** Non-`upon … prior written notice` phrasing so deterministic surgical fallback cannot patch. */
function buildTerminationConvenienceDocNonDeterministic(noticeInner: string, padTotal: number): string {
  const core = `## Termination

### Termination for Convenience

Any Party may terminate its participation in this Agreement for convenience ${noticeInner}

## Signatures

IN WITNESS WHEREOF.
`;
  const pad = "p".repeat(Math.max(0, padTotal - core.length));
  return `${core}\n${pad}`;
}

describe("resolvePremiumRefineApplyOutcome — termination convenience notice surgical postcondition", () => {
  it("does not accept when the model edits unrelated text but leaves fifteen (15) days prior written notice in the convenience sentence (and deterministic cannot patch this phrasing)", () => {
    const notice =
      "with at least fifteen (15) days written notice to the other Parties (nonstandard phrasing without the operative upon clause).";
    const baseline = buildTerminationConvenienceDocNonDeterministic(notice, 9200);
    const candidate = `${baseline}\n\n## Operational Note\n\nClarified internal cross-references in Article 1 headings only.\n`;
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: candidate,
      baselineText: baseline,
      baselineLen: baseline.length,
      summaryChanges: ["Clarified internal cross-references in Article 1 headings only."],
      userInstruction: TERMINATION_CONVENIENCE_45_INSTR,
    });
    expect(resolved.acceptance.decision).toBe("rejected_surgical_postcondition_failed");
    expect(resolved.finalText.trim()).toBe(baseline.trim());
    expect(resolved.appliedDeterministicSurgicalFallback).toBe(false);
  });

  it("does not accept when the model leaves thirty (30) days prior written notice when the baseline uses non-deterministic phrasing", () => {
    const notice =
      "with thirty (30) days written notice to the other Parties (nonstandard phrasing without the operative upon clause).";
    const baseline = buildTerminationConvenienceDocNonDeterministic(notice, 9200);
    const candidate = `${baseline}\n\n## Style\n\nNormalized dash usage in non-substantive headings.\n`;
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: candidate,
      baselineText: baseline,
      baselineLen: baseline.length,
      summaryChanges: ["Normalized dash usage in non-substantive headings."],
      userInstruction: TERMINATION_CONVENIENCE_45_INSTR,
    });
    expect(resolved.acceptance.decision).toBe("rejected_surgical_postcondition_failed");
    expect(resolved.finalText.trim()).toBe(baseline.trim());
  });

  it("accepts when the convenience sentence contains forty-five (45) days' prior written notice", () => {
    const baseline = buildTerminationConvenienceDoc("upon thirty (30) days' prior written notice", 9200);
    const candidate = buildTerminationConvenienceDoc("upon forty-five (45) days' prior written notice", 9300);
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: candidate,
      baselineText: baseline,
      baselineLen: baseline.length,
      summaryChanges: ["Updated termination-for-convenience notice period per instruction."],
      userInstruction: TERMINATION_CONVENIENCE_45_INSTR,
    });
    expect(resolved.acceptance.decision).toBe("accepted");
    expect(resolved.finalText).toContain("forty-five (45) days' prior written notice");
    expect(resolved.appliedDeterministicSurgicalFallback).toBe(false);
  });

  it("does not accept the LLM-only edit when convenience still shows fifteen (15) but applies deterministic fallback from a patchable baseline (for-cause text may drift)", () => {
    const baseline = buildTerminationConvenienceDoc("upon at least fifteen (15) days' prior written notice", 9200);
    const cause45 = baseline.replace(
      "twenty-one (21) calendar days",
      "forty-five (45) days' prior written notice and twenty-one (21) calendar days",
    );
    expect(cause45).not.toBe(baseline);
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: cause45,
      baselineText: baseline,
      baselineLen: baseline.length,
      summaryChanges: ["Adjusted cure-period notice framing in the for-cause paragraph."],
      userInstruction: TERMINATION_CONVENIENCE_45_INSTR,
    });
    expect(resolved.acceptance.decision).toBe("accepted");
    expect(resolved.appliedDeterministicSurgicalFallback).toBe(true);
    expect(resolved.finalText).toMatch(/forty-five\s*\(\s*45\s*\)\s*days['']?\s+prior\s+written\s+notice/i);
    expect(resolved.finalText).not.toMatch(/fifteen\s*\(\s*15\s*\)\s*days['']?\s+prior\s+written\s+notice/i);
  });

  it("applies deterministic fallback when the LLM candidate fails the postcondition but the baseline can be patched", () => {
    const baseline = buildTerminationConvenienceDoc("upon thirty (30) days' prior written notice", 9200);
    const bad = `${baseline}\n\n## Administrative\n\nReordered non-substantive bullet labels in the exhibits table of contents.\n`;
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: bad,
      baselineText: baseline,
      baselineLen: baseline.length,
      summaryChanges: ["Reordered exhibit TOC labels."],
      userInstruction: TERMINATION_CONVENIENCE_45_INSTR,
    });
    expect(resolved.acceptance.decision).toBe("accepted");
    expect(resolved.appliedDeterministicSurgicalFallback).toBe(true);
    expect(resolved.finalText).toMatch(/forty-five\s*\(\s*45\s*\)\s*days['']?\s+prior\s+written\s+notice/i);
    expect(resolved.finalText).not.toMatch(/thirty\s*\(\s*30\s*\)\s*days['']?\s+prior\s+written\s+notice/i);
  });

  it("does not run the postcondition gate for instructions that are not termination-convenience notice-day surgical intents", () => {
    const baseline = buildTerminationConvenienceDoc("upon thirty (30) days' prior written notice", 9200);
    const candidate = `${baseline}\n\n## Exhibit Index\n\nNormalized numbering in the exhibit list only.\n`;
    const instr = "Improve the exhibits cross-reference formatting in Section 1 only.";
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: candidate,
      baselineText: baseline,
      baselineLen: baseline.length,
      summaryChanges: ["Normalized exhibit numbering."],
      userInstruction: instr,
    });
    expect(candidatePassesTerminationConvenienceNoticeDaysPostcondition(candidate, instr)).toBe(true);
    expect(resolved.acceptance.decision).toBe("accepted");
  });
});
