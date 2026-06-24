/**
 * TEST429 — sanitized historical LawDog failure regression corpus (TEST359–428).
 * Table-driven cases map real user-facing failure classes to concrete invariants.
 */

export type Test429AssertionStage =
  | "review"
  | "freeze_gate"
  | "hydration"
  | "recovery"
  | "dashboard"
  | "starter_gate"
  | "heading_repair"
  | "signer_edit"
  | "full_workflow";

export type Test429InvariantKey =
  | "review_mounted_non_thin"
  | "no_blank_pro_shell"
  | "single_execution_block"
  | "single_witness"
  | "no_malformed_headings"
  | "full_legal_entity_names"
  | "human_signer_names"
  | "metadata_fields_preserved"
  | "notices_match_parties"
  | "review_sot_parity"
  | "dashboard_completion"
  | "stale_corpus_cleared"
  | "recovery_frozen_sot"
  | "no_fixture_contamination"
  | "coordinator_excluded"
  | "partial_slots_preserve_known"
  | "starter_complexity_gate"
  | "signer_edit_carryover"
  | "client_materials_heading_merged"
  | "freeze_rejects_bad_corpus"
  | "sticky_cta_spacer"
  | "signer_setup_latch_timing"
  | "no_truncated_party_render"
  | "party_count_authority_stable"
  | "completed_n_execution_blocks"
  | "no_recovery_quad_bias"
  | "vs01_bridge_ready";

export type Test429SetupKind =
  | "default"
  | "signer_edit"
  | "recovery_structural"
  | "recovery_stale"
  | "glued_client_materials"
  | "duplicate_witness"
  | "malformed_freeze_gate"
  | "starter_gate_only"
  | "full_workflow";

export type Test429Case = {
  id: string;
  historicalFailure: string;
  historicalRef: string;
  fixtureType: string;
  partyCount: number;
  assertionStage: Test429AssertionStage;
  scenarioId: string;
  setupKind: Test429SetupKind;
  invariantKeys: Test429InvariantKey[];
};

export const TEST429_CASES: Test429Case[] = [
  {
    id: "h366_signer_edit_carryover",
    historicalFailure: "Signer edit details did not reflect on Review Pro screen",
    historicalRef: "TEST366",
    fixtureType: "consulting",
    partyCount: 2,
    assertionStage: "signer_edit",
    scenarioId: "a_consulting_2p_tech_logistics",
    setupKind: "signer_edit",
    invariantKeys: [
      "signer_edit_carryover",
      "review_mounted_non_thin",
      "human_signer_names",
      "single_execution_block",
      "review_sot_parity",
    ],
  },
  {
    id: "h370_completion_ready",
    historicalFailure: "Completed agreement emails / link missing after both signatures",
    historicalRef: "TEST370",
    fixtureType: "consulting",
    partyCount: 2,
    assertionStage: "full_workflow",
    scenarioId: "a_consulting_2p_tech_logistics",
    setupKind: "full_workflow",
    invariantKeys: ["vs01_bridge_ready", "dashboard_completion", "completed_n_execution_blocks"],
  },
  {
    id: "h379_first_draft_render",
    historicalFailure: "True agreement first draft failed to render",
    historicalRef: "TEST379",
    fixtureType: "consulting",
    partyCount: 2,
    assertionStage: "review",
    scenarioId: "a_consulting_2p_tech_logistics",
    setupKind: "default",
    invariantKeys: ["review_mounted_non_thin", "no_blank_pro_shell", "no_fixture_contamination"],
  },
  {
    id: "h397_four_party_placeholder",
    historicalFailure: "Four-party placeholder repair used only 2 parties",
    historicalRef: "TEST397",
    fixtureType: "revenue_share",
    partyCount: 4,
    assertionStage: "review",
    scenarioId: "c_revshare_4p_syndicate",
    setupKind: "default",
    invariantKeys: [
      "party_count_authority_stable",
      "notices_match_parties",
      "full_legal_entity_names",
      "no_truncated_party_render",
    ],
  },
  {
    id: "h341_client_materials_heading",
    historicalFailure: "Client Materials heading split/cutoff/unbolded",
    historicalRef: "TEST341",
    fixtureType: "consulting",
    partyCount: 2,
    assertionStage: "heading_repair",
    scenarioId: "a_consulting_2p_tech_logistics",
    setupKind: "glued_client_materials",
    invariantKeys: ["client_materials_heading_merged", "no_malformed_headings"],
  },
  {
    id: "h368_duplicate_witness",
    historicalFailure: "Duplicate execution blocks / multiple IN WITNESS WHEREOF",
    historicalRef: "TEST368",
    fixtureType: "consulting",
    partyCount: 3,
    assertionStage: "review",
    scenarioId: "a_consulting_3p_hr_healthcare",
    setupKind: "duplicate_witness",
    invariantKeys: ["single_witness", "single_execution_block"],
  },
  {
    id: "h304_review_payload_parity",
    historicalFailure: "Review link payload mismatch vs owner review surface",
    historicalRef: "TEST304",
    fixtureType: "vendor",
    partyCount: 4,
    assertionStage: "review",
    scenarioId: "b_vendor_4p_implementation_support",
    setupKind: "default",
    invariantKeys: ["review_sot_parity", "review_mounted_non_thin"],
  },
  {
    id: "h_truncated_party_names",
    historicalFailure: "Party legal names truncated in render",
    historicalRef: "TEST359",
    fixtureType: "consulting",
    partyCount: 3,
    assertionStage: "review",
    scenarioId: "a_consulting_3p_hr_healthcare",
    setupKind: "default",
    invariantKeys: ["full_legal_entity_names", "no_truncated_party_render"],
  },
  {
    id: "h_dashboard_signed_status",
    historicalFailure: "Dashboard status did not update after both signatures",
    historicalRef: "TEST370",
    fixtureType: "vendor",
    partyCount: 3,
    assertionStage: "dashboard",
    scenarioId: "b_vendor_3p_prime_sub",
    setupKind: "default",
    invariantKeys: ["dashboard_completion", "completed_n_execution_blocks"],
  },
  {
    id: "h_party2_email_partial",
    historicalFailure: "Party 2 review email missing or role persisted without email",
    historicalRef: "TEST412",
    fixtureType: "partial_metadata",
    partyCount: 2,
    assertionStage: "hydration",
    scenarioId: "f_metadata_2p_missing_email",
    setupKind: "default",
    invariantKeys: ["partial_slots_preserve_known", "metadata_fields_preserved"],
  },
  {
    id: "h414_metadata_4_to_2",
    historicalFailure: "Four-party signer metadata degraded 4 → 2",
    historicalRef: "TEST414",
    fixtureType: "vendor",
    partyCount: 4,
    assertionStage: "hydration",
    scenarioId: "b_vendor_4p_implementation_support",
    setupKind: "default",
    invariantKeys: ["party_count_authority_stable", "human_signer_names", "completed_n_execution_blocks"],
  },
  {
    id: "h419_blank_shell_after_reject",
    historicalFailure: "Blank LawDog Pro Draft shell after accepted-then-rejected SoT",
    historicalRef: "TEST419",
    fixtureType: "recovery",
    partyCount: 4,
    assertionStage: "recovery",
    scenarioId: "g_recovery_4p_revshare",
    setupKind: "recovery_structural",
    invariantKeys: ["no_blank_pro_shell", "recovery_frozen_sot", "review_mounted_non_thin"],
  },
  {
    id: "h421_stale_unfrozen_corpus",
    historicalFailure: "Stale accepted-but-unfrozen corpus used after structural rejection",
    historicalRef: "TEST421",
    fixtureType: "recovery",
    partyCount: 3,
    assertionStage: "recovery",
    scenarioId: "g_recovery_3p_vendor",
    setupKind: "recovery_stale",
    invariantKeys: ["stale_corpus_cleared", "recovery_frozen_sot", "no_blank_pro_shell"],
  },
  {
    id: "h396_notice_inflation",
    historicalFailure: "Notice stanzas inflated from phantom rows",
    historicalRef: "TEST396",
    fixtureType: "revenue_share",
    partyCount: 4,
    assertionStage: "review",
    scenarioId: "c_revshare_4p_syndicate",
    setupKind: "default",
    invariantKeys: ["notices_match_parties", "party_count_authority_stable"],
  },
  {
    id: "h_entity_as_signer_name",
    historicalFailure: "Signer name lines using entity names instead of human names",
    historicalRef: "TEST405",
    fixtureType: "vendor",
    partyCount: 4,
    assertionStage: "hydration",
    scenarioId: "b_vendor_4p_implementation_support",
    setupKind: "default",
    invariantKeys: ["human_signer_names", "metadata_fields_preserved"],
  },
  {
    id: "h_duplicate_signature_tail",
    historicalFailure: "Date/signature block drift or duplicate signature tails",
    historicalRef: "TEST368",
    fixtureType: "joint_venture",
    partyCount: 5,
    assertionStage: "review",
    scenarioId: "d_jv_5p_saas_partnership",
    setupKind: "default",
    invariantKeys: ["single_execution_block", "single_witness", "completed_n_execution_blocks"],
  },
  {
    id: "h_sticky_cta_spacer",
    historicalFailure: "Sticky CTA overlap with signature block / signer setup",
    historicalRef: "TEST297",
    fixtureType: "partial_metadata",
    partyCount: 2,
    assertionStage: "review",
    scenarioId: "f_metadata_2p_missing_email",
    setupKind: "default",
    invariantKeys: ["sticky_cta_spacer"],
  },
  {
    id: "h_signer_setup_latch_timing",
    historicalFailure: "Review mode showing signer setup too early",
    historicalRef: "TEST286",
    fixtureType: "consulting",
    partyCount: 2,
    assertionStage: "review",
    scenarioId: "a_consulting_2p_tech_logistics",
    setupKind: "default",
    invariantKeys: ["signer_setup_latch_timing"],
  },
  {
    id: "h_malformed_headings_reject",
    historicalFailure: "Pro output accepted despite synthetic malformed headings",
    historicalRef: "TEST411",
    fixtureType: "consulting",
    partyCount: 4,
    assertionStage: "freeze_gate",
    scenarioId: "a_consulting_4p_cyber_manufacturer",
    setupKind: "malformed_freeze_gate",
    invariantKeys: ["freeze_rejects_bad_corpus"],
  },
  {
    id: "h_orphan_glued_headings",
    historicalFailure: "Section numbering/orphan/glued heading corruption",
    historicalRef: "TEST312",
    fixtureType: "vendor",
    partyCount: 3,
    assertionStage: "review",
    scenarioId: "b_vendor_3p_prime_sub",
    setupKind: "default",
    invariantKeys: ["no_malformed_headings", "no_fixture_contamination"],
  },
  {
    id: "h_coordinator_exclusion",
    historicalFailure: "Coordinator-only should not add coordinator as signer/party",
    historicalRef: "TEST412",
    fixtureType: "coordinator_only",
    partyCount: 4,
    assertionStage: "review",
    scenarioId: "e_coordinator_4p",
    setupKind: "default",
    invariantKeys: ["coordinator_excluded", "notices_match_parties"],
  },
  {
    id: "h_partial_metadata_preserve",
    historicalFailure: "Partial metadata preserves known fields and prompts only for missing",
    historicalRef: "TEST412",
    fixtureType: "partial_metadata",
    partyCount: 3,
    assertionStage: "hydration",
    scenarioId: "f_metadata_3p_partial_title",
    setupKind: "default",
    invariantKeys: ["partial_slots_preserve_known", "metadata_fields_preserved"],
  },
  {
    id: "h_five_party_execution_blocks",
    historicalFailure: "4–5 party completed corpus preserves all execution blocks",
    historicalRef: "TEST425",
    fixtureType: "joint_venture",
    partyCount: 5,
    assertionStage: "hydration",
    scenarioId: "d_jv_5p_saas_partnership",
    setupKind: "default",
    invariantKeys: ["completed_n_execution_blocks", "full_legal_entity_names"],
  },
  {
    id: "h_recovery_no_quad_bias",
    historicalFailure: "Recovery corpus should not bias toward Red Mesa/Blue Canyon",
    historicalRef: "TEST426",
    fixtureType: "recovery",
    partyCount: 2,
    assertionStage: "recovery",
    scenarioId: "g_recovery_2p_consulting",
    setupKind: "recovery_structural",
    invariantKeys: ["no_recovery_quad_bias", "no_fixture_contamination", "recovery_frozen_sot"],
  },
  {
    id: "h_starter_gate_three_party",
    historicalFailure: "Free Starter gates to Pro for 3+ parties without premature Pro shell",
    historicalRef: "TEST359",
    fixtureType: "vendor",
    partyCount: 3,
    assertionStage: "starter_gate",
    scenarioId: "b_vendor_3p_prime_sub",
    setupKind: "starter_gate_only",
    invariantKeys: ["starter_complexity_gate"],
  },
  {
    id: "h_starter_gate_coordinator",
    historicalFailure: "Free Starter gates coordinator-only to Pro without premature shell",
    historicalRef: "TEST372",
    fixtureType: "coordinator_only",
    partyCount: 4,
    assertionStage: "starter_gate",
    scenarioId: "e_coordinator_4p",
    setupKind: "starter_gate_only",
    invariantKeys: ["starter_complexity_gate"],
  },
  {
    id: "h_starter_gate_revshare",
    historicalFailure: "Free Starter gates revenue-share to Pro without premature shell",
    historicalRef: "TEST359",
    fixtureType: "revenue_share",
    partyCount: 4,
    assertionStage: "starter_gate",
    scenarioId: "c_revshare_4p_syndicate",
    setupKind: "starter_gate_only",
    invariantKeys: ["starter_complexity_gate"],
  },
];

/** Split Client Materials heading corpus (sanitized entities). */
export function buildTest429SplitClientMaterialsCorpus(): string {
  return [
    "4. Project Coordination, Reviews and Changes",
    "The parties will coordinate in good faith.",
    "5. Ownership, Work Product and",
    "Client Materials",
    "",
    "5.1 Client Ownership of Paid Deliverables",
    "Client owns paid deliverables upon payment.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Velox Analytics Partners LLC",
  ].join("\n");
}
