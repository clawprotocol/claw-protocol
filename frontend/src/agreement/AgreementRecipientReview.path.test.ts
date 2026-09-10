import { describe, expect, it } from "vitest";
import {
  agreementMagicLinkPath,
  agreementSigningPath,
  parseAgreementReviewPath,
  parseAgreementSignPath,
} from "./AgreementRecipientReview";

describe("Agreement recipient review path parsing", () => {
  it("parses canonical review route without token", () => {
    expect(parseAgreementReviewPath("/agreements/ag_1/review", "")).toEqual({ agreementId: "ag_1" });
  });

  it("treats /app/agreements/:id as recipient route only with token", () => {
    expect(parseAgreementReviewPath("/app/agreements/ag_1", "")).toBeNull();
    expect(parseAgreementReviewPath("/app/agreements/ag_1", "?token=abc")).toEqual({
      agreementId: "ag_1",
      token: "abc",
    });
  });

  it("builds canonical recipient magic link path", () => {
    expect(agreementMagicLinkPath("ag_1", "tok_123")).toBe("/agreements/ag_1/review?t=tok_123");
  });

  it("keeps recipient role and participant-party scope on both runtime-supported entries", () => {
    expect(parseAgreementReviewPath("/agreements/ag_1/review", "?t=tok&role=reviewer&p=p-orion")).toEqual({
      agreementId: "ag_1",
      token: "tok",
      role: "reviewer",
      participantPartyId: "p-orion",
    });
    expect(parseAgreementReviewPath("/app/agreements/ag_1", "?token=tok&role=reviewer&p=p-orion")).toEqual({
      agreementId: "ag_1",
      token: "tok",
      role: "reviewer",
      participantPartyId: "p-orion",
    });
  });

  it("builds and parses the canonical signing path with token and party", () => {
    expect(agreementSigningPath("ag_1", "lv-1", "tok_sign", "p-orion")).toBe(
      "/agreements/ag_1/sign?t=tok_sign&p=p-orion",
    );
    expect(parseAgreementSignPath("/agreements/ag_1/sign", "?t=tok_sign&p=p-orion")).toEqual({
      agreementId: "ag_1",
      token: "tok_sign",
      participantPartyId: "p-orion",
    });
    expect(parseAgreementSignPath("/agreements/ag_1/sign", "")).toEqual({ agreementId: "ag_1" });
  });
});
