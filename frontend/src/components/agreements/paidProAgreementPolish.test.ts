import { describe, expect, it } from "vitest";
import { finalizeUserVisibleAgreementPlainText } from "./agreementTemplatePlaceholderSafety";
import { applyPaidProRenderPolish } from "./paidProRenderPolish";
import {
  applyEnterpriseClausePolish,
  assessPartyExtractionConfidence,
  buildPartyEntries,
  definedShortNameFromLegalEntity,
  normalizeOpeningRecital,
  polishPaidProAgreementText,
} from "./paidProAgreementPolish";

const IRONCLAD_INTAKE = `Need an agreement between Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC for a joint AI software and infrastructure rollout project.

* Ethan Cole — CEO at Ironclad — ethan.cole@ironcladsg.com
* Maya Bennett — CTO at Harborline — maya.bennett@harborlinedata.com
* Lucas Reed — Managing Partner at Northwind — lucas.reed@northwindap.io
* Olivia Hart — Ops Director at Silver Mesa — olivia.hart@silvermesaanalytics.com
* Adrian Vale — President at VertexGrid — adrian.vale@vertexgridtech.com`;

const IRONCLAD_PARTIES = [
  "Ironclad Systems Group LLC",
  "Harborline Data Solutions Inc.",
  "Northwind Automation Partners LLC",
  "Silver Mesa Analytics LP",
  "VertexGrid Technologies LLC",
] as const;

const IRONCLAD_EMAILS = [
  "ethan.cole@ironcladsg.com",
  "maya.bennett@harborlinedata.com",
  "lucas.reed@northwindap.io",
  "olivia.hart@silvermesaanalytics.com",
  "adrian.vale@vertexgridtech.com",
] as const;

const TWO_PARTY = ["Acme Widgets LLC", "Beta Supply Inc."] as const;

function pad(core: string, len = 22_000): string {
  const filler = "\n\nThe parties agree to cooperate in good faith. ".repeat(350);
  let t = core;
  while (t.length < len) t += filler;
  return t;
}

describe("definedShortNameFromLegalEntity", () => {
  it("derives trade names for multi-party entities", () => {
    expect(definedShortNameFromLegalEntity("Ironclad Systems Group LLC")).toBe("Ironclad");
    expect(definedShortNameFromLegalEntity("Silver Mesa Analytics LP")).toBe("Silver Mesa");
    expect(definedShortNameFromLegalEntity("Harborline Data Solutions Inc.")).toBe("Harborline");
  });
});

describe("normalizeOpeningRecital", () => {
  it("rewrites short-name recital with full legal entities and defined short names", () => {
    const parties = buildPartyEntries(IRONCLAD_PARTIES);
    const body =
      "CONFIDENTIALITY AND COMMERCIAL PROTECTIONS AGREEMENT\n\nentered into by and among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.";
    const { text, log } = normalizeOpeningRecital(body, parties, "high");
    expect(log.applied).toBe(true);
    expect(text).toContain('Ironclad Systems Group LLC (“Ironclad”)');
    expect(text).toContain('VertexGrid Technologies LLC (“VertexGrid”)');
    expect(text).toContain("by and among");
    expect(text).not.toMatch(/among Ironclad, Harborline, Northwind/i);
  });

  it("uses between for two-party agreements", () => {
    const parties = buildPartyEntries(TWO_PARTY);
    const body = "SERVICES AGREEMENT\n\nentered into by and between Acme, and Beta.";
    const { text } = normalizeOpeningRecital(body, parties, "high");
    expect(text).toMatch(/by and between/i);
    expect(text).not.toMatch(/by and among/i);
    expect(text).toContain('Acme Widgets LLC (“Acme”)');
    expect(text).toContain('Beta Supply Inc. (“Beta”)');
  });

  it("rewrites This Agreement is between opener after a title line", () => {
    const parties = buildPartyEntries(TWO_PARTY);
    const body = "MASTER SERVICES AGREEMENT\n\nThis Agreement is between Acme and Beta.";
    const { text, log } = normalizeOpeningRecital(body, parties, "high");
    expect(log.reason).not.toBe("recital_not_found");
    expect(log.applied).toBe(true);
    expect(text).toContain('Acme Widgets LLC (“Acme”)');
    expect(text).toMatch(/by and between/i);
  });

  it("rewrites This [title] Agreement is entered into by and among abbreviated parties", () => {
    const parties = buildPartyEntries(IRONCLAD_PARTIES);
    const body =
      "CONFIDENTIALITY AND COMMERCIAL PROTECTIONS AGREEMENT\n\nThis Confidentiality and Commercial Protections Agreement is entered into by and among Ironclad, Harborline, and Northwind.";
    const { text, log } = normalizeOpeningRecital(body, parties, "high");
    expect(log.reason).not.toBe("recital_not_found");
    expect(log.applied).toBe(true);
    expect(text).toContain('Ironclad Systems Group LLC (“Ironclad”)');
  });

  it("leaves recital untouched when party confidence is low", () => {
    const parties = buildPartyEntries(["Foo", "Bar"]);
    const body = "entered into by and among Foo and Bar.";
    const { text, log } = normalizeOpeningRecital(body, parties, "low");
    expect(log.applied).toBe(false);
    expect(text).toBe(body);
  });

  it("does not duplicate suffixes when recital already has full legal names", () => {
    const parties = buildPartyEntries(IRONCLAD_PARTIES);
    const full = `entered into by and among ${IRONCLAD_PARTIES.map((p) => `${p} (“${definedShortNameFromLegalEntity(p)}”)`).join(", ")} (each a “Party” and collectively, the “Parties”).`;
    const { text, log } = normalizeOpeningRecital(full, parties, "high");
    expect(log.applied).toBe(false);
    expect(text).not.toMatch(/LLC LLC|Inc\. Inc\./);
  });
});

describe("polishPaidProAgreementText", () => {
  it("Ironclad five-party: recital, signatures, emails, enterprise polish", () => {
    const body = pad(
      [
        "CONFIDENTIALITY AND COMMERCIAL PROTECTIONS AGREEMENT",
        "entered into by and among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.",
        "TERM. The Agreement begins on the effective date of the last signature.",
        "SERVICE AVAILABILITY. Provider will use commercially reasonable efforts to maintain platform availability.",
        "DISPUTES. Parties will negotiate in good faith before litigation.",
        "TERMINATION. Provisions that by their nature should survive termination remain in effect.",
        "KEY CONTACTS",
        ...IRONCLAD_PARTIES.map((p, i) => `${p}\nEmail: [EMAIL_${i + 1}]`),
        "IN WITNESS WHEREOF:",
        "Ironclad\nBy: ___",
        "Harborline\nBy: ___",
        "Northwind\nBy: ___",
        "Silver Mesa\nBy: ___",
        "VertexGrid\nBy: ___",
      ].join("\n"),
    );

    const out = applyPaidProRenderPolish(body, IRONCLAD_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "test",
    });

    expect(out.agreementPolish.recital.applied).toBe(true);
    expect(out.agreementPolish.signature.replacedCount).toBeGreaterThanOrEqual(4);
    expect(out.agreementPolish.enterprise.effectiveDateAdded).toBe(true);
    expect(out.agreementPolish.enterprise.disputeWindowAdded).toBe(true);
    expect(out.agreementPolish.enterprise.uptimeTargetAdded).toBe(true);
    expect(out.agreementPolish.enterprise.survivalPolished).toBe(true);
    expect(out.agreementPolish.enterprise.attorneysFeesAdded).toBe(true);

    for (const email of IRONCLAD_EMAILS) {
      expect(out.text).toContain(email);
    }
    expect(out.text).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
    expect(out.text).not.toMatch(/@Ironclad Systems Group LLC/i);
    expect(out.text).toContain("target monthly uptime availability of 99.5%");
    expect(out.text).toContain("fifteen (15) business days");
    expect(out.text).toContain("survive expiration or termination");

    const opening = out.text.slice(0, 1200);
    expect(opening).toContain("Ironclad Systems Group LLC");
    expect(opening).toMatch(/\(.*Ironclad.*\)/);

    expect(out.text).toContain("Ironclad Systems Group LLC");
    const witnessIdx = out.text.search(/IN WITNESS WHEREOF/i);
    if (witnessIdx >= 0) {
      const sig = out.text.slice(witnessIdx);
      expect(sig).toContain("Ironclad Systems Group LLC");
      expect(sig).not.toMatch(/\nIronclad\nBy:/);
    }
  });

  it("does not mutate emails or URLs during short-name safety pass", () => {
    const body = [
      "entered into by and among Ironclad, Harborline, and Northwind.",
      "Contact: ethan.cole@ironcladsg.com",
      "Site: https://ironclad.example/status",
      "IN WITNESS WHEREOF:",
      "Ironclad\nBy: ___",
    ].join("\n");
    const parties = buildPartyEntries([
      "Ironclad Systems Group LLC",
      "Harborline Data Solutions Inc.",
      "Northwind Automation Partners LLC",
    ]);
    const { text } = polishPaidProAgreementText(body, IRONCLAD_INTAKE, [...parties.map((p) => p.full)], {
      explicitPartyList: true,
    });
    expect(text).toContain("ethan.cole@ironcladsg.com");
    expect(text).toContain("https://ironclad.example/status");
    expect(text).not.toMatch(/@Ironclad Systems Group LLC/i);
  });
});

describe("applyEnterpriseClausePolish", () => {
  it("adds explicit survival topics when only implied survival exists", () => {
    const snippet =
      "TERMINATION. Provisions that by their nature should survive termination remain in effect.\n";
    const { log, text } = applyEnterpriseClausePolish(snippet);
    expect(log.survivalPolished).toBe(true);
    expect(text).toContain("payment obligations accrued before termination");
  });

  it("does not add uptime target for non-software agreements", () => {
    const body =
      "Consulting services only. Provider will use commercially reasonable efforts to deliver reports.";
    const { log } = applyEnterpriseClausePolish(body);
    expect(log.uptimeTargetAdded).toBe(false);
  });

  it("does not duplicate effective date, survival, or attorneys fees when present", () => {
    const body = [
      'Effective Date means the date of the last signature below (the "Effective Date").',
      "Disputes: fifteen (15) business days of negotiation before court.",
      "The prevailing party recovers attorneys' fees.",
      "Survival: confidentiality, intellectual property, and indemnification survive termination.",
      "Uptime target monthly availability of 99.5% applies.",
    ].join("\n");
    const { text, log } = applyEnterpriseClausePolish(body);
    expect(log.effectiveDateAdded).toBe(false);
    expect(log.disputeWindowAdded).toBe(false);
    expect(log.attorneysFeesAdded).toBe(false);
    expect(log.uptimeTargetAdded).toBe(false);
    expect((text.match(/Effective Date/gi) || []).length).toBeLessThanOrEqual(3);
  });
});

describe("assessPartyExtractionConfidence", () => {
  it("marks explicit multi-party lists as high confidence", () => {
    const r = assessPartyExtractionConfidence([...IRONCLAD_PARTIES], IRONCLAD_INTAKE, true);
    expect(r.confidence).toBe("high");
  });
});

describe("finalize integration", () => {
  it("keeps operative payment placeholders fatal after full polish", () => {
    const body = [
      "entered into by and among Ironclad, Harborline, Northwind, Silver Mesa, and VertexGrid.",
      "2. PAYMENT\nFees: [INSERT PAYMENT TERMS HERE].",
      "KEY CONTACTS\n[EMAIL_1]\n[EMAIL_2]\n[EMAIL_3]\n[EMAIL_4]\n[EMAIL_5]",
    ].join("\n");
    const fin = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: IRONCLAD_INTAKE,
      partyNames: [...IRONCLAD_PARTIES],
      surface: "test",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remainingFatal.some((t) => /PAYMENT/i.test(t))).toBe(true);
    for (const email of IRONCLAD_EMAILS) {
      expect(fin.text).toContain(email);
    }
  });
});
