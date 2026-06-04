/**
 * DEV/QA pipeline diagnostics for home-prompt signer metadata → parties → handoff → hydration.
 */

import { extractBetweenPartyNameList } from "./partyBetweenParse";
import {
  matchSignerForEntityIsClauses,
  stripSignerInstructionClausesFromIntake,
} from "./intakeSignerInstructionParse";
import { resolveUniversalSignerMetadataBySlot } from "./universalSignerMetadataAuthority";
import {
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
} from "./premiumPartyNamesHandoff";
import { paidProSignerMetadataForensicLineageEnabled } from "./paidProSignerMetadataAuthority";

export type SignerPipelineDiagnosticArgs = {
  stage: string;
  intakeRaw?: string | null;
  legalEntities?: readonly string[];
  draftParties?: readonly { name?: string | null; signerName?: string | null; signerTitle?: string | null }[];
  uiSignerNames?: readonly string[];
  uiSignerTitles?: readonly string[];
  executionBlockSignerSource?: string | null;
};

function diagnosticsEnabled(): boolean {
  return (
    paidProSignerMetadataForensicLineageEnabled() ||
    (typeof import.meta !== "undefined" && import.meta.env?.DEV === true)
  );
}

export function logPaidProSignerMetadataPipelineDiagnostics(args: SignerPipelineDiagnosticArgs): void {
  if (!diagnosticsEnabled()) return;
  const intakeRaw = String(args.intakeRaw ?? "");
  const cleaned = stripSignerInstructionClausesFromIntake(intakeRaw);
  const extracted = matchSignerForEntityIsClauses(intakeRaw);
  const betweenParties = extractBetweenPartyNameList(cleaned);
  const legalEntities =
    args.legalEntities ??
    args.draftParties?.map((p) => String(p.name ?? "").trim()).filter(Boolean) ??
    betweenParties;

  // eslint-disable-next-line no-console
  console.info("[signer-intake-raw]", {
    stage: args.stage,
    len: intakeRaw.length,
    extractedClauses: extracted,
  });
  // eslint-disable-next-line no-console
  console.info("[signer-intake-cleaned]", {
    stage: args.stage,
    len: cleaned.length,
    betweenParties,
  });

  const resolved = resolveUniversalSignerMetadataBySlot({
    legalEntities,
    intakeText: intakeRaw,
    draftParties: args.draftParties ?? null,
    uiSignerNames: args.uiSignerNames,
    uiSignerTitles: args.uiSignerTitles,
  });
  // eslint-disable-next-line no-console
  console.info("[signer-authority-state]", {
    stage: args.stage,
    legalEntities,
    resolved: resolved.map((r) => ({
      entity: r.entity,
      signerName: r.signerName,
      signerTitle: r.signerTitle,
      source: r.source,
    })),
  });

  const handoff = readPremiumRecipientHandoff();
  const handoffSlots = linearPremiumRecipientSlots(handoff, Math.max(legalEntities.length, 2));
  // eslint-disable-next-line no-console
  console.info("[review-link-signer-payload]", {
    stage: args.stage,
    partySlots: handoffSlots.length,
    slots: handoffSlots.map((s) => ({
      name: s.name,
      signerName: s.signerName,
      signerTitle: s.signerTitle,
    })),
    slotsWithSignerName: handoffSlots.filter((s) => String(s.signerName ?? "").trim()).length,
    slotsWithSignerTitle: handoffSlots.filter((s) => String(s.signerTitle ?? "").trim()).length,
  });

  // eslint-disable-next-line no-console
  console.info("[hydration-signer-payload]", {
    stage: args.stage,
    uiSignerNames: args.uiSignerNames ?? [],
    uiSignerTitles: args.uiSignerTitles ?? [],
    draftSignerNames: (args.draftParties ?? []).map((p) => p.signerName ?? ""),
    draftSignerTitles: (args.draftParties ?? []).map((p) => p.signerTitle ?? ""),
  });

  if (args.executionBlockSignerSource) {
    // eslint-disable-next-line no-console
    console.info("[execution-block-signer-source]", {
      stage: args.stage,
      source: args.executionBlockSignerSource,
    });
  }
}
