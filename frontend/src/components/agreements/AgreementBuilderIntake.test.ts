import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCreateReviewAgreementResumeId,
  readCreateReviewAgreementResumeId,
  writeCreateReviewAgreementResumeId,
} from "./agreementIntakeStorage";
import { shouldKeepReviewDisplayAfterProHydrate } from "./sendHandoffAuthoritativeCorpus";

describe("AgreementBuilderIntake paid-pro resume + hydrate contract", () => {
  const sessionStore = new Map<string, string>();

  beforeEach(() => {
    sessionStore.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (sessionStore.has(k) ? sessionStore.get(k)! : null),
      setItem: (k: string, v: string) => void sessionStore.set(k, v),
      removeItem: (k: string) => void sessionStore.delete(k),
    } as Storage);
    clearCreateReviewAgreementResumeId();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips agreement_id in session for /app/send → /app/create resume hydration", () => {
    writeCreateReviewAgreementResumeId("  agr-xyz  ");
    expect(readCreateReviewAgreementResumeId()).toBe("agr-xyz");
  });

  it("hydrate shape: server_full_document_text length + render source keeps review (not intake)", () => {
    const d = {
      premium_render_source: "server_full_document_text",
      server_full_document_text: "b".repeat(600),
      premium_full_document_text: "",
      premium_server_full_document_text: "",
    };
    expect(shouldKeepReviewDisplayAfterProHydrate(d)).toBe(true);
  });

  it("runPersistAndOpen must not clear premium completion state (regression: paid Pro → free intake)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).not.toMatch(/runPersistAndOpen[\s\S]{0,12000}clearPremiumCompletionStateAfterSend/);
  });

  it("paid authoritative recipient step uses Review and send CTA copy (not Create review link)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("paidProAuthoritative");
    expect(s).toContain('"Review and send"');
    expect(s).toContain("Add at least one recipient before continuing.");
  });

  it("paid authoritative recipient handoff uses advancePaidProToRecipientSetup in both handOff and runPrimary paths", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const matches = [
      ...s.matchAll(/if\s*\(\s*paidProAuthoritative\s*\)\s*\{[\s\S]*?advancePaidProToRecipientSetup\(\)/g),
    ];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("handOffProductionDraftToRecipients advances paid authoritative via advancePaidProToRecipientSetup only when paid", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const handOffProductionDraftToRecipients");
    expect(i).toBeGreaterThanOrEqual(0);
    const j = s.indexOf("const handlePremiumReviewFirstContinueToSigners", i);
    expect(j).toBeGreaterThan(i);
    const block = s.slice(i, j);
    expect(block).toMatch(/if\s*\(\s*paidProAuthoritative\s*\)[\s\S]*advancePaidProToRecipientSetup/);
    expect(block).toMatch(/else\s*\{[\s\S]*setCreateFlowPhase\("recipient_setup_required"\)/);
  });

  it("guided intake reset effect bails out for paid authoritative Pro (no INPUT regression)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("if (guidedStructureComplete) return;");
    expect(i).toBeGreaterThanOrEqual(0);
    const slice = s.slice(i, i + 500);
    expect(slice).toContain("if (paidProAuthoritative) return;");
  });

  it("applyMissingAnswer keeps displayPhase review for authoritative paid Pro two-pane", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const applyMissingAnswer = async");
    expect(i).toBeGreaterThanOrEqual(0);
    const j = s.indexOf("const paidProAuthoritative = useMemo", i);
    expect(j).toBeGreaterThan(i);
    const block = s.slice(i, j);
    expect(block).toContain("isPaidProAgreementAuthoritative");
    expect(block).toContain('setDisplayPhase(authoritative ? "review" : "intake")');
  });

  it("runPersistAndOpen hydrate-fallback uses review displayPhase when authoritative", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("if (createProductionTwoPane && !hydrate && structuredOk)");
    expect(i).toBeGreaterThanOrEqual(0);
    const frag = s.slice(i, i + 550);
    expect(frag).toContain("isPaidProAgreementAuthoritative");
    expect(frag).toContain('? "review"');
    expect(frag).toContain(': "intake"');
  });

  it("shows Pro refine “What changed” under preview when host wires onProRefineWhatChanged", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("proRefineWhatChangedSummary");
    expect(s).toContain("onProRefineWhatChanged=");
    expect(s).toContain("What changed:");
  });

  it("starter tier gates premiumPaidDocumentSurface only on paid completion session or persisted premium flow", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const premiumPaidDocumentSurface = useMemo");
    expect(i).toBeGreaterThanOrEqual(0);
    const frag = s.slice(i, i + 1400);
    expect(frag).toContain("CRITICAL INVARIANT:");
    expect(frag).toContain("!tierAllowsAdvancedFullDraftReveal(tier)");
    expect(frag).toContain(
      "return Boolean(hasPaidPremiumCompletionSession() || premiumPersistedFlowActive);",
    );
    expect(frag).not.toContain("peekAdvancedFullDraftCheckoutGrant()");
    expect(frag).not.toContain("premiumSendPathUnlocked");
    expect(frag).toContain("return true");
  });

  it("premiumCompletion URL is honored via hasPaidPremiumCompletionSession (starter Pro surface path)", () => {
    const p = join(__dirname, "premiumCompletionStorage.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain('get("premiumCompletion") === "1"');
  });

  it("basic parse path uses basic_parse_timeout abort reason (not premium_parse_timeout)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toMatch(
      /controller\.abort\(\s*isPremium\s*\?\s*"premium_parse_timeout"\s*:\s*"basic_parse_timeout"\s*\)/,
    );
  });

  it("paid authoritative Pro hides top adjust card but keeps lower Finalize panel", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("showTopProAdjustCard");
    expect(intake).toMatch(/showTopProAdjustCard\s*=\s*Boolean\([\s\S]*?!paidProAuthoritative/);
    expect(intake).toContain("Want to adjust this agreement?");
    expect(intake).toContain("{showTopProAdjustCard ?");
    expect(intake).toContain("FinalizeYourAgreementPanel");
    expect(intake).toContain("showProLawdogRefineAndFinalize");
    const finalize = readFileSync(join(__dirname, "FinalizeYourAgreementPanel.tsx"), "utf8");
    expect(finalize).toContain("Ready to send for review");
  });
});
