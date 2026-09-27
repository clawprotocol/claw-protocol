import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import {
  assertPaidProSignatureSectionOrderingInvariant,
  lastNumberedSectionHeadingIndex,
  numberedSectionHeadingsAfterSignatures,
  repairPaidProSignatureSectionOrdering,
} from "./paidProSignatureSectionOrdering";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "qa/paidProHardening/fixtures");

const TEST212_BROKEN = readFileSync(join(FIXTURE_DIR, "freeProQaTemplateATest212.txt"), "utf8");

const INTAKE = readFileSync(join(FIXTURE_DIR, "freeProQaTemplateATest212.intake.txt"), "utf8").trim();

describe("paidProSignatureSectionOrdering", () => {
  it("test212 fixture has mis-ordered signatures before section 12", () => {
    expect(TEST212_BROKEN).toMatch(/\nSIGNATURES\n/);
    expect(TEST212_BROKEN).toMatch(/12\.\s+Scope of Services and Project Deliverables/);
    expect(numberedSectionHeadingsAfterSignatures(TEST212_BROKEN).length).toBeGreaterThan(0);
    expect(TEST212_BROKEN).toContain("Iron Vale Systems Inc..");
  });

  it("repair relocates section 12 before SIGNATURES and fixes entity punctuation", () => {
    const { text } = repairPaidProSignatureSectionOrdering(TEST212_BROKEN);
    assertPaidProSignatureSectionOrderingInvariant(text);
    expect(text).not.toContain("Inc..");
    expect(numberedSectionHeadingsAfterSignatures(text)).toHaveLength(0);
    const sigIdx = text.search(/^\s*SIGNATURES\s*$/im);
    const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
    expect(sigIdx).toBeGreaterThan(-1);
    expect(witnessIdx).toBeGreaterThan(sigIdx);
    expect(lastNumberedSectionHeadingIndex(text)).toBeLessThan(sigIdx);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
  });

  it("keeps unnumbered operative body before sequential 10/11/12/13 SIGNATURES", () => {
    const paint = [
      "SERVICES AGREEMENT",
      "",
      "This Agreement is between Cedar Ridge Labs LLC and Iron Quill Partners Inc.",
      "",
      "The parties agree to the operative commercial terms set forth below.",
      "",
      "10. NOTICES",
      "",
      "If to Cedar Ridge Labs LLC:",
      "Email: jordan@example.test",
      "",
      "11. GOVERNING LAW",
      "",
      "This Agreement is governed by the laws of the State of Texas.",
      "",
      "12. MISCELLANEOUS",
      "",
      "This Agreement constitutes the entire agreement of the parties.",
      "",
      "13. SIGNATURES",
    ].join("\n");
    const { text } = repairPaidProSignatureSectionOrdering(paint);
    expect(text).toContain("This Agreement is between Cedar Ridge Labs LLC and Iron Quill Partners Inc.");
    expect(text).toContain("The parties agree to the operative commercial terms set forth below.");
    expect(text).toMatch(/10\.\s+NOTICES/);
    expect(text).toMatch(/11\.\s+GOVERNING LAW/);
    expect(text).toMatch(/13\.\s+SIGNATURES/);
    expect(text.indexOf("This Agreement is between")).toBeLessThan(text.search(/10\.\s+NOTICES/));
  });

  it("display polish preserves ordering invariants for test212", () => {
    const { text } = polishProAgreementDisplayLayer(TEST212_BROKEN, {
      intakeText: INTAKE,
      reviewDisplayMode: false,
    });
    assertPaidProSignatureSectionOrderingInvariant(text);
    expect(text).not.toMatch(/(?:Inc|LLC|Ltd)\.\./i);
  });
});
