import { PublicKey } from "@solana/web3.js";
import { createDevnetClient, SolanaSDK } from "8004-solana";

async function fetchJson(url: string, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const client = createDevnetClient();
  const sdk = new (SolanaSDK as any)({ client });

  const agentAsset = new PublicKey("6MBXFZG9zUkhcub68RtGuYaghVYfYhu9NqhM1kXn4Pdv");
  const agent = await sdk.getAgent(agentAsset);

  console.log("=== AGENT (on-chain) ===");
  console.dir(agent, { depth: 6 });

  const uri = agent?.agent_uri ?? agent?.agentUri ?? agent?.uri;

  console.log("\nURI found:", uri);

  if (!uri) {
    console.log("\n⚠️ No URI found on agent account.");
    process.exit(1);
  }

  const card = await fetchJson(uri, 15000);

  console.log("\n=== AGENT CARD (fetched JSON) ===");
  console.dir(card, { depth: 10 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
