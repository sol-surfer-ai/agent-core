"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
const PORT = Number(process.env.PORT ?? 3000);
const HOST = "0.0.0.0";
function computeSignal(params) {
    const reasons = [];
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
http_1.default
    .createServer((req, res) => {
    // Use the incoming host header if present; fall back to a safe base.
    const hostHeader = req.headers.host ?? `127.0.0.1:${PORT}`;
    const url = new url_1.URL(req.url ?? "/", `http://${hostHeader}`);
    if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            agent: "SOL Surfer",
            status: "running",
            network: "devnet",
            ts: new Date().toISOString()
        }));
        return;
    }
    if (url.pathname === "/signal") {
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
        res.end(JSON.stringify({
            pair: "SOL/USDC",
            inputs: parsed,
            ...result,
            ts: new Date().toISOString()
        }));
        return;
    }
    res.writeHead(404);
    res.end("not found");
})
    .listen(PORT, HOST, () => {
    console.log(`✅ SOL Surfer runtime listening on ${HOST}:${PORT}`);
});
