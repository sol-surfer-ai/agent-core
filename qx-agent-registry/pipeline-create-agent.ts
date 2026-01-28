import fs from "fs";
import { Keypair } from "@solana/web3.js";
import {
  createAgent,
  fetchAgentByCreator,
  hashCardJcs,
  makeConnection,
} from "@pipeline/agent-registry-sdk";

function loadKeypair(path = "agent-keypair.json") {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function main() {
  // 1) Devnet connection
  const connection = makeConnection("devnet");

  // 2) Load your funded payer wallet
  const payer = loadKeypair();

  console.log("Using payer:", payer.publicKey.toBase58());

  // 3) Define your agent "card" data
  const cardData = {
    name: "QX Watchtower Agent",
    description: "Monitors QX network signals and emits alerts",
    version: "0.1.0"
  };

  // 4) Create deterministic card hash
  const cardHash = await hashCardJcs(cardData);

  // 5) Create agent on-chain
  const agentPda = await createAgent({
    connection,
    payer,
    cardUri: "https://example.com/qx-watchtower-agent-card.json", 
    cardHash,
    hasStaking: true,
  });

  console.log("✅ Agent created!");
  console.log("Agent PDA:", agentPda.toBase58());

  // 6) Fetch agent to confirm on-chain state
  const result = await fetchAgentByCreator(connection, payer.publicKey);

  if (result) {
    console.log("✅ Agent account data:");
    console.log(result.account);
  } else {
    console.log("❌ Agent not found (unexpected)");
  }
}

main().catch(console.error);
