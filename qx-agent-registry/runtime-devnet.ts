import http from "http";
import { URL } from "url";

const PORT = 8787;

type Signal = "BUY" | "SELL" | "HOLD";

function computeSignal(params: {
  price?: number;
  sma?: number;
  momentum?: number;
}): { signal: Signal; confidence: number; reasons: string[] } {
  const reasons: string[] = [];

  // Dummy / placeholder logic for now:
  // - if price > sma and momentum positive => BUY
  // - if price < sma and momentum negative => SELL
  // - otherwise HOLD
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

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          agent: "SOL Surfer",
          status: "running",
          network: "devnet",
          ts: new Date().toISOString()
        })
      );
      return;
    }

    if (url.pathname === "/signal") {
      // Example: /signal?price=105&sma=100&momentum=0.8
      const price = url.searchParams.get("price");
      const sma = url.searchParams.get("sma");
      const momentum = url.searchParams.get("momentum");

      const parsed = {
        price: price ? Number(price) : undefined,
        sma: sma ? Number(sma) : undefined,
        momentum: momentum ? Number(momentum) : undefined
      };

      const result = computeSignal(parsed);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          pair: "SOL/USDC",
          inputs: parsed,
          ...result,
          ts: new Date().toISOString()
        })
      );
      return;
    }

    res.writeHead(404);
    res.end("not found");
  })
  .listen(PORT, () => {
    console.log(`✅ SOL Surfer runtime: http://localhost:${PORT}/health`);
    console.log(`✅ SOL Surfer signal:  http://localhost:${PORT}/signal`);
  });
