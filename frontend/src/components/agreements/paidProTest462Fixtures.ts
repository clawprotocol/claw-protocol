/**
 * TEST462 — outdoor-products four-party frozen SoT with notice boundary/stanza collapse defects.
 */

import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";
import {
  TEST457_LIVE_INTAKE,
  TEST457_MIN_SERVER_LEN,
  test457BrightPeakFirstDraft,
} from "./paidProTest457Fixtures";
import { buildTest461FrozenHandoffCorpus, TEST461_SIGNER_METADATA } from "./paidProTest461Vs01PreparePacketFixtures";

export const TEST462_LIVE_INTAKE = TEST457_LIVE_INTAKE;
export const TEST462_MIN_FROZEN_LEN = TEST457_MIN_SERVER_LEN;
export const TEST462_ALL_PARTIES = [TEST440_EVERGREEN, TEST440_ATLAS, TEST440_HORIZON, TEST440_BRIGHT_PEAK];
export const TEST462_SIGNER_METADATA = TEST461_SIGNER_METADATA;

export function test462BrightPeakFirstDraft() {
  return test457BrightPeakFirstDraft();
}

function buildCollapsedInlineNoticeStanza(
  entity: string,
  signerName: string,
  signerTitle: string,
  email: string,
  address: string,
): string {
  return `If to ${entity}: ${entity} Attn: ${signerName}, ${signerTitle} Email: ${email} ${address}`;
}

/** Frozen substantive corpus with void12.2 join, venue.12.4 join, and collapsed inline notice stanzas. */
export function buildTest462FrozenHandoffCorpus(): string {
  let body = buildTest461FrozenHandoffCorpus();
  const voidJoin = "Any prohibited assignment is void12.2 Notices";
  if (!/void12\.2 Notices/i.test(body)) {
    const noticesIdx = body.search(/12\.2\s+Notices|12\.\s+Disputes/i);
    if (noticesIdx >= 0) {
      body = `${body.slice(0, noticesIdx).trimEnd()}\n\n${voidJoin}\n\n${body.slice(noticesIdx).trimStart()}`;
    } else {
      body = `${body.trimEnd()}\n\n${voidJoin}`;
    }
  }

  const collapsedStanzas = [
    buildCollapsedInlineNoticeStanza(
      TEST440_EVERGREEN,
      TEST462_SIGNER_METADATA.partySignerNames[0]!,
      TEST462_SIGNER_METADATA.partySignerTitles[0]!,
      TEST462_SIGNER_METADATA.recipient1Email,
      TEST462_SIGNER_METADATA.partyAddresses[0]!,
    ),
    buildCollapsedInlineNoticeStanza(
      TEST440_ATLAS,
      TEST462_SIGNER_METADATA.partySignerNames[1]!,
      TEST462_SIGNER_METADATA.partySignerTitles[1]!,
      TEST462_SIGNER_METADATA.recipient2Email,
      TEST462_SIGNER_METADATA.partyAddresses[1]!,
    ),
    buildCollapsedInlineNoticeStanza(
      TEST440_HORIZON,
      TEST462_SIGNER_METADATA.partySignerNames[2]!,
      TEST462_SIGNER_METADATA.partySignerTitles[2]!,
      TEST462_SIGNER_METADATA.extraPartyReviewEmails[0]!,
      TEST462_SIGNER_METADATA.partyAddresses[2]!,
    ),
    buildCollapsedInlineNoticeStanza(
      TEST440_BRIGHT_PEAK,
      TEST462_SIGNER_METADATA.partySignerNames[3]!,
      TEST462_SIGNER_METADATA.partySignerTitles[3]!,
      TEST462_SIGNER_METADATA.extraPartyReviewEmails[1]!,
      TEST462_SIGNER_METADATA.partyAddresses[3]!,
    ),
  ];

  for (const stanza of collapsedStanzas) {
    const entity = stanza.match(/^If to\s+(.+?):/i)?.[1]?.trim() ?? "";
    if (!entity) continue;
    const thinRe = new RegExp(
      `If to\\s+${entity.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}:[^\\n]*`,
      "i",
    );
    if (thinRe.test(body)) {
      body = body.replace(thinRe, stanza);
    }
  }

  return body;
}
