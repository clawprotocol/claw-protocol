/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { applyPaidProRenderPolish } from "./paidProRenderPolish";
import {
  buildPartyEntries,
  countDefinedShortMarksInHead,
  normalizeOpeningRecital,
  polishPaidProAgreementText,
} from "./paidProAgreementPolish";
import {
  resolveAuthoritativePartiesForRecitalPolish,
} from "./paidProPartyNamePreserve";

const IRONCLAD_INTAKE = `Need an agreement between Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC for a joint AI software and infrastructure rollout project.`;

const IRONCLAD_PARTIES = [
  "Ironclad Systems Group LLC",
  "Harborline Data Solutions Inc.",
  "Northwind Automation Partners LLC",
  "Silver Mesa Analytics LP",
  "VertexGrid Technologies LLC",
] as const;

const JUNK_DRAFT_PARTIES = [
  ...IRONCLAD_PARTIES,
  "ownership of Project deliverables",
  "implementation plans",
  "milestone approvals",
  "the Parties",
  "collectively",
  "technical specifications",
  "or other",
];

function ironcladOpeningBody(): string {
  return [
    "CONFIDENTIALITY AND COMMERCIAL PROTECTIONS AGREEMENT",
    "",
    "entered into by and among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.",
    "",
    "1. Scope",
    "The Parties agree to collaborate on the rollout.",
    "ownership of Project deliverables shall vest as stated below.",
    "implementation plans and milestone approvals are attached.",
    "the Parties acknowledge collectively that technical specifications or other terms may apply.",
  ].join("\n");
}

describe("resolveAuthoritativePartiesForRecitalPolish", () => {
  it("returns exactly five intake entities when draft parties include body phrase junk", () => {
    const names = resolveAuthoritativePartiesForRecitalPolish(JUNK_DRAFT_PARTIES, IRONCLAD_INTAKE);
    expect(names).toHaveLength(5);
    expect(names).toEqual([...IRONCLAD_PARTIES]);
  });
});

describe("normalizeOpeningRecital guards", () => {
  it("Ironclad five-party rewrite produces exactly five defined parties in opening", () => {
    const parties = buildPartyEntries(
      resolveAuthoritativePartiesForRecitalPolish(IRONCLAD_PARTIES, IRONCLAD_INTAKE),
    );
    const { text, log } = normalizeOpeningRecital(ironcladOpeningBody(), parties, "high");
    expect(log.applied).toBe(true);
    expect(log.partyCount).toBe(5);
    const opening = text.slice(0, 900);
    expect(opening).toContain("Ironclad Systems Group LLC");
    expect(opening).toContain("VertexGrid Technologies LLC");
    expect(countDefinedShortMarksInHead(opening)).toBe(5);
    expect(opening).not.toContain('("ownership of")');
    expect(opening).not.toContain('("collectively")');
    expect(opening).not.toContain('("the Parties")');
  });

  it("body phrases are not promoted to party definitions when junk draft parties are passed", () => {
    const parties = buildPartyEntries(
      resolveAuthoritativePartiesForRecitalPolish(JUNK_DRAFT_PARTIES, IRONCLAD_INTAKE),
    );
    expect(parties).toHaveLength(5);
    const { text, log } = normalizeOpeningRecital(ironcladOpeningBody(), parties, "high");
    expect(log.partyCount).toBe(5);
    expect(log.partyCount).toBeLessThanOrEqual(5);
    expect(text).not.toMatch(/ownership of Project deliverables \("ownership of"\)/i);
    expect(text).not.toMatch(/collectively \("collectively"\)/i);
  });

  it("already-polished recital is skipped on second pass", () => {
    const parties = buildPartyEntries(
      resolveAuthoritativePartiesForRecitalPolish(IRONCLAD_PARTIES, IRONCLAD_INTAKE),
    );
    const first = normalizeOpeningRecital(ironcladOpeningBody(), parties, "high");
    expect(first.log.applied).toBe(true);
    const second = normalizeOpeningRecital(first.text, parties, "high");
    expect(second.log.applied).toBe(false);
    expect(second.log.reason).toBe("already_polished");
    expect(second.text).toBe(first.text);
  });

  it("signature headings use full legal entities", () => {
    const body = [
      ironcladOpeningBody(),
      "IN WITNESS WHEREOF:",
      "Ironclad",
      "By: ___",
      "Harborline",
      "By: ___",
    ].join("\n");
    const out = polishPaidProAgreementText(body, IRONCLAD_INTAKE, [...IRONCLAD_PARTIES], {
      explicitPartyList: true,
    });
    const sig = out.text.slice(out.text.search(/IN WITNESS WHEREOF/i));
    expect(sig).toContain("Ironclad Systems Group LLC");
    expect(sig).not.toMatch(/\nIronclad\nBy:/);
  });
});

describe("applyPaidProRenderPolish recital party cap", () => {
  it("never logs more recital parties than authoritative intake entities", () => {
    const out = applyPaidProRenderPolish(ironcladOpeningBody(), IRONCLAD_INTAKE, JUNK_DRAFT_PARTIES, {
      surface: "test_junk_parties",
    });
    expect(out.agreementPolish.recital.partyCount).toBeLessThanOrEqual(5);
    if (out.agreementPolish.recital.applied) {
      expect(out.agreementPolish.recital.partyCount).toBe(5);
    }
  });
});
