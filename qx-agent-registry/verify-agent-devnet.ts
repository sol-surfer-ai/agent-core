import { PublicKey } from "@solana/web3.js";
import { createDevnetClient, SolanaSDK } from "8004-solana";

type Endpoint = { type?: string; url: string };

async function fetchJson(url: string, timeoutMs = 15000, init?: RequestInit) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}\n${text.slice(0, 500)}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response from ${url}\n${text.slice(0, 500)}`);
    }
  } finally {
    clearTimeout(t);
  }
}

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function pickEndpoint(endpoints: Endpoint[], suffix: string): string {
  const ep = endpoints.find((e) => e?.url?.toLowerCase().endsWith(suffix));
  if (!ep) throw new Error(`Missing endpoint ending with "${suffix}"`);
  return ep.url;
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

  const endpoints: Endpoint[] | undefined = card?.endpoints;
  assert(Array.isArray(endpoints) && endpoints.length > 0, "Missing endpoints[] in agent card");

  for (const e of endpoints) {
    const scheme = new URL(e.url).protocol.replace(":", "");
    if (e.type && e.type !== scheme) {
      throw new Error(`Endpoint type mismatch: type="${e.type}" url="${e.url}"`);
    }
  }

  const healthUrl = pickEndpoint(endpoints, "/health");
  const signalUrl = pickEndpoint(endpoints, "/signal");

  console.log("\n=== RUNTIME VERIFY ===");

  console.log("GET ", healthUrl);
  const health = await fetchJson(healthUrl, 15000, { method: "GET" });
  assert(health?.status === "running", `Health check failed: ${JSON.stringify(health)}`);

  console.log("POST", signalUrl);
  const signal = await fetchJson(signalUrl, 15000, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  const allowedSignals = new Set(["BUY", "SELL", "HOLD"]);
  assert(allowedSignals.has(signal?.signal), `Invalid signal.signal: ${signal?.signal}`);
  assert(
    typeof signal?.confidence === "number" && signal.confidence >= 0 && signal.confidence <= 1,
    `Invalid signal.confidence: ${signal?.confidence}`
  );

  console.log("\n✅ Runtime endpoints verified.");
  console.log("✅ Agent verification complete.");
}

main().catch((e) => {
  console.error("\n❌ Verification failed.");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
