import { describe, expect, it } from "vitest";
import { applyNamedPartyFallbackFromIntake, tryInferNamedPartiesFromIntake } from "./intakeNamedPartyFallback";
import { draftHasPlaceholderParties, draftHasPlaceholderFieldsForRecipients } from "./reviewPlaceholderGuard";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { canonicalizeStarterDraftForReview } from "./starterRecipientDraftMerge";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { detectAgreementFamily } from "./agreementFamilyRouter";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false } as const;

function makeSignerIntake(signers: { name: string; email: string }[], description: string): string {
  const lines = [description];
  signers.forEach((s, i) => {
    const label = i === 0 ? "Sender/signer 1" : `Signer ${i + 1}`;
    lines.push(`${label}: ${s.name}, ${s.email}`);
  });
  return lines.join("\n");
}

function emptyDraft(): ParsedDraftShape {
  return {
    title: "",
    jurisdiction: "TBD",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: EMPTY_PAYMENT,
  };
}

describe("tryInferNamedPartiesFromIntake", () => {
  it("infers person and company from employment-style phrasing", () => {
    const raw =
      "Create an employment agreement for John Smith in Acme LLC for $20 an hour starting next Monday in California.";
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out![0].name).toContain("John Smith");
    expect(out![1].name).toMatch(/Acme LLC/i);
  });

  it("extracts 4 explicit signers from signer-line intake", () => {
    const raw = [
      "Consulting agreement with confidentiality provisions.",
      "Sender/signer 1: Anthem Blanchard, anthem@example.com",
      "Signer 2: Sarah Collins, sarah@example.com",
      "Signer 3: Michael Reed, michael@example.com",
      "Signer 4: Jamie Chen, jamie@example.com",
    ].join("\n");
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(4);
    expect(out![0].name).toBe("Anthem Blanchard");
    expect(out![1].name).toBe("Sarah Collins");
    expect(out![2].name).toBe("Michael Reed");
    expect(out![3].name).toBe("Jamie Chen");
  });

  it("extracts emails alongside signer names", () => {
    const raw = [
      "Service agreement",
      "Signer 1: Alice Jones, alice@corp.co",
      "Signer 2: Bob Williams, bob@corp.co",
    ].join("\n");
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out![0].email).toBe("alice@corp.co");
    expect(out![1].email).toBe("bob@corp.co");
  });

  it("handles party/signatory labels", () => {
    const raw = [
      "NDA",
      "Party 1: Jane Doe",
      "Party 2: Corp Industries",
    ].join("\n");
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out![0].name).toBe("Jane Doe");
  });

  it("returns null for intake without explicit signer lines or named patterns", () => {
    const raw = "Draft a simple consulting agreement for my business.";
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).toBeNull();
  });

  it("still matches between-style patterns", () => {
    const raw = "Create an agreement between Alpha Corp and Beta Ltd";
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out![0].name).toBe("Alpha Corp");
    expect(out![1].name).toBe("Beta Ltd");
  });
});

describe("applyNamedPartyFallbackFromIntake", () => {
  it("replaces placeholder parties with extracted signer rows", () => {
    const parsed: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Party A (edit in review)", role: "party" },
        { name: "Party B (edit in review)", role: "party" },
      ],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: EMPTY_PAYMENT,
    };
    const intake = [
      "Consulting agreement",
      "Sender/signer 1: Anthem Blanchard, anthem@test.com",
      "Signer 2: Sarah Collins, sarah@test.com",
      "Signer 3: Michael Reed, michael@test.com",
      "Signer 4: Jamie Chen, jamie@test.com",
    ].join("\n");
    const result = applyNamedPartyFallbackFromIntake(parsed, intake);
    expect(result.parties).toHaveLength(4);
    expect(result.parties![0].name).toBe("Anthem Blanchard");
    expect(result.parties![1].name).toBe("Sarah Collins");
    expect(result.parties![2].name).toBe("Michael Reed");
    expect(result.parties![3].name).toBe("Jamie Chen");
  });

  it("does not replace when parties are already real names", () => {
    const parsed: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Alice Jones", role: "party" },
        { name: "Bob Williams", role: "party" },
      ],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: EMPTY_PAYMENT,
    };
    const intake = "Signer 1: Other Person\nSigner 2: Another One";
    const result = applyNamedPartyFallbackFromIntake(parsed, intake);
    expect(result.parties![0].name).toBe("Alice Jones");
    expect(result.parties![1].name).toBe("Bob Williams");
  });

  it("hasPlaceholderParties=false when explicit names present", () => {
    const parsed: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Anthem Blanchard", role: "party" },
        { name: "Sarah Collins", role: "party" },
        { name: "Michael Reed", role: "party" },
        { name: "Jamie Chen", role: "party" },
      ],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: EMPTY_PAYMENT,
    };
    expect(draftHasPlaceholderParties(parsed)).toBe(false);
  });
});

describe("full pipeline: multi-party intake → draft (QA scenario)", () => {
  const QA_INTAKE = [
    "Consulting agreement with confidentiality provisions.",
    "Sender/signer 1: Anthem Blanchard, anthem@example.com",
    "Signer 2: Sarah Collins, sarah@example.com",
    "Signer 3: Michael Reed, michael@example.com",
    "Signer 4: Jamie Chen, jamie@example.com",
  ].join("\n");

  it("does not misroute multi-party consulting prompt as NDA/confidentiality-only", () => {
    const family = detectAgreementFamily(QA_INTAKE);
    expect(family).toBe("consulting_agreement");
    expect(family).not.toBe("nda");
    expect(family).not.toBe("confidentiality_commercial_protections_agreement");
  });

  it("produces 4 named parties through runIntakeDefaultsAndRoles (simulating basic_parse_timeout)", () => {
    const emptyParsed: ParsedDraftShape = {
      title: "",
      jurisdiction: "TBD",
      parties: [],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: EMPTY_PAYMENT,
    };
    const result = runIntakeDefaultsAndRoles(emptyParsed, QA_INTAKE, true, defaultIntakePartyRoleLabels());
    expect(result.parties.length).toBeGreaterThanOrEqual(4);
    expect(result.parties[0].name).toBe("Anthem Blanchard");
    expect(result.parties[1].name).toBe("Sarah Collins");
    expect(result.parties[2].name).toBe("Michael Reed");
    expect(result.parties[3].name).toBe("Jamie Chen");
    expect(draftHasPlaceholderParties(result)).toBe(false);
  });

  it("preserves existing 2-party prompts (no regression)", () => {
    const twoPartyIntake = "Create a consulting agreement between Acme Corp and Widget LLC";
    const result = runIntakeDefaultsAndRoles(emptyDraft(), twoPartyIntake, true, defaultIntakePartyRoleLabels());
    expect(result.parties.length).toBeGreaterThanOrEqual(2);
    expect(result.parties[0].name).toMatch(/Acme Corp/i);
    expect(result.parties[1].name).toMatch(/Widget LLC/i);
    expect(draftHasPlaceholderParties(result)).toBe(false);
  });
});

describe("multi-party extraction: 3, 4, and 5 signers survive full pipeline", () => {
  const THREE_SIGNERS = [
    { name: "Priya Kapoor", email: "priya@kapoorventures.io" },
    { name: "Darius Montgomery", email: "darius@montco.net" },
    { name: "Lena Vasquez", email: "lena@vasquezdesign.co" },
  ];
  const FOUR_SIGNERS = [
    { name: "Tomasz Kowalski", email: "tomasz@kowalski.dev" },
    { name: "Naomi Okafor", email: "naomi@okafor.legal" },
    { name: "Rafael Diaz", email: "rafael@diazgroup.com" },
    { name: "Aisha Patel", email: "aisha@patel.partners" },
  ];
  const FIVE_SIGNERS = [
    { name: "Henrik Larsen", email: "henrik@larsen.se" },
    { name: "Mei Zhang", email: "mei@zhangcapital.cn" },
    { name: "Carlos Gutierrez", email: "carlos@gutierrez.mx" },
    { name: "Fatima Al-Rashidi", email: "fatima@rashidi.ae" },
    { name: "Oliver Chen", email: "oliver@chensoftware.io" },
  ];

  it("3 signers: extraction preserves all names and emails", () => {
    const intake = makeSignerIntake(THREE_SIGNERS, "Partnership agreement");
    const out = tryInferNamedPartiesFromIntake(intake);
    expect(out).toHaveLength(3);
    THREE_SIGNERS.forEach((s, i) => {
      expect(out![i].name).toBe(s.name);
      expect(out![i].email).toBe(s.email);
    });
  });

  it("4 signers: extraction preserves all names and emails", () => {
    const intake = makeSignerIntake(FOUR_SIGNERS, "Joint venture agreement");
    const out = tryInferNamedPartiesFromIntake(intake);
    expect(out).toHaveLength(4);
    FOUR_SIGNERS.forEach((s, i) => {
      expect(out![i].name).toBe(s.name);
      expect(out![i].email).toBe(s.email);
    });
  });

  it("5 signers: extraction preserves all names and emails", () => {
    const intake = makeSignerIntake(FIVE_SIGNERS, "Software licensing agreement");
    const out = tryInferNamedPartiesFromIntake(intake);
    expect(out).toHaveLength(5);
    FIVE_SIGNERS.forEach((s, i) => {
      expect(out![i].name).toBe(s.name);
      expect(out![i].email).toBe(s.email);
    });
  });

  it("3 signers survive runIntakeDefaultsAndRoles + canonicalize", () => {
    const intake = makeSignerIntake(THREE_SIGNERS, "Consulting engagement");
    const result = runIntakeDefaultsAndRoles(emptyDraft(), intake, true, defaultIntakePartyRoleLabels());
    expect(result.parties.length).toBeGreaterThanOrEqual(3);
    THREE_SIGNERS.forEach((s, i) => {
      expect(result.parties[i].name).toBe(s.name);
    });
    const canonical = canonicalizeStarterDraftForReview(result);
    expect(canonical.parties.length).toBeGreaterThanOrEqual(3);
    THREE_SIGNERS.forEach((s, i) => {
      expect(canonical.parties[i].name).toBe(s.name);
    });
    expect(draftHasPlaceholderParties(canonical)).toBe(false);
  });

  it("4 signers survive runIntakeDefaultsAndRoles + canonicalize", () => {
    const intake = makeSignerIntake(FOUR_SIGNERS, "Advisory services contract");
    const result = runIntakeDefaultsAndRoles(emptyDraft(), intake, true, defaultIntakePartyRoleLabels());
    expect(result.parties.length).toBeGreaterThanOrEqual(4);
    FOUR_SIGNERS.forEach((s, i) => {
      expect(result.parties[i].name).toBe(s.name);
    });
    const canonical = canonicalizeStarterDraftForReview(result);
    expect(canonical.parties.length).toBeGreaterThanOrEqual(4);
    FOUR_SIGNERS.forEach((s, i) => {
      expect(canonical.parties[i].name).toBe(s.name);
    });
    expect(draftHasPlaceholderParties(canonical)).toBe(false);
    expect(draftHasPlaceholderFieldsForRecipients(canonical)).toBe(false);
  });

  it("5 signers survive runIntakeDefaultsAndRoles + canonicalize", () => {
    const intake = makeSignerIntake(FIVE_SIGNERS, "Platform development agreement");
    const result = runIntakeDefaultsAndRoles(emptyDraft(), intake, true, defaultIntakePartyRoleLabels());
    expect(result.parties.length).toBeGreaterThanOrEqual(5);
    FIVE_SIGNERS.forEach((s, i) => {
      expect(result.parties[i].name).toBe(s.name);
    });
    const canonical = canonicalizeStarterDraftForReview(result);
    expect(canonical.parties.length).toBeGreaterThanOrEqual(5);
    FIVE_SIGNERS.forEach((s, i) => {
      expect(canonical.parties[i].name).toBe(s.name);
    });
    expect(draftHasPlaceholderParties(canonical)).toBe(false);
  });
});

describe("agreement family routing: service/web/dev agreements with confidentiality", () => {
  it("web development agreement with confidentiality clause → not NDA", () => {
    const intake = "Web development agreement with confidentiality provisions and IP assignment.\nSigner 1: Dev Studio\nSigner 2: Client Corp";
    const family = detectAgreementFamily(intake);
    expect(family).not.toBe("nda");
    expect(family).not.toBe("confidentiality_commercial_protections_agreement");
  });

  it("software development agreement mentioning confidentiality → services family", () => {
    const intake = "Software development agreement including confidentiality for a mobile app project";
    const family = detectAgreementFamily(intake);
    expect(family).not.toBe("nda");
    expect(family).not.toBe("confidentiality_commercial_protections_agreement");
  });

  it("pure NDA still routes correctly", () => {
    const intake = "Mutual NDA between two companies";
    const family = detectAgreementFamily(intake);
    expect(family).toBe("nda");
  });

  it("pure confidentiality agreement still routes correctly", () => {
    const intake = "Confidentiality agreement for a real estate transaction";
    const family = detectAgreementFamily(intake);
    expect(family).toBe("nda");
  });
});
