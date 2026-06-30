/**
 * Single entry point for structured intake party/signer/contact field recognition.
 * All modules that parse Representative, title, email, address, or entity headings
 * should import from here — do not reimplement field patterns elsewhere.
 */

export {
  parseAllStructuredPartyContactBlocks,
  parseEntityHeaderContactBlocks,
  parseLabeledPartyBlocks,
  labeledPartyBlocksForSignerMetadata,
  stripIntakeBulletPrefix,
  type LabeledPartyBlock,
} from "./labeledPartyBlockParse";

export {
  alignIntakeSignerMetadataToLegalEntities,
  authorityPartiesFromIntakeSignerMetadata,
  countIntakeSignerMetadataSlots,
  extractCanonicalIntakeSignerMetadata,
  mergeIntakeSignerMetadataIntoAuthorityParties,
  type CanonicalIntakeSignerSlot,
  type ExtractedIntakeSignerMetadata,
} from "./intakeSignerMetadataAuthority";
