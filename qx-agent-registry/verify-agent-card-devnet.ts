import { PublicKey } from "@solana/web3.js";
import { createDevnetClient, SolanaSDK } from "8004-solana";

async function main() {
  const client = createDevnetClient();
  const sdk = new (SolanaSDK as any)({ client });

  const agentAsset = new PublicKey("6MBXFZG9zUkhcub68RtGuYaghVYfYhu9NqhM1kXn4Pdv");

  // Read agent account (on-chain)
  const agent = await sdk.getAgent(agentAsset);
  console.log("=== AGENT (on-chain) ===");
  console.dir(agent, { depth: 6 });

  // Read metadata (on-chain)
  const meta = await sdk.getMetadata(agentAsset);
  console.log("\n=== METADATA (on-chain) ===");
  console.dir(meta, { depth: 6 });

  // Try to locate a URI field in common places
  const uri =
    meta?.uri ??
    meta?.data?.uri ??
    meta?.metadata?.uri ??
    agent?.uri ??
    agent?.account?.uri ??
    agent?.account?.metadataUri;

  console.log("\nURI found:", uri);

  if (uri) {
    const card = await sdk.fetchJsonFromUri(uri);
    console.log("\n=== AGENT CARD (fetched JSON) ===");
    console.dir(card, { depth: 6 });
  } else {
    console.log("\n⚠️ No URI field found. Paste outputs and we’ll pinpoint it.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
