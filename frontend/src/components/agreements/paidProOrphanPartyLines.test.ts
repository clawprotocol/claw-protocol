import { beforeEach, describe, expect, it } from "vitest";
import { clearPaidProCorpusScanCache } from "./paidProCorpusScanCache";
import { removeOrphanPartyLinesBeforeExecutionTail } from "./paidProOrphanPartyLines";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const PARTIES = [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER];

function corpusWithOrphansBeforeSection12(): string {
  return [
    "MUTUAL CONSULTING AGREEMENT",
    "",
    `This Agreement is entered into by ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
    "",
    "11.5 Entire Agreement.",
    "This Agreement is the entire agreement.",
    "",
    "11.6 Counterparts.",
    "Counterparts may be executed in electronic form.",
    "",
    PAID_PRO_HARDENING_CLIENT,
    "",
    PAID_PRO_HARDENING_PROVIDER,
    "",
    "12. ACCEPTANCE AND DEMONSTRATION REVIEW",
    "Client may review deliverables within ten business days.",
    "",
    "IN WITNESS WHEREOF",
    `CLIENT: ${PAID_PRO_HARDENING_CLIENT}`,
    `SERVICE PROVIDER: ${PAID_PRO_HARDENING_PROVIDER}`,
  ].join("\n");
}

function corpusWithOrphansBeforeWitness(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    `Between ${PAID_PRO_HARDENING_CLIENT} and ${PAID_PRO_HARDENING_PROVIDER}.`,
    "",
    "9.5 Governing Law.",
    "Delaware law governs.",
    "",
    "9.6 Counterparts.",
    "Electronic signatures are binding.",
    "",
    PAID_PRO_HARDENING_CLIENT,
    "",
    PAID_PRO_HARDENING_PROVIDER,
    "",
    "IN WITNESS WHEREOF, the Parties have executed this Agreement.",
    `CLIENT: ${PAID_PRO_HARDENING_CLIENT}`,
    `SERVICE PROVIDER: ${PAID_PRO_HARDENING_PROVIDER}`,
  ].join("\n");
}

beforeEach(() => {
  clearPaidProCorpusScanCache();
});

describe("paidProOrphanPartyLines", () => {
  it("removes bare party names between final numbered provision and Section 12", () => {
    const before = corpusWithOrphansBeforeSection12();
    const { text, removedLines } = removeOrphanPartyLinesBeforeExecutionTail(before, PARTIES);
    expect(removedLines).toEqual(PARTIES);
    expect(text).not.toMatch(
      new RegExp(`11\\.6 Counterparts\\.\\n\\n${PAID_PRO_HARDENING_CLIENT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"),
    );
    expect(text).toContain("12. ACCEPTANCE AND DEMONSTRATION REVIEW");
    expect(text).toContain(PAID_PRO_HARDENING_CLIENT);
    expect(text.indexOf("12. ACCEPTANCE")).toBeLessThan(text.lastIndexOf(PAID_PRO_HARDENING_CLIENT));
  });

  it("removes bare party names between final numbered provision and IN WITNESS WHEREOF", () => {
    const before = corpusWithOrphansBeforeWitness();
    const { text, removedLines } = removeOrphanPartyLinesBeforeExecutionTail(before, PARTIES);
    expect(removedLines).toEqual(PARTIES);
    const gap = text.slice(text.indexOf("9.6 Counterparts"), text.indexOf("IN WITNESS"));
    expect(gap).not.toContain(`\n${PAID_PRO_HARDENING_CLIENT}\n`);
    expect(text).toContain("IN WITNESS WHEREOF");
  });

  it("does not remove party names in opening recital", () => {
    const recital = [
      "AGREEMENT",
      "",
      `${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider") enter this Agreement.`,
      "",
      "1. Scope.",
      "Provider delivers services.",
      "",
      "IN WITNESS WHEREOF",
      `CLIENT: ${PAID_PRO_HARDENING_CLIENT}`,
    ].join("\n");
    const { text, removedLines } = removeOrphanPartyLinesBeforeExecutionTail(recital, PARTIES);
    expect(removedLines).toHaveLength(0);
    expect(text).toContain(`${PAID_PRO_HARDENING_CLIENT} ("Client")`);
  });

  it("does not remove party names in execution blocks", () => {
    const exec = [
      "1. Term.",
      "Twelve months.",
      "",
      "IN WITNESS WHEREOF",
      `CLIENT: ${PAID_PRO_HARDENING_CLIENT}`,
      `SERVICE PROVIDER: ${PAID_PRO_HARDENING_PROVIDER}`,
    ].join("\n");
    const { removedLines } = removeOrphanPartyLinesBeforeExecutionTail(exec, PARTIES);
    expect(removedLines).toHaveLength(0);
  });

  it("does not remove party names in notice fields", () => {
    const notices = [
      "10. Notices.",
      `Client notices: ${PAID_PRO_HARDENING_CLIENT}, 100 Main St.`,
      `Provider notices: ${PAID_PRO_HARDENING_PROVIDER}, 200 Oak Ave.`,
      "",
      "IN WITNESS WHEREOF",
      `CLIENT: ${PAID_PRO_HARDENING_CLIENT}`,
    ].join("\n");
    const { removedLines } = removeOrphanPartyLinesBeforeExecutionTail(notices, PARTIES);
    expect(removedLines).toHaveLength(0);
  });

});
