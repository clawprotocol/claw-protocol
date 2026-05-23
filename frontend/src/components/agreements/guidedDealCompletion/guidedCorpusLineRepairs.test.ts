import { describe, expect, it } from "vitest";
import {
  dedupeRepeatingSentenceLines,
  repairGuidedCorpusLinesBeforeStructure,
  splitMergedSubclauseLine,
  stripOrphanNumberedHeadingLines,
  stripStaleExecutionPlacementCorpusCopy,
} from "./guidedCorpusLineRepairs";
import { normalizeGuidedProCorpusStructure, validateNormalizedCorpusStructure } from "./guidedCanonicalCorpusNormalizer";

describe("guidedCorpusLineRepairs", () => {
  it("splits merged 6.1 / 8.1 subclause lines", () => {
    const parts = splitMergedSubclauseLine(
      "6.1 Each Party represents and warrants that it has the authority 8.1 All notices under this Agreement shall be in writing.",
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^6\.1\b/);
    expect(parts[1]).toMatch(/^8\.1\b/);
  });

  it("dedupes repeated invoice sentences", () => {
    const line =
      "Contractor will invoice Company monthly in arrears for services performed. Fees, rates, and payment timing will be documented in a schedule or written statement agreed before work begins.";
    const text = `${line}\n\n${line}`;
    const deduped = dedupeRepeatingSentenceLines(text);
    expect((deduped.text.match(/Contractor will invoice Company monthly/gi) ?? []).length).toBe(1);
  });

  it("strips orphan numbered headings like 8. and **8.", () => {
    const text = "7. Notices\nNotices go here.\n\n**8.\n\n9. Electronic Signatures\nDone.";
    const stripped = stripOrphanNumberedHeadingLines(text);
    expect(stripped.text).not.toMatch(/^\s*\*{0,2}8\./m);
    expect(stripped.text).toMatch(/9\.\s+Electronic Signatures/);
  });

  it("strips execution placement footer when witness block exists", () => {
    const text = `1. Purpose\n\nIN WITNESS WHEREOF\n\nCLIENT:\nAcme\nBy: ___\n\nExecution and signature placement are handled in the electronic signing step.`;
    const stripped = stripStaleExecutionPlacementCorpusCopy(text);
    expect(stripped.text).not.toMatch(/Execution and signature placement/i);
  });
});

/** Abbreviated test52 post-answer corruption fixture. */
export function test52CorruptedPostAnswerCorpus(): string {
  return `
AI AUTOMATION SERVICES AGREEMENT
This Agreement is effective as of the date of the last

1. Purpose and Scope
1.1 The Service Provider agrees to assist the Client in setting up AI automation.

2.1 The Client agrees to pay the Service Provider a monthly fee of approximately $6,000.
Contractor will invoice Company monthly in arrears for services performed. Fees, rates, and payment timing will be documented in a schedule or written statement agreed before work begins.

Contractor will invoice Company monthly in arrears for services performed. Fees, rates, and payment timing will be documented in a schedule or written statement agreed before work begins.

6.1 Each Party represents and warrants that it has the authority 8.1 All notices under this Agreement shall be in writing and shall be deemed given when delivered personally.

9.3 Electronic signatures shall be deemed valid and binding.

2. Fees and Payment
Invoices are due Net 30 from receipt unless a signed change order states otherwise.

4. Ownership and Work Product
Company owns the project deliverables and work product created specifically for Company after payment, subject only to Provider's retained ownership of pre-existing tools, templates, know-how, and background technology.

5. Support Expectations
Provider will target 99.9% monthly uptime for production automation components.

6. Term and Termination
Either party may terminate for convenience with 30 days written notice.

3. Confidentiality
Each party will protect the other party's confidential information and use it only to perform under this Agreement.

7. Notices
All notices must be in writing and sent to the addresses designated by the parties.

8. Miscellaneous
This Agreement is the entire agreement between the parties and may be amended only in a signed writing.

9. Electronic Signatures and Counterparts
Electronic signatures and counterparts are permitted to the fullest extent allowed by law.

${"Additional operational, payment, confidentiality, and support terms apply as described throughout this Agreement. ".repeat(14)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: __________________________
Name: Anthem H Blanchard
Title: Manager

SERVICE PROVIDER:
Joe Smith
Signature: __________________________
Name: Joe Smith
`.trim();
}

describe("test52 corpus normalization", () => {
  it("repairs corrupted post-answer corpus structure", () => {
    const repaired = repairGuidedCorpusLinesBeforeStructure(test52CorruptedPostAnswerCorpus());
    const normalized = normalizeGuidedProCorpusStructure(repaired.text);
    const validation = validateNormalizedCorpusStructure(normalized.text);
    expect(validation.ok, validation.defects.join(", ")).toBe(true);
    expect(normalized.text).not.toMatch(/^[^\n]*\b6\.1\b[^\n]*\b8\.1\b[^\n]*$/im);
    expect((normalized.text.match(/Contractor will invoice Company monthly/gi) ?? []).length).toBeLessThanOrEqual(1);
    expect(normalized.text).not.toMatch(
      /\b9\.\s+Electronic Signatures[\s\S]*\n\s*2\.\s+Fees and Payment/i,
    );
    expect(normalized.text.match(/^\s*2\.\s+Fees and Payment/gim)?.length ?? 0).toBe(1);
    const purposeIdx = normalized.text.search(/^\s*1\.\s+Purpose/im);
    const feesIdx = normalized.text.search(/^\s*2\.\s+Fees and Payment/im);
    const witnessIdx = normalized.text.search(/\bIN WITNESS WHEREOF/i);
    expect(purposeIdx).toBeGreaterThanOrEqual(0);
    expect(feesIdx).toBeGreaterThan(purposeIdx);
    expect(witnessIdx).toBeGreaterThan(feesIdx);
  });
});
