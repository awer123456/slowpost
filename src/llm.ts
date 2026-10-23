import { config } from "./config.js";

// Minimal OpenAI-compatible client for chat / embeddings / rerank.
// Works against SiliconFlow, Ollama, vLLM, or any compatible endpoint.

async function callApi(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

export interface ChatResult {
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  latencyMs: number;
}

export async function chatJson(
  system: string,
  user: string,
  model: string = config.chatModel,
): Promise<ChatResult> {
  const t0 = Date.now();
  const data = await callApi("/chat/completions", {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
    max_tokens: 2000,
  });
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  return { content, usage: data?.usage, latencyMs: Date.now() - t0 };
}

export async function embed(texts: string[], model: string = config.embeddingModel): Promise<number[][]> {
  const data = await callApi("/embeddings", { model, input: texts });
  return (data.data as any[])
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding as number[]);
}

export async function rerank(
  query: string,
  documents: string[],
  topN: number,
  model: string = config.rerankModel,
): Promise<{ index: number; score: number }[]> {
  const data = await callApi("/rerank", { model, query, documents, top_n: topN });
  return (data.results as any[]).map((r) => ({ index: r.index, score: r.relevance_score }));
}
