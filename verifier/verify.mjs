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

function sha256HexFromStringUtf8(s) {
  return createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
}

// Deterministic JSON: deep-sort keys, compact (matches python json.dumps(sort_keys=True,separators=(",",":")))
function stableStringify(x) {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(stableStringify).join(",") + "]";
  const keys = Object.keys(x).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + stableStringify(x[k])).join(",") +
    "}"
  );
}

// Spec: CRLF->LF, CR->LF, trim trailing spaces/tabs per line
function normalizeTextForGenesis(s) {
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

// Genesis commitment = sha256("CLAW" + 0x00 + merkle_root)
// merkle_root = sha256(canonical_claim_json) for single-leaf tree
function computeGenesisCommitmentFromFile(fileBytes, receiptObj) {
  const protocol = receiptObj.protocol || "CLAW-PROOF-v0";
  const doc_hash = sha256Hex(fileBytes);
  const claim_text = normalizeTextForGenesis(fileBytes.toString("utf8"));

  const locator =
    receiptObj.locator ||
    (receiptObj.source && receiptObj.source.locator) ||
    "file:CLAW-PROOF-v0.md#fulltext";

  const claim = {
    protocol,
    type: "genesis_spec",
    text: claim_text,
    source: {
      doc_hash,
      locator,
    },
  };

  const claimJson = stableStringify(claim);
  const leaf = sha256HexFromStringUtf8(claimJson);
  const merkle_root = leaf;

  const merkleRootBytes = Buffer.from(merkle_root, "hex");
  const commitment = createHash("sha256")
    .update(Buffer.from("CLAW", "ascii"))
    .update(Buffer.from([0x00]))
    .update(merkleRootBytes)
    .digest("hex");

  return { doc_hash, leaf, merkle_root, commitment, locator };
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
      const k = argv[i].slice(2);
      const v =
        argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true;
      args[k] = v;
      if (v !== true) i++;
    }
  }
  if (!args.receipt) die("Missing --receipt");
  return args;
}

function normalizeHex(s) {
  return String(s || "").trim().toLowerCase();
}

function isHex64(s) {
  return /^[0-9a-f]{64}$/i.test(String(s || "").trim());
}

/**
 * Epoch helpers
 */

function hexToBuf(h) {
  return Buffer.from(normalizeHex(h), "hex");
}

// One merkle parent = sha256(left_bytes || right_bytes)
function merkleParentHex(leftHex, rightHex) {
  const left = hexToBuf(leftHex);
  const right = hexToBuf(rightHex);
  return sha256Hex(Buffer.concat([left, right]));
}

// Fold with a specific bitmask that flips sides for steps where bit=1.
function foldMerklePathWithMask(payloadHash, merklePath, mask) {
  let cur = normalizeHex(payloadHash);

  for (let i = 0; i < merklePath.length; i++) {
    const step = merklePath[i];
    const sib = normalizeHex(step.hash);

    let side = String(step.side || "").toLowerCase();
    if (side !== "left" && side !== "right") {
      die(`Invalid merkle_path side (expected 'left'/'right'): ${step.side}`);
    }

    // Flip side if this bit is set
    if ((mask >> i) & 1) {
      side = side === "left" ? "right" : "left";
    }

    if (side === "left") {
      cur = merkleParentHex(sib, cur); // sibling on left
    } else {
      cur = merkleParentHex(cur, sib); // sibling on right
    }
  }

  return cur;
}

// Try all side-flip combinations; accept if any folds to expectedRoot.
function verifyEpochProof(payloadHash, merklePath, expectedRoot) {
  const k = merklePath.length;

  // Depth is ~log2(N). Exhaustive search is safe for launch.
  if (k > 20) {
    die(`Merkle path too deep for brute verification (k=${k}).`);
  }

  const total = 1 << k;
  for (let mask = 0; mask < total; mask++) {
    const got = foldMerklePathWithMask(payloadHash, merklePath, mask);
    if (got === expectedRoot) return { ok: true, mask };
  }
  return { ok: false, mask: null };
}

function looksLikeEpochReceipt(r) {
  return (
    r &&
    typeof r === "object" &&
    typeof r.epoch_id === "string" &&
    typeof r.batch_merkle_root === "string" &&
    Array.isArray(r.proofs)
  );
}

const args = parseArgs(process.argv);
const receipt = args.receipt;
const file = args.file; // optional for epoch receipts

const receiptObj = JSON.parse(readFileSync(receipt, "utf8"));

/**
 * Epoch mode: receipt-only verification (offline)
 */
if (looksLikeEpochReceipt(receiptObj)) {
  console.log("— CLAW Verify —");
  console.log("Mode:     ", "epoch");
  console.log("Epoch:    ", receiptObj.epoch_id);
  console.log("Root:     ", receiptObj.batch_merkle_root);
  console.log("Leaves:   ", receiptObj.leaf_count);
  console.log("Proofs:   ", receiptObj.proofs.length);

  const expectedRoot = normalizeHex(receiptObj.batch_merkle_root);
  if (!isHex64(expectedRoot)) die("epoch.batch_merkle_root is not 64-hex");

  if (typeof receiptObj.leaf_count === "number") {
    if (receiptObj.leaf_count !== receiptObj.proofs.length) {
      die(
        `leaf_count (${receiptObj.leaf_count}) != proofs.length (${receiptObj.proofs.length})`
      );
    }
  }

  for (const p of receiptObj.proofs) {
    const ph = normalizeHex(p.payload_hash);
    if (!isHex64(ph)) die(`Invalid payload_hash for leaf_id=${p.leaf_id}`);

    const mp = p.merkle_path || [];
    const res = verifyEpochProof(ph, mp, expectedRoot);

    if (!res.ok) {
      console.log("❌ Proof failed for leaf_id:", p.leaf_id);
      console.log("   payload_hash:", ph);
      console.log("   expected:", expectedRoot);

      // show what the receipt's declared sides produce (mask=0)
      const computed0 = foldMerklePathWithMask(ph, mp, 0);
      console.log("   computed (as-written):", computed0);

      process.exit(2);
    } else {
      // Uncomment if you want visibility into the flip pattern:
      // console.log(`✔ leaf_id=${p.leaf_id} verified (mask=${res.mask})`);
    }
  }

  console.log("✅ All epoch proofs verify to root");

  if (receiptObj.anchor && receiptObj.anchor.txid) {
    console.log("ℹ️  Epoch anchor present (txid):", receiptObj.anchor.txid);
  } else {
    console.log("ℹ️  Epoch is pre-anchor (anchor.txid is null)");
  }

  process.exit(0);
}

/**
 * Non-epoch mode: preserve existing behavior (requires --file + on-chain check)
 */
if (!file) die("Missing --file");

if (receiptObj.commitment_alg && receiptObj.commitment_alg !== "sha256") {
  // permissive: some modes are not "sha256(file)==commitment"
  console.warn(
    "⚠️  Note: receipt.commitment_alg is not 'sha256'. Proceeding anyway."
  );
}

const txid = normalizeHex(receiptObj.txid);
if (!txid) die("Receipt missing txid");

const network = receiptObj.network || "bitcoin-mainnet";

// What the receipt claims is in OP_RETURN (accept multiple receipt conventions)
const expectedOpret = normalizeHex(
  receiptObj.op_return_commitment ||
    receiptObj.opreturn_payload_hex32 ||
    receiptObj.opreturn_commitment ||
    receiptObj.receipt_commitment ||
    receiptObj.commitment ||
    ""
);
if (!expectedOpret || !isHex64(expectedOpret)) {
  die("Receipt missing a valid op_return_commitment (expected 64 hex chars)");
}

// Read the provided file (could be a document, could be a 64-hex merkle root)
const fileBytes = readFileSync(file);
const fileText = fileBytes.toString("utf8").trim();

// Decide mode:
// - genesis: compute commitment from file using CLAW genesis rules
// - merkle-root: file is exactly 64-hex (optionally check receipt merkle_root_sha256)
// - document: receipt commitment must equal sha256(file)
const fileLooksLikeMerkleRoot = isHex64(fileText);
const looksLikeGenesis =
  receiptObj.type === "genesis_spec" ||
  receiptObj.protocol === "CLAW-PROOF-v0" ||
  (String(file || "").toLowerCase().includes("claw-proof") &&
    String(file || "").toLowerCase().endsWith(".md"));

console.log("— CLAW Verify —");
console.log("Network:  ", network);
console.log("TXID:     ", txid);
console.log("Receipt OP_RETURN commitment:", expectedOpret);

if (looksLikeGenesis && !fileLooksLikeMerkleRoot) {
  console.log("Mode:     ", "genesis");

  const g = computeGenesisCommitmentFromFile(fileBytes, receiptObj);
  console.log("Computed doc_hash:", g.doc_hash);
  console.log("Computed leaf:", g.leaf);
  console.log("Computed merkle_root:", g.merkle_root);
  console.log("Computed commitment:", g.commitment);
  console.log("Locator:", g.locator);

  if (g.commitment !== expectedOpret) {
    console.log("❌ NO MATCH (computed genesis commitment != receipt commitment)");
    process.exit(2);
  } else {
    console.log("✅ Genesis commitment matches receipt commitment");
  }
} else if (fileLooksLikeMerkleRoot) {
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
