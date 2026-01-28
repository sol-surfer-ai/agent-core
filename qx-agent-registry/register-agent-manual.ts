import fs from "fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import { createDevnetClient, IdentityTransactionBuilder } from "8004-solana";

function loadKeypair() {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync("agent-keypair.json", "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const signerKp = loadKeypair();

  const client = createDevnetClient();
  const itb = new IdentityTransactionBuilder(client);

  // Agent metadata URI (placeholder ok for now)
  const agentUri = "https://example.com/qx-watchtower/registration.json";

  // IMPORTANT:
  // - skipSend:true returns a PreparedTransaction (base64 tx, blockhash, lastValidBlockHeight, signer pubkey)
  // - assetPubkey is REQUIRED when skipSend:true (per your d.ts)
  const assetKp = Keypair.generate();

  const prepared = await itb.registerAgent(agentUri, {
    skipSend: true,
    signer: signerKp.publicKey,     // PublicKey (not Keypair)
    feePayer: signerKp.publicKey,   // optional but explicit
    assetPubkey: assetKp.publicKey, // REQUIRED for skipSend
  } as any);

  console.log("Prepared:", prepared);

  // Deserialize tx and sign it
  const txBuf = Buffer.from((prepared as any).transaction, "base64");
  const tx = Transaction.from(txBuf);

  // Sign with required signers:
  // - fee payer / signer wallet
  // - asset keypair (newly generated)
  tx.partialSign(signerKp, assetKp);

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  console.log("Sent tx:", sig);

  // Confirm using the blockhash info returned by PreparedTransaction
  await connection.confirmTransaction(
    {
      signature: sig,
      blockhash: (prepared as any).blockhash,
      lastValidBlockHeight: (prepared as any).lastValidBlockHeight,
    },
    "confirmed"
  );

  console.log("✅ Confirmed:", sig);
  console.log("Agent wallet:", signerKp.publicKey.toBase58());
  console.log("Asset pubkey:", assetKp.publicKey.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
