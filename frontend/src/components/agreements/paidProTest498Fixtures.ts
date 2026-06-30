/**
 * TEST498 — Stonebridge / NovaPath / ClearSpring 3-party completed artifact parity (TEST474 reproduction).
 */

import {
  TEST490_CLEARSPRING,
  TEST490_NOVAPATH,
  TEST490_STONEBRIDGE,
} from "./paidProTest490Fixtures";

export const TEST498_SIGNERS = [
  {
    partyLegalName: TEST490_STONEBRIDGE,
    signerName: "Sandra Wells",
    signerTitle: "Managing Member",
    signerEmail: "cryptocurated21+s@gmail.com",
  },
  {
    partyLegalName: TEST490_NOVAPATH,
    signerName: "Caleb Price",
    signerTitle: "Chief Product Officer",
    signerEmail: "cryptocurated21+nova@gmail.com",
  },
  {
    partyLegalName: TEST490_CLEARSPRING,
    signerName: "Maya Coleman",
    signerTitle: "President",
    signerEmail: "cryptocurated21+cs@gmail.com",
  },
] as const;

export function buildTest498ThreePartyWitnessTail(): string {
  return [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    ...TEST498_SIGNERS.flatMap((party) => [
      `${party.partyLegalName}:`,
      "By: ______________________________",
      `Name: ${party.signerName}`,
      `Title: ${party.signerTitle}`,
      "Date: ______________________________",
      "",
    ]),
  ].join("\n");
}
