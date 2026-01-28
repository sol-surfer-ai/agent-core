import fs from "fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createDevnetClient, SolanaSDK } from "8004-solana";

function loadKeypair(path = "agent-keypair.json") {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const signer = loadKeypair();
  const client = createDevnetClient();
  const sdk = new (SolanaSDK as any)({ client, signer });

  const agentAsset = new PublicKey("6MBXFZG9zUkhcub68RtGuYaghVYfYhu9NqhM1kXn4Pdv");

  // This is REQUIRED by the SDK for setAgentUri
  const collection = new PublicKey("BPzTDYcD43oDgaz8jZjM81hmbYzYcQ2Q34F3mTPFFpdo");

  const newUri =
    "https://raw.githubusercontent.com/mhelton80/dev/main/qx-agent-registry/agent-card.devnet.json";

  console.log("Updating agent URI to:", newUri);

  const res = await sdk.setAgentUri(agentAsset, collection, newUri);

  console.log("✅ Agent URI updated successfully");
  console.log(res);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
