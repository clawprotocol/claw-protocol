import { describe, expect, it } from "vitest";
import {
  intakeExplicitlyRequestsImplementationTitleScope,
  intakeTitleIncludesUnsupportedSpecializedWord,
  reconcileAgreementTitleWithIntakeScope,
  resolveAgreementTitleFromIntakeScope,
} from "./paidProAgreementTitleScope";
import { resolvePaidProServicesAgreementTitle } from "./paidProOpeningRecitalGuard";
import { buildCanonicalPaidProServicesOpeningRecital } from "./paidProOpeningRecitalGuard";
import { resolveCanonicalPartyIdentitiesFromIntake } from "./canonicalPartyIdentityResolver";
import { TEST372_FREE_STACKED_PARTY_INTAKE } from "./paidProTest372FreeStarterIdentityRegression.test";

const GENERIC_CONSULTING_INTAKE = `
Create a services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.
Scope: Strategic business consulting services.
$5,000. Texas law.
`.trim();

const IMPLEMENTATION_INTAKE = `
CRM implementation services between Acme Corp and Beta LLC.
$10,000 fixed fee.
`.trim();

const SOFTWARE_INTAKE = `
Software development services agreement between DevShop LLC and Acme Corp.
Custom web application with API integrations. $50,000.
`.trim();

const REVENUE_SHARE_INTAKE = `
Revenue sharing agreement among three companies: Alpha LLC, Beta LLC, and Gamma LLC.
`.trim();

describe("paidProAgreementTitleScope", () => {
  it("generic consulting prompt does not include Implementation in title", () => {
    const title = resolvePaidProServicesAgreementTitle(GENERIC_CONSULTING_INTAKE);
    expect(title).not.toMatch(/IMPLEMENTATION/i);
    expect(title).toMatch(/CONSULTING SERVICES AGREEMENT/i);
    expect(intakeTitleIncludesUnsupportedSpecializedWord("CONSULTING AND IMPLEMENTATION AGREEMENT", GENERIC_CONSULTING_INTAKE)).toBe(
      true,
    );
  });

  it("Test372 consulting intake uses consulting services title", () => {
    const title = resolvePaidProServicesAgreementTitle(TEST372_FREE_STACKED_PARTY_INTAKE);
    expect(title).not.toMatch(/IMPLEMENTATION/i);
    expect(title).toMatch(/CONSULTING SERVICES AGREEMENT/i);
  });

  it("explicit implementation prompt may include Implementation", () => {
    expect(intakeExplicitlyRequestsImplementationTitleScope(IMPLEMENTATION_INTAKE)).toBe(true);
    const title = resolveAgreementTitleFromIntakeScope(IMPLEMENTATION_INTAKE);
    expect(title.titleUpper).toMatch(/IMPLEMENTATION/i);
  });

  it("explicit software prompt may include Software", () => {
    const title = resolveAgreementTitleFromIntakeScope(SOFTWARE_INTAKE);
    expect(title.titleUpper).toMatch(/SOFTWARE/i);
  });

  it("explicit revenue share prompt may include Revenue Sharing", () => {
    const title = resolveAgreementTitleFromIntakeScope(REVENUE_SHARE_INTAKE);
    expect(title.recitalPhrase).toMatch(/Revenue Sharing Agreement/i);
  });

  it("reconciles contaminated Implementation title for generic consulting intake", () => {
    const reconciled = reconcileAgreementTitleWithIntakeScope(
      "CONSULTING AND IMPLEMENTATION AGREEMENT",
      GENERIC_CONSULTING_INTAKE,
    );
    expect(reconciled.titleUpper).not.toMatch(/IMPLEMENTATION/i);
    expect(reconciled.titleUpper).toMatch(/CONSULTING SERVICES/i);
  });

  it("opening recital uses scope-aligned title phrase", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(GENERIC_CONSULTING_INTAKE, [
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
    ]);
    const opening = buildCanonicalPaidProServicesOpeningRecital(records[0]!, records[1]!, GENERIC_CONSULTING_INTAKE);
    expect(opening).toMatch(/CONSULTING SERVICES AGREEMENT/i);
    expect(opening).not.toMatch(/IMPLEMENTATION/i);
  });
});
