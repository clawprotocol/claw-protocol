/**
 * Batch QA harness — operational synthesis across 35+ agreement archetypes (deterministic, no live Pro API).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveAuthoritativePartiesForRecitalPolish } from "../paidProPartyNamePreserve";
import { classifyDealDna, extractPartyResponsibilities } from "./index";
import {
  PRO_OPERATIONAL_QA_ARCHETYPES,
  PRO_OPERATIONAL_QA_FIXTURES,
} from "./proOperationalSynthesisFixtures";
import { runProOperationalQaPipeline } from "./proOperationalSynthesisQaPipeline";
import {
  runAllProQaValidators,
  type ProQaValidationIssue,
} from "./proOperationalSynthesisValidators";

const __dir = dirname(fileURLToPath(import.meta.url));
const readonlyViewSrc = readFileSync(
  join(__dir, "../PremiumAgreementReadonlyView.tsx"),
  "utf8",
);
const premiumHtmlSrc = readFileSync(join(__dir, "../premiumAgreementDocumentHtml.ts"), "utf8");

type BatchFailure = { id: string; label: string; issues: ProQaValidationIssue[] };

function summarizeFailures(failures: BatchFailure[]): void {
  if (!failures.length || import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[pro-qa-batch-summary]", {
    total: PRO_OPERATIONAL_QA_FIXTURES.length,
    failed: failures.length,
    samples: failures.slice(0, 8).map((f) => ({
      id: f.id,
      codes: f.issues.map((i) => i.code),
    })),
  });
}

describe("Pro operational synthesis batch QA", () => {
  const aggregateFailures: BatchFailure[] = [];

  it("covers at least 35 archetype fixtures", () => {
    expect(PRO_OPERATIONAL_QA_FIXTURES.length).toBeGreaterThanOrEqual(35);
    expect(PRO_OPERATIONAL_QA_ARCHETYPES.length).toBeGreaterThanOrEqual(5);
  });

  for (const fixture of PRO_OPERATIONAL_QA_FIXTURES) {
    it(`[${fixture.id}] ${fixture.label}`, () => {
      const authoritative = resolveAuthoritativePartiesForRecitalPolish(fixture.parties, fixture.intake);
      const result = runProOperationalQaPipeline(fixture);
      const partyCount = Math.max(authoritative.length, fixture.parties.length);

      expect(result.context.additional_terms).toContain("operational synthesis");
      expect(result.synthesis.responsibilities.length).toBeGreaterThanOrEqual(
        Math.min(2, partyCount),
      );

      const dna = classifyDealDna(fixture.intake, { partyCount: fixture.parties.length });
      expect(dna.archetype).toBeTruthy();
      const profiles = extractPartyResponsibilities(fixture.intake, fixture.parties);
      expect(profiles.length).toBe(fixture.parties.length);
      expect(profiles.every((p) => !/^(ownership of|collectively|the parties)$/i.test(p.party))).toBe(true);

      if (fixture.expectMilestoneTable) {
        const milestoneInIntake = /\bmilestones?\b/i.test(fixture.intake);
        expect(milestoneInIntake).toBe(true);
        const hasTable = /\bIMPLEMENTATION\s+MILESTONES\b|\|\s*Milestone\s*\|/i.test(result.text);
        const hasContext = (result.context.material_asks || []).some((m) => /milestone|implementation/i.test(m));
        expect(hasTable || hasContext).toBe(true);
      }

      const issues = runAllProQaValidators({
        text: result.text,
        intake: fixture.intake,
        parties: fixture.parties,
        expectedSignals: fixture.expectedSignals,
        minSignalHits: fixture.minSignalHits ?? 1,
      });

      expect(result.placeholderOk, `placeholder gate: ${result.placeholderRemainingFatal.join(", ")}`).toBe(
        true,
      );

      if (issues.length) {
        aggregateFailures.push({ id: fixture.id, label: fixture.label, issues });
        const detail = issues.map((i) => `${i.code}: ${i.message}`).join("\n");
        expect(issues, `[${fixture.id}] ${fixture.label}\n${detail}`).toEqual([]);
      }
    });
  }

  it("aggregate failure summary (logged when any case fails)", () => {
    summarizeFailures(aggregateFailures);
    expect(aggregateFailures.length).toBe(0);
  });
});

describe("readonly surface readability (static)", () => {
  it("does not use text-align justify on premium readonly surfaces", () => {
    expect(readonlyViewSrc).not.toMatch(/text-align:\s*justify/);
    expect(readonlyViewSrc).not.toContain("text-justify");
    expect(premiumHtmlSrc).not.toMatch(/text-align:\s*justify/);
  });
});
