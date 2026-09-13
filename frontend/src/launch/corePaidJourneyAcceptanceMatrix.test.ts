import { describe, expect, it } from "vitest";
import { consultingCorpusPaddedSnippet, consultingPositiveSnippet } from "./corePaidJourneyAcceptanceFixtures";
import {
  CORE_PAID_JOURNEY_EXPECTED_FACTS as FACTS,
  CORE_PAID_JOURNEY_REPETITIVE_FILLER_PHRASE,
  articleContainsExpectedFacts,
  articlePresentationIssues,
  articleQualityDefects,
  countRepetitiveFiller,
  describeOperativeArticleCompare,
  operativeArticleFingerprint,
} from "./corePaidJourneyAcceptanceMatrix";

describe("core paid journey article inspectors", () => {
  it("passes a substantive non-padded Harbor=Consultant / Ironvale=Client article", () => {
    const article = consultingPositiveSnippet();
    expect(articleContainsExpectedFacts(article)).toEqual([]);
    expect(articleQualityDefects(article)).toEqual([]);
    expect(articlePresentationIssues(article)).toEqual([]);
  });

  it("treats the 220× operative-detail stub padding as a failing negative case", () => {
    const padded = consultingCorpusPaddedSnippet();
    expect(countRepetitiveFiller(padded)).toBeGreaterThanOrEqual(8);
    expect(padded).toContain(CORE_PAID_JOURNEY_REPETITIVE_FILLER_PHRASE);
    const defects = articleQualityDefects(padded);
    expect(defects.some((d) => d.startsWith("repetitive_filler:"))).toBe(true);
  });

  it("fails party-to-role reversal even when company names and keywords are present", () => {
    const reversed = [
      "CONSULTING SERVICES AGREEMENT",
      `This Agreement is between ${FACTS.parties[0].name} ("Client") and ${FACTS.parties[1].name} ("Service Provider").`,
      "Consultant shall perform AI workflow implementation. Client shall pay $48,000.",
      "The initial term is twelve months beginning October 1, 2026. Delaware law.",
      "Consultant retains ownership of pre-existing tools. Client owns deliverables after payment.",
      `Consultant: ${FACTS.parties[0].name} By: Maya Chen`,
      `Client: ${FACTS.parties[1].name} By: Jordan Hale`,
    ].join("\n\n");
    expect(articleContainsExpectedFacts(reversed)).toContain(
      `party_role:${FACTS.parties[0].name}->Consultant`,
    );
    expect(articleQualityDefects(reversed)).toContain(
      `role_contradiction:${FACTS.parties[0].name}->Client`,
    );
  });

  it("treats document chrome as presentation-only, not an operative mismatch", () => {
    const base = consultingPositiveSnippet();
    const chrome = `Document\nDraft Agreement (non-binding template)\nAgreement locked for signature\nCompleted agreement\n${base}`;
    const compare = describeOperativeArticleCompare("owner", base, "maya", chrome);
    expect(compare.sameOperative).toBe(true);
    expect(compare.presentationOnly).toBe(true);
    const changed = base.replace("twelve months", "six months");
    expect(describeOperativeArticleCompare("owner", base, "changed", changed).sameOperative).toBe(false);
  });

  it("fingerprints operative paper without signature metadata", () => {
    const base = consultingPositiveSnippet();
    const withSigNoise = `${base}\n\nIN WITNESS WHEREOF\nBy: ________________\nName: scratch`;
    expect(operativeArticleFingerprint(base)).toBe(operativeArticleFingerprint(withSigNoise));
    const remapped = base.replace(`${FACTS.parties[0].name} ("Consultant")`, `${FACTS.parties[0].name} ("CLIENT")`);
    expect(operativeArticleFingerprint(base)).not.toBe(operativeArticleFingerprint(remapped));
  });

  it("treats a whitespace-split start date as semantically present and a presentation issue", () => {
    const split = consultingPositiveSnippet().replace("October 1, 2026", "October 1,\n\n2026");
    expect(articleContainsExpectedFacts(split)).not.toContain("startDate");
    expect(articlePresentationIssues(split).some((i) => i.code === "date_line_broken")).toBe(true);
  });
});
