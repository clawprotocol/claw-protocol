/**
 * Harbor Guest Flywheel Regression Tests
 *
 * Tests for the 2026-08-21 Harbor guest flywheel live failures:
 * 1. Party name truncation: "Harbor Pool & Patio LLC" → "Patio LLC" (ampersand split bug)
 * 2. Prompt leak: numbered headings like "11. Mesa Realty..." appearing in Pro body
 * 3. 45-day clawback missing from extracted commercial terms
 *
 * The demo session save failure (bug #1) is tested in backend tests.
 */

import { describe, it, expect } from "vitest";
import { extractAgreementEntityCandidates } from "./partyPlaceholderDisplay";
import { extractBetweenPartyNameList } from "../components/agreements/partyBetweenParse";
import { extractAgreementParties } from "./extractAgreementParties";
import { stripPremiumInstructionNoiseForDocument } from "../components/agreements/premiumInstructionStrip";
import { extractCommercialProtectiveTerms } from "../components/agreements/commercialProtectiveTermsExtract";

const HARBOR_DUMP = `I run Harbor Pool & Patio LLC, a pool company in Mesa / Phoenix. Mesa Realty Group LLC said they'll send us buyer and listing leads if we pay them 7% after the customer puts down a deposit. Don't count our house accounts or anyone we already did a job for last year. If the job falls through in 45 days they have to give the money back. 12 month deal, exclusive in the Phoenix metro as long as they send a decent number of leads, and they can't poach our customers or call them direct. Arizona law. My dog is named Biscuit and the trucks are teal.`;

describe("Harbor guest flywheel regression tests", () => {
  describe("Bug #2: Party name ampersand split (Harbor Pool & Patio LLC → Patio LLC)", () => {
    it("extractBetweenPartyNameList returns empty for prose without between-clause", () => {
      const between = extractBetweenPartyNameList(HARBOR_DUMP);
      expect(between).toEqual([]);
    });

    it("extractAgreementEntityCandidates preserves full 'Harbor Pool & Patio LLC' name", () => {
      const candidates = extractAgreementEntityCandidates(HARBOR_DUMP);
      expect(candidates).toContain("Harbor Pool & Patio LLC");
      expect(candidates).not.toContain("Patio LLC");
    });

    it("extractAgreementParties preserves full 'Harbor Pool & Patio LLC' name", () => {
      const parties = extractAgreementParties({ intakeText: HARBOR_DUMP });
      expect(parties).toContain("Harbor Pool & Patio LLC");
      expect(parties).not.toContain("Patio LLC");
    });

    it("preserves other ampersand company names", () => {
      const text = "Agreement between Smith & Jones Manufacturing Inc and Eastern Supply Co.";
      const candidates = extractAgreementEntityCandidates(text);
      expect(candidates).toContain("Smith & Jones Manufacturing Inc");
    });
  });

  describe("Bug #3: Prompt leak as numbered sections", () => {
    it("strips high-numbered sections containing informal LLC prose", () => {
      const leakyBody = `1. SERVICES
The Provider will deliver consulting services.

2. PAYMENT
7% commission after deposit.

11. Mesa Realty Group LLC said they'll send us buyer leads.
12. Don't count our house accounts or anyone we already did a job for last year.
13. 12 month deal, exclusive in the Phoenix metro.

3. TERM
12 months from effective date.`;

      const cleaned = stripPremiumInstructionNoiseForDocument(leakyBody);

      expect(cleaned).toContain("1. SERVICES");
      expect(cleaned).toContain("2. PAYMENT");
      expect(cleaned).toContain("3. TERM");
      expect(cleaned).not.toContain("11. Mesa Realty Group LLC said");
      expect(cleaned).not.toContain("12. Don't count");
      expect(cleaned).not.toContain("13. 12 month deal");
    });

    it("strips 'If the job falls through' pattern", () => {
      const leaky = `14. If the job falls through in 45 days they have to give the money back.

This is the actual body.`;

      const cleaned = stripPremiumInstructionNoiseForDocument(leaky);

      expect(cleaned).not.toContain("14. If the job");
      expect(cleaned).toContain("This is the actual body");
    });

    it("strips 'They want/They can' patterns", () => {
      const leaky = `15. They want exclusive in phoenix metro.
16. They can't poach our customers.

Real content here.`;

      const cleaned = stripPremiumInstructionNoiseForDocument(leaky);

      expect(cleaned).not.toContain("15. They want");
      expect(cleaned).not.toContain("16. They can't");
      expect(cleaned).toContain("Real content here");
    });

    it("preserves legitimate high-numbered sections with formal headings", () => {
      const body = `10. NOTICES
All notices shall be in writing.

11. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement.

12. AMENDMENTS
No amendment shall be effective unless in writing.`;

      const cleaned = stripPremiumInstructionNoiseForDocument(body);

      expect(cleaned).toContain("10. NOTICES");
      expect(cleaned).toContain("11. ENTIRE AGREEMENT");
      expect(cleaned).toContain("12. AMENDMENTS");
    });
  });

  describe("Bug #4: 45-day clawback missing from commercial terms", () => {
    it("extracts clawback term from Harbor dump prose", () => {
      const terms = extractCommercialProtectiveTerms(HARBOR_DUMP);
      expect(terms.clawback).toBe(true);
      expect(terms.clawbackText).toMatch(/45\s*days?/i);
    });

    it("extracts exclusivity from Harbor dump", () => {
      const terms = extractCommercialProtectiveTerms(HARBOR_DUMP);
      expect(terms.exclusivity).toBe(true);
      expect(terms.exclusivityText).toMatch(/exclusiv/i);
    });

    it("extracts protected accounts from Harbor dump", () => {
      const terms = extractCommercialProtectiveTerms(HARBOR_DUMP);
      expect(terms.protectedAccounts).toBe(true);
      expect(terms.protectedAccountsText).toMatch(/house\s+accounts/i);
    });

    it("does not extract noise terms (dog, teal)", () => {
      const terms = extractCommercialProtectiveTerms(HARBOR_DUMP);
      const allText = `${terms.exclusivityText} ${terms.clawbackText} ${terms.protectedAccountsText}`;
      expect(allText).not.toMatch(/biscuit/i);
      expect(allText).not.toMatch(/teal/i);
    });
  });
});
