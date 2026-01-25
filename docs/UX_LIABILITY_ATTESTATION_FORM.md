# UX — Liability Attestation Form (CLAW v1)

This form captures user declarations for the Personal Liability utility.
Inputs map directly to `notice.liability_attestation`.

## Fields (Required unless noted)

- role (select):
  - natural_person | entity | agent | officer | employee | contractor | other

- capacity (select):
  - individual | representative | delegated | unknown

- relationship (select):
  - owner | signer | operator | beneficiary | third_party | unknown

- control_flags (multi-select, optional):
  - custody_asserted
  - operational_control
  - access_rights
  - public_facing_role

- valid_from (datetime, UTC):
  - when this declaration becomes effective

- valid_to (datetime, UTC, optional):
  - leave empty if open-ended

- declared_exclusions (multi-select, optional):
  - no_authority
  - no_control
  - not_acting_as_agent

## UX Rules
- Show clear disclaimer: “This is not legal advice.”
- Require explicit user confirmation before submit.
- Display a read-only preview of generated tags/flags after submit
  (fetched from `/v1/liability/assessment/{event_id}`).

## Submission
- Submit as `event_type=notice` with `notice.liability_attestation`.
- Do not edit after submission (timeline immutability).
