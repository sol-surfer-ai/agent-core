import http from "http";
import { URL } from "url";
import { fetch as undiciFetch } from "undici";

(globalThis as any).fetch = undiciFetch;

type Signal = "BUY" | "SELL" | "HOLD";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = "0.0.0.0";

const QUOTE_PROVIDER =
  process.env.JUPITER_QUOTE_URL ?? "https://public.jupiterapi.com/quote";

const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const MAX_SAMPLES = Number(process.env.MAX_SAMPLES ?? 240);
const SMA_LEN = Number(process.env.SMA_LEN ?? 20);
const MOMENTUM_LEN = Number(process.env.MOMENTUM_LEN ?? 5);

const SAMPLE_INTERVAL_MS = Number(process.env.SAMPLE_INTERVAL_MS ?? 15000);
const OUTLIER_PCT = Number(process.env.OUTLIER_PCT ?? 1.0);

const PRICE_PROBE_LAMPORTS = process.env.PRICE_PROBE_LAMPORTS ?? "10000000";
const LIQUIDITY_PROBE_LAMPORTS = process.env.LIQUIDITY_PROBE_LAMPORTS ?? "1000000000";
const DEFAULT_SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS ?? 50);

type PriceSample = { ts: number; price: number; route: string[] };

type LiquiditySnapshot = {
  quoteProvider: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount?: string;
  otherAmountThreshold?: string;
  slippageBps: number;
  priceImpactPct?: number;
  swapUsdValue?: string;
  contextSlot?: number;
  timeTaken?: number;
  venues: Array<{ label: string; pct?: number }>;
  ts: string;
};

type ComputedState = {
  ts: string;
  ready: boolean;
  price?: number;
  sma?: number;
  momentum?: number;
  signal: Signal;
  confidence: number;
  reasons: string[];
  dexRoute: string[];
  samples: { count: number; smaLen: number; momentumLen: number };
  liquidity?: LiquiditySnapshot;
};

const priceHistory: PriceSample[] = [];
let lastTick: PriceSample | undefined;

let lastComputed: ComputedState = {
  ts: new Date().toISOString(),
  ready: false,
  signal: "HOLD",
  confidence: 0.25,
  reasons: ["Warming up..."],
  dexRoute: [],
  samples: { count: 0, smaLen: SMA_LEN, momentumLen: MOMENTUM_LEN }
};

function computeSignal(params: {
  price?: number;
  sma?: number;
  momentum?: number;
}): { signal: Signal; confidence: number; reasons: string[] } {
  const reasons: string[] = [];

  const price = params.price;
  const sma = params.sma;
  const momentum = params.momentum;

  if (price == null || sma == null || momentum == null) {
    return {
      signal: "HOLD",
      confidence: 0.25,
      reasons: ["Missing inputs (price/sma/momentum). Returning HOLD."]
    };
  }

  if (price > sma && momentum > 0) {
    reasons.push("price > sma");
    reasons.push("momentum > 0");
    return { signal: "BUY", confidence: 0.7, reasons };
  }

  if (price < sma && momentum < 0) {
    reasons.push("price < sma");
    reasons.push("momentum < 0");
    return { signal: "SELL", confidence: 0.7, reasons };
  }

  reasons.push("No clear edge (mixed/neutral signals)");
  return { signal: "HOLD", confidence: 0.45, reasons };
}

function sendJson(res: http.ServerResponse, status: number, obj: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

async function readJsonBody(req: http.IncomingMessage, maxBytes = 1024 * 1024) {
  return await new Promise<any>((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": "sol-surfer-runtime/0.2"
    };

    if (JUPITER_API_KEY) headers["x-api-key"] = JUPITER_API_KEY;

    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { ...headers, ...(init?.headers ?? {}) }
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} ${res.statusText} from ${url}\n${text.slice(0, 600)}`
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response from ${url}\n${text.slice(0, 600)}`);
    }
  } catch (e: any) {
    const msg =
      e?.name === "AbortError" ? `Timeout after ${timeoutMs}ms` : (e?.message ?? String(e));
    throw new Error(`fetch failed: ${msg}`);
  } finally {
    clearTimeout(t);
  }
}

async function getDexQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
}) {
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;

  const u = new URL(QUOTE_PROVIDER);
  u.searchParams.set("inputMint", params.inputMint);
  u.searchParams.set("outputMint", params.outputMint);
  u.searchParams.set("amount", params.amount);
  u.searchParams.set("slippageBps", String(slippageBps));

  return await fetchJson(u.toString(), { method: "GET" }, 15000);
}

function asNum(x: any): number | undefined {
  if (x == null) return undefined;
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function average(xs: number[]) {
  if (xs.length === 0) return undefined;
  const s = xs.reduce((a, b) => a + b, 0);
  return s / xs.length;
}

function pushSample(sample: PriceSample) {
  priceHistory.push(sample);
  if (priceHistory.length > MAX_SAMPLES) {
    priceHistory.splice(0, priceHistory.length - MAX_SAMPLES);
  }
}

function computeSmaFromHistory(len: number) {
  const n = Math.max(1, Math.floor(len));
  if (priceHistory.length < n) return undefined;
  const tail = priceHistory.slice(-n).map((x) => x.price);
  return average(tail);
}

function computeMomentumFromHistory(len: number) {
  const n = Math.max(1, Math.floor(len));
  if (priceHistory.length < n + 1) return undefined;
  const now = priceHistory[priceHistory.length - 1].price;
  const prev = priceHistory[priceHistory.length - 1 - n].price;
  return now - prev;
}

function isOutlier(prev: number, next: number) {
  const pct = Math.abs((next - prev) / prev) * 100;
  return pct >= OUTLIER_PCT;
}

function parseVenuesFromQuote(quote: any): Array<{ label: string; pct?: number }> {
  const rp = Array.isArray(quote?.routePlan) ? quote.routePlan : [];
  const venues: Array<{ label: string; pct?: number }> = [];

  for (const step of rp) {
    const label =
      step?.swapInfo?.label ??
      step?.swapInfo?.ammKey ??
      step?.swapInfo?.amm ??
      step?.label;

    const pct = asNum(step?.percent) ?? asNum(step?.swapInfo?.percent);

    if (label) venues.push({ label: String(label), pct });
  }

  if (venues.length === 0) {
    const fallback =
      quote?.routePlan?.[0]?.swapInfo?.label ??
      quote?.routePlan?.[0]?.label ??
      quote?.label;
    if (fallback) venues.push({ label: String(fallback) });
  }

  return venues;
}

async function getDexPriceUSDCPerSOL() {
  const quote = await getDexQuote({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: PRICE_PROBE_LAMPORTS,
    slippageBps: DEFAULT_SLIPPAGE_BPS
  });

  const inAmount = asNum(quote?.inAmount) ?? asNum(PRICE_PROBE_LAMPORTS);
  const outAmount = asNum(quote?.outAmount);

  if (!outAmount || !inAmount) throw new Error("Invalid price quote amounts");

  const price = outAmount / 1_000_000 / (inAmount / 1_000_000_000);
  const routeLabels = parseVenuesFromQuote(quote).map((v) => v.label);

  return { price, routeLabels };
}

async function getLiquiditySnapshot() {
  const quote = await getDexQuote({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: LIQUIDITY_PROBE_LAMPORTS,
    slippageBps: DEFAULT_SLIPPAGE_BPS
  });

  const priceImpactPct = asNum(quote?.priceImpactPct);
  const contextSlot = asNum(quote?.contextSlot);
  const timeTaken = asNum(quote?.timeTaken);

  const snap: LiquiditySnapshot = {
    quoteProvider: QUOTE_PROVIDER,
    inputMint: String(quote?.inputMint ?? SOL_MINT),
    outputMint: String(quote?.outputMint ?? USDC_MINT),
    inAmount: String(quote?.inAmount ?? LIQUIDITY_PROBE_LAMPORTS),
    outAmount: quote?.outAmount != null ? String(quote.outAmount) : undefined,
    otherAmountThreshold:
      quote?.otherAmountThreshold != null ? String(quote.otherAmountThreshold) : undefined,
    slippageBps: Number(quote?.slippageBps ?? DEFAULT_SLIPPAGE_BPS),
    priceImpactPct: priceImpactPct != null ? priceImpactPct : undefined,
    swapUsdValue: quote?.swapUsdValue != null ? String(quote.swapUsdValue) : undefined,
    contextSlot: contextSlot != null ? contextSlot : undefined,
    timeTaken: timeTaken != null ? timeTaken : undefined,
    venues: parseVenuesFromQuote(quote),
    ts: new Date().toISOString()
  };

  return snap;
}

async function sampleLoop() {
  while (true) {
    try {
      const [p, liq] = await Promise.all([getDexPriceUSDCPerSOL(), getLiquiditySnapshot()]);

      const sample: PriceSample = { ts: Date.now(), price: p.price, route: p.routeLabels };

      if (lastTick && isOutlier(lastTick.price, sample.price)) {
        lastComputed = {
          ...lastComputed,
          ts: new Date().toISOString(),
          ready: lastComputed.ready,
          price: sample.price,
          sma: lastComputed.sma,
          momentum: lastComputed.momentum,
          signal: lastComputed.signal,
          confidence: 0.25,
          reasons: [`Outlier tick ignored (${OUTLIER_PCT}% threshold)`],
          dexRoute: sample.route,
          liquidity: liq,
          samples: { count: priceHistory.length, smaLen: SMA_LEN, momentumLen: MOMENTUM_LEN }
        };
      } else {
        pushSample(sample);
        lastTick = sample;

        const sma = computeSmaFromHistory(SMA_LEN);
        const momentum = computeMomentumFromHistory(MOMENTUM_LEN);

        const ready =
          priceHistory.length >= SMA_LEN && priceHistory.length >= MOMENTUM_LEN + 1;

        const inputs = { price: sample.price, sma, momentum };
        const result = computeSignal(inputs);

        lastComputed = {
          ts: new Date().toISOString(),
          ready,
          price: sample.price,
          sma,
          momentum,
          ...result,
          dexRoute: sample.route,
          liquidity: liq,
          samples: { count: priceHistory.length, smaLen: SMA_LEN, momentumLen: MOMENTUM_LEN }
        };
      }
    } catch (e: any) {
      lastComputed = {
        ...lastComputed,
        ts: new Date().toISOString(),
        signal: "HOLD",
        confidence: 0.25,
        reasons: [e?.message ?? String(e)]
      };
    }

    await new Promise((r) => setTimeout(r, SAMPLE_INTERVAL_MS));
  }
}

http
  .createServer(async (req, res) => {
    const hostHeader = req.headers.host ?? `127.0.0.1:${PORT}`;
    const url = new URL(req.url ?? "/", `http://${hostHeader}`);
    const method = (req.method ?? "GET").toUpperCase();

    try {
      if (url.pathname === "/health") {
        sendJson(res, 200, {
          agent: "SOL Surfer",
          status: "running",
          network: "devnet",
          ts: new Date().toISOString(),
          sampler: {
            intervalMs: SAMPLE_INTERVAL_MS,
            samples: priceHistory.length,
            priceProbeLamports: PRICE_PROBE_LAMPORTS,
            liquidityProbeLamports: LIQUIDITY_PROBE_LAMPORTS
          }
        });
        return;
      }

      if (url.pathname === "/probe") {
        const r = await fetch("https://example.com", {
          headers: { accept: "text/html", "user-agent": "sol-surfer-runtime/0.2" }
        });
        const text = await r.text();
        sendJson(res, 200, {
          ok: r.ok,
          status: r.status,
          len: text.length,
          ts: new Date().toISOString()
        });
        return;
      }

      if (url.pathname === "/quote") {
        if (method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        const body = await readJsonBody(req);

        const inputMint = body?.inputMint;
        const outputMint = body?.outputMint;
        const amount = body?.amount;
        const slippageBps = body?.slippageBps;

        if (!inputMint || !outputMint || !amount) {
          sendJson(res, 400, { error: "inputMint, outputMint, amount required" });
          return;
        }

        const quote = await getDexQuote({
          inputMint: String(inputMint),
          outputMint: String(outputMint),
          amount: String(amount),
          slippageBps: slippageBps != null ? Number(slippageBps) : undefined
        });

        const inAmount = quote?.inAmount != null ? String(quote.inAmount) : String(amount);
        const outAmount = quote?.outAmount != null ? String(quote.outAmount) : undefined;
        const otherAmountThreshold =
          quote?.otherAmountThreshold != null ? String(quote.otherAmountThreshold) : undefined;

        const priceImpactPct = asNum(quote?.priceImpactPct);
        const venues = parseVenuesFromQuote(quote);

        sendJson(res, 200, {
          quoteProvider: QUOTE_PROVIDER,
          inputMint: String(inputMint),
          outputMint: String(outputMint),
          amount: String(amount),
          slippageBps: Number(quote?.slippageBps ?? slippageBps ?? DEFAULT_SLIPPAGE_BPS),
          inAmount,
          outAmount,
          otherAmountThreshold,
          priceImpactPct,
          venues,
          raw: quote,
          ts: new Date().toISOString()
        });
        return;
      }

      if (url.pathname === "/signal") {
        if (method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        sendJson(res, 200, {
          pair: "SOL/USDC",
          ready: lastComputed.ready,
          inputs: {
            price: lastComputed.price,
            sma: lastComputed.sma,
            momentum: lastComputed.momentum
          },
          priceSource: "dex",
          dexRoute: lastComputed.dexRoute,
          samples: lastComputed.samples,
          liquidity: lastComputed.liquidity,
          signal: lastComputed.signal,
          confidence: lastComputed.confidence,
          reasons: lastComputed.reasons,
          ts: lastComputed.ts
        });
        return;
      }

      res.writeHead(404);
      res.end("not found");
    } catch (e: any) {
      sendJson(res, 500, { error: e?.message ?? String(e) });
    }
  })
  .listen(PORT, HOST, () => {
    console.log(`✅ SOL Surfer runtime listening on ${HOST}:${PORT}`);
    console.log(`✅ Quote provider: ${QUOTE_PROVIDER}`);
    void sampleLoop();
  });
