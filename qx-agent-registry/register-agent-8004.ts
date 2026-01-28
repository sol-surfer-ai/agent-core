import fs from "fs";
import { Keypair } from "@solana/web3.js";
import { createDevnetClient, SolanaSDK } from "8004-solana";

function loadKeypair(path = "agent-keypair.json") {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const signer = loadKeypair();
  console.log("Signer:", signer.publicKey.toBase58());

  // IMPORTANT: no args here
  const client = createDevnetClient();

  // IMPORTANT: SolanaSDK appears to take an options object
  const sdk = new (SolanaSDK as any)({
    client,
    signer,           // Keypair
    // If this SDK expects a different key name, we’ll see it immediately in the next error
  });

  // Create a collection (recommended)
  const colRes = await sdk.createCollection(
    "QX Agents (devnet)",
    "https://example.com/qx-collection.json"
  );

  // The SDK returns either TransactionResult+collection or PreparedTransaction+collection
  const collection = colRes.collection ?? colRes.collectionPubkey ?? colRes.collectionPda;
  console.log("Collection:", collection?.toBase58 ? collection.toBase58() : collection);

  // Register an agent under that collection
  const agentUri = "https://example.com/qx-watchtower-agent.json";
  const regRes = await sdk.registerAgent(agentUri, collection);

  console.log("registerAgent:", regRes);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
