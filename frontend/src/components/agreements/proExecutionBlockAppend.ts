/**
 * Append a clean execution / signature block when accepted Pro corpus lacks witness structure.
 */

import type { CanonicalPartyIdentityRecord } from "./canonicalPartyIdentityResolver";
import { corpusHasVisibleSignatureExecutionLines } from "./guidedDealCompletion/signatureRegion";

export type AppendProExecutionBlockResult = {
  text: string;
  appended: boolean;
  repairs: string[];
};

function buildExecutionBlock(records: readonly CanonicalPartyIdentityRecord[]): string {
  const client = records[0];
  const provider = records[1];
  if (!client || !provider) {
    return [
      "IN WITNESS WHEREOF, the Parties have executed this Agreement as of the date last signed below.",
      "",
      "CLIENT:",
      "By: _________________________________",
      "Name: _______________________________",
      "Title: ______________________________",
      "Date: _______________________________",
      "",
      "SERVICE PROVIDER:",
      "By: _________________________________",
      "Name: _______________________________",
      "Title: ______________________________",
      "Date: _______________________________",
    ].join("\n");
  }

  const clientLines = [
    client.fullLegalName,
    client.signerName ? `Name: ${client.signerName}` : "Name: _______________________________",
    client.signerTitle ? `Title: ${client.signerTitle}` : "Title: ______________________________",
    "Date: _______________________________",
  ];
  const providerLines = [
    provider.fullLegalName,
    provider.signerName ? `Name: ${provider.signerName}` : "Name: _______________________________",
    provider.signerTitle ? `Title: ${provider.signerTitle}` : "Title: ______________________________",
    "Date: _______________________________",
  ];

  return [
    "IN WITNESS WHEREOF, the Parties have executed this Agreement as of the date last signed below.",
    "",
    `${client.roleLabel.toUpperCase()}:`,
    client.fullLegalName,
    "By: _________________________________",
    ...clientLines.slice(1),
    "",
    `${provider.roleLabel.toUpperCase()}:`,
    provider.fullLegalName,
    "By: _________________________________",
    ...providerLines.slice(1),
  ].join("\n");
}

export function appendProExecutionBlockIfMissing(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
): AppendProExecutionBlockResult {
  const body = (text || "").trim();
  if (!body) return { text: body, appended: false, repairs: [] };
  if (corpusHasVisibleSignatureExecutionLines(body)) {
    return { text: body, appended: false, repairs: [] };
  }
  const block = buildExecutionBlock(records);
  return {
    text: `${body}\n\n${block}`.replace(/\n{3,}/g, "\n\n").trim(),
    appended: true,
    repairs: ["execution_block:appended"],
  };
}
