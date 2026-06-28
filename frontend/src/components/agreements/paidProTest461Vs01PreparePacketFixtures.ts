/**
 * TEST461 — outdoor-products four-party frozen SoT → VS01 prepare_signing_packet handoff.
 */

import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";
import {
  buildTest457LiveSuccessPolishDefectsBody,
  TEST457_LIVE_INTAKE,
  TEST457_MIN_SERVER_LEN,
  test457BrightPeakFirstDraft,
} from "./paidProTest457Fixtures";

export const TEST461_LIVE_INTAKE = TEST457_LIVE_INTAKE;
export const TEST461_MIN_FROZEN_LEN = TEST457_MIN_SERVER_LEN;
export const TEST461_ALL_PARTIES = [TEST440_EVERGREEN, TEST440_ATLAS, TEST440_HORIZON, TEST440_BRIGHT_PEAK];

export function test461BrightPeakFirstDraft() {
  return test457BrightPeakFirstDraft();
}

/** Frozen ~27k corpus with live venue.12.4 Notices join defect. */
export function buildTest461FrozenHandoffCorpus(): string {
  let body = buildTest457LiveSuccessPolishDefectsBody();
  const venueJoin =
    "Each party consents to that jurisdiction and venue.12.4 Notices must be delivered in writing.";
  if (/venue\.12\.4 Notices/i.test(body)) {
    return body;
  }
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx >= 0) {
    body = `${body.slice(0, witnessIdx).trimEnd()}\n\n${venueJoin}\n\n${body.slice(witnessIdx).trimStart()}`;
  } else {
    body = `${body.trimEnd()}\n\n${venueJoin}`;
  }
  return body;
}

export const TEST461_SIGNER_METADATA = {
  partyCount: 4,
  recipient1Name: TEST440_EVERGREEN,
  recipient2Name: TEST440_ATLAS,
  recipient1Email: "cryptocurated21+e@gmail.com",
  recipient2Email: "cryptocurated21+a@gmail.com",
  extraPartyLegalNames: [TEST440_HORIZON, TEST440_BRIGHT_PEAK],
  extraPartyReviewEmails: ["cryptocurated21+h@gmail.com", "cryptocurated21+b@gmail.com"],
  partySignerNames: ["Eve Green", "Ann Center", "Hans Wiener", "Benton Reese"],
  partySignerTitles: ["CEO", "CIO", "Member", "Manager"],
  partyAddresses: [
    "100 Evergreen Way, Tulsa, OK 74101",
    "200 Atlas Ave, Oklahoma City, OK 73102",
    "300 Horizon Blvd, Norman, OK 73069",
    "400 BrightPeak Dr, Edmond, OK 73034",
  ],
} as const;
