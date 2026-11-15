import { VOCAB_CONFIG } from "./vocab-config.ts";

/**
 * Minimal client for the Voyage AI embeddings API.
 * https://docs.voyageai.com/reference/embeddings-api
 * Uses only `fetch`, so it runs in Deno (Edge Function) and in Node (tests).
 */

export const VOYAGE_DEFAULT_URL = "https://api.voyageai.com/v1/embeddings";

export class EmbeddingError extends Error {
  /** HTTP status from the provider, or 0 when the request never got an answer. */
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "EmbeddingError";
    this.status = status;
  }
}

export type EmbedOptions = {
  apiKey: string;
  /** Override for tests and local development; defaults to the real API. */
  apiUrl?: string;
  model?: string;
  dimension?: number;
  fetch?: typeof fetch;
  signal?: AbortSignal;
};

type VoyageResponse = {
  data?: { embedding?: unknown; index?: number }[];
  detail?: unknown;
};

/**
 * Embeds all texts in ONE request and returns the vectors in input order.
 * Throws EmbeddingError when the key is missing, the provider refuses, or the
 * answer does not match the request (count or dimension).
 */
export async function embedTexts(texts: readonly string[], options: EmbedOptions): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!options.apiKey) throw new EmbeddingError("VOYAGE_API_KEY belum diatur.", 0);

  const dimension = options.dimension ?? VOCAB_CONFIG.EMBEDDING_DIM;
  const doFetch = options.fetch ?? fetch;

  let response: Response;
  try {
    response = await doFetch(options.apiUrl || VOYAGE_DEFAULT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({
        input: texts,
        model: options.model ?? VOCAB_CONFIG.EMBEDDING_MODEL,
        // The vectors are stored and compared with each other, not used as search queries.
        input_type: "document",
        output_dimension: dimension,
      }),
      signal: options.signal,
    });
  } catch (error) {
    throw new EmbeddingError(`Tidak bisa menghubungi layanan embedding: ${(error as Error).message}`, 0);
  }

  let payload: VoyageResponse | null = null;
  try {
    payload = (await response.json()) as VoyageResponse;
  } catch {
    // handled below: a non-JSON body is only acceptable together with an error status
  }

  if (!response.ok) {
    const detail = typeof payload?.detail === "string" ? `: ${payload.detail}` : "";
    const reason = response.status === 401 || response.status === 403 ? "API key ditolak" : "permintaan ditolak";
    throw new EmbeddingError(`Layanan embedding menjawab ${response.status} (${reason})${detail}`, response.status);
  }

  const rows = [...(payload?.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (rows.length !== texts.length) {
    throw new EmbeddingError(`Jumlah embedding (${rows.length}) tidak sama dengan jumlah teks (${texts.length}).`, 502);
  }
  return rows.map((row, i) => {
    const vector = row.embedding;
    if (!Array.isArray(vector) || vector.length !== dimension || !vector.every((v) => typeof v === "number")) {
      throw new EmbeddingError(`Embedding ke-${i + 1} tidak berukuran ${dimension} dimensi.`, 502);
    }
    return vector as number[];
  });
}
