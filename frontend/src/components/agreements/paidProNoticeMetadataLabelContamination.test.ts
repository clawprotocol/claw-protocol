/**
 * Genesis Dog retest — notice / signer-setup must never treat field labels
 * (Role, Attn, Email, By) as party legal entities.
 */
import { describe, expect, it } from "vitest";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { resolveAuthorityPartyLegalNameField } from "./intakeSignerMetadataAuthority";
import {
  ensureOperativeIfToNoticeDelivery,
  noticeStanzaHasLegalEntityLine,
  noticeStanzaHasRoleLabelCorruption,
} from "./paidProPartyNoticeDetails";
import {
  hasPartyMetadataLabelContamination,
  isAuthoritativeLegalEntityName,
  isPartyMetadataRoleLabel,
  stripTrailingPartyMetadataLabel,
} from "./paidProPartyNamePreserve";
import { extractSignerEntitiesFromSignatureBlock } from "./signerSetupPartyIdentity";
import { sanitizeSignerPartyLegalEntityDisplay } from "./signerPartyLegalEntityDisplaySanitizer";

const ALEX = "Alex Rivera";
const PIXEL = "PixelForge Labs";

describe("party metadata label contamination (Role/Attn/Email/By)", () => {
  it("rejects fused and bare metadata labels as authoritative entities", () => {
    for (const bad of [
      "Role",
      "Attn",
      "By",
      "Email",
      `${ALEX} Role`,
      `${ALEX} Attn`,
      `${ALEX} Email`,
      `${ALEX} By`,
    ]) {
      expect(hasPartyMetadataLabelContamination(bad)).toBe(true);
      expect(isAuthoritativeLegalEntityName(bad)).toBe(false);
    }
    expect(isPartyMetadataRoleLabel("Role")).toBe(true);
    expect(isPartyMetadataRoleLabel("By")).toBe(true);
    expect(stripTrailingPartyMetadataLabel(`${ALEX} Role`)).toBe(ALEX);
    expect(resolveAuthorityPartyLegalNameField(`${ALEX} Role`, "")).toBe(ALEX);
    expect(resolveAuthorityPartyLegalNameField("Role", "")).toBe("");
    expect(resolveAuthorityPartyLegalNameField(ALEX, "")).toBe(ALEX);
    expect(resolveAuthorityPartyLegalNameField(PIXEL, "")).toBe(PIXEL);
  });

  it("does not extract Role from signature blocks as Party 2", () => {
    const body = [
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      `CLIENT: ${ALEX}`,
      "By: ____________________",
      "Name: ____________________",
      "",
      "SERVICE PROVIDER:",
      "Role",
      "By: ____________________",
      "Name: ____________________",
    ].join("\n");
    expect(extractSignerEntitiesFromSignatureBlock(body)).not.toContain("Role");
    expect(extractSignerEntitiesFromSignatureBlock(body)).not.toContain("Alex Rivera Role");
  });

  it("flags corrupted If-to headers and refuses completeness", () => {
    const stanza = [
      `If to ${ALEX} Attn:`,
      `${ALEX} Attn`,
      "provided during signer setup.",
    ].join("\n");
    expect(noticeStanzaHasRoleLabelCorruption(stanza)).toBe(true);
    expect(noticeStanzaHasLegalEntityLine(stanza)).toBe(false);
    expect(partyLegalNamesMatch(ALEX, `${ALEX} Attn`)).toBe(false);
  });

  it("rebuilds contaminated notices into two clean stanzas for Alex/PixelForge", () => {
    const corpus = [
      "INDEPENDENT CONTRACTOR AGREEMENT",
      "",
      `This Independent Contractor Agreement is between ${ALEX} and ${PIXEL}.`,
      "",
      "1. Services",
      "Alex designs the mobile app UI.",
      "",
      "NOTICES",
      "Any notice under this agreement must be in writing.",
      "",
      `If to ${ALEX} Attn:`,
      `${ALEX} Attn`,
      "provided during signer setup.",
      "",
      `If to ${ALEX} Role:`,
      `${ALEX} Role`,
      "provided during signer setup.",
      "",
      `If to ${ALEX} Email:`,
      `${ALEX} Email`,
      "provided during signer setup.",
      "",
      `If to ${ALEX} By:`,
      `${ALEX} By`,
      "provided during signer setup.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      `CLIENT: ${ALEX}`,
      "By: ____________________",
      "Name: ____________________",
      "",
      `SERVICE PROVIDER: ${PIXEL}`,
      "By: ____________________",
      "Name: ____________________",
    ].join("\n");

    const parties = [
      {
        partyIndex: 0,
        partyLegalName: ALEX,
        signerEmail: "cryptocurated21+Alex@gmail.com",
        signerName: ALEX,
        signerTitle: "",
        partyAddress: "123 Main Street, Huntsville, AL 71098",
      },
      {
        partyIndex: 1,
        partyLegalName: PIXEL,
        signerEmail: "cryptocurated21+Pixel@gmail.com",
        signerName: "Pixel Gin",
        signerTitle: "CEO",
        partyAddress: "234 Candy Avenue, Electric, CA 91234",
      },
    ];

    const repaired = ensureOperativeIfToNoticeDelivery(corpus, parties, {
      intakeText: `Services agreement between ${ALEX} and ${PIXEL}.`,
      draftPartyNames: [ALEX, PIXEL],
      acceptedCorpus: corpus,
    });

    expect(repaired.text).not.toMatch(/If to Alex Rivera (?:Attn|Role|Email|By)\s*:/i);
    expect(repaired.text).toMatch(/If to Alex Rivera\s*:/i);
    expect(repaired.text).toMatch(/If to PixelForge Labs\s*:/i);
    expect(sanitizeSignerPartyLegalEntityDisplay("Role")).toBe("");
    expect(sanitizeSignerPartyLegalEntityDisplay(`${ALEX} Role`)).toBe(ALEX);
  });
});
