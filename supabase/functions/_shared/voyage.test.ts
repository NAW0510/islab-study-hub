import { describe, expect, it } from "vitest";
import { embedTexts, EmbeddingError, VOYAGE_DEFAULT_URL } from "./voyage.ts";

const DIM = 4;
const vector = (seed: number) => Array.from({ length: DIM }, (_, i) => seed + i / 10);

function fakeFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    return respond(url, init);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("embedTexts", () => {
  it("sends every text in one request and returns vectors in input order", async () => {
    const { fn, calls } = fakeFetch(() =>
      // Deliberately out of order: the client must sort by `index`.
      json({ data: [{ embedding: vector(2), index: 1 }, { embedding: vector(1), index: 0 }] }),
    );

    const result = await embedTexts(["satu", "dua"], { apiKey: "kunci-uji", dimension: DIM, fetch: fn });

    expect(result).toEqual([vector(1), vector(2)]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(VOYAGE_DEFAULT_URL);
    expect(calls[0].body).toEqual({ input: ["satu", "dua"], model: "voyage-4", input_type: "document", output_dimension: DIM });
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer kunci-uji");
  });

  it("does not call the API for an empty batch", async () => {
    const { fn, calls } = fakeFetch(() => json({ data: [] }));
    expect(await embedTexts([], { apiKey: "kunci-uji", fetch: fn })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("honours a custom URL and model", async () => {
    const { fn, calls } = fakeFetch(() => json({ data: [{ embedding: vector(1), index: 0 }] }));
    await embedTexts(["x"], { apiKey: "k", apiUrl: "http://localhost:9999/embed", model: "lain", dimension: DIM, fetch: fn });
    expect(calls[0].url).toBe("http://localhost:9999/embed");
    expect(calls[0].body.model).toBe("lain");
  });

  it("fails clearly without a key, before any request", async () => {
    const { fn, calls } = fakeFetch(() => json({}));
    await expect(embedTexts(["x"], { apiKey: "", fetch: fn })).rejects.toThrow(EmbeddingError);
    expect(calls).toHaveLength(0);
  });

  it("reports a rejected key with its status", async () => {
    const { fn } = fakeFetch(() => json({ detail: "Provided API key is invalid." }, 401));
    const error = await embedTexts(["x"], { apiKey: "salah", fetch: fn }).catch((e) => e);
    expect(error).toBeInstanceOf(EmbeddingError);
    expect(error.status).toBe(401);
    expect(error.message).toContain("API key ditolak");
  });

  it("reports network failures as status 0", async () => {
    const fn = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const error = await embedTexts(["x"], { apiKey: "k", fetch: fn }).catch((e) => e);
    expect(error).toBeInstanceOf(EmbeddingError);
    expect(error.status).toBe(0);
  });

  it("rejects answers with the wrong count or dimension", async () => {
    const short = fakeFetch(() => json({ data: [{ embedding: vector(1), index: 0 }] }));
    await expect(embedTexts(["a", "b"], { apiKey: "k", dimension: DIM, fetch: short.fn })).rejects.toThrow(/Jumlah embedding/);

    const wrongSize = fakeFetch(() => json({ data: [{ embedding: [1, 2], index: 0 }] }));
    await expect(embedTexts(["a"], { apiKey: "k", dimension: DIM, fetch: wrongSize.fn })).rejects.toThrow(/dimensi/);
  });
});
