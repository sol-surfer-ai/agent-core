import http from "http";

const PORT = 8787;

http
  .createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          agent: "SOL Surfer",
          status: "surfing 🌊",
          network: "devnet",
          ts: new Date().toISOString(),
        })
      );
      return;
    }

    res.writeHead(404);
    res.end("not found");
  })
  .listen(PORT, () => {
    console.log(`✅ SOL Surfer runtime: http://localhost:${PORT}/health`);
  });
