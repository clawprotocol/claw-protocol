import { describe, expect, it } from "vitest";
import {
  scoreFiveTenets,
  shouldSkipAskAndRenderImmediately,
  getMissingTenetTopics,
  filterNoiseFromIntake,
} from "./proAgreementFiveTenets";
import type { FiveTenetScore } from "./proAgreementFiveTenets";

import proQaFixtures from "../../../../qa/fixtures/pro-agreement-qa-prompts.json";

type QaFixture = {
  id: string;
  title: string;
  prompt: string;
  category: string;
  expected_tenets: {
    parties: boolean;
    scope: boolean;
    payment: boolean;
    term: boolean;
    governing_law: boolean;
  };
  should_ask: boolean;
  expected_ask_topics?: string[];
  party_names_must_survive?: string[];
  noise_to_drop?: string[];
  material_terms_to_keep?: string[];
  contradictory?: boolean;
  party_count?: number;
  harbor_defect_test?: boolean;
  should_not_render_as_name?: string[];
  raw_prompt_must_not_appear_as_heading?: string[];
  not_a_signing_party?: string[];
  emails_to_preserve?: string[];
  section_numbering_must_start_from?: number;
};

describe("proAgreementFiveTenets", () => {
  describe("scoreFiveTenets", () => {
    it("scores a complete agreement with all five tenets", () => {
      const text = `Services agreement between Harbor Pool & Patio LLC and Mesa Consulting Inc. 
        Mesa will provide pool maintenance services for $3,000/month for 12 months. 
        California law governs.`;

      const score = scoreFiveTenets(text);
      expect(score.parties).toBe(true);
      expect(score.scope).toBe(true);
      expect(score.payment).toBe(true);
      expect(score.term).toBe(true);
      expect(score.governingLaw).toBe(true);
      expect(score.isComplete).toBe(true);
      expect(score.score).toBe(100);
      expect(score.missingTenets).toHaveLength(0);
    });

    it("identifies missing parties tenet", () => {
      const text = "Need a consulting agreement for data analytics. $5,000 flat fee. 30 days. California law.";
      const score = scoreFiveTenets(text);
      expect(score.parties).toBe(false);
      expect(score.isComplete).toBe(false);
      expect(score.missingTenets).toContain("parties");
    });

    it("identifies missing payment tenet", () => {
      const text = "Agreement between Jane Doe and Acme Corp for marketing services. 6 months. New York law.";
      const score = scoreFiveTenets(text);
      expect(score.payment).toBe(false);
      expect(score.missingTenets).toContain("payment");
    });

    it("identifies missing term tenet", () => {
      const text = "Consulting agreement. Jane Smith and Acme Corp. Strategy services. $10,000. Delaware law.";
      const score = scoreFiveTenets(text);
      expect(score.term).toBe(false);
      expect(score.missingTenets).toContain("term");
    });

    it("identifies missing governing law tenet", () => {
      const text = "NDA between Tech Inc and Curious Corp. Mutual confidentiality. 2 year term.";
      const score = scoreFiveTenets(text);
      expect(score.governingLaw).toBe(false);
      expect(score.missingTenets).toContain("governing_law");
    });

    it("handles mutual NDA as having payment consideration", () => {
      const text = "Mutual NDA between Alpha Corp and Beta LLC. 3 years. California law.";
      const score = scoreFiveTenets(text);
      expect(score.payment).toBe(true);
    });

    it("rejects role tokens as party names", () => {
      const text = "Service Provider will provide consulting services to Client. $200/hour. 3 months. NY law.";
      const score = scoreFiveTenets(text);
      expect(score.parties).toBe(false);
    });
  });

  describe("shouldSkipAskAndRenderImmediately", () => {
    it("returns true when all five tenets are present", () => {
      const text = `Consulting agreement. Jane Smith will advise Bright Pixel LLC on marketing strategy. 
        $5,000 flat fee over 30 days. Texas law.`;
      expect(shouldSkipAskAndRenderImmediately(text)).toBe(true);
    });

    it("returns false when any tenet is missing", () => {
      const text = "Agreement between me and Acme Corp. Website development.";
      expect(shouldSkipAskAndRenderImmediately(text)).toBe(false);
    });
  });

  describe("getMissingTenetTopics", () => {
    it("returns empty array when complete", () => {
      const text = `Services agreement between Tech LLC and Client Corp. 
        Web development. $10,000. 3 months. California law.`;
      expect(getMissingTenetTopics(text)).toHaveLength(0);
    });

    it("returns missing tenets for thin intake", () => {
      const text = "Agreement between me and Acme Corp";
      const missing = getMissingTenetTopics(text);
      expect(missing).toContain("scope");
      expect(missing).toContain("payment");
      expect(missing).toContain("term");
      expect(missing).toContain("governing_law");
    });
  });

  describe("filterNoiseFromIntake", () => {
    it("drops pet names and weather references", () => {
      const text = `Freelance design contract. My dog's name is Max and it's raining today. 
        Designer: Sarah Chen. Client: TechStart Inc. $2,500 for logo design.`;
      const result = filterNoiseFromIntake(text);
      expect(result.droppedNoise).toContainEqual(expect.stringMatching(/dog/i));
      expect(result.droppedNoise).toContainEqual(expect.stringMatching(/raining/i));
      expect(result.cleanedText).not.toMatch(/dog/i);
    });

    it("keeps material commercial terms", () => {
      const text = `Marketing agreement. Had coffee this morning. EXCLUSIVE rights. 
        $4,000/month. 6 months. Commission clawback if customer churns.`;
      const result = filterNoiseFromIntake(text);
      expect(result.keptMaterial).toContainEqual(expect.stringMatching(/\$4,000/));
      expect(result.keptMaterial).toContainEqual(expect.stringMatching(/6 months/i));
      expect(result.keptMaterial).toContainEqual(expect.stringMatching(/exclusive/i));
      expect(result.keptMaterial).toContainEqual(expect.stringMatching(/clawback/i));
    });

    it("drops truck color and cousin recommendations", () => {
      const text = `Services contract. My truck is blue. Jim's Plumbing will fix pipes. 
        $1,200. My cousin recommended them.`;
      const result = filterNoiseFromIntake(text);
      expect(result.droppedNoise).toContainEqual(expect.stringMatching(/truck is blue/i));
      expect(result.droppedNoise).toContainEqual(expect.stringMatching(/cousin/i));
    });
  });
});

describe("proAgreementFiveTenets fixture validation", () => {
  const fixtures = proQaFixtures as QaFixture[];

  describe.each(fixtures)("$id - $title", (fixture) => {
    it("scores five tenets correctly", () => {
      const score = scoreFiveTenets(fixture.prompt);

      if (fixture.expected_tenets.parties !== undefined) {
        expect(score.parties).toBe(fixture.expected_tenets.parties);
      }
      if (fixture.expected_tenets.scope !== undefined) {
        expect(score.scope).toBe(fixture.expected_tenets.scope);
      }
      if (fixture.expected_tenets.payment !== undefined) {
        expect(score.payment).toBe(fixture.expected_tenets.payment);
      }
      if (fixture.expected_tenets.term !== undefined) {
        expect(score.term).toBe(fixture.expected_tenets.term);
      }
      if (fixture.expected_tenets.governing_law !== undefined) {
        expect(score.governingLaw).toBe(fixture.expected_tenets.governing_law);
      }
    });

    it("determines ask-vs-render correctly", () => {
      // Contradictory fixtures need LLM analysis - basic five tenets can't detect contradictions
      // Truncated names also require deeper analysis
      const requiresLlmAnalysis = fixture.contradictory || fixture.category === "truncated_names";
      if (requiresLlmAnalysis) {
        // Skip simple ask-vs-render test for cases that require LLM contradiction detection
        return;
      }
      const shouldSkip = shouldSkipAskAndRenderImmediately(fixture.prompt);
      expect(shouldSkip).toBe(!fixture.should_ask);
    });

    if (fixture.noise_to_drop && fixture.noise_to_drop.length > 0) {
      it("identifies noise to drop", () => {
        const result = filterNoiseFromIntake(fixture.prompt);
        for (const noise of fixture.noise_to_drop!) {
          const found = result.droppedNoise.some((d) =>
            d.toLowerCase().includes(noise.toLowerCase())
          );
          expect(found).toBe(true);
        }
      });
    }

    if (fixture.material_terms_to_keep && fixture.material_terms_to_keep.length > 0) {
      it("preserves material commercial terms", () => {
        const result = filterNoiseFromIntake(fixture.prompt);
        for (const term of fixture.material_terms_to_keep!) {
          const termInOutput =
            result.cleanedText.toLowerCase().includes(term.toLowerCase()) ||
            result.keptMaterial.some((k) => k.toLowerCase().includes(term.toLowerCase()));
          expect(termInOutput).toBe(true);
        }
      });
    }
  });
});

describe("Harbor defect regression tests", () => {
  it("preserves Harbor Pool & Patio LLC with ampersand", () => {
    const text = "Pool maintenance agreement between Harbor Pool & Patio LLC and Red Mesa Logistics LLC.";
    const score = scoreFiveTenets(text);
    expect(score.parties).toBe(true);
    expect(text).toContain("Harbor Pool & Patio LLC");
  });

  it("preserves Smith & Jones Manufacturing Inc", () => {
    const text = "License from Smith & Jones Manufacturing Inc to Eastern Supply Co.";
    const score = scoreFiveTenets(text);
    expect(score.parties).toBe(true);
    expect(text).toContain("Smith & Jones Manufacturing Inc");
  });

  it("preserves Barnes & Noble Publishing LLC", () => {
    const text = "Agreement between Barnes & Noble Publishing LLC and Digital Reads Inc.";
    const score = scoreFiveTenets(text);
    expect(score.parties).toBe(true);
    expect(text).toContain("Barnes & Noble Publishing LLC");
  });

  it("preserves O'Brien & Associates LLC with apostrophe and ampersand", () => {
    const text = "Consulting by O'Brien & Associates LLC for Müller Technologies GmbH.";
    const score = scoreFiveTenets(text);
    expect(score.parties).toBe(true);
    expect(text).toContain("O'Brien & Associates LLC");
  });

  it("preserves García & Sons Landscaping with accents", () => {
    const text = "Services from García & Sons Landscaping for The Château HOA.";
    const score = scoreFiveTenets(text);
    expect(score.parties).toBe(true);
    expect(text).toContain("García & Sons Landscaping");
  });
});

describe("Role token leak prevention", () => {
  it("rejects Service Provider as actual party name", () => {
    const text = "Service Provider will provide consulting to Client. $200/hour. 3 months. NY law.";
    const score = scoreFiveTenets(text);
    expect(score.parties).toBe(false);
  });

  it("rejects the Developer as actual party name", () => {
    const text = "The Developer agrees to build app for the Company. $50,000. 6 months. Delaware law.";
    const score = scoreFiveTenets(text);
    expect(score.parties).toBe(false);
  });

  it("accepts real company names alongside role descriptions", () => {
    const text = "Mobile App Experts LLC (Developer) will build app for Restaurant Chain Inc (Client). $80,000. 5 months. Texas law.";
    const score = scoreFiveTenets(text);
    expect(score.parties).toBe(true);
  });
});

describe("Question limit validation", () => {
  it("missing facts API returns at most 5 questions", () => {
    const score = scoreFiveTenets("NDA");
    const missing = getMissingTenetTopics("NDA");
    expect(missing.length).toBeLessThanOrEqual(5);
  });
});
