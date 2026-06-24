/**
 * Shared assertion helpers for TEST423 N-party authority tests.
 */

import { expect } from "vitest";

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { evaluateProfessionalCorpusContamination } from "./paidProProfessionalCorpusContamination";
import { countSignatureExecutionLinesInTail } from "./guidedDealCompletion/signatureRegion";
import {
  linearPremiumRecipientSlots,
  type PremiumRecipientHandoffV2,
} from "./premiumPartyNamesHandoff";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { consumeAuthoritativeSignerCount, resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { countSignerMetadataSlots } from "./signerMetadataEffective";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { normalizeAgreementPartyName } from "./partySlotIdentityNormalize";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { looksLikeEmail } from "./recipientEmailValidation";

export type NPartyAuthorityExpectations = {
  expectedN: number;
  intakeText: string;
  draft: ParsedDraftShape;
  parties: readonly string[];
  signerNames: readonly string[];
  corpus: string;
  requireNoticeStanzas?: boolean;
};

export function executionTail(text: string): string {
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  return witnessIdx >= 0 ? text.slice(witnessIdx) : "";
}

function partyNameAppearsInCorpusTail(tail: string, party: string): boolean {
  const normalized = normalizeAgreementPartyName(party).toLowerCase();
  if (!normalized) return false;
  if (tail.includes(normalized)) return true;
  const withoutTerminalPeriod = normalized.replace(/\.+$/, "");
  if (withoutTerminalPeriod !== normalized && tail.includes(withoutTerminalPeriod)) return true;
  if (tail.includes(`${withoutTerminalPeriod}.`)) return true;
  const tailLines = tail.split("\n");
  return tailLines.some((line) => partyLegalNamesMatch(line.trim(), party));
}

export function countPartyBlocksInExecutionTail(text: string, parties: readonly string[]): number {
  const tail = executionTail(text).toLowerCase();
  let count = 0;
  for (const party of parties) {
    if (partyNameAppearsInCorpusTail(tail, party)) count += 1;
  }
  return count;
}

export function assertCanonicalPartyCount(
  label: string,
  intakeText: string,
  draft: ParsedDraftShape,
  expectedN: number,
  corpus?: string,
): void {
  const resolution = resolveAuthoritativeSignerCount({
    intakeText,
    draftParties: draft.parties,
    corpusPlain: corpus,
    manifestPartyCount: expectedN,
  });
  expect(resolution.count, `${label}:authoritativeSignerCount`).toBe(expectedN);
  expect(
    consumeAuthoritativeSignerCount(`${label}:consume`, {
      intakeText,
      draftParties: draft.parties,
      corpusPlain: corpus,
      manifestPartyCount: expectedN,
    }),
    `${label}:consume`,
  ).toBe(expectedN);
}

export function assertHandoffSlotIntegrity(
  handoff: PremiumRecipientHandoffV2 | null,
  expectedN: number,
  parties: readonly string[],
): void {
  expect(handoff, "handoff").not.toBeNull();
  const slots = linearPremiumRecipientSlots(handoff!, expectedN);
  expect(slots.length, "partySlots").toBe(expectedN);
  const counts = countSignerMetadataSlots(handoff!, expectedN);
  expect(counts.partySlots, "signerMetadataSlots").toBe(expectedN);
  for (let i = 0; i < expectedN; i += 1) {
    const slot = slots[i]!;
    const entity = parties[i] ?? "";
    expect(slot.name.trim().length, `slot${i}:name`).toBeGreaterThan(2);
    if (entity) {
      expect(slot.name.toLowerCase(), `slot${i}:entity`).toContain(
        entity.split(/\s+/)[0]!.toLowerCase(),
      );
    }
    const signerName = (slot.signerName || "").trim();
    if (signerName) {
      expect(isAuthoritativeLegalEntityName(signerName), `slot${i}:signerNotEntity`).toBe(false);
    }
    const email = (slot.email || "").trim();
    if (email) {
      expect(looksLikeEmail(email), `slot${i}:email`).toBe(true);
    }
  }
  const phantom = slots.slice(expectedN);
  expect(phantom.length, "phantomTail").toBe(0);
}

export function assertAuthorityPartiesMetadata(
  label: string,
  authority: readonly PaidProSignerMetadataParty[],
  parties: readonly string[],
  signerNames: readonly string[],
): void {
  expect(authority.length, `${label}:authorityLen`).toBe(parties.length);
  for (let i = 0; i < parties.length; i += 1) {
    expect(authority[i]?.partyLegalName, `${label}:entity${i}`).toBeTruthy();
    expect(isAuthoritativeLegalEntityName(authority[i]!.partyLegalName), `${label}:entityLegal${i}`).toBe(
      true,
    );
    if (signerNames[i]) {
      expect(authority[i]?.signerName, `${label}:signer${i}`).toBe(signerNames[i]);
      expect(
        isAuthoritativeLegalEntityName(authority[i]?.signerName ?? ""),
        `${label}:signerNotEntity${i}`,
      ).toBe(false);
    }
  }
}

export function assertCorpusNPartyStructure(args: NPartyAuthorityExpectations): void {
  const { corpus, parties, expectedN, intakeText, signerNames, requireNoticeStanzas = true } = args;
  expect(corpus.length).toBeGreaterThan(3000);
  expect(countPaidProExecutionBlocks(corpus), "executionBlocks").toBe(1);
  expect(countPartyBlocksInExecutionTail(corpus, parties), "signaturePartyBlocks").toBe(expectedN);
  expect(countSignatureExecutionLinesInTail(corpus), "signatureByLines").toBeGreaterThanOrEqual(expectedN);
  if (requireNoticeStanzas) {
    expect(countOperativeIfToNoticeStanzas(corpus), "noticeStanzas").toBe(expectedN);
  }
  const contamination = evaluateProfessionalCorpusContamination(corpus, {
    partyNames: parties,
    partyCount: expectedN,
    intakeText,
    signerNames,
  });
  expect(contamination.ok, contamination.issues.map((i) => i.code).join(",")).toBe(true);
  expect(corpus).not.toMatch(/RED MESA BLUE CANYON HARBOR IRON/);
}
