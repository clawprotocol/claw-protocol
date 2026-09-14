import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  buildCanonicalPaidProServicesOpeningRecital,
  detectPaidProMalformedServicesOpening,
  ensurePaidProServicesAgreementOpening,
  isPaidProOpeningStructurallyValid,
  PAID_PRO_SERVICES_TITLE,
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
  beforeEach(() => {
    clearPaidProSourceOfTruth();
  });
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("detects naked party-name header before Section 1", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE, [BLUE, IRON]);
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(detectPaidProMalformedServicesOpening(MALFORMED_HEAD, records)).toBe(true);
  });

  it("repairs malformed head with canonical services opening", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE, [BLUE, IRON]);
    const { text, repairs } = repairPaidProServicesAgreementOpening(MALFORMED_HEAD, records, INTAKE);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text.trim()).not.toMatch(new RegExp(`^${BLUE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n`));
    expect(text).toContain(PAID_PRO_SERVICES_TITLE);
    expect(text).toMatch(/entered\s+into\s+by\s+and\s+between/i);
    expect(text).not.toMatch(/as of the Effective Date/i);
    expect(text).toContain(`${BLUE} ("Client")`);
    expect(text).toMatch(/Iron Vale Systems Inc\.?\s*\(\s*["']Service Provider["']\s*\)/);
    const sec1 = text.search(/^\s*1\.\s+/m);
    const titleIdx = text.indexOf(PAID_PRO_SERVICES_TITLE);
    expect(sec1).toBeGreaterThan(titleIdx);
    expect(isPaidProOpeningStructurallyValid(text, records)).toBe(true);
  });

  it("applyAcceptedProCorpusSafeDisplay repairs before downstream surfaces", () => {
    const draft = draftParties();
    const raw = padBody(MALFORMED_HEAD);
    const safe = applyAcceptedProCorpusSafeDisplay(raw, { draft, intakeText: INTAKE });
    expect(safe.text).toContain(PAID_PRO_SERVICES_TITLE);
    expect(safe.text.trim()).not.toMatch(new RegExp(`^${BLUE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n`));
    expect(safe.repairs.some((r) => r.startsWith("opening:"))).toBe(true);

    clearPaidProSourceOfTruth();
    establishPaidProSourceOfTruth({
      text: safe.text,
      draft,
      intakeText: INTAKE,
      source: "server_full_draft",
    });
    const sotPlain = getPaidProSourceOfTruthText();
    expect(sotPlain).toMatch(/entered\s+into\s+by\s+and\s+between/i);
    expect(sotPlain).not.toMatch(/as of the Effective Date/i);
    expect(sotPlain).toContain(`${BLUE} ("Client")`);

    const review = resolvePaidProReviewRenderPlain({ draft, intakeText: INTAKE });
    const copy = getPaidProDocumentForSurface("copy", { draft, intakeText: INTAKE })?.text ?? "";
    const display = getPaidProDocumentForSurface("display", { draft, intakeText: INTAKE })?.text ?? "";

    for (const label of ["review", "copy", "display"] as const) {
      const surface = label === "review" ? review : label === "copy" ? copy : display;
      const head = surface.slice(0, 1_500);
      expect(head.startsWith(PAID_PRO_SERVICES_TITLE), label).toBe(true);
      expect(head).toMatch(/entered\s+into\s+by\s+and\s+between/i);
      expect(head).not.toMatch(/as of the Effective Date/i);
      expect(surface).toContain(`${BLUE} ("Client")`);
      expect(surface).toMatch(/Iron Vale Systems Inc\.?\s*\(\s*["']Service Provider["']\s*\)/);
      const sec1 = surface.search(/^\s*1\.\s+/m);
      const titleIdx = surface.indexOf(PAID_PRO_SERVICES_TITLE);
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
    const block = buildCanonicalPaidProServicesOpeningRecital(records[0]!, records[1]!, INTAKE);
    expect(block).toContain(PAID_PRO_SERVICES_TITLE);
    expect(block).toContain('this "Agreement")');
    expect(block).toContain("collectively as the \"Parties.\"");
    expect(block).toMatch(/entered into by and between/i);
    expect(block).not.toMatch(/as of the Effective Date/i);
  });

  it("safe display does not invert Harbor Consultant / Ironvale Client", () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const corpus = [
      "CONSULTING SERVICES AGREEMENT",
      "",
      `This Consulting Services Agreement (the "Agreement") is entered into as of October 1, 2026 by and between ${harbor} ("Consultant") and ${ironvale} ("Client").`,
      "",
      "1. PARTIES AND ROLES",
      "Consultant shall perform AI workflow implementation. Client shall pay $48,000.",
      "2. TERM",
      "The initial term is twelve months beginning October 1, 2026.",
    ].join("\n");
    const draft = {
      title: "Consulting Services Agreement",
      parties: [
        { name: harbor, role: "Consultant" },
        { name: ironvale, role: "Client" },
      ],
    } as ParsedDraftShape;
    const intake =
      "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client).";
    const safe = applyAcceptedProCorpusSafeDisplay(padBody(corpus), { draft, intakeText: intake });
    expect(safe.text).toContain(`${harbor} ("Consultant")`);
    expect(safe.text).toMatch(/Ironvale Manufacturing Inc\.?\s*\(\s*"Client"\s*\)/);
    expect(safe.text).not.toContain(`${harbor} ("Client")`);
    expect(safe.text).not.toMatch(/Ironvale Manufacturing Inc\.?\s*\(\s*"Service Provider"\s*\)/);
  });

  it("does not invent an undefined Effective Date when only a term start is supplied", () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const corpus = [
      "CONSULTING SERVICES AGREEMENT",
      "",
      `This Consulting Services Agreement (the "Agreement") is entered into by and between ${harbor} ("Consultant") and ${ironvale} ("Client").`,
      "",
      "1. PARTIES AND ROLES",
      "Consultant shall perform AI workflow implementation.",
      "4. TERM AND DURATION",
      "The initial term is twelve months beginning October 1, 2026.",
    ].join("\n");
    const records = [
      {
        fullLegalName: harbor,
        roleLabel: "Consultant",
        displayAlias: "Harbor Peak",
        signerName: "Maya Chen",
        signerTitle: "Principal",
      },
      {
        fullLegalName: ironvale,
        roleLabel: "Client",
        displayAlias: "Ironvale",
        signerName: "Jordan Hale",
        signerTitle: "Operations Lead",
      },
    ];
    expect(isPaidProOpeningStructurallyValid(padBody(corpus), records)).toBe(true);
    const ensured = ensurePaidProServicesAgreementOpening(padBody(corpus), records);
    expect(ensured.text).toMatch(/entered into by and between/i);
    expect(ensured.text).not.toMatch(/as of the Effective Date/i);
    expect(ensured.text).toMatch(/beginning October 1, 2026/);
  });

  it("does not invent an undefined Effective Date when index-default roles would fail structural checks", () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const corpus = [
      "CONSULTING SERVICES AGREEMENT",
      "",
      `This Consulting Services Agreement (the "Agreement") is entered into by and between ${harbor} ("Consultant") and ${ironvale} ("Client").`,
      "",
      "1. PARTIES AND ROLES",
      "Consultant shall perform AI workflow implementation.",
      "4. TERM AND DURATION",
      "The initial term is twelve months beginning October 1, 2026.",
    ].join("\n");
    const indexDefault = [
      { fullLegalName: harbor, roleLabel: "Client", displayAlias: harbor, signerName: null, signerTitle: null },
      { fullLegalName: ironvale, roleLabel: "Service Provider", displayAlias: ironvale, signerName: null, signerTitle: null },
    ];
    const repaired = repairPaidProServicesAgreementOpening(padBody(corpus), indexDefault);
    expect(repaired.text).toMatch(/entered into by and between/i);
    expect(repaired.text).not.toMatch(/as of the Effective Date/i);
    expect(repaired.text).toMatch(/beginning October 1, 2026/);
    const ensured = ensurePaidProServicesAgreementOpening(padBody(corpus), indexDefault);
    expect(ensured.text).not.toMatch(/as of the Effective Date/i);
  });

  it("keeps a labeled Effective Date and does not invent one from the Harbor stub recital", () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const records = [
      { fullLegalName: harbor, roleLabel: "Consultant", displayAlias: harbor, signerName: null, signerTitle: null },
      { fullLegalName: ironvale, roleLabel: "Client", displayAlias: ironvale, signerName: null, signerTitle: null },
    ];
    const stub = [
      "CONSULTING SERVICES AGREEMENT",
      `This Consulting Services Agreement (the "Agreement") is entered into by and between ${harbor} ("Consultant") and ${ironvale} ("Client").`,
      "1. PARTIES AND ROLES. Consultant is an independent professional services firm.",
      "4. TERM AND DURATION. The initial term is twelve months beginning October 1, 2026.",
    ].join("\n");
    const unlabeled = ensurePaidProServicesAgreementOpening(padBody(stub), records);
    expect(unlabeled.text).toMatch(/entered into by and between/i);
    expect(unlabeled.text).not.toMatch(/as of the Effective Date/i);
    const labeled = [
      "CONSULTING SERVICES AGREEMENT",
      `This Consulting Services Agreement (the "Agreement") is entered into as of October 1, 2026 (the "Effective Date") by and between ${harbor} ("Consultant") and ${ironvale} ("Client").`,
      "1. PARTIES AND ROLES. Consultant is an independent professional services firm.",
      "4. TERM AND DURATION. The initial term is twelve months beginning October 1, 2026.",
    ].join("\n");
    const kept = repairPaidProServicesAgreementOpening(padBody(labeled), records);
    expect(kept.text).toMatch(/October 1, 2026 \(the "Effective Date"\)/);
    expect(kept.text).not.toMatch(/as of the Effective Date by and between/i);
  });

  it("does not invert Harbor Consultant / Ironvale Client before acceptance", () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const records = [
      {
        fullLegalName: harbor,
        roleLabel: "Consultant",
        displayAlias: "Harbor Peak",
        signerName: "Maya Chen",
        signerTitle: "Principal",
      },
      {
        fullLegalName: ironvale,
        roleLabel: "Client",
        displayAlias: "Ironvale",
        signerName: "Jordan Hale",
        signerTitle: "Operations Lead",
      },
    ];
    const corpus = [
      "CONSULTING SERVICES AGREEMENT",
      "",
      `This Consulting Services Agreement (the "Agreement") is entered into as of October 1, 2026 by and between ${harbor} ("Consultant") and ${ironvale} ("Client").`,
      "",
      "1. PARTIES AND ROLES",
      "Consultant is an independent professional services firm.",
    ].join("\n");
    expect(detectPaidProMalformedServicesOpening(corpus, records)).toBe(false);
    const ensured = ensurePaidProServicesAgreementOpening(corpus, records);
    expect(ensured.text).toContain(`${harbor} ("Consultant")`);
    expect(ensured.text).toContain(`${ironvale} ("Client")`);
    expect(ensured.text).not.toContain(`${harbor} ("Client")`);
    expect(ensured.text).not.toContain(`${ironvale} ("Service Provider")`);
  });

  it("does not rewrite Harbor Consultant / Ironvale Client when slots are empty or index-default Client/SP", () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const corpus = [
      "CONSULTING SERVICES AGREEMENT",
      "",
      `This Consulting Services Agreement (the "Agreement") is entered into as of October 1, 2026 by and between ${harbor} ("Consultant") and ${ironvale} ("Client").`,
      "",
      "1. PARTIES AND ROLES",
      "Consultant shall perform AI workflow implementation. Client shall pay $48,000.",
    ].join("\n");
    const emptyRoles = [
      { fullLegalName: harbor, roleLabel: "", displayAlias: harbor, signerName: null, signerTitle: null },
      { fullLegalName: ironvale, roleLabel: "", displayAlias: ironvale, signerName: null, signerTitle: null },
    ];
    const indexDefault = [
      { fullLegalName: harbor, roleLabel: "Client", displayAlias: harbor, signerName: null, signerTitle: null },
      { fullLegalName: ironvale, roleLabel: "Service Provider", displayAlias: ironvale, signerName: null, signerTitle: null },
    ];
    for (const records of [emptyRoles, indexDefault]) {
      expect(detectPaidProMalformedServicesOpening(corpus, records)).toBe(false);
      expect(isPaidProOpeningStructurallyValid(corpus, records)).toBe(true);
      const repaired = repairPaidProServicesAgreementOpening(corpus, records);
      expect(repaired.text).toContain(`${harbor} ("Consultant")`);
      expect(repaired.text).toContain(`${ironvale} ("Client")`);
      expect(repaired.text).not.toContain(`${harbor} ("Client")`);
      expect(repaired.text).not.toContain(`${ironvale} ("Service Provider")`);
    }
    const draft = {
      title: "Consulting Services Agreement",
      parties: [
        { name: harbor, role: "" },
        { name: ironvale, role: "" },
      ],
    } as ParsedDraftShape;
    const safe = applyAcceptedProCorpusSafeDisplay(padBody(corpus), { draft });
    expect(safe.text).toContain(`${harbor} ("Consultant")`);
    expect(safe.text).not.toContain(`${harbor} ("CLIENT")`);
    expect(safe.text).not.toContain(`${harbor} ("Client")`);
  });

  it("ensurePaidProServicesAgreementOpening is idempotent on valid corpus", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE, [BLUE, IRON]);
    const repaired = repairPaidProServicesAgreementOpening(MALFORMED_HEAD, records).text;
    const again = ensurePaidProServicesAgreementOpening(repaired, records);
    expect(again.repairs).toHaveLength(0);
    expect(again.text).toBe(repaired);
  });
});
