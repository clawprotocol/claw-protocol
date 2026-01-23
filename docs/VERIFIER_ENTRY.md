# Verifier Entry (v1.x)

This is the canonical starting point for anyone who wants to **verify** a CLAW v1.x receipt.

CLAW verification is **deterministic, reproducible, and trust-minimized**.
It does not rely on trust in CLAW, its authors, or its infrastructure.

CLAW verifies **existence, sequence, and integrity of records** —
not truth, legal merit, adjudication, or enforcement.

---

## What you can verify

A CLAW v1.x receipt allows any third party to verify that specific digital content:

- existed in a particular form,
- no later than a known time, and
- has not been altered since that time.

Verification proves **cryptographic consistency** between:
- the content (or its committed hash),
- the canonicalized representation,
- the receipt fields, and
- (if present) a public blockchain anchor.

---

## What CLAW does not do

CLAW does **not**:
- determine truth or falsity,
- evaluate legal validity or merit,
- adjudicate disputes,
- issue judgments or rulings,
- confer authority, or
- enforce outcomes.

Any legal significance, if any, arises solely from **external law or voluntary agreement**.

---

## Quickstart (recommended)

Run the reproducible verifier pack:

- Reproduction Pack: [`../repro/`](../repro/)
- One-command verifier: [`../repro/verify.sh`](../repro/verify.sh)

---

## Full procedure and technical details

Read the complete verification guide:

- Verification Guide: [`VERIFY.md`](VERIFY.md)
