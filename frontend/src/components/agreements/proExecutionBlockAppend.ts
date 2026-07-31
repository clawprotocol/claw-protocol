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

function roleNorm(label: string | null | undefined): string {
  return String(label || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Prefer semantic Client / Service Provider roles over raw manifest array order. */
function orderRecordsForExecutionBlock(
  records: readonly CanonicalPartyIdentityRecord[],
): {
  client: CanonicalPartyIdentityRecord | undefined;
  provider: CanonicalPartyIdentityRecord | undefined;
} {
  const client =
    records.find((r) => {
      const role = roleNorm(r.roleLabel);
      return role === "client" || role === "customer" || role === "buyer";
    }) ?? records[0];
  const provider =
    records.find((r) => {
      const role = roleNorm(r.roleLabel);
      return (
        role === "service provider" ||
        role === "provider" ||
        role === "contractor" ||
        role === "vendor"
      );
    }) ?? records.find((r) => r !== client) ?? records[1];
  return { client, provider };
}

function buildExecutionBlock(records: readonly CanonicalPartyIdentityRecord[]): string {
  const { client, provider } = orderRecordsForExecutionBlock(records);
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

  const clientHeading = /client|customer|buyer/i.test(client.roleLabel)
    ? "CLIENT"
    : client.roleLabel.toUpperCase();
  const providerHeading = /provider|contractor|vendor/i.test(provider.roleLabel)
    ? "SERVICE PROVIDER"
    : provider.roleLabel.toUpperCase();

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
    `${clientHeading}:`,
    client.fullLegalName,
    "By: _________________________________",
    ...clientLines.slice(1),
    "",
    `${providerHeading}:`,
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
