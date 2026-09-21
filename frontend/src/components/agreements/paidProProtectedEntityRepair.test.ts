import { describe, expect, it } from "vitest";
import { repairProtectedLegalEntitySuffixes } from "./paidProProtectedEntityRepair";

function twice(
  text: string,
  parties: readonly string[],
  intake?: string | null,
): { first: ReturnType<typeof repairProtectedLegalEntitySuffixes>; second: ReturnType<typeof repairProtectedLegalEntitySuffixes> } {
  const first = repairProtectedLegalEntitySuffixes(text, parties, intake ?? text);
  const second = repairProtectedLegalEntitySuffixes(first.text, parties, intake ?? text);
  return { first, second };
}

describe("repairProtectedLegalEntitySuffixes — customer-content integrity", () => {
  it("does not rewrite emails or ordinary wording when Cedar LLC is a party", () => {
    const cedar = "Cedar LLC";
    const other = "Maple Partners Inc.";
    const body = [
      `This Agreement is between ${cedar} ("Consultant") and ${other} ("Client").`,
      "Notices: legal@cedar.com",
      "Cedar trees are excluded from scope.",
      `Visit https://cedar.com/terms or www.cedar.com for policies.`,
    ].join("\n");
    const { first, second } = twice(body, [cedar, other]);
    expect(first.text).toContain('Cedar LLC ("Consultant")');
    expect(first.text).toContain("legal@cedar.com");
    expect(first.text).not.toContain("legal@Cedar LLC.com");
    expect(first.text).toContain("Cedar trees are excluded from scope.");
    expect(first.text).not.toContain("Cedar LLC trees are excluded from scope.");
    expect(first.text).toContain("https://cedar.com/terms");
    expect(first.text).toContain("www.cedar.com");
    expect(second.text).toBe(first.text);
  });

  it("does not splice a shorter party's suffix into a longer overlapping party name", () => {
    const alphaLlc = "Alpha LLC";
    const alphaConsulting = "Alpha Consulting LLC";
    const body = [
      `This Agreement is between ${alphaLlc} ("Client") and ${alphaConsulting} ("Advisor").`,
      `${alphaConsulting} shall provide independent advice.`,
      "Alpha Consulting LLC keeps its own name.",
    ].join("\n");
    const { first, second } = twice(body, [alphaLlc, alphaConsulting]);
    expect(first.text).toContain('Alpha LLC ("Client")');
    expect(first.text).toContain('Alpha Consulting LLC ("Advisor")');
    expect(first.text).toContain("Alpha Consulting LLC shall provide independent advice.");
    expect(first.text).not.toContain("Alpha LLC Consulting LLC");
    expect(second.text).toBe(first.text);
  });

  it("does not guess when parties share a base name but have different suffixes", () => {
    const harborLlc = "Harbor LLC";
    const harborInc = "Harbor Inc.";
    const body = [
      `This Agreement is between ${harborLlc} ("Consultant") and ${harborInc} ("Client").`,
      'Harbor ("Ambiguous") is not uniquely either party.',
      `${harborLlc} shall perform the services.`,
      `${harborInc} shall pay the fees.`,
    ].join("\n");
    const { first, second } = twice(body, [harborLlc, harborInc]);
    expect(first.text).toContain('Harbor LLC ("Consultant")');
    expect(first.text).toContain('Harbor Inc. ("Client")');
    expect(first.text).toContain('Harbor ("Ambiguous") is not uniquely either party.');
    expect(first.text).not.toMatch(/Harbor LLC Inc/);
    expect(first.text).not.toMatch(/Harbor Inc\. LLC/);
    expect(first.text).toContain(`${harborLlc} shall perform the services.`);
    expect(first.text).toContain(`${harborInc} shall pay the fees.`);
    expect(second.text).toBe(first.text);
  });

  it("still restores a unique multi-word truncated party before delivers and in role appositives", () => {
    const lumen = "Lumen Bioinformatics Inc.";
    const thalassa = "Thalassa Data Systems LLC";
    const coastal = "Coastal Meridian Analytics LLC";
    const vanguard = "Vanguard Regulatory Sciences Ltd.";
    const body = [
      `The parties are ${lumen} (Platform Developer), ${thalassa} (Data Infrastructure Provider), Coastal Meridian Analytics (Analytics Integrator), and ${vanguard} (Regulatory Compliance Advisor).`,
      `Coastal Meridian Analytics delivers analytics modules.`,
    ].join("\n");
    const { first, second } = twice(body, [lumen, thalassa, coastal, vanguard]);
    expect(first.repairs).toBeGreaterThan(0);
    expect(first.text).toContain(`${coastal} (Analytics Integrator)`);
    expect(first.text).toContain(`${coastal} delivers`);
    expect(first.text).not.toMatch(/Coastal Meridian Analytics \(Analytics Integrator\)/);
    expect(second.text).toBe(first.text);
  });

  it("still restores ClearSpring Distribution LLC in opening, possessive, and trailing-period truncation", () => {
    const stone = "Stonebridge Wellness LLC";
    const nova = "NovaPath Learning Inc.";
    const clear = "ClearSpring Distribution LLC";
    const body = [
      `This Agreement is entered into by and among ${stone} ("Content Owner / Licensor"), ${nova} ("Platform Adapter / Host"), and ClearSpring Distribution ("Distributor").`,
      `${stone}'s authorized signer is Sandra Wells. ${nova}'s authorized signer is Caleb Price. ClearSpring Distribution 's authorized signer is Maya Coleman.`,
      `Subscription revenue is split 20% to ClearSpring Distribution .`,
    ].join("\n");
    const { first, second } = twice(body, [stone, nova, clear]);
    expect(first.text).toContain(`${clear} ("Distributor")`);
    expect(first.text).toContain(`${clear}'s authorized signer is Maya Coleman`);
    expect(first.text).toContain(`20% to ${clear}.`);
    expect(second.text).toBe(first.text);
  });

  it("leaves an already-suffixed unique party unchanged (idempotent)", () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const body = `This Services Agreement is entered into by and between ${harbor} ("Service Provider") and ${ironvale} ("Client").`;
    const { first, second } = twice(body, [harbor, ironvale]);
    expect(first.text).toBe(body);
    expect(second.text).toBe(body);
    expect(first.text).not.toMatch(/Ironvale Manufacturing Inc\. Inc\./);
  });
});

describe("repairProtectedLegalEntitySuffixes — current document emails vs original intake", () => {
  it("keeps an email that appears only in the current document", () => {
    const cedar = "Cedar Ridge Advisors LLC";
    const maple = "Maple Partners Inc.";
    const intake = [
      `Draft a Delaware consulting agreement between ${cedar} and ${maple}.`,
      "Notices will be provided later.",
    ].join("\n");
    const document = [
      `This Agreement is between ${cedar} ("Consultant") and ${maple} ("Client").`,
      `If to ${cedar}: notices@cedar-ridge.example`,
      `If to ${maple}: counsel@maplepartners.example`,
    ].join("\n");
    const { first, second } = twice(document, [cedar, maple], intake);
    expect(first.text).toBe(document);
    expect(second.text).toBe(document);
  });

  it("preserves a revised email that differs from intake", () => {
    const oak = "Oak Street Holdings LLC";
    const pine = "Pine Creek Manufacturing Inc.";
    const intake = [
      `Parties: ${oak} (Client) and ${pine} (Supplier).`,
      "Notices: legal@old-company.com",
    ].join("\n");
    const document = [
      `This Agreement is between ${oak} ("Client") and ${pine} ("Supplier").`,
      `Notices to ${oak}: legal@new-company.com`,
      `Notices to ${pine}: purchasing@pine-creek.example`,
    ].join("\n");
    const { first, second } = twice(document, [oak, pine], intake);
    expect(first.text).toBe(document);
    expect(second.text).toBe(document);
  });

  it("preserves distinct party addresses including plus-addressing and subdomains", () => {
    const stone = "Stonebridge Wellness LLC";
    const nova = "NovaPath Learning Inc.";
    const clear = "ClearSpring Distribution LLC";
    const intake = [
      `Three-party Oklahoma license among ${stone}, ${nova}, and ${clear}.`,
      "Use placeholder notices until the parties confirm addresses.",
    ].join("\n");
    const document = [
      `This Agreement is among ${stone} ("Licensor"), ${nova} ("Platform"), and ${clear} ("Distributor").`,
      `If to ${stone}: sandra+notices@mail.stonebridge.example`,
      `If to ${nova}: legal@ops.novapath.example`,
      `If to ${clear}: billing+ok@clearspring.example`,
    ].join("\n");
    const { first, second } = twice(document, [stone, nova, clear], intake);
    expect(first.text).toBe(document);
    expect(second.text).toBe(document);
  });

  it("does not reinsert an intake email that the current document removed", () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const intake = [
      `Delaware consulting between ${harbor} and ${ironvale}.`,
      "Notices: legal@old-company.com",
      "Also: jordan.hale@ironvale.example",
    ].join("\n");
    const document = [
      `This Agreement is between ${harbor} ("Consultant") and ${ironvale} ("Client").`,
      `If to ${harbor}: maya.chen@harborpeak.example`,
      `If to ${ironvale}:`,
      ironvale,
    ].join("\n");
    const { first, second } = twice(document, [harbor, ironvale], intake);
    expect(first.text).toBe(document);
    expect(second.text).toBe(document);
  });
});
