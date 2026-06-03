import { describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  enforcePaidProSingleExecutionBlock,
  truncatePostCanonicalExecutionPollution,
} from "./paidProExecutionBlockNormalization";
import {
  isRecitalFragmentExecutionPartyLine,
  repairOrphanedLegalEntitySuffixSpacingInCorpus,
} from "./paidProLegalEntityNameHygiene";
import { resolvePaidProServicesAgreementTitle } from "./paidProOpeningRecitalGuard";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const INTAKE =
  "Create a consulting and implementation agreement between Blue Canyon Analytics LLC (Client) " +
  "and Iron Vale Systems Inc. (Service Provider). Fixed fee $8,500. Delaware law governs.";

const OPENING = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  `This Agreement is entered into between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
].join("\n");

function goodExecutionBlock(): string {
  return [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    PAID_PRO_HARDENING_CLIENT,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
    "",
    "SERVICE PROVIDER:",
    PAID_PRO_HARDENING_PROVIDER,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
  ].join("\n");
}

function buildTest236DuplicateTailCorpus(): string {
  const operative = [
    OPENING,
    "",
    "1. SCOPE OF SERVICES. Iron Vale Systems Inc. will access client systems to deliver implementation services.",
    "2. PAYMENT. Client shall pay a fixed fee of $8,500.",
    "3. GOVERNING LAW. Delaware law governs.",
    "4. OWNERSHIP. Upon full payment, Client owns all deliverables.",
  ].join("\n");
  const pollutedTail = [
    "",
    goodExecutionBlock(),
    "",
    "CLIENT:",
    "is entered into as of the Effective Date by and between Blue Canyon Analytics LLC",
    "By: __________________________",
  ].join("\n");
  return operative + pollutedTail;
}

function countExecutionHeadings(text: string): {
  witness: number;
  client: number;
  serviceProvider: number;
} {
  return {
    witness: (text.match(/\bIN WITNESS WHEREOF\b/gi) || []).length,
    client: (text.match(/^\s*CLIENT\s*:?\s*$/gim) || []).length,
    serviceProvider: (text.match(/^\s*SERVICE\s+PROVIDER\s*:?\s*$/gim) || []).length,
  };
}

function draft(): ParsedDraftShape {
  return {
    title: "Consulting and Implementation Agreement",
    jurisdiction: "Delaware",
    agreement_family: "services_agreement",
    parties: [
      { name: PAID_PRO_HARDENING_CLIENT, role: "Client" },
      { name: PAID_PRO_HARDENING_PROVIDER, role: "Service Provider" },
    ],
    purpose: "AI workflow implementation services.",
    payment_terms: "Fixed fee of $8,500.",
    duration: "Until completion",
    due_date: null,
    effective_date: null,
    payment: { amount: 8_500, cadence: null, valid: true },
  } as ParsedDraftShape;
}

describe("paidPro Test236 execution block pollution", () => {
  it("rejects recital fragment execution party names anywhere in the line", () => {
    expect(
      isRecitalFragmentExecutionPartyLine(
        "is entered into as of the Effective Date by and between Blue Canyon Analytics LLC",
      ),
    ).toBe(true);
    expect(isRecitalFragmentExecutionPartyLine("by and between Blue Canyon Analytics LLC")).toBe(true);
    expect(
      isRecitalFragmentExecutionPartyLine(
        `This Agreement is entered into between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
      ),
    ).toBe(false);
  });

  it("collapses duplicate CLIENT tail with recital fragment party name", () => {
    const raw = buildTest236DuplicateTailCorpus();
    expect(countExecutionHeadings(raw).client).toBeGreaterThan(1);
    const normalized = enforcePaidProSingleExecutionBlock(raw);
    const headings = countExecutionHeadings(normalized.text);
    expect(headings.witness).toBe(1);
    expect(headings.client).toBe(1);
    expect(headings.serviceProvider).toBe(1);
    expect(analyzePaidProExecutionBlockInvariant(normalized.text).ok).toBe(true);
    const tail = normalized.text.slice(normalized.text.search(/\bIN WITNESS WHEREOF\b/i));
    expect(tail).not.toMatch(/is entered into/i);
    expect(tail).not.toMatch(/by and between/i);
    expect(tail).toMatch(/CLIENT\s*:\s*\n\s*Blue Canyon Analytics LLC/i);
    expect(tail).toMatch(/SERVICE PROVIDER:\s*\n\s*Iron Vale Systems Inc/i);
  });

  it("preserves valid opening recital in operative body", () => {
    const raw = buildTest236DuplicateTailCorpus();
    const normalized = enforcePaidProSingleExecutionBlock(raw);
    const witnessIdx = normalized.text.search(/\bIN WITNESS WHEREOF\b/i);
    const head = normalized.text.slice(0, witnessIdx);
    expect(head).toContain(PAID_PRO_HARDENING_CLIENT);
    expect(head).toContain(PAID_PRO_HARDENING_PROVIDER);
    expect(head).toMatch(/entered into between/i);
    expect(head).toMatch(/\$8,500|8500/i);
    expect(head).toMatch(/Delaware/i);
  });

  it("applyAcceptedProCorpusSafeDisplay and polish retain exactly one execution block", () => {
    const safe = applyAcceptedProCorpusSafeDisplay(buildTest236DuplicateTailCorpus(), {
      draft: draft(),
      intakeText: INTAKE,
    }).text;
    const polished = polishProAgreementDisplayLayer(safe, {
      draft: draft(),
      intakeText: INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    }).text;
    for (const text of [safe, polished]) {
      const headings = countExecutionHeadings(text);
      expect(headings.witness).toBe(1);
      expect(headings.client).toBe(1);
      expect(headings.serviceProvider).toBe(1);
      expect(text.slice(text.search(/\bIN WITNESS WHEREOF\b/i))).not.toMatch(/is entered into/i);
    }
  });

  it("truncatePostCanonicalExecutionPollution removes trailing role headings only", () => {
    const truncated = truncatePostCanonicalExecutionPollution(buildTest236DuplicateTailCorpus());
    expect(countExecutionHeadings(truncated.text).client).toBe(1);
    expect(truncated.text.slice(0, truncated.text.search(/\bIN WITNESS WHEREOF\b/i))).toContain(
      PAID_PRO_HARDENING_CLIENT,
    );
  });

  it("repairs orphaned Systems . spacing before operative verbs", () => {
    const repaired = repairOrphanedLegalEntitySuffixSpacingInCorpus(
      "Iron Vale Systems . will access client systems for implementation.",
    );
    expect(repaired.text).toMatch(/Iron Vale Systems Inc\. will access/i);
  });

  it("prefers Consulting Agreement title when intake is not mutual", () => {
    expect(resolvePaidProServicesAgreementTitle(INTAKE)).toBe("CONSULTING AND IMPLEMENTATION AGREEMENT");
    expect(resolvePaidProServicesAgreementTitle("Create a mutual consulting agreement")).toContain("MUTUAL");
  });
});
