import { describe, expect, it } from "vitest";
import { rejectPremiumBodyForProRender, isLikelyFiveSectionStarterShellPro } from "./premiumFullDraftClientAcceptance";
import { buildPremiumDeliverablePlainTextFromDraft, pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: true };

function baseDraft(over: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "Agreement",
    jurisdiction: "CA",
    parties: [
      { name: "A", role: "party" },
      { name: "B", role: "party" },
    ],
    purpose: "Services.",
    payment_terms: "Monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: emptyPayment,
    agreement_family: "services_agreement",
    ...over,
  };
}

function longServerLogoDoc(): string {
  return [
    "LOGO DESIGN SERVICES AGREEMENT",
    "",
    "WHEREAS Client desires custom logo work; NOW THEREFORE:",
    "",
    "1. SERVICES. Designer will create logo concepts for Client brand.",
    "2. FEE. Flat fee of $1,500 for the engagement described.",
    "3. REVISIONS. Client receives two (2) revision rounds after initial concepts.",
    "4. CONFIDENTIALITY. Mutual protection of non-public information.",
    "5. IP. Upon full payment, Client owns final logo deliverables as agreed.",
    "6. TERM AND TERMINATION. As stated in schedules or standard commercial terms.",
    "7. LIABILITY. Commercially reasonable limitations.",
    "8. DISPUTES. Good-faith negotiation then courts of California.",
    "9. NOTICES. Email to designated representatives.",
    "10. MISCELLANEOUS. Entire agreement; counterparts; electronic signatures.",
    "",
    "Operative detail. ".repeat(200),
  ].join("\n");
}

describe("Pro source regression (QA prompts)", () => {
  it("logo contract — rejects internal markers; accepts server-style doc with fee + revisions", () => {
    const intake = "Need a logo contract for $1,500 with 2 revisions.";
    const bad = "Sparse-prompt premium expansion\n" + "x".repeat(1800);
    expect(rejectPremiumBodyForProRender(bad, { intakeLower: intake.toLowerCase() }).ok).toBe(false);
    const good = longServerLogoDoc();
    expect(rejectPremiumBodyForProRender(good, { intakeLower: intake.toLowerCase() }).ok).toBe(true);
    expect(good.toLowerCase()).toMatch(/1,?500|1500/);
    expect(good.toLowerCase()).toMatch(/revision/);
  });

  it("loan prompt — rejects commercial workstreams intro in body", () => {
    const intake = "Lent friend $5,000 repay monthly.";
    const bad = "Your LawDog Pro agreement is organized into commercial workstreams below — not the free starter shell.";
    expect(rejectPremiumBodyForProRender(bad, { intakeLower: intake.toLowerCase() }).ok).toBe(false);
  });

  it("founder vesting — rejects generic AGREEMENT title when intake has vesting", () => {
    const intake = "Two founders 60/40 vesting.";
    const bad = "AGREEMENT\n\n1. PARTIES.\n2. SCOPE.\n3. PAYMENT.\n4. TERM.\n5. LAW.\n" + "x".repeat(400);
    const r = rejectPremiumBodyForProRender(bad, { intakeLower: intake.toLowerCase() });
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("generic_title") || x.includes("starter_shell"))).toBe(true);
  });

  it("estate — rejects structured-below intro", () => {
    const intake = "My siblings need rules for dad's estate tonight.";
    const bad = "Your LawDog Pro agreement is structured below — fuller commercial framing";
    expect(rejectPremiumBodyForProRender(bad, { intakeLower: intake.toLowerCase() }).ok).toBe(false);
  });

  it("pickPremium prefers draft premium_full_document_text over longer stale snapshot with shell", () => {
    const full = longServerLogoDoc();
    const draft = baseDraft({
      premium_full_document_text: full,
      title: "Logo Design Services Agreement",
    });
    const snap = [
      "AGREEMENT",
      "",
      "Your LawDog Pro agreement is structured below",
      "",
      "1. SCOPE OF SERVICES / PURPOSE",
      "Thin",
      "2. PAYMENT TERMS",
      "Thin",
      "3. TERM AND EFFECTIVE DATE",
      "Thin",
      "4. GOVERNING LAW",
      "Thin",
      "5. TERMINATION",
      "Thin",
    ].join("\n");
    const out = pickPremiumPaidReadonlyPlainText({
      premiumWinningBodyText: snap,
      premiumReadonlySnapshotText: snap,
      draft,
      agreementDocumentText: "",
    });
    expect(out.plainText).toContain("LOGO DESIGN");
    expect(out.plainText.toLowerCase()).not.toContain("structured below");
    expect(out.sourceUsed).toBe("server_full_document_text");
  });

  it("buildPremiumDeliverablePlainTextFromDraft returns server full when present even if thin bar fails", () => {
    const full = longServerLogoDoc();
    const d = baseDraft({ premium_full_document_text: full });
    const acc = rejectPremiumBodyForProRender(full);
    expect(acc.ok, acc.reasons.join(",")).toBe(true);
    const out = buildPremiumDeliverablePlainTextFromDraft(d);
    expect(out.length).toBeGreaterThan(2000);
    expect(out).toContain("LOGO DESIGN SERVICES AGREEMENT");
    expect(out).toContain("$1,500");
    expect(out.toLowerCase()).not.toContain("structured below");
    expect(out.toLowerCase()).not.toContain("commercial workstreams");
  });
});

describe("isLikelyFiveSectionStarterShellPro", () => {
  it("flags thin five-slot shell", () => {
    const shell = [
      "AGREEMENT",
      "",
      "1. SCOPE OF SERVICES / PURPOSE",
      "Short",
      "2. PAYMENT TERMS",
      "Short",
      "3. TERM AND EFFECTIVE DATE",
      "Short",
      "4. GOVERNING LAW",
      "Short",
      "5. TERMINATION",
      "Short",
    ].join("\n");
    expect(isLikelyFiveSectionStarterShellPro(shell)).toBe(true);
  });
});
