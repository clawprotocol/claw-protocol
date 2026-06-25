/**
 * TEST436 — malformed notice / heading fragments for idempotency invariant tests.
 */

import { NORTH_STAR, SUMMIT_RIDGE } from "./paidProTest429FourPartyNorthStarFixtures";
import { TEST435_NORTH_STAR_PARTIES } from "./paidProTest435NorthStarFormattingFixtures";

export const TEST436_NORTH_STAR_PARTIES = [...TEST435_NORTH_STAR_PARTIES];

/** Duplicated header + entity lines mirroring live TEST435 wire defects. */
export function buildTest436MalformedNorthStarNoticeStanza(party = NORTH_STAR): string {
  return [
    `If to ${party} ${party} :`,
    `${party} ${party}`,
    "Attn: Authorized Signer",
    "Email: primary business email on file with the Party",
    "Address: primary business address on file with the Party",
  ].join("\n");
}

export function buildTest436MalformedSummitRidgeNoticeStanza(): string {
  return buildTest436MalformedNorthStarNoticeStanza(SUMMIT_RIDGE);
}

export const TEST436_DUPLICATED_IF_TO_HEADER = `If to ${NORTH_STAR} ${NORTH_STAR} :`;
export const TEST436_DUPLICATED_ENTITY_LINE = `${NORTH_STAR} ${NORTH_STAR}`;

export const TEST436_SPLIT_HEADING_FRAGMENTS_REPAIR_SPLIT: ReadonlyArray<{
  label: string;
  input: string;
  merged: RegExp;
}> = [
  {
    label: "Lead Consultant Responsibilities",
    input: ["1.2 Lead", "", "Consultant Responsibilities", "Lead Consultant will manage governance."].join("\n"),
    merged: /Lead Consultant Responsibilities/i,
  },
  {
    label: "Revenue Allocation Among Service Providers",
    input: [
      "3.4 Revenue",
      "",
      "Allocation Among Service Providers",
      "Fees are allocated among service providers.",
    ].join("\n"),
    merged: /Revenue Allocation Among Service Providers/i,
  },
  {
    label: "Timing of Internal Allocation Payments",
    input: [
      "3.5 Timing of Internal",
      "",
      "Allocation Payments",
      "Lead Consultant tracks internal allocations.",
    ].join("\n"),
    merged: /Timing of Internal Allocation Payments/i,
  },
];

export const TEST436_SPLIT_HEADING_FRAGMENTS_AUTHORITY: ReadonlyArray<{
  label: string;
  input: string;
  merged: RegExp;
}> = [
  {
    label: "Client Materials and Data",
    input: ["4. Client Materials", "", "and Data", "Client will provide materials."].join("\n"),
    merged: /Client Materials and Data/i,
  },
  {
    label: "Intellectual Property, Work Product and Data",
    input: [
      "5. Intellectual Property, Work Product",
      "",
      "and Data",
      "Ownership terms apply.",
    ].join("\n"),
    merged: /Intellectual Property, Work Product and Data/i,
  },
  {
    label: "Governing Law and Venue",
    input: ["11. Governing Law", "", "and Venue", "Oklahoma law governs."].join("\n"),
    merged: /Governing Law and Venue/i,
  },
];

/** @deprecated use TEST436_SPLIT_HEADING_FRAGMENTS_REPAIR_SPLIT */
export const TEST436_SPLIT_HEADING_FRAGMENTS = TEST436_SPLIT_HEADING_FRAGMENTS_REPAIR_SPLIT;
