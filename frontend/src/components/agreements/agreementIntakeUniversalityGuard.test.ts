/**
 * Product-wide invariants: counsel-prep gating, fresh-create authority clear, and
 * intake↔corpus contamination fail-closed apply to every LawDog account — not a
 * single user, org, tier, or Genesis flag.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateIntentionalCreateDraftSubmit } from "./agreementIntakeCapabilityGate";
import { detectPaidProCorpusIntakeContamination } from "./paidProIntakeCorpusFidelity";

const ROOT = resolve(__dirname);
const CAPABILITY_SRC = readFileSync(resolve(ROOT, "agreementIntakeCapabilityGate.ts"), "utf8");
const CLARIFICATION_SRC = readFileSync(resolve(ROOT, "agreementIntakeClarification.ts"), "utf8");
const FIDELITY_SRC = readFileSync(resolve(ROOT, "paidProIntakeCorpusFidelity.ts"), "utf8");
const PLACEHOLDER_FILL_SRC = readFileSync(resolve(ROOT, "applyIntakeDraftPlaceholders.ts"), "utf8");
const CLEAR_SRC = readFileSync(
  resolve(ROOT, "../../launch/newAgreementSessionReset.ts"),
  "utf8",
);
const INTAKE_SRC = readFileSync(resolve(ROOT, "AgreementBuilderIntake.tsx"), "utf8");

const ACCOUNT_SCOPED_RE =
  /\b(?:orgId|userId|user_id|org_id|accountId|workspaceId|Anthem|Blanchard|047b01af|Genesis Dog|genesisDogsOnly|allowlist|email\s*===)\b/;

describe("agreement intake universality (all LawDog accounts)", () => {
  it("capability / fidelity / clear / placeholder-fill modules have no account-scoped branches", () => {
    expect(CAPABILITY_SRC).not.toMatch(ACCOUNT_SCOPED_RE);
    expect(CLARIFICATION_SRC).not.toMatch(ACCOUNT_SCOPED_RE);
    expect(FIDELITY_SRC).not.toMatch(ACCOUNT_SCOPED_RE);
    expect(PLACEHOLDER_FILL_SRC).not.toMatch(ACCOUNT_SCOPED_RE);
    expect(CLEAR_SRC).not.toMatch(ACCOUNT_SCOPED_RE);
  });

  it("universal GTM party-authority spectrum suite is present (multi-family, not NDA-only)", () => {
    const spectrum = readFileSync(
      resolve(ROOT, "paidProUniversalGtmPartyAuthorityRegression.test.ts"),
      "utf8",
    );
    expect(spectrum).toMatch(/family: "msa"/);
    expect(spectrum).toMatch(/family: "saas_subscription"/);
    expect(spectrum).toMatch(/family: "license"/);
    expect(spectrum).toMatch(/family: "dpa"/);
    expect(spectrum).toMatch(/family: "purchase"/);
    expect(spectrum).toMatch(/family: "loi"/);
    expect(spectrum).toMatch(/family: "amendment"/);
    expect(spectrum).toMatch(/All affiliates will sign/);
    expect(spectrum).toMatch(/will not sign/);
    expect(spectrum).toMatch(/Governing law: New York/);
    expect(spectrum).toMatch(/Governing law: Delaware/);
    expect(spectrum).toMatch(/Governing law: California/);
    expect(spectrum).toMatch(/Governing law: Texas/);
    expect(spectrum).toMatch(/initializeNewAgreementSession/);
    expect(spectrum).toMatch(/clarification follow-up/);
    expect(spectrum).toMatch(/assertCanonicalPartySurfacesAgree/);
    // Fixture entities only — no personal/account identifiers as case anchors.
    expect(spectrum).not.toMatch(/\b(?:Anthem|Blanchard|047b01af)\b/);
  });

  it("every INPUT generate handoff goes through intentional create prep", () => {
    for (const handoff of [
      "guided_input_generate",
      "voice_draft_now",
      "home_create_submit",
      "starter_create_submit",
      "stageA_baseline",
    ]) {
      expect(INTAKE_SRC.includes(`"${handoff}"`), `missing handoff ${handoff}`).toBe(true);
    }
    // Shared prep is the product choke point for clear + capability gate.
    expect(INTAKE_SRC).toContain("prepareIntentionalCreateDraftSubmit");
    expect(INTAKE_SRC).toContain("evaluateIntentionalCreateDraftSubmit");
    expect(INTAKE_SRC).toContain("applyIntakeCapabilityBlock");
    expect(INTAKE_SRC).toContain("AgreementIntakeClarificationPanel");
    // Rewrite / intentional submit must overwrite session original (not if-richer only).
    expect(INTAKE_SRC).toContain("writeOriginalUserIntakeRawAtDraftCommit(rewrite)");
    expect(INTAKE_SRC).toContain("writeOriginalUserIntakeRawAtDraftCommit(decision.text)");
    expect(INTAKE_SRC).toContain("writeOriginalUserIntakeRawAtDraftCommit(rawSubmitted)");
    // First-review contamination intake prefers live create text over longest-wins.
    expect(INTAKE_SRC).toContain(
      "intakeText: (intakeCombined || currentPremiumMergedIntakeKey || \"\").trim()",
    );
    // After freeze accept, never auto-fire a second entitled_rewrite that blanks paint.
    expect(INTAKE_SRC).toContain("hasAcceptedPaidCreateFlowFreezeLatch()");
    // Both guided call sites must prep before parse (regression: one path skipped the gate).
    const guidedPrepCount = (INTAKE_SRC.match(/prepareIntentionalCreateDraftSubmit\(guidedRaw\)/g) || [])
      .length;
    expect(guidedPrepCount).toBeGreaterThanOrEqual(2);
    expect(INTAKE_SRC).toContain("prepareIntentionalCreateDraftSubmit(voiceRaw)");
    // Home hero auto-generate uses the same evaluate + clear stack (all accounts).
    expect(INTAKE_SRC).toContain("evaluateIntentionalCreateDraftSubmit(text)");
    expect(INTAKE_SRC).toContain("clearPriorPaidAuthorityForFreshCreateSubmit()");
  });

  it("first-review paint uses contamination fail-closed for any intake/corpus pair", () => {
    const firstReview = readFileSync(resolve(ROOT, "paidProFirstReviewDisplayAuthority.ts"), "utf8");
    expect(firstReview).toContain("detectPaidProCorpusIntakeContamination");
    expect(firstReview).toContain("rejectContaminatedFirstReviewPlain");
    expect(firstReview).not.toMatch(ACCOUNT_SCOPED_RE);
  });

  it("same counsel-prep prompt is blocked for any caller (no account context required)", () => {
    const prompt = [
      "Hey LawDog, I need help with a customer agreement issue.",
      "Can you help me figure out:",
      "1. Whether we should push them back to our MSA or accept their pilot agreement with edits.",
      "2. Which terms are actual deal risks vs. normal legal noise.",
      "I'm not looking for a law school memo.",
    ].join("\n");
    const decision = evaluateIntentionalCreateDraftSubmit(prompt);
    expect(decision.action).toBe("block_capability");
  });

  it("contamination detector is intake/corpus structural — not identity-based", () => {
    const result = detectPaidProCorpusIntakeContamination({
      intakeText:
        "Draft a 60-day SaaS pilot between Acme Co and Beta LLC for $15k with SOC 2 Type I terms.",
      corpusText: [
        "SERVICES AGREEMENT",
        "Designer will provide product design services for a six-week mobile app UI.",
        "Client will pay Designer a flat fee of $4,500.",
        "If to Alex Rivera:",
        "If to PixelForge Labs:",
        "CLIENT: Alex Rivera",
        "SERVICE PROVIDER:",
        "PixelForge Labs",
        "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      ].join("\n"),
    });
    expect(result.contaminated).toBe(true);
  });
});
