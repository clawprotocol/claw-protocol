import { describe, expect, it } from "vitest";
import { applyPaidProRenderPolish } from "./paidProRenderPolish";
import {
  preserveFullLegalPartyNames,
  preserveFullLegalPartyNamesInOpeningAndSignatures,
} from "./paidProPartyNamePreserve";
import { repairProtectedLegalEntitySuffixes } from "./paidProProtectedEntityRepair";

const iron = "Ironclad Systems Group LLC";
const harbor = "Harborline Data Solutions Inc.";
const north = "Northwind Automation Partners LLC";
const silver = "Silver Mesa Analytics LP";
const stone = "Stonebridge Wellness LLC";
const nova = "NovaPath Learning Inc.";
const clear = "ClearSpring Distribution LLC";
const oak = "Oak Street Holdings LLC";
const pine = "Pine Creek Manufacturing Inc.";
const wells = "Wells Wells Holdings LLC";
const pineLlc = "Pine Creek LLC";

const fourIntake = `Joint rollout among ${iron}, ${harbor}, ${north}, and ${silver}.`;
const fourParties = [iron, harbor, north, silver];
const threeParties = [stone, nova, clear];
const threeIntake = `Oklahoma license among ${stone}, ${nova}, and ${clear}.`;

function fourBody(): string {
  return [
    `This Agreement is among ${iron} ("Sponsor"), ${harbor} ("Vendor"), ${north} ("Integrator"), and ${silver} ("Analyst").`,
    "Sponsor shall fund the rollout.",
    `If to ${harbor}: maya.bennett@harborlinedata.com`,
    "IN WITNESS WHEREOF, the parties have executed this Agreement.",
    iron,
    "By: _________________________",
    harbor,
    "By: _________________________",
  ].join("\n");
}

function pineBody(): string {
  return [
    `This Agreement is between ${oak} ("Client") and ${pine} ("Service Provider").`,
    "Client shall pay $5,000 upon delivery.",
    `If to ${pine}: purchasing@pine-creek.example`,
    "Client representative: Avery Oak.",
    "Supplier representative: Casey Pine.",
    "1 Oak Street, Wilmington, DE 19801",
    "9 Pine Creek Rd, Wilmington, DE 19802",
    "IN WITNESS WHEREOF, the parties have executed this Agreement.",
    oak,
    "By: _________________________",
    pine,
    "By: _________________________",
  ].join("\n");
}

function lineStarting(text: string, prefix: string): string | undefined {
  return text.split("\n").find((line) => line.startsWith(prefix));
}

describe("company-name integrity — expandShortPartyLabels remainder", () => {
  it("does not expand aliases inside Harborline Data Solutions Inc. on a notice line", () => {
    const input = fourBody();
    const out = preserveFullLegalPartyNames(input, fourParties, fourIntake);
    expect(lineStarting(out, "This Agreement is among ")).toBe(
      `This Agreement is among ${iron} ("Sponsor"), ${harbor} ("Vendor"), ${north} ("Integrator"), and ${silver} ("Analyst").`,
    );
    expect(lineStarting(out, "Sponsor shall fund")).toBe("Sponsor shall fund the rollout.");
    expect(lineStarting(out, `If to ${harbor}`)).toBe(`If to ${harbor}: maya.bennett@harborlinedata.com`);
    expect(lineStarting(out, harbor)).toBe(harbor);
    expect(out).not.toContain("Harborline Data Solutions Inc. Solutions Inc.");
    expect(out).not.toContain("Inc. Solutions Inc");
  });

  it("does not expand aliases inside Pine Creek Manufacturing Inc. on a notice line", () => {
    const input = pineBody();
    const out = preserveFullLegalPartyNames(input, [oak, pine], `Delaware supply between ${oak} and ${pine}.`);
    expect(lineStarting(out, `If to ${pine}`)).toBe(`If to ${pine}: purchasing@pine-creek.example`);
    expect(lineStarting(out, pine)).toBe(pine);
    expect(out).not.toContain("Pine Creek Manufacturing Inc. Manufacturing Inc.");
    expect(out).not.toContain("Inc Manufacturing Inc");
    expect(out).toContain("Client representative: Avery Oak.");
    expect(out).toContain("1 Oak Street, Wilmington, DE 19801");
  });

  it("still expands an unambiguous truncated Harborline reference", () => {
    const input = "This Agreement is among Ironclad, Harborline, and Northwind.";
    const out = preserveFullLegalPartyNamesInOpeningAndSignatures(input, fourParties, fourIntake);
    expect(lineStarting(out, "This Agreement is among ")).toBe(
      `This Agreement is among ${iron}, ${harbor}, and ${north}.`,
    );
  });

  it("keeps Wells Wells Holdings LLC when the repeat is the confirmed name", () => {
    const body = [
      `This Agreement is between ${wells} ("Client") and ${oak} ("Service Provider").`,
      `${wells} shall pay the fee.`,
    ].join("\n");
    const out = preserveFullLegalPartyNames(body, [wells, oak], body);
    expect(lineStarting(out, "This Agreement is between ")).toBe(
      `This Agreement is between ${wells} ("Client") and ${oak} ("Service Provider").`,
    );
    expect(lineStarting(out, `${wells} shall`)).toBe(`${wells} shall pay the fee.`);
  });

  it("does not splice Pine Creek LLC into Pine Creek Manufacturing Inc.", () => {
    const body = [
      `This Agreement is between ${pine} ("Supplier") and ${pineLlc} ("Affiliate").`,
      `${pine} shall ship goods.`,
      `${pineLlc} shall receive notices.`,
    ].join("\n");
    const out = preserveFullLegalPartyNames(body, [pine, pineLlc], body);
    expect(lineStarting(out, `${pine} shall`)).toBe(`${pine} shall ship goods.`);
    expect(lineStarting(out, `${pineLlc} shall`)).toBe(`${pineLlc} shall receive notices.`);
    expect(out).not.toContain("Pine Creek Manufacturing Inc. LLC");
    expect(out).not.toContain("Pine Creek LLC Manufacturing");
  });
});

describe("company-name integrity — review and final render", () => {
  it("keeps Harborline complete through applyPaidProRenderPolish", () => {
    const input = fourBody();
    const first = applyPaidProRenderPolish(input, fourIntake, fourParties, {
      surface: "company_name_integrity_four",
      skipCache: true,
    });
    const second = applyPaidProRenderPolish(first.text, fourIntake, fourParties, {
      surface: "company_name_integrity_four",
      skipCache: true,
    });
    expect(first.text).toContain(`${iron} ("Sponsor")`);
    expect(first.text).toContain(`${harbor} ("Vendor")`);
    expect(first.text).toContain(`${north} ("Integrator")`);
    expect(first.text).toContain(`${silver} ("Analyst")`);
    expect(first.text).toContain("Sponsor shall fund the rollout.");
    expect(lineStarting(first.text, `If to ${harbor}`)).toBe(`If to ${harbor}: maya.bennett@harborlinedata.com`);
    expect(first.text).toMatch(/^Harborline Data Solutions Inc\.$/m);
    expect(first.text).not.toContain("Harborline Data Solutions Inc. Solutions Inc.");
    expect(second.text).toBe(first.text);
  });

  it("keeps Pine Creek complete through applyPaidProRenderPolish", () => {
    const input = pineBody();
    const intake = `Delaware supply between ${oak} and ${pine}.`;
    const first = applyPaidProRenderPolish(input, intake, [oak, pine], {
      surface: "company_name_integrity_pine",
      skipCache: true,
    });
    const second = applyPaidProRenderPolish(first.text, intake, [oak, pine], {
      surface: "company_name_integrity_pine",
      skipCache: true,
    });
    expect(first.text).toContain(`${oak} ("Client")`);
    expect(first.text).toContain("Client shall pay $5,000 upon delivery.");
    expect(lineStarting(first.text, `If to ${pine}`)).toBe(`If to ${pine}: purchasing@pine-creek.example`);
    expect(first.text).toMatch(/^Pine Creek Manufacturing Inc\.$/m);
    expect(first.text).not.toContain("Pine Creek Manufacturing Inc. Manufacturing Inc.");
    expect(first.text).not.toContain("Inc Manufacturing Inc");
    expect(first.text).toContain("Client representative: Avery Oak.");
    expect(first.text).toContain("1 Oak Street, Wilmington, DE 19801");
    expect(first.text).toContain("purchasing@pine-creek.example");
    expect(second.text).toBe(first.text);
  });

  it("keeps three-party names and roles, including reordered party records", () => {
    const input = [
      `This Agreement is among ${stone} ("Licensor"), ${nova} ("Platform"), and ${clear} ("Distributor").`,
      "Licensor shall grant a nonexclusive license to the Platform.",
      `If to ${stone}: notices@stonebridge.example`,
    ].join("\n");
    const opts = { surface: "company_name_integrity_three", skipCache: true as const };
    const first = applyPaidProRenderPolish(input, threeIntake, threeParties, opts);
    const reordered = applyPaidProRenderPolish(input, threeIntake, [clear, stone, nova], opts);
    expect(lineStarting(first.text, "This Agreement is among ")).toContain(`${stone} ("Licensor")`);
    expect(first.text).toContain(`${nova} ("Platform")`);
    expect(first.text).toContain(`${clear} ("Distributor")`);
    expect(first.text).toContain("Licensor shall grant a nonexclusive license to the Platform.");
    expect(lineStarting(first.text, `If to ${stone}`)).toBe(`If to ${stone}: notices@stonebridge.example`);
    expect(lineStarting(reordered.text, "This Agreement is among ")).toBe(
      lineStarting(first.text, "This Agreement is among "),
    );
    expect(reordered.text).toContain(`${stone} ("Licensor")`);
    expect(reordered.text).not.toContain(`${stone} ("Distributor")`);
  });

  it("review/final name repair path does not duplicate Harborline or Pine Creek", () => {
    const fourSuffix = repairProtectedLegalEntitySuffixes(fourBody(), fourParties, fourIntake).text;
    const four = preserveFullLegalPartyNamesInOpeningAndSignatures(fourSuffix, fourParties, fourIntake);
    expect(lineStarting(four, "This Agreement is among ")).toBe(
      `This Agreement is among ${iron} ("Sponsor"), ${harbor} ("Vendor"), ${north} ("Integrator"), and ${silver} ("Analyst").`,
    );
    expect(lineStarting(four, `If to ${harbor}`)).toBe(`If to ${harbor}: maya.bennett@harborlinedata.com`);
    expect(four).not.toContain("Harborline Data Solutions Inc. Solutions Inc.");

    const pineIntake = `Delaware supply between ${oak} and ${pine}.`;
    const twoSuffix = repairProtectedLegalEntitySuffixes(pineBody(), [oak, pine], pineIntake).text;
    const two = preserveFullLegalPartyNamesInOpeningAndSignatures(twoSuffix, [oak, pine], pineIntake);
    expect(lineStarting(two, `If to ${pine}`)).toBe(`If to ${pine}: purchasing@pine-creek.example`);
    expect(two).not.toContain("Pine Creek Manufacturing Inc. Manufacturing Inc.");
    expect(lineStarting(two, "Client representative: ")).toBe("Client representative: Avery Oak.");
  });

  it("suffix restore still completes a truncated Harborline Data Solutions reference", () => {
    const truncated = [
      `This Agreement is among ${iron} ("Sponsor"), Harborline Data Solutions ("Vendor"), ${north} ("Integrator"), and ${silver} ("Analyst").`,
      "Harborline Data Solutions shall host the platform.",
    ].join("\n");
    const { text, repairs } = repairProtectedLegalEntitySuffixes(truncated, fourParties, fourIntake);
    expect(repairs).toBeGreaterThan(0);
    expect(lineStarting(text, "This Agreement is among ")).toBe(
      `This Agreement is among ${iron} ("Sponsor"), ${harbor} ("Vendor"), ${north} ("Integrator"), and ${silver} ("Analyst").`,
    );
    expect(lineStarting(text, `${harbor} shall`)).toBe(`${harbor} shall host the platform.`);
    expect(text).not.toContain("Harborline Data Solutions Inc. Solutions Inc.");
  });
});
