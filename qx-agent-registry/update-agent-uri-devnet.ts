import fs from "fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createDevnetClient, SolanaSDK } from "8004-solana";

function loadKeypair(path: string) {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function main() {
  // 1) Load payer/signer (your devnet wallet that owns the agent)
  const payer = loadKeypair("agent-keypair.json");
  console.log("Signer:", payer.publicKey.toBase58());

  // 2) Configure SDK with devnet client
  const client = createDevnetClient("https://api.devnet.solana.com"); // or your preferred RPC
  const sdk = new (SolanaSDK as any)({ client, signer: payer });

  // 3) Your agent asset + collection (use your existing devnet values)
  const agentAsset = new PublicKey("6MBXFZG9zUkhcub68RtGuYaghVYfYhu9NqhM1kXn4Pdv");
  const collection = new PublicKey("BPzTDYcD43oDgaz8jZjM81hmbYzYcQ2Q34F3mTPFFpdo");

  // 4) New URI pointing to your moved repo + updated card
  const NEW_URI =
    "https://raw.githubusercontent.com/sol-surfer-ai/agent-core/main/qx-agent-registry/agent-card.devnet.json";

  console.log("Updating agent URI to:", NEW_URI);

  // 5) Write call
  const result = await sdk.setAgentUri(agentAsset, collection, NEW_URI, {
    signer: payer.publicKey,
  });

  console.log("✅ Agent URI updated");
  console.dir(result, { depth: 6 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
