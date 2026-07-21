import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CreateUiStage } from "../../components/agreements/createUiStage";
import {
  computeSimpleCreatePaidProReviewReady,
  resolveSimpleCreateShellLifecycleStage,
  SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE,
  SIMPLE_CREATE_STARTER_HERO_TITLE,
} from "./simpleCreatePaidProReviewShell";

describe("computeSimpleCreatePaidProReviewReady", () => {
  it("is true for simple create + authoritative paid Pro on DRAFT+review or on RECIPIENTS (suppresses starter shell)", () => {
    const base = {
      simpleProductFlow: true,
      liveWorkspaceTwoPane: true,
      paidProAuthoritative: true,
      createUiStage: CreateUiStage.DRAFT,
      displayPhase: "review",
    };
    expect(computeSimpleCreatePaidProReviewReady(base)).toBe(true);
    expect(
      computeSimpleCreatePaidProReviewReady({
        ...base,
        createUiStage: CreateUiStage.RECIPIENTS,
        displayPhase: "review",
      }),
    ).toBe(true);
    expect(computeSimpleCreatePaidProReviewReady({ ...base, displayPhase: "intake" })).toBe(false);
    expect(computeSimpleCreatePaidProReviewReady({ ...base, createUiStage: CreateUiStage.INPUT })).toBe(false);
    expect(computeSimpleCreatePaidProReviewReady({ ...base, paidProAuthoritative: false })).toBe(false);
    expect(computeSimpleCreatePaidProReviewReady({ ...base, simpleProductFlow: false })).toBe(false);
    expect(computeSimpleCreatePaidProReviewReady({ ...base, liveWorkspaceTwoPane: false })).toBe(false);
  });
});

describe("resolveSimpleCreateShellLifecycleStage", () => {
  it("stays on Review until signature recipient setup is active", () => {
    const base = {
      paidProReviewReady: true,
      paidProRecipientSetupOnDraft: false,
      createFlowPhase: "draft_ready_for_review" as const,
      effectivePremiumSendMode: "signature" as const,
    };
    expect(resolveSimpleCreateShellLifecycleStage(base)).toBe("review");
    expect(
      resolveSimpleCreateShellLifecycleStage({
        ...base,
        paidProRecipientSetupOnDraft: true,
        createFlowPhase: "recipient_setup_required",
      }),
    ).toBe("sign");
    expect(
      resolveSimpleCreateShellLifecycleStage({
        ...base,
        paidProRecipientSetupOnDraft: true,
        createFlowPhase: "recipient_setup_required",
        effectivePremiumSendMode: "review",
      }),
    ).toBe("review");
  });
});

describe("Simple create shell copy contract", () => {
  it("uses distinct Pro review title vs starter marketing title", () => {
    expect(SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE).not.toContain("in minutes");
    expect(SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE).toContain("Pro");
    expect(SIMPLE_CREATE_STARTER_HERO_TITLE).toMatch(/Draft it fast/i);
  });

  it("SimpleCreatePage gates starter hero on paidProReviewReadyShell (not createUiStage alone)", () => {
    const p = join(__dirname, "SimpleCreatePage.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("paidProReviewReadyShell");
    expect(s).toContain("onSimpleCreateShellChrome");
    expect(s).toContain("SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE");
    expect(s).toContain("SIMPLE_CREATE_STARTER_HERO_TITLE");
    expect(s).not.toMatch(/isFreshSimpleCreateStart\s*\?\s*["']Create an agreement in minutes/);
  });

  it("SimpleCreatePage drops owner lifecycle chrome for anonymous free-starter review", () => {
    const p = join(__dirname, "SimpleCreatePage.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("freeStarterReviewShellActive");
    expect(s).toContain("anonymousStarterReviewChrome");
    expect(s).toContain("hideHeader={anonymousStarterReviewChrome}");
    expect(s).toContain('logoHomeHref={anonymousStarterReviewChrome ? "/" : "/app"}');
    expect(s).toContain("hideAffiliateNav={anonymousStarterReviewChrome}");
    // Lifecycle step omitted when anonymous starter review is active (not paid Pro).
    expect(s).toMatch(/anonymousStarterReviewChrome\s*\?\s*undefined/);
  });

  it("AgreementBuilderIntake reports paid Pro review readiness to the create shell", () => {
    const p = join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("computeSimpleCreatePaidProReviewReady");
    expect(s).toContain("onSimpleCreateShellChrome");
    expect(s).toContain("paidProReviewReady");
    expect(s).toContain("freeStarterReviewShellActive");
  });
});
