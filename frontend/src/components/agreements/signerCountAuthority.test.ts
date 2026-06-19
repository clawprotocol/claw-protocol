import { describe, expect, it } from "vitest";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolveGeneratedAgreementPartyCount } from "./paidProNPartySignerSetup";
import { TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE } from "./paidProTest371QuadrpartiteRegression.test";
import { TEST372_FREE_STACKED_PARTY_INTAKE } from "./paidProTest372FreeStarterIdentityRegression.test";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";

const TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK = [
  "SERVICES AGREEMENT",
  "",
  "IN WITNESS WHEREOF",
  "",
  "CLIENT:",
  "Blue Canyon Analytics LLC",
  "By: __________________________",
  "",
  "SERVICE PROVIDER:",
  "Harbor Peak Automation LLC",
  "By: __________________________",
  "",
  "PARTY 3:",
  "Decorative Fallback LLC",
  "By: __________________________",
].join("\n");

describe("signerCountAuthority", () => {
  it("resolves signer count to 2 for role-labeled two-party intake", () => {
    const resolution = resolveAuthoritativeSignerCount({
      intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
      draftParties: [
        { name: "Blue Canyon Analytics LLC" },
        { name: "Harbor Peak Automation LLC" },
      ],
      corpusPlain: TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK,
    });
    expect(resolution.count).toBe(2);
    expect(resolution.corpusBlockCount).toBeGreaterThanOrEqual(2);
  });

  it("generated agreement party count ignores decorative third signature block", () => {
    const count = resolveGeneratedAgreementPartyCount({
      intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
      draftParties: [
        { name: "Blue Canyon Analytics LLC" },
        { name: "Harbor Peak Automation LLC" },
        { name: "Decorative Fallback LLC" },
      ],
      corpusPlain: TWO_PARTY_CORPUS_WITH_EXTRA_BLOCK,
    });
    expect(count).toBe(2);
  });

  it("Test371 quadrpartite intake keeps signer count at 4", () => {
    const labeled = labeledPartyLegalEntities(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(labeled).toHaveLength(4);
    const resolution = resolveAuthoritativeSignerCount({
      intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
      draftParties: labeled.map((name) => ({ name })),
    });
    expect(resolution.count).toBe(4);
    expect(resolution.source).toBe("labeled_parties");
  });

  it("coordinator block in intake does not add a labeled signing party", () => {
    const labeled = labeledPartyLegalEntities(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(labeled.some((n) => /Alex Morgan/i.test(n))).toBe(false);
    expect(labeled).toHaveLength(4);
  });
});
