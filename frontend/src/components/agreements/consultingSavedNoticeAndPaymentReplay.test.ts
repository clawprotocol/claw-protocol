import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "../../launch/corePaidJourneyAcceptanceMatrix";
import { shouldBlockPaidProStructuralMutationAfterAcceptance } from "./paidProAuthoritativeRenderGate";
import {
  ensureCanonicalNoticesSectionHeadingForFreeze,
  relocateMisplacedNoticesSectionBeforeGoverningLaw,
  repairIncompleteIfToNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { clearAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  UNCONFIRMED_INVOICE_CADENCE_QUESTION,
  UNCONFIRMED_PAYMENT_DUE_QUESTION,
  UNCONFIRMED_PAYMENT_TIMING_QUESTION,
  buildMaterialMissingItems,
} from "./proAgreementCompleteness";

function replayFixture(): {
  authoritative_draft: string;
  visible_agreement?: string;
  missing_material_info?: string[];
} {
  const rel = "evals/commercial-readiness/fixtures/consulting-unconfirmed-payment-replay.json";
  const candidates = [resolve(process.cwd(), rel), resolve(process.cwd(), "..", rel)];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`sanitized consulting replay fixture missing; looked in ${candidates.join(", ")}`);
  return JSON.parse(readFileSync(found, "utf8"));
}

function harborParties() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: "Harbor Peak Analytics LLC",
    recipient2Name: "Ironvale Manufacturing Inc.",
    recipient1Email: "maya.chen@harborpeak.test",
    recipient2Email: "jordan.hale@ironvale.test",
    extraPartyReviewEmails: [],
    partySignerNames: ["Maya Chen", "Jordan Hale"],
    partySignerTitles: ["", ""],
    partyAddresses: ["", ""],
  }).parties;
}

function topLevelSections(text: string): { n: number; title: string }[] {
  const out: { n: number; title: string }[] = [];
  for (const m of text.matchAll(/(?:^|\n)(\d+)\.(?!\d)\s+([A-Za-z][^\n]*)/g)) {
    out.push({ n: Number(m[1]), title: (m[2] ?? "").trim() });
  }
  return out;
}

function assertCoherentSectionOrder(text: string): void {
  const secs = topLevelSections(text);
  expect(secs.length).toBeGreaterThan(8);
  for (let i = 1; i < secs.length; i += 1) {
    expect(secs[i]!.n, `${secs[i - 1]!.title} then ${secs[i]!.title}`).toBeGreaterThan(
      secs[i - 1]!.n,
    );
  }
}

describe("consulting saved-evidence notice order and payment timing", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
  });

  it("reproduces the live 13. NOTICES before 11/12 defect", () => {
    const visible = String(replayFixture().visible_agreement || "");
    expect(visible.indexOf("13. NOTICES")).toBeGreaterThan(-1);
    expect(visible.indexOf("13. NOTICES")).toBeLessThan(visible.indexOf("11. Governing Law"));
    expect(visible.indexOf("11. Governing Law")).toBeLessThan(visible.indexOf("12. Miscellaneous"));
  });

  it("working-draft hydrate places notices in coherent section order", () => {
    const server = String(replayFixture().authoritative_draft || "");
    expect(server).not.toMatch(/^\s*13\.\s+NOTICES/m);
    const inserted = repairIncompleteIfToNoticeStanzas(server, harborParties());
    const headed = ensureCanonicalNoticesSectionHeadingForFreeze(inserted.text);
    const relocated = relocateMisplacedNoticesSectionBeforeGoverningLaw(headed.text);
    assertCoherentSectionOrder(relocated.text);
    expect(relocated.text).toMatch(/maya\.chen@harborpeak\.test/i);
    expect(relocated.text).toMatch(/jordan\.hale@ironvale\.test/i);
    expect(relocated.text).toMatch(/Harbor Peak Analytics LLC/);
    expect(relocated.text).toMatch(/Ironvale Manufacturing Inc/);
    expect(relocated.text).toMatch(/IN WITNESS WHEREOF/i);
    expect(relocated.text).toMatch(/Maya Chen/);
    expect(relocated.text).toMatch(/Jordan Hale/);
    const again = ensureCanonicalNoticesSectionHeadingForFreeze(
      repairIncompleteIfToNoticeStanzas(relocated.text, harborParties()).text,
    );
    expect(fingerprintAgreementBody(again.text)).toBe(fingerprintAgreementBody(relocated.text));
  });

  it("refresh/reopen of accepted paper does not rewrite notice order or signer blocks", () => {
    const accepted = String(replayFixture().visible_agreement || "");
    const acceptedHash = fingerprintAgreementBody(accepted);
    establishPaidProSourceOfTruth({ text: accepted, source: "server_full_draft" });
    expect(shouldBlockPaidProStructuralMutationAfterAcceptance()).toBe(true);
    const polished = polishProAgreementDisplayLayer(accepted);
    expect(fingerprintAgreementBody(polished.text)).toBe(acceptedHash);
    const relocated = relocateMisplacedNoticesSectionBeforeGoverningLaw(accepted);
    expect(fingerprintAgreementBody(relocated.text)).toBe(acceptedHash);
    expect(relocated.text).toContain("13. NOTICES");
    expect(relocated.text).toContain("Maya Chen");
    expect(relocated.text).toContain("Jordan Hale");
  });

  it("targeted payment question appears and partial answers keep the remaining ask", () => {
    const raw = replayFixture();
    const body = String(raw.authoritative_draft || "");
    expect(CORE_PAID_JOURNEY_FILLED_INTAKE).not.toMatch(/net\s*[- ]?30|installment/i);
    const missing = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      body,
      serverMissing: raw.missing_material_info,
    });
    expect(missing.some((i) => i.question === UNCONFIRMED_PAYMENT_TIMING_QUESTION)).toBe(true);
    expect(missing.find((i) => i.question === UNCONFIRMED_PAYMENT_TIMING_QUESTION)?.canProceedWithoutAnswer).toBe(
      true,
    );
    const monthly = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      userGapAnswers: "Invoice monthly",
      body,
      serverMissing: [],
    });
    expect(monthly.some((i) => i.question === UNCONFIRMED_PAYMENT_DUE_QUESTION)).toBe(true);
    expect(monthly.some((i) => i.question === UNCONFIRMED_PAYMENT_TIMING_QUESTION)).toBe(false);
    expect(monthly.some((i) => i.question === UNCONFIRMED_INVOICE_CADENCE_QUESTION)).toBe(false);
    const tbd = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      userGapAnswers: "Payment timing is TBD",
      body,
      serverMissing: [],
    });
    expect(tbd.some((i) => i.question === UNCONFIRMED_PAYMENT_TIMING_QUESTION)).toBe(true);
    const pay = missing.find((i) => i.question === UNCONFIRMED_PAYMENT_TIMING_QUESTION);
    expect(pay?.canProceedWithoutAnswer).toBe(true);
    expect(pay?.severity).toBe("material");
  });

  it("later explicit answers resolve earlier TBD and are not re-asked", () => {
    const raw = replayFixture();
    const body = String(raw.authoritative_draft || "");
    const resolved = buildMaterialMissingItems({
      intakeRaw: `${CORE_PAID_JOURNEY_FILLED_INTAKE}\nPayment timing is TBD.`,
      userGapAnswers: "Payment timing is TBD\nInvoice once on October 1, 2026. Payment due net 60.",
      body,
      serverMissing: [],
    });
    expect(resolved.some((i) => i.question === UNCONFIRMED_PAYMENT_TIMING_QUESTION)).toBe(false);
    expect(resolved.some((i) => i.question === UNCONFIRMED_PAYMENT_DUE_QUESTION)).toBe(false);
    expect(resolved.some((i) => i.question === UNCONFIRMED_INVOICE_CADENCE_QUESTION)).toBe(false);
    expect(
      resolved.some((i) => i.id === "payment_timing" || i.id === "payment_due" || i.id === "invoice_cadence"),
    ).toBe(false);
  });

  it("weekly then monthly asks nothing extra and keeps canProceedWithoutAnswer advisory", () => {
    const raw = replayFixture();
    const body = String(raw.authoritative_draft || "");
    const monthly = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      userGapAnswers: "Invoice weekly. Payment due net 30.\nInvoice monthly.",
      body,
      serverMissing: [],
    });
    expect(monthly.some((i) => i.question === UNCONFIRMED_INVOICE_CADENCE_QUESTION)).toBe(false);
    expect(monthly.some((i) => i.question === UNCONFIRMED_PAYMENT_TIMING_QUESTION)).toBe(false);
    const conflicted = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      userGapAnswers: "Invoice weekly and monthly.",
      body,
      serverMissing: [],
    });
    const cadenceAsk = conflicted.find((i) => i.question === UNCONFIRMED_INVOICE_CADENCE_QUESTION);
    expect(cadenceAsk?.canProceedWithoutAnswer).toBe(true);
    expect(cadenceAsk?.severity).toBe("material");
  });

  it("complete answers are not re-asked and refresh keeps the same document identity", () => {
    const raw = replayFixture();
    const body = String(raw.authoritative_draft || "");
    const answers = "Invoice once on October 1, 2026. Payment due net 30.";
    const confirmed = buildMaterialMissingItems({
      intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE,
      userGapAnswers: answers,
      body,
      serverMissing: [],
    });
    expect(confirmed.some((i) => i.question === UNCONFIRMED_PAYMENT_TIMING_QUESTION)).toBe(false);
    expect(confirmed.some((i) => i.question === UNCONFIRMED_PAYMENT_DUE_QUESTION)).toBe(false);
    const working = repairIncompleteIfToNoticeStanzas(body, harborParties()).text;
    const first = fingerprintAgreementBody(working);
    const second = fingerprintAgreementBody(
      repairIncompleteIfToNoticeStanzas(working, harborParties()).text,
    );
    expect(second).toBe(first);
  });
});
