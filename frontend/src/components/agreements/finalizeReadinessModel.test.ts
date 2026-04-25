import { describe, expect, it } from "vitest";
import {
  buildFinalizeMissingLinesPriority,
  resolveFinalizeReadiness,
} from "./finalizeReadinessModel";
import type { PremiumFinalizeAudit } from "./premiumFinalizeAuditTypes";
import type { PremiumAgreementReview } from "./premiumAgreementReviewTypes";
import type { PremiumCompletenessRow } from "./premiumReviewCompleteness";

const emptyRows: PremiumCompletenessRow[] = [];

describe("buildFinalizeMissingLinesPriority", () => {
  it("prefers deal-specific audit over generic premium-review lines", () => {
    const audit: PremiumFinalizeAudit = {
      deal_specific_missing_terms: [
        "Allocate ownership of trailer, espresso machine, and generator",
        "Clarify profit split after repaying the cart purchase loan (waterfall)",
        "Set spending and bank / signature authority for daily float",
      ],
      placeholder_terms_found: [],
      resolved_strengths: [],
      best_next_step: "edit",
      confidence: "medium",
    };
    const review: PremiumAgreementReview = {
      strengths: [],
      missing_or_weak_terms: [
        "Confidentiality obligations for recipes could be explicit",
        "IP ownership of branding should be assigned",
      ],
      questions_for_user: [],
      suggested_clause_upgrades: [],
      priority_score: 70,
    };
    const lines = buildFinalizeMissingLinesPriority(
      audit,
      "not needed for this assertion",
      review,
      emptyRows,
      3,
    );
    expect(lines).toHaveLength(3);
    expect(lines[0].toLowerCase()).toContain("trailer");
    expect(lines.join(" ").toLowerCase()).not.toMatch(/confidentiality/);
    expect(lines.join(" ").toLowerCase()).not.toMatch(/\bip\b/);
  });

  it("promotes deterministic placeholder scan when model omits it", () => {
    const audit: PremiumFinalizeAudit = {
      deal_specific_missing_terms: [],
      placeholder_terms_found: [],
      resolved_strengths: [],
      best_next_step: "edit",
      confidence: "low",
    };
    const doc = "Compensation to be agreed. The mobile unit is TBD for insurance purposes.\nname not provided";
    const lines = buildFinalizeMissingLinesPriority(audit, doc, null, emptyRows, 3);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const joined = lines.join(" ");
    expect(joined.toLowerCase()).toMatch(/to be agreed|tbd|name not provided/);
  });
});

describe("resolveFinalizeReadiness (audit + placeholders)", () => {
  it("downgrades signature choice when placeholder or deal gaps exist", () => {
    const audit: PremiumFinalizeAudit = {
      deal_specific_missing_terms: ["Clarify cash controls"],
      placeholder_terms_found: [],
      resolved_strengths: [],
      best_next_step: "edit",
      confidence: "medium",
    };
    const r = resolveFinalizeReadiness({
      sendMode: "signature",
      sendModeTouched: true,
      notOkCount: 0,
      priorityScore: 0,
      lastRefine: null,
      audit,
      documentText: "plain text",
    });
    expect(r).not.toBe("ready_for_signature");
  });

  it("allows ready_for_signature on signature path when audit has no blockers and supports send", () => {
    const audit: PremiumFinalizeAudit = {
      deal_specific_missing_terms: [],
      placeholder_terms_found: [],
      resolved_strengths: ["Solid"],
      best_next_step: "send",
      confidence: "high",
    };
    const r = resolveFinalizeReadiness({
      sendMode: "signature",
      sendModeTouched: true,
      notOkCount: 0,
      priorityScore: 0,
      lastRefine: null,
      audit,
      documentText: "Clean document text without bracket insert markers or unresolved drafting language.",
    });
    expect(r).toBe("ready_for_signature");
  });
});
