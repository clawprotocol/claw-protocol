/**
 * Shared TEST396 quad-party freeze fixtures (not a test module — safe for fixture import chains).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc.";

export const TEST396_QUAD_PARTY_INTAKE = [
  "Create a multi-party revenue sharing agreement.",
  "",
  "Party 1",
  `Legal Entity: ${RED}`,
  "Signer Name: Sarah Mitchell",
  "Signer Title: CEO",
  "Signer Email: contracts@redmesa-logistics.com",
  "Address: 100 Commerce Way, Tulsa, OK 74103",
  "",
  "Party 2",
  `Legal Entity: ${BLUE}`,
  "Signer Name: Dana Chen",
  "Signer Title: President",
  "Signer Email: legal@bluecanyonanalytics.com",
  "",
  "Party 3",
  `Legal Entity: ${HARBOR}`,
  "Signer Name: Michael Torres",
  "Signer Title: President",
  "Signer Email: legal@harborpeakautomation.com",
  "",
  "Party 4",
  `Legal Entity: ${IRON}`,
  "Signer Name: Rebecca Stone",
  "Signer Title: Managing Partner",
  "Signer Email: rstone@ironvale.com",
  "",
  "Oklahoma law governs. Provider fees and revenue sharing among the parties.",
].join("\n");

export function test396Draft(): ParsedDraftShape {
  return {
    title: "Multi-Party Revenue Sharing Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement",
    parties: [
      { name: RED, role: "Party 1", email: "contracts@redmesa-logistics.com" } as never,
      { name: BLUE, role: "Party 2", email: "legal@bluecanyonanalytics.com" } as never,
      { name: HARBOR, role: "Party 3", email: "legal@harborpeakautomation.com" } as never,
      { name: IRON, role: "Party 4", email: "rstone@ironvale.com" } as never,
    ],
    purpose: "Revenue sharing and provider fees.",
    payment_terms: "Provider fees.",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 1, cadence: "monthly", valid: true },
  };
}

export function test396Parties() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 4,
    recipient1Name: RED,
    recipient2Name: BLUE,
    recipient1Email: "contracts@redmesa-logistics.com",
    recipient2Email: "legal@bluecanyonanalytics.com",
    extraPartyReviewEmails: ["legal@harborpeakautomation.com", "rstone@ironvale.com"],
    partySignerNames: ["Sarah Mitchell", "Dana Chen", "Michael Torres", "Rebecca Stone"],
    partySignerTitles: ["CEO", "President", "President", "Managing Partner"],
    partyAddresses: ["100 Commerce Way, Tulsa, OK 74103", "", "", ""],
  }).parties;
}
