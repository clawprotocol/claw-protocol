import { beforeEach, describe, expect, it } from "vitest";
import { detectAgreementFamily } from "./agreementFamilyRouter";
import {
  clearPaidProAgreementFamilyCache,
  resolveAuthoritativePaidProAgreementFamily,
} from "./paidProAgreementFamilyAuthority";

const INTAKE = [
  "Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
  "consulting and implementation services",
  "fixed fee $8,500",
].join(" ");

describe("paidProAgreementFamilyAuthority", () => {
  beforeEach(() => {
    clearPaidProAgreementFamilyCache();
  });

  it("one Paid Pro run returns one cached authoritative family decision", () => {
    const intakeFamily = detectAgreementFamily(INTAKE);
    const fp = "fp-family-test";
    const first = resolveAuthoritativePaidProAgreementFamily({
      intakeText: INTAKE,
      serverFamilyHint: "consulting_agreement",
      traceId: "trace-1",
      sessionGenerationId: "gen-1",
      intakeFingerprint: fp,
    });
    const second = resolveAuthoritativePaidProAgreementFamily({
      intakeText: INTAKE,
      serverFamilyHint: "services_agreement",
      traceId: "trace-1",
      sessionGenerationId: "gen-1",
      intakeFingerprint: fp,
    });
    expect(first.family).toBe(second.family);
    expect(first).toBe(second);
    expect(intakeFamily).toBeTruthy();
  });
});
