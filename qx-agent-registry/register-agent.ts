import fs from "fs";
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import { IdentityTransactionBuilder } from "8004-solana";

function loadKeypair() {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync("agent-keypair.json", "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const signer = loadKeypair();

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const itb = new IdentityTransactionBuilder(connection);

  const agentUri = "https://example.com/qx-watchtower/registration.json"; // placeholder

  const result = await itb.registerAgent(agentUri, {
    signer
  } as any);

  console.log("registerAgent result:", result);
  console.log("Agent wallet:", signer.publicKey.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
