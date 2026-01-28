import fs from "fs";
import { Keypair } from "@solana/web3.js";
import { createDevnetClient, IdentityTransactionBuilder } from "8004-solana";

function loadKeypair() {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync("agent-keypair.json", "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const signer = loadKeypair();

  const client = createDevnetClient();
  const itb = new IdentityTransactionBuilder(client);

  const agentUri = "https://example.com/qx-watchtower/registration.json"; // placeholder for now

  const result = await itb.registerAgent(agentUri, {
    signer,
    // atomEnabled: true, // default true
  } as any);

  console.log("registerAgent result:", result);
  console.log("Agent wallet:", signer.publicKey.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});