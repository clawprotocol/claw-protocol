/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  buildLivePaidProSignerMetadataAuthority,
  partyLegalNamesMatch,
  preserveSlotIndexedSignerMetadataParties,
} from "./paidProSignerMetadataAuthority";
import { mergeIntakeSignerMetadataIntoAuthorityParties } from "./intakeSignerMetadataAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { repairIncompleteIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { buildTest461FrozenHandoffCorpus, TEST461_LIVE_INTAKE, test461BrightPeakFirstDraft } from "./paidProTest461Vs01PreparePacketFixtures";
import {
  TEST472_ENTITIES,
  TEST472_SHUFFLED_LEGAL_ENTITIES,
  TEST472_SIGNERS,
  test472AuthorityParties,
  test472LiveUi,
} from "./paidProTest472Fixtures";

function extractNoticeStanzas(text: string): string[] {
  const noticesIdx = text.search(/\bNotices\b/i);
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const region = witnessIdx >= 0 ? text.slice(noticesIdx, witnessIdx) : text.slice(noticesIdx);
  return region.split(/\n(?=If to\s+)/i).slice(1).map((s) => s.trim()).filter(Boolean);
}

function noticeStanzaForEntity(stanzas: string[], entity: string): string {
  const found = stanzas.find((stanza) => {
    const header = stanza.trim().split("\n")[0]?.trim() ?? "";
    const match = header.match(/^If to\s+(.+?)\s*:\s*$/i);
    const headingEntity = match?.[1]?.trim() ?? "";
    return headingEntity.length >= 2 && partyLegalNamesMatch(headingEntity, entity);
  });
  expect(found).toBeTruthy();
  return found!;
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
  vi.restoreAllMocks();
});

describe("TEST472 — metadata hydration no rotation", () => {
  it("preserveSlotIndexedSignerMetadataParties binds signer contact by legal entity, not shifted index", () => {
    const source = test472AuthorityParties();
    const rotatedMerged = source.map((party, i) => ({
      ...party,
      signerName: TEST472_SIGNERS[(i + 1) % 4]!.name,
      signerEmail: TEST472_SIGNERS[(i + 1) % 4]!.email,
      signerTitle: TEST472_SIGNERS[(i + 1) % 4]!.title,
    }));
    const repaired = preserveSlotIndexedSignerMetadataParties(rotatedMerged, source, 4);
    expect(repaired).toHaveLength(4);
    repaired.forEach((party, i) => {
      expect(party.partyLegalName).toContain(TEST472_ENTITIES[i]!.split(" ")[0]!);
      expect(party.signerName).toBe(TEST472_SIGNERS[i]!.name);
      expect(party.signerEmail).toBe(TEST472_SIGNERS[i]!.email);
      expect(party.signerTitle).toBe(TEST472_SIGNERS[i]!.title);
    });
  });

  it("mergeIntakeSignerMetadataIntoAuthorityParties does not rotate when legal entity order differs", () => {
    const source = test472AuthorityParties();
    const merged = mergeIntakeSignerMetadataIntoAuthorityParties(
      source,
      TEST461_LIVE_INTAKE,
      [...TEST472_SHUFFLED_LEGAL_ENTITIES],
    );
    expect(merged).toHaveLength(4);
    TEST472_ENTITIES.forEach((entity, i) => {
      const party = merged.find((p) => partyLegalNamesMatch(p.partyLegalName, entity));
      expect(party?.signerName).toBe(TEST472_SIGNERS[i]!.name);
      expect(party?.signerEmail).toBe(TEST472_SIGNERS[i]!.email);
    });
  });

  it("final hydrated Pro agreement notice + execution blocks match each legal entity signer", () => {
    const draft = test461BrightPeakFirstDraft();
    const intake = TEST461_LIVE_INTAKE;
    const raw = buildTest461FrozenHandoffCorpus();
    const prep = preparePaidProServerDocumentForAcceptance(raw, draft, intake);
    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft_retry" });
    establishPaidProSourceOfTruth({
      text: prep.text,
      source: "server_full_draft_retry",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });

    const authority = buildLivePaidProSignerMetadataAuthority(test472LiveUi(), "live_ui", {
      intakeText: intake,
      draftPartyNames: [TEST472_ENTITIES[0]!, TEST472_ENTITIES[1]!],
    });
    expect(authority.parties).toHaveLength(4);
    TEST472_ENTITIES.forEach((entity, i) => {
      const party = authority.parties.find((p) => partyLegalNamesMatch(p.partyLegalName, entity));
      expect(party?.signerName).toBe(TEST472_SIGNERS[i]!.name);
      expect(party?.signerEmail).toBe(TEST472_SIGNERS[i]!.email);
      expect(party?.signerTitle).toBe(TEST472_SIGNERS[i]!.title);
    });
    setConsumedPaidProSignerMetadataAuthority(authority);

    const rotatedMerged = authority.parties.map((party, i) => ({
      ...party,
      signerName: TEST472_SIGNERS[(i + 1) % 4]!.name,
      signerEmail: TEST472_SIGNERS[(i + 1) % 4]!.email,
      signerTitle: TEST472_SIGNERS[(i + 1) % 4]!.title,
    }));
    const mergedParties = preserveSlotIndexedSignerMetadataParties(
      rotatedMerged,
      authority.parties,
      4,
    );
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: prep.text,
      authority: { ...authority, parties: mergedParties },
      intakeRaw: intake,
      surface: "test472_metadata_hydration",
      signatureRegionOnly: true,
      repairRecital: true,
    });
    expect(hydrated.rejected).toBe(false);

    const noticeRepair = repairIncompleteIfToNoticeStanzas(hydrated.corpus, mergedParties);
    mergedParties.forEach((party) => {
      const entity = TEST472_ENTITIES.find((name) => partyLegalNamesMatch(party.partyLegalName, name));
      expect(entity).toBeTruthy();
      const signerIndex = TEST472_ENTITIES.indexOf(entity!);
      expect(party.signerName).toBe(TEST472_SIGNERS[signerIndex]!.name);
      expect(party.signerEmail).toBe(TEST472_SIGNERS[signerIndex]!.email);
    });
    const stanzas = extractNoticeStanzas(noticeRepair.text);
    expect(stanzas.length).toBeGreaterThanOrEqual(4);

    TEST472_ENTITIES.forEach((entity, i) => {
      const stanza = noticeStanzaForEntity(stanzas, entity);
      expect(stanza).toContain(TEST472_SIGNERS[i]!.name);
      expect(stanza).toContain(TEST472_SIGNERS[i]!.email);
      expect(stanza).toContain(TEST472_SIGNERS[i]!.title);
      for (let j = 0; j < 4; j++) {
        if (j === i) continue;
        expect(stanza).not.toContain(TEST472_SIGNERS[j]!.email);
      }
    });
  });
});
