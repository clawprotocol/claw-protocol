#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

function die(msg) {
  console.error("❌", msg);
  process.exit(1);
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// Extract OP_RETURN push32: 6a20 + 32 bytes
function extractOpReturnPush32(rawTxHex) {
  const m = rawTxHex.toLowerCase().match(/6a20([0-9a-f]{64})/);
  return m ? m[1] : null;
}

async function fetchRawTxHex(txid, network) {
  const base =
    network === "bitcoin-testnet"
      ? "https://blockstream.info/testnet/api"
      : "https://blockstream.info/api";

  const res = await fetch(`${base}/tx/${txid}/hex`);
  if (!res.ok) die(`Failed to fetch tx hex (${res.status})`);
  return (await res.text()).trim();
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  if (!args.receipt) die("Missing --receipt");
  if (!args.file) die("Missing --file");
  return args;
}

function normalizeHex(s) {
  return String(s || "").trim().toLowerCase();
}

function isHex64(s) {
  return /^[0-9a-f]{64}$/i.test(String(s || "").trim());
}

const { receipt, file } = parseArgs(process.argv);

const receiptObj = JSON.parse(readFileSync(receipt, "utf8"));

if (receiptObj.commitment_alg && receiptObj.commitment_alg !== "sha256") {
  // we keep this permissive, because genesis mode isn't "sha256(file)==commitment"
  // but if you *want* strictness, change this to die(...)
  console.warn(
    "⚠️  Note: receipt.commitment_alg is not 'sha256'. Proceeding anyway."
  );
}

const txid = normalizeHex(receiptObj.txid);
if (!txid) die("Receipt missing txid");

const network = receiptObj.network || "bitcoin-mainnet";

// What the receipt claims is in OP_RETURN
const expectedOpret = normalizeHex(
  receiptObj.op_return_commitment || receiptObj.receipt_commitment
);
if (!expectedOpret || !isHex64(expectedOpret)) {
  die("Receipt missing a valid op_return_commitment (expected 64 hex chars)");
}

// Read the provided file (could be a document, could be a 64-hex merkle root)
const fileBytes = readFileSync(file);
const fileText = fileBytes.toString("utf8").trim();

// Decide mode:
// - If the file is exactly 64-hex, treat it as a merkle root (Genesis-style).
// - Otherwise treat it as a document and hash it.
const fileLooksLikeMerkleRoot = isHex64(fileText);

console.log("— CLAW Verify —");
console.log("Network:  ", network);
console.log("TXID:     ", txid);
console.log("Receipt OP_RETURN commitment:", expectedOpret);

if (fileLooksLikeMerkleRoot) {
  console.log("Mode:     ", "merkle-root");
  console.log("Merkle root (from file):", normalizeHex(fileText));

  // Optional: if receipt includes merkle_root_sha256, enforce it matches the file
  if (receiptObj.merkle_root_sha256) {
    const expectedRoot = normalizeHex(receiptObj.merkle_root_sha256);
    if (!isHex64(expectedRoot)) die("receipt.merkle_root_sha256 is not 64-hex");
    console.log("Receipt merkle_root_sha256:", expectedRoot);

    if (expectedRoot !== normalizeHex(fileText)) {
      console.log("❌ NO MATCH (merkle root mismatch)");
      process.exit(2);
    } else {
      console.log("✅ Merkle root matches receipt");
    }
  } else {
    console.log(
      "ℹ️  receipt.merkle_root_sha256 not present; skipping root-to-receipt check."
    );
  }
} else {
  console.log("Mode:     ", "document");
  const computedDocHash = sha256Hex(fileBytes);
  console.log("Computed sha256(file):", computedDocHash);

  // In document mode, the receipt commitment should equal sha256(file)
  if (computedDocHash !== expectedOpret) {
    console.log("❌ NO MATCH (sha256(file) != receipt commitment)");
    process.exit(2);
  } else {
    console.log("✅ sha256(file) matches receipt commitment");
  }
}

// Always verify what’s actually on-chain in OP_RETURN push32
const rawTxHex = await fetchRawTxHex(txid, network);
const onchainOpret = extractOpReturnPush32(rawTxHex);
if (!onchainOpret) die("No OP_RETURN push32 found in tx");

console.log("On-chain OP_RETURN push32:", onchainOpret);

if (onchainOpret === expectedOpret) {
  console.log("✅ ON-CHAIN MATCH");
  process.exit(0);
} else {
  console.log("❌ NO MATCH (receipt commitment != on-chain OP_RETURN)");
  process.exit(2);
}
