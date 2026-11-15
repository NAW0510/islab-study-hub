// Local stand-in for the Voyage AI embeddings API, for testing the
// `vocab-embed` Edge Function without an API key or quota.
//
//   node scripts/voyage-mock.mjs            # listens on :4010
//   VOYAGE_MOCK_KEY=kunci node scripts/…    # only this bearer token is accepted
//
// The vectors are NOT real embeddings. Each word is hashed into a few of the
// 512 dimensions (a "bag of words"), so texts that share words end up close
// together. That is enough to exercise the whole flow and the decision rule,
// and it is deterministic: the same text always gives the same vector.
//
// GET /stats returns how many embedding requests were received and how many
// texts each one carried (to check that a bulk paste is ONE request).

import { createServer } from "node:http";

const PORT = Number(process.env.VOYAGE_MOCK_PORT ?? 4010);
const REQUIRED_KEY = process.env.VOYAGE_MOCK_KEY ?? "";
const stats = { requests: 0, batches: [] };

function hash(text, seed) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function embed(text, dimension) {
  const vector = new Array(dimension).fill(0);
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const word of words) {
    if (word.length < 3) continue;
    for (let k = 0; k < 4; k++) {
      const h = hash(word, k);
      vector[h % dimension] += h & 1 ? 1 : -1;
    }
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((v) => v / norm);
}

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/stats") return send(res, 200, stats);
  if (req.method === "POST" && req.url === "/reset") {
    stats.requests = 0;
    stats.batches = [];
    return send(res, 200, stats);
  }
  if (req.method !== "POST" || req.url !== "/v1/embeddings") return send(res, 404, { detail: "Not found" });

  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token || (REQUIRED_KEY && token !== REQUIRED_KEY)) {
    return send(res, 401, { detail: "Provided API key is invalid." });
  }

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    try {
      const { input, model = "voyage-4", output_dimension: dimension = 1024 } = JSON.parse(raw);
      const texts = Array.isArray(input) ? input : [input];
      stats.requests += 1;
      stats.batches.push(texts.length);
      send(res, 200, {
        object: "list",
        data: texts.map((text, index) => ({ object: "embedding", embedding: embed(String(text), dimension), index })),
        model,
        usage: { total_tokens: texts.join(" ").split(/\s+/).length },
      });
    } catch {
      send(res, 400, { detail: "Invalid JSON body." });
    }
  });
}).listen(PORT, () => console.log(`Voyage mock listening on http://localhost:${PORT}/v1/embeddings`));
