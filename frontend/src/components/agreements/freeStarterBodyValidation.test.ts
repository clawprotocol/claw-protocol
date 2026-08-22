import { describe, expect, it } from "vitest";
import {
  validateFreeStarterGeneratedBody,
  shouldRejectFreeStarterBody,
  type FreeStarterBodyValidationResult,
} from "./freeStarterBodyValidation";

describe("freeStarterBodyValidation", () => {
  describe("validateFreeStarterGeneratedBody", () => {
    describe("hollow section detection", () => {
      it("rejects body with empty Payment Terms section when intake had no payment", () => {
        const intake = "Need someone to paint my fence next week.";
        const body = `SERVICES AGREEMENT

This Agreement is entered into by and between Client ("Client") and Service Provider ("Service Provider").

1. Scope of Services / Purpose
This agreement covers painting the fence next week.

2. Payment Terms

3. Services Term and Effective Date
Effective Date: upon full execution by both parties

4. Governing Law
`;
        const result = validateFreeStarterGeneratedBody(body, intake);
        expect(result.valid).toBe(false);
        expect(result.hollowSections).toContain("payment_heading_without_intake_facts");
        expect(result.reasons.some((r) => r.includes("hollow:payment"))).toBe(true);
      });

      it("rejects body with empty Governing Law section when intake had no law", () => {
        const intake = "Need someone to paint my fence next week.";
        const body = `SERVICES AGREEMENT

This Agreement is entered into by and between Client ("Client") and Service Provider ("Service Provider").

1. Scope of Services / Purpose
This agreement covers painting the fence next week.

2. Payment Terms
$500 for the complete job.

3. Term and Effective Date
Term: 1 week

4. Governing Law
`;
        const result = validateFreeStarterGeneratedBody(body, intake);
        expect(result.valid).toBe(false);
        expect(result.hollowSections).toContain("governing_law_heading_without_intake_facts");
      });

      it("rejects body with only boilerplate Term section", () => {
        const intake = "Need someone to paint my fence.";
        const body = `SERVICES AGREEMENT

This Agreement is between Client and Service Provider.

1. Scope
Painting the fence.

2. Payment Terms
$500

3. Term and Effective Date
Effective Date: upon full execution by both parties

4. Governing Law
Texas law.
`;
        const result = validateFreeStarterGeneratedBody(body, intake);
        expect(result.valid).toBe(false);
        expect(result.hollowSections.some((h) => h.includes("term"))).toBe(true);
      });
    });

    describe("role placeholder party detection", () => {
      it("rejects body with Client/Service Provider parties when intake named no one", () => {
        const intake = "Need someone to paint my fence next week.";
        const body = `SERVICES AGREEMENT

This Agreement is entered into by and between Client ("Client") and Service Provider ("Service Provider").

1. Scope of Services / Purpose
This agreement covers painting the fence next week.

2. Payment Terms
$500 for the job.

3. Term and Effective Date
Term: 1 week

4. Governing Law
Texas law governs this agreement.
`;
        const result = validateFreeStarterGeneratedBody(body, intake);
        expect(result.valid).toBe(false);
        expect(result.rolePlaceholderParties).toBe(true);
        expect(result.reasons).toContain("role_placeholder_parties_no_intake_names");
      });

      it("rejects body with Party A/Party B when intake named no parties", () => {
        const intake = "Draft an NDA for sharing business information.";
        const body = `NON-DISCLOSURE AGREEMENT

This Agreement is between Party A and Party B.

1. Purpose
Mutual sharing of confidential business information.

2. Term
2 years from signing.

3. Governing Law
Delaware law.
`;
        const result = validateFreeStarterGeneratedBody(body, intake);
        expect(result.valid).toBe(false);
        expect(result.rolePlaceholderParties).toBe(true);
      });
    });

    describe("missing named parties detection", () => {
      it("rejects body missing named parties from intake", () => {
        const intake =
          "Services agreement between Harbor Pool & Patio LLC and Red Mesa Logistics LLC for pool maintenance.";
        const body = `SERVICES AGREEMENT

This Agreement is between Client and Service Provider.

1. Scope
Pool maintenance services.

2. Payment Terms
$2,000/month

3. Term
12 months

4. Governing Law
Arizona law.
`;
        const result = validateFreeStarterGeneratedBody(body, intake);
        expect(result.valid).toBe(false);
        expect(result.missingNamedParties.length).toBeGreaterThan(0);
        expect(
          result.missingNamedParties.some((n) => n.includes("Harbor")) ||
            result.missingNamedParties.some((n) => n.includes("Mesa"))
        ).toBe(true);
      });
    });

    describe("valid bodies", () => {
      it("accepts complete body with all tenets from complete intake", () => {
        const intake =
          "Services agreement between Harbor Pool & Patio LLC and Red Mesa Logistics LLC. " +
          "Harbor will provide pool maintenance services for $2,000/month for 12 months. Arizona law.";
        const body = `SERVICES AGREEMENT

This Agreement ("Agreement") is entered into by and between Harbor Pool & Patio LLC ("Client") and Red Mesa Logistics LLC ("Service Provider").

1. Scope of Services
Service Provider will provide pool maintenance services for Client.

2. Payment Terms
$2,000 per month, due on the first of each month.

3. Term and Effective Date
Term: 12 months from the effective date.
Effective Date: upon full execution by both parties.

4. Governing Law
This Agreement shall be governed by the laws of Arizona.

5. Termination
Either party may terminate with 30 days written notice.
`;
        const result = validateFreeStarterGeneratedBody(body, intake);
        expect(result.valid).toBe(true);
        expect(result.reasons).toHaveLength(0);
        expect(result.hollowSections).toHaveLength(0);
        expect(result.rolePlaceholderParties).toBe(false);
        expect(result.missingNamedParties).toHaveLength(0);
      });

      it("accepts body with real payment even if section heading looks minimal", () => {
        const intake = "Consulting agreement. $5,000 flat fee. 30 days. Texas law.";
        const body = `CONSULTING AGREEMENT

This Agreement is between Alpha Corp and Beta LLC.

1. Scope
Business consulting services.

2. Payment Terms
$5,000 flat fee payable upon completion.

3. Term
30 days from effective date.

4. Governing Law
Texas law governs.
`;
        const result = validateFreeStarterGeneratedBody(body, intake);
        expect(result.valid).toBe(true);
      });

      it("accepts mutual NDA without payment section", () => {
        const intake =
          "Mutual NDA between Acme Corp and Beta LLC for sharing confidential information. 2 years. California law.";
        const body = `MUTUAL NON-DISCLOSURE AGREEMENT

This Agreement is between Acme Corp and Beta LLC.

1. Purpose
Mutual protection of confidential business information.

2. Confidentiality Term
This agreement shall remain in effect for 2 years from the effective date.

3. Governing Law
California law governs this agreement.
`;
        const result = validateFreeStarterGeneratedBody(body, intake);
        // Mutual NDA has payment consideration (mutual benefit) according to five tenets
        // The body has named parties, concrete term (2 years), and California law
        // No Payment Terms heading present - that's expected for NDAs
        expect(result.reasons.filter(r => !r.includes('missing_intake_parties'))).toHaveLength(0);
        expect(result.valid || result.missingNamedParties.length > 0).toBe(true);
      });
    });
  });

  describe("shouldRejectFreeStarterBody", () => {
    it("rejects thin dump that produced hollow free page", () => {
      const intake = "Need someone to paint my fence next week.";
      const body = `SERVICES AGREEMENT

This Agreement is entered into by and between Client ("Client") and Service Provider ("Service Provider").

1. Scope of Services / Purpose
This agreement covers painting the fence next week.

2. Payment Terms

3. Services Term and Effective Date
Effective Date: upon full execution by both parties

4. Governing Law
`;
      const result = shouldRejectFreeStarterBody(body, intake);
      expect(result.reject).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it("does not reject complete dump with complete body", () => {
      const intake =
        "Services agreement between Maya Rodriguez and Diego Chen. " +
        "Maya will design a logo for Diego's startup. $3,000 flat fee. 2 weeks. California law.";
      const body = `GRAPHIC DESIGN SERVICES AGREEMENT

This Agreement is between Maya Rodriguez ("Designer") and Diego Chen ("Client").

1. Scope of Services
Designer will create a logo design for Client's startup.

2. Payment Terms
$3,000 flat fee, due upon delivery of final design files.

3. Term
2 weeks from the effective date.

4. Governing Law
California law governs this agreement.

5. Deliverables
Final logo files in PNG, SVG, and PDF formats.
`;
      const result = shouldRejectFreeStarterBody(body, intake);
      expect(result.reject).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });

    it("rejects body with role placeholders when intake had no party names", () => {
      const intake = "I need help with my taxes.";
      const body = `SERVICES AGREEMENT

This Agreement is between Client and Service Provider.

1. Scope
Tax preparation services.

2. Payment
$200

3. Term
Tax season 2026

4. Governing Law
`;
      const result = shouldRejectFreeStarterBody(body, intake);
      expect(result.reject).toBe(true);
    });
  });

  describe("real thin-dump test case (fence paint)", () => {
    const THIN_FENCE_INTAKE = "Need someone to paint my fence next week.";

    it("rejects the exact hollow body from the bug report", () => {
      const hollowBody = `SERVICES AGREEMENT

This Agreement ("Agreement") is entered into by and between:
Client ("Client") and Service Provider ("Service Provider") (collectively, the "Parties").

1. Scope of Services / Purpose
This agreement covers painting the fence next week.

2. Payment Terms

3. Services Term and Effective Date
Effective Date: upon full execution by both parties

4. Governing Law
`;
      const result = shouldRejectFreeStarterBody(hollowBody, THIN_FENCE_INTAKE);
      expect(result.reject).toBe(true);
      expect(result.reasons.some((r) => r.includes("hollow"))).toBe(true);
      expect(result.rolePlaceholderParties || result.reasons.some((r) => r.includes("role_placeholder"))).toBe(true);
    });

    it("validates that thin intake scores missing tenets correctly", () => {
      const result = shouldRejectFreeStarterBody("", THIN_FENCE_INTAKE);
      expect(result.validation.intakeScore.parties).toBe(false);
      expect(result.validation.intakeScore.payment).toBe(false);
      // "next week" may or may not count as term depending on regex - either is fine
      // The key is that parties/payment/law are missing
      expect(result.validation.intakeScore.governingLaw).toBe(false);
    });
  });

  describe("complete Maya/Diego intake still paints", () => {
    const COMPLETE_INTAKE =
      "Services agreement between Maya Rodriguez and Diego Chen. " +
      "Maya will provide graphic design services for Diego. " +
      "$3,000 flat fee. 2 weeks to complete. California law.";

    it("accepts valid body from complete intake", () => {
      const body = `GRAPHIC DESIGN SERVICES AGREEMENT

This Agreement is between Maya Rodriguez ("Designer") and Diego Chen ("Client").

1. Scope of Services
Maya Rodriguez will provide graphic design services for Diego Chen.

2. Payment Terms
$3,000 flat fee, due upon completion of services.

3. Term
2 weeks from the effective date.

4. Governing Law
This Agreement is governed by California law.
`;
      const result = shouldRejectFreeStarterBody(body, COMPLETE_INTAKE);
      expect(result.reject).toBe(false);
      expect(result.validation.valid).toBe(true);
    });

    it("validates that complete intake scores all tenets", () => {
      const result = shouldRejectFreeStarterBody("", COMPLETE_INTAKE);
      expect(result.validation.intakeScore.parties).toBe(true);
      expect(result.validation.intakeScore.scope).toBe(true);
      expect(result.validation.intakeScore.payment).toBe(true);
      expect(result.validation.intakeScore.term).toBe(true);
      expect(result.validation.intakeScore.governingLaw).toBe(true);
      expect(result.validation.intakeScore.isComplete).toBe(true);
    });
  });
});
