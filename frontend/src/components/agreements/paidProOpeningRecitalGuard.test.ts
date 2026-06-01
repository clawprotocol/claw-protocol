import { describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  buildCanonicalPaidProServicesOpeningRecital,
  detectPaidProMalformedServicesOpening,
  ensurePaidProServicesAgreementOpening,
  isPaidProOpeningStructurallyValid,
  PAID_PRO_MUTUAL_CONSULTING_TITLE,
  repairPaidProServicesAgreementOpening,
} from "./paidProOpeningRecitalGuard";
import { resolveCanonicalPartyIdentitiesFromIntake } from "./canonicalPartyIdentityResolver";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc";

const INTAKE = [
  "Professional services agreement between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
  "Scope: internal automation tooling and AI-assisted reporting workflows.",
  "Fee $8,500 total with 50% upfront and 50% on completion.",
  "Delaware law governs. Electronic signatures acceptable.",
].join(" ");

const MALFORMED_HEAD = [
  BLUE,
  "1. Scope of Services",
  "Provider shall deliver internal automation tooling and AI-assisted reporting workflows for Client.",
  "2. Fees",
  "Total fee of $8,500 USD: fifty percent (50%) due upfront and fifty percent (50%) due upon completion.",
  "3. Governing Law",
  "This Agreement is governed by the laws of the State of Delaware.",
  "4. Termination",
  "Either Party may terminate for material breach upon written notice.",
  "5. Confidentiality",
  "Each Party shall protect the other Party's confidential information.",
  "6. Electronic Signatures",
  "The Parties agree that electronic signatures are acceptable.",
].join("\n");

function padBody(core: string, minLen = 2_800): string {
  const filler =
    " Additional operative clause text for substance and acceptance gates. ";
  let t = core;
  while (t.length < minLen) t += filler;
  return t;
}

function draftParties(): ParsedDraftShape {
  return {
    title: "Mutual Consulting Agreement",
    parties: [
      { name: BLUE, role: "Client" },
      { name: IRON, role: "Service Provider" },
    ],
  } as ParsedDraftShape;
}

describe("paidProOpeningRecitalGuard", () => {
  it("detects naked party-name header before Section 1", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE, [BLUE, IRON]);
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(detectPaidProMalformedServicesOpening(MALFORMED_HEAD, records)).toBe(true);
  });

  it("repairs malformed head with canonical mutual consulting opening", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE, [BLUE, IRON]);
    const { text, repairs } = repairPaidProServicesAgreementOpening(MALFORMED_HEAD, records);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).not.toMatch(new RegExp(`^${BLUE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n`, "m"));
    expect(text).toContain(PAID_PRO_MUTUAL_CONSULTING_TITLE);
    expect(text).toMatch(/entered\s+into\s+as\s+of/i);
    expect(text).toContain(`${BLUE} ("Client")`);
    expect(text).toMatch(/Iron Vale Systems Inc\.?\s*\(\s*["']Service Provider["']\s*\)/);
    const sec1 = text.search(/^\s*1\.\s+/m);
    const titleIdx = text.indexOf(PAID_PRO_MUTUAL_CONSULTING_TITLE);
    expect(sec1).toBeGreaterThan(titleIdx);
    expect(isPaidProOpeningStructurallyValid(text, records)).toBe(true);
  });

  it("applyAcceptedProCorpusSafeDisplay repairs before downstream surfaces", () => {
    const draft = draftParties();
    const raw = padBody(MALFORMED_HEAD);
    const safe = applyAcceptedProCorpusSafeDisplay(raw, { draft, intakeText: INTAKE });
    expect(safe.text).toContain(PAID_PRO_MUTUAL_CONSULTING_TITLE);
    expect(safe.text).not.toMatch(new RegExp(`^${BLUE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n`, "m"));
    expect(safe.repairs.some((r) => r.startsWith("opening:"))).toBe(true);

    clearPaidProSourceOfTruth();
    establishPaidProSourceOfTruth({
      text: safe.text,
      draft,
      intakeText: INTAKE,
      source: "server_full_draft",
    });
    const sotPlain = getPaidProSourceOfTruthText();
    expect(sotPlain).toMatch(/entered\s+into\s+as\s+of/i);
    expect(sotPlain).toContain(`${BLUE} ("Client")`);

    const review = resolvePaidProReviewRenderPlain({ draft, intakeText: INTAKE });
    const copy = getPaidProDocumentForSurface("copy", { draft, intakeText: INTAKE })?.text ?? "";
    const display = getPaidProDocumentForSurface("display", { draft, intakeText: INTAKE })?.text ?? "";

    for (const label of ["review", "copy", "display"] as const) {
      const surface = label === "review" ? review : label === "copy" ? copy : display;
      const head = surface.slice(0, 1_500);
      expect(head.startsWith(PAID_PRO_MUTUAL_CONSULTING_TITLE), label).toBe(true);
      expect(head).toMatch(/entered\s+into\s+as\s+of/i);
      expect(surface).toContain(`${BLUE} ("Client")`);
      expect(surface).toMatch(/Iron Vale Systems Inc\.?\s*\(\s*["']Service Provider["']\s*\)/);
      const sec1 = surface.search(/^\s*1\.\s+/m);
      const titleIdx = surface.indexOf(PAID_PRO_MUTUAL_CONSULTING_TITLE);
      expect(sec1, label).toBeGreaterThan(titleIdx);
      const firstMeaningful = surface
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .find(Boolean);
      expect(firstMeaningful, label).not.toBe(BLUE);
    }
    clearPaidProSourceOfTruth();
  });

  it("buildCanonicalPaidProServicesOpeningRecital matches required shape", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE, [BLUE, IRON]);
    const block = buildCanonicalPaidProServicesOpeningRecital(records[0]!, records[1]!);
    expect(block).toContain(PAID_PRO_MUTUAL_CONSULTING_TITLE);
    expect(block).toContain('this "Agreement")');
    expect(block).toContain("collectively as the \"Parties.\"");
  });

  it("ensurePaidProServicesAgreementOpening is idempotent on valid corpus", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE, [BLUE, IRON]);
    const repaired = repairPaidProServicesAgreementOpening(MALFORMED_HEAD, records).text;
    const again = ensurePaidProServicesAgreementOpening(repaired, records);
    expect(again.repairs).toHaveLength(0);
    expect(again.text).toBe(repaired);
  });
});
