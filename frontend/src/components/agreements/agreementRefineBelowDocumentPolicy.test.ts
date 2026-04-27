import { describe, expect, it } from "vitest";
import { CreateUiStage } from "./createUiStage";
import {
  isBelowDocumentRefineSectionParentEligible,
  shouldShowPersistedRefineTextareaBox,
  shouldShowStarterProRefineUpsellCard,
} from "./agreementRefineBelowDocumentPolicy";

describe("agreementRefineBelowDocumentPolicy", () => {
  const parentMatch = {
    createProductionTwoPane: true,
    createUiStage: CreateUiStage.DRAFT,
    hasDraft: true,
    productionDraftPrimaryReviewSurface: true,
    showFinalizeYourAgreement: false,
  };

  it("parent shell only in production draft review (not finalize)", () => {
    expect(isBelowDocumentRefineSectionParentEligible(parentMatch)).toBe(true);
    expect(
      isBelowDocumentRefineSectionParentEligible({
        ...parentMatch,
        showFinalizeYourAgreement: true,
      }),
    ).toBe(false);
    expect(
      isBelowDocumentRefineSectionParentEligible({
        ...parentMatch,
        createUiStage: CreateUiStage.INPUT,
      }),
    ).toBe(false);
  });

  it("Starter / free: upsell card, not persisted refine textarea", () => {
    expect(shouldShowPersistedRefineTextareaBox(true, true, false)).toBe(false);
    expect(shouldShowPersistedRefineTextareaBox(true, false, false)).toBe(false);
    expect(shouldShowStarterProRefineUpsellCard(true, false, false)).toBe(true);
  });

  it("LawDog Pro / unlocked: persisted refine textarea, not upsell", () => {
    expect(shouldShowPersistedRefineTextareaBox(true, true, true)).toBe(true);
    expect(shouldShowStarterProRefineUpsellCard(true, true, false)).toBe(false);
  });

  it("suppresses starter upsell when premium upsell is suppressed (e.g. workspace entitled)", () => {
    expect(shouldShowStarterProRefineUpsellCard(true, false, true)).toBe(false);
  });
});
