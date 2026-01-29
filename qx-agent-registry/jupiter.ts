export type QuoteRequest = {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
};

export async function getJupiterQuote(req: QuoteRequest) {
  const slippageBps = req.slippageBps ?? 50;

  const url =
    `https://quote-api.jup.ag/v6/quote` +
    `?inputMint=${encodeURIComponent(req.inputMint)}` +
    `&outputMint=${encodeURIComponent(req.outputMint)}` +
    `&amount=${encodeURIComponent(req.amount)}` +
    `&slippageBps=${encodeURIComponent(String(slippageBps))}`;

  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Jupiter quote failed: ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
