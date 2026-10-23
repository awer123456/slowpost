# SlowPost 📮 — a post office for messages you shouldn't send yet

**SlowPost** is a "slow post office" for heated messages. Instead of firing off the
angry text you just typed, you *mail it to tomorrow*: an open-weight model rewrites
it into a calm version, writes a neutral third-party summary, and extracts what
each side actually needs — then the letter is **held in the post office until the
next morning**, when you can take out the calm version and decide, with a clear
head, whether to send it at all.

SlowPost is a sibling of [WeVi](https://github.com/awer123456), a private AI
mediation space built on the same belief: **the most sensitive conversations in
your life should be handled by models you can choose, inspect, and run yourself.**

**Live demo: https://slowpost.wevi.top** (demo mode: the overnight hold is
shortened to 3 minutes so you can watch a letter unlock)

![SlowPost demo: a roommate rant about takeout boxes, cooled from heat 54 to 0](https://slowpost.wevi.top/demo.png)

## Why open-weight AI is the core

This is not a wrapper around a closed API. Every model in the pipeline is an
open-weight model, served through an OpenAI-compatible endpoint:

| Role | Model | Why |
|---|---|---|
| Rewrite + analysis | DeepSeek-V3.2 (open weights, MIT) | Strong Chinese instruction-following and reliable structured JSON |
| Embeddings | Qwen3-Embedding-8B | Top-tier multilingual retrieval (MTEB) |
| Rerank | Qwen3-Reranker-8B | Cross-encoder precision for the technique library |

Because the models are open weights, the *same code* runs three ways with only
an environment change:

1. **Hosted** (default here): SiliconFlow's API serving the open-weight models.
2. **Fully local**: point `LLM_BASE_URL` at a local Ollama / vLLM endpoint running
   the same (or smaller) open-weight models — nothing leaves your machine.
3. **Self-hosted**: your own vLLM cluster, if you have one.

That freedom is the point: a tool that holds your angriest, most private words
should never lock you into one vendor's cloud.

## How it works

```
heated draft ──► hybrid retrieval ──► LLM rewrite ──► held in post office ──► released next morning
                    │                     │
        technique card library      strict JSON schema
        (NVC, Gottman, ...)         validated output
```

1. **Retrieval** — a library of 17 de-escalation technique cards (Nonviolent
   Communication, Gottman's soft startup, boundaries, repair attempts, the
   overnight rule…). For each draft we run **BM25 + embedding recall**, merge
   with **Reciprocal Rank Fusion**, then **rerank** with a cross-encoder to pick
   the 3 techniques that fit *this* conflict.
2. **Generation** — the chat model receives the draft plus the selected cards and
   must return strict JSON: `calmRewrite`, `neutralSummary`, `theirNeeds`,
   `myNeeds`, `techniquesUsed`, `riskFlags`. Output is validated against a zod
   schema; invalid output is retried once with the validation error fed back.
3. **The hold** — the letter is stored, not sent. In real mode it unlocks at
   09:00 the next day. Sleep resets the emotional baseline; whatever you still
   want to say tomorrow is what you actually meant.

## Evaluation

We built a small, fully reproducible eval (12 heated Chinese drafts, each labeled
with the technique cards a human would pick) and measured the pipeline instead
of vibes:

- **Retrieval**: Recall@3 of the hybrid + rerank pipeline.
- **Generation** (per model): strict-schema success rate, average latency, and
  "heat reduction" — a transparent lexicon-based score of heated language
  (absolutes, insults, threats, exclamation density) before vs. after rewriting.

Run it yourself:

```bash
EVAL_MODELS="deepseek-ai/DeepSeek-V3.2,deepseek-ai/DeepSeek-V4.1-Flash,Qwen/Qwen3.5-35B-A3B" npm run eval
```

Results are written to `data/eval-results.json`. Numbers from our run
(2026-10-23, measured from a remote dev box — the deployed server in-region is
faster):

- **Retrieval Recall@3: 75.0%** (first run: 54.2%) — strict scoring: each case
  labels the two cards a human would pick, and near-miss cards (equally valid
  techniques) count as misses. Diagnosing the misses showed most losses were
  not the reranker's fault: the candidate pool was cut to 8 before reranking,
  and the cards' written vocabulary missed users' colloquial wording. Widening
  the pool, adding colloquial tags, and phrasing the rerank query as a task
  took it to 75.0%.

| Model | Schema success | Avg latency | Avg heat reduction | Total tokens |
|---|---|---|---|---|
| DeepSeek-V3.2 | 12/12 (100%) | 12.9s | 83% | 9,230 |
| DeepSeek-V4.1-Flash | 12/12 (100%) | 14.8s | 72% | 16,122 |
| Qwen3.5-35B-A3B | 9/12 (75%)* | 97.2s | 78% | 50,588 |

DeepSeek-V3.2 won on every axis, so it is the default. Qwen3.5-35B-A3B's
reasoning traces made it 7× slower — a good reminder that "newest" is not
"best fit" for a small, well-scoped task.

\* The Qwen3.5 row was measured from the production server; 3 of its 12 calls
failed on provider errors (HTTP 503 / dropped connections) across repeated
attempts from two networks, so its figures cover the 9 completed cases.

## Run it

```bash
npm install
cp .env.example .env   # set SILICONFLOW_API_KEY (or LLM_BASE_URL + key for local)
npm start              # http://localhost:3200
```

Environment:

| Variable | Default | Notes |
|---|---|---|
| `SILICONFLOW_API_KEY` | — | Or `LLM_API_KEY` for any OpenAI-compatible endpoint |
| `LLM_BASE_URL` | `https://api.siliconflow.cn/v1` | Set to `http://localhost:11434/v1` for local Ollama |
| `CHAT_MODEL` | `deepseek-ai/DeepSeek-V3.2` | Any open-weight chat model the endpoint serves |
| `EMBEDDING_MODEL` | `Qwen/Qwen3-Embedding-8B` | |
| `RERANK_MODEL` | `Qwen/Qwen3-Reranker-8B` | Retrieval falls back to BM25+RRF if unavailable |
| `HOLD_MODE` | `overnight` | `demo` releases after `DEMO_HOLD_MINUTES` minutes |
| `PORT` | `3200` | |

## Tech

Node 24 · TypeScript · Fastify · zod · no database (a JSON post-office box is
enough for a post office) · vanilla HTML/CSS front end.

## License

MIT. The technique cards summarize widely published communication research
(NVC, the Gottman Institute's findings, interest-based negotiation) in our own
words.
