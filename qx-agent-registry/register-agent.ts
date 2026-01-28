import fs from "fs";
import { Keypair } from "@solana/web3.js";
import { createDevnetClient, IdentityTransactionBuilder } from "8004-solana";

function loadKeypair() {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync("agent-keypair.json","utf8")));
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const signer = loadKeypair();
  const client = createDevnetClient();
  const itb = new IdentityTransactionBuilder(client);

  // Build tx (likely returns PreparedTransaction when skipSend=true)
  const prepared = await itb.registerAgent(
    "https://example.com/qx-watchtower/registration.json",
    { skipSend: true, signer } // <- key part
  );

  // Send with explicit signer
  const sent = await itb.sendWithRetry(prepared, { signer });

  console.log("Signature:", sent.signature);
  console.log("Success:", sent.success);
  console.log("Asset:", sent.asset);
  console.log("Agent wallet:", signer.publicKey.toBase58());
}

main().catch(e => { console.error(e); process.exit(1); });
