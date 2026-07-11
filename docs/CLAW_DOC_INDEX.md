# CLAW Documentation Index (Authoritative)

This file exists to help humans and AI agents navigate CLAW documentation.

## Core Authority
- docs/CLAW_CANON.md — authority order, scope, philosophy
- STATE.md — current implementation state

## LawDog Product Architecture (root)
- docs/architecture/LAWDOG_SYSTEM_ARCHITECTURE.md — **root** product architecture: layers, domain objects, lifecycle, markers, persistence, invariants (screenflow children reference this)
- docs/architecture/LAWDOG_DOMAIN_MODEL.md — **what** objects exist: ownership, lifetime, persistence, mutation authority (canonical noun reference for screenflows)
- docs/architecture/LAWDOG_INTERACTION_DATA_FLOW.md — **how** data moves: lifecycle stages, gates, mutation choreography, fail-closed transitions
- docs/architecture/LAWDOG_ARCHITECTURE_DECISIONS.md — **why** decisions (ADRs): freeze immutability, review-before-sign, parity, markers, proof boundaries

## CLAW v1 Utilities
- docs/CLAW_V1_UTILITIES.md — e-sign, timelines, personal liability, agreements
- docs/CLAW_AUTOMATED_DETERMINATION_CLAUSE.md — adjudication logic (agreements)
- docs/CLAW_PERSONAL_LIABILITY.md (if exists; otherwise TODO)

## Timelines & Evidence
- docs/CLAW_TIMELINE_API.md
- docs/CLAW_PROOF-v0-COMPLIANCE.md

## Anchoring / Crypto (Non-Product)
- docs/ANCHORING.md
- docs/ANCHORING_MODEL.md

## Genesis / Governance
- docs/GENESIS.md
- docs/HASHES.genesis-v0.sha256

## Automated Determination (v1)

- CLAW_PERSONAL_LIABILITY.md  
  Canonical definition of liability classifications (non-advisory)

- CLAW_AUTOMATED_DETERMINATION_CLAUSE_V1.md  
  Mechanical rules for consuming liability outputs

- CLAW_SAMPLE_AGREEMENT_ONE_PAGER_V1.md  
  Demonstration agreement consuming determination output only


This index is non-normative but authoritative for navigation.
