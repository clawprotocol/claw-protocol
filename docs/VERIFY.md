# CLAW Verification (v1.x)

This document explains how to independently verify a CLAW v1.x receipt.

Verification in CLAW is **deterministic, reproducible, and trust-minimized**.
It does not rely on trust in CLAW, its authors, or its infrastructure.

CLAW verification confirms **existence, sequence, and integrity of data** —
not truth, legal validity, adjudication, or enforcement.

---

## What Verification Means in CLAW

A CLAW v1.x receipt allows any third party to verify that:

- specific digital content existed in a particular form,
- no later than a known time,
- and has not been altered since that time.

Verification proves **cryptographic commitment consistency** across:
- the original content,
- its canonicalized representation,
- the issued receipt,
- and (if present) a public anchor.

Verification does **not**:
- determine truth or falsity,
- evaluate legal merit,
- adjudicate disputes,
- issue judgments or rulings,
- confer authority or enforce outcomes.

Any legal significance, if any, arises solely from **external law or voluntary agreement**.

For a visual, non-technical overview of this process, see `VERIFIER_DIAGRAM.md`.

---

## Recommended Verification Path (Quickstart)

The canonical way to verify a CLAW v1.x receipt is via the
**Verification Reproduction Pack**, which provides frozen inputs and
a one-command verifier.

Verifier entry point:
→ [`VERIFIER_ENTRY.md`](VERIFIER_ENTRY.md)

See:

repro/README.md

From the `repro/` directory:

```bash
./verify.sh
