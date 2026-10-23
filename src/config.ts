// Central config. Everything runs on open-weight models.
// Default provider: SiliconFlow (OpenAI-compatible API serving open-weight models).
// Fully-local mode: point BASE_URL at a local Ollama/vLLM endpoint instead —
// same code, because the models are open weights and the endpoints are compatible.

export const config = {
  port: Number(process.env.PORT ?? 3200),
  host: process.env.HOST ?? "0.0.0.0",

  apiKey: process.env.SILICONFLOW_API_KEY ?? process.env.LLM_API_KEY ?? "",
  baseUrl: (process.env.LLM_BASE_URL ?? "https://api.siliconflow.cn/v1").replace(/\/$/, ""),

  // Chat model: any open-weight model id the endpoint serves.
  chatModel: process.env.CHAT_MODEL ?? "deepseek-ai/DeepSeek-V3.2",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "Qwen/Qwen3-Embedding-8B",
  rerankModel: process.env.RERANK_MODEL ?? "Qwen/Qwen3-Reranker-8B",

  // "Overnight" hold: real mode releases at 09:00 next day; demo mode uses minutes.
  holdMode: (process.env.HOLD_MODE ?? "overnight") as "overnight" | "demo",
  demoHoldMinutes: Number(process.env.DEMO_HOLD_MINUTES ?? 1),
};
