import fs from "fs";
import { Connection, Keypair, Transaction, clusterApiUrl } from "@solana/web3.js";
import { IdentityTransactionBuilder } from "8004-solana";

function loadKeypair() {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync("agent-keypair.json", "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const signerKp = loadKeypair();

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const itb = new IdentityTransactionBuilder(connection);

  const agentUri = "https://example.com/qx-watchtower/registration.json";
  const assetKp = Keypair.generate();

  const prepared = await itb.registerAgent(agentUri, {
    skipSend: true,
    signer: signerKp.publicKey,
    feePayer: signerKp.publicKey,
    assetPubkey: assetKp.publicKey
  } as any);

  const txBuf = Buffer.from((prepared as any).transaction, "base64");
  const tx = Transaction.from(txBuf);

  tx.partialSign(signerKp, assetKp);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  console.log("Sent tx:", sig);

  await connection.confirmTransaction(
    {
      signature: sig,
      blockhash: (prepared as any).blockhash,
      lastValidBlockHeight: (prepared as any).lastValidBlockHeight
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