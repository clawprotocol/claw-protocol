/**
 * Product-wide: intake→corpus placeholder fill must work for any deal family / party names /
 * jurisdiction — not a single SaaS counsel-prep prompt or account.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyIntakeDraftPlaceholders } from "./applyIntakeDraftPlaceholders";

const ROOT = resolve(__dirname);
const MODULE_SRC = readFileSync(resolve(ROOT, "applyIntakeDraftPlaceholders.ts"), "utf8");
const SAFE_DISPLAY_SRC = readFileSync(resolve(ROOT, "acceptedProCorpusSafeDisplay.ts"), "utf8");
const POLISH_SRC = readFileSync(resolve(ROOT, "polishProAgreementDisplayLayer.ts"), "utf8");

const ACCOUNT_SCOPED_RE =
  /\b(?:orgId|userId|user_id|org_id|accountId|workspaceId|Anthem|Blanchard|047b01af|Genesis Dog|genesisDogsOnly|allowlist|email\s*===)\b/;

const CASE_SPECIFIC_RE =
  /\b(?:ABC LLC|Sample Corp|PixelForge|Northstar Analytics|047b|lawdog\.me\/app\/create)\b/;

describe("applyIntakeDraftPlaceholders universality", () => {
  it("module + wire-in sites have no account- or case-specific branches", () => {
    expect(MODULE_SRC).not.toMatch(ACCOUNT_SCOPED_RE);
    expect(MODULE_SRC).not.toMatch(CASE_SPECIFIC_RE);
    expect(SAFE_DISPLAY_SRC).toContain("applyIntakeDraftPlaceholders");
    expect(POLISH_SRC).toContain("applyIntakeDraftPlaceholders");
    expect(SAFE_DISPLAY_SRC).not.toMatch(ACCOUNT_SCOPED_RE);
  });

  it.each([
    {
      family: "saas",
      intake:
        "Draft a 12-month SaaS subscription agreement between Orion Labs LLC and Contoso Retail Inc for $180k ACV. " +
        "Out of scope: PHI, PCI, children's data, classified information. Governing law: Delaware.",
      body:
        "Between [Your Company Legal Name] (“Provider”) and [Customer Legal Name] (“Customer”).\n" +
        "Customer will not submit to the Service PHI, PCI standards data, classified information, or controlled government data.\n" +
        "Governed by the laws of [State].",
      party0: "Orion Labs LLC",
      party1: "Contoso Retail Inc",
      gov: "Delaware",
    },
    {
      family: "services",
      intake:
        "Draft a 6-week services agreement between Riverbend Design LLC and Harbor Peak Automation Inc for $12,500. Governing law: Texas.",
      body:
        "This Services Agreement is between [Provider Legal Name] and [Client Legal Name].\n" +
        "Governing law: [State].",
      party0: "Riverbend Design LLC",
      party1: "Harbor Peak Automation Inc",
      gov: "Texas",
    },
    {
      family: "nda",
      intake:
        "Draft a mutual NDA between Apex Holdings LP and Meridian Workforce Group LLC covering confidential business information. Governing law: New York.",
      body:
        "This NDA is between [Party A Legal Name] and [Party B Legal Name].\n" +
        "This Agreement is governed by the laws of [State].",
      party0: "Apex Holdings LP",
      party1: "Meridian Workforce Group LLC",
      gov: "New York",
    },
    {
      family: "license",
      intake:
        "Draft a software license agreement between NovaGrid Systems LLC and Prairie Signal Holdings LP for $96,000. Governing law: California.",
      body:
        "Licensor [Your Company Name] grants Licensee [Counterparty Name] a license.\n" +
        "Venue: courts located in [State].",
      party0: "NovaGrid Systems LLC",
      party1: "Prairie Signal Holdings LP",
      gov: "California",
    },
  ])(
    "fills clarification-style brackets for $family intakes (any parties / state)",
    ({ intake, body, party0, party1, gov }) => {
      const { text } = applyIntakeDraftPlaceholders({ text: body, intakeText: intake });
      expect(text).toContain(party0);
      expect(text).toContain(party1);
      expect(text).toContain(gov);
      expect(text).not.toMatch(
        /\[Your Company(?: Legal)? Name\]|\[Customer Legal Name\]|\[Client Legal Name\]|\[Provider Legal Name\]|\[Party [AB] Legal Name\]|\[Counterparty Name\]|\[State\]/i,
      );
      if (/children/i.test(intake)) {
        expect(text).toMatch(/children's data/i);
      }
    },
  );

  it("does not invent parties when intake has no resolvable names", () => {
    const { text, repairs } = applyIntakeDraftPlaceholders({
      text: "Between [Your Company Legal Name] and [Customer Legal Name]. Governing law: [State].",
      intakeText: "Need a contract somehow with vague notes and no legal names.",
    });
    expect(text).toMatch(/\[Your Company Legal Name\]/);
    expect(text).toMatch(/\[Customer Legal Name\]/);
    expect(text).toMatch(/\[State\]/);
    expect(repairs.filter((r) => r.startsWith("intake_placeholder:party"))).toHaveLength(0);
  });
});
