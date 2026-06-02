import { afterEach, describe, expect, it } from "vitest";
import {
  resolveCanonicalPartyIdentitiesFromIntake,
  resolveCanonicalPartyIdentitiesFromSources,
} from "./canonicalPartyIdentityResolver";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const INTAKE =
  `Create a mutual consulting agreement between ${PAID_PRO_HARDENING_CLIENT} (Client) and ${PAID_PRO_HARDENING_PROVIDER} (Service Provider).`;

const ACCEPTED = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  `This Agreement is between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
  "",
  "1. SCOPE OF SERVICES. Provider delivers services.",
  "6. INDEPENDENT CONTRACTOR AND ACCESS. Service Provider is an independent contractor.",
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  PAID_PRO_HARDENING_CLIENT,
  "By: __________________________",
  "",
  "SERVICE PROVIDER:",
  PAID_PRO_HARDENING_PROVIDER,
  "By: __________________________",
].join("\n");

describe("paidPro canonical party extraction guards", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("parses intake between-clause parties with role parentheticals", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE, [
      PAID_PRO_HARDENING_CLIENT,
      PAID_PRO_HARDENING_PROVIDER,
    ]);
    expect(records.length).toBe(2);
  });

  it("rejects section-heading-prefixed and fused multi-party candidates from generated body", () => {
    const pollutedBody = [
      ACCEPTED,
      "",
      `INDEPENDENT CONTRACTOR AND ACCESS ${PAID_PRO_HARDENING_PROVIDER}`,
      `Client. ${PAID_PRO_HARDENING_CLIENT} ${PAID_PRO_HARDENING_PROVIDER} Analytics LLC`,
    ].join("\n");
    const records = resolveCanonicalPartyIdentitiesFromSources({
      rawIntake: INTAKE,
      generatedBody: pollutedBody,
      starterNames: [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
    });
    const names = records.map((r) => r.fullLegalName);
    expect(names.some((n) => n.includes("Blue Canyon"))).toBe(true);
    expect(names.some((n) => n.match(/Iron Vale/i))).toBe(true);
    expect(names.some((n) => /INDEPENDENT CONTRACTOR AND ACCESS/i.test(n))).toBe(false);
    expect(names.some((n) => /^Client\./i.test(n))).toBe(false);
    expect(names.some((n) => n.includes("Analytics LLC") && n.includes("Iron Vale"))).toBe(false);
  });

  it("uses accepted SoT recital map instead of polluted generated-body extraction", () => {
    const fixture = loadPaidProHardeningFixture("freeProQaTemplateATest204");
    const { acceptedText } = armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const polluted = [
      acceptedText,
      `INDEPENDENT CONTRACTOR AND ACCESS ${PAID_PRO_HARDENING_PROVIDER}`,
      `Client. ${PAID_PRO_HARDENING_CLIENT} ${PAID_PRO_HARDENING_PROVIDER} Analytics LLC`,
    ].join("\n");
    const records = resolveCanonicalPartyIdentitiesFromSources({
      rawIntake: fixture.intakeText,
      generatedBody: polluted,
      starterNames: [PAID_PRO_HARDENING_PROVIDER, PAID_PRO_HARDENING_CLIENT],
    });
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records.find((r) => r.roleLabel === "Client")?.fullLegalName).toContain("Blue Canyon");
    expect(records.find((r) => r.roleLabel === "Service Provider")?.fullLegalName).toMatch(/Iron Vale/);
    expect(records.some((r) => /INDEPENDENT CONTRACTOR/i.test(r.fullLegalName))).toBe(false);
  });
});
