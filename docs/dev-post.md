Title: SlowPost: A Post Office for Messages You Shouldn't Send Yet

Tags: #devchallenge #hf26challenge #ai #opensource

## What I Built

**SlowPost** is a slow post office for heated messages.

We've all written *that* message: the 1 a.m. resignation letter, the reply-all
with a little too much honesty, the text to your roommate about the dishes that
somehow escalates into questioning their entire upbringing. You don't regret
*writing* it. You regret *sending* it.

SlowPost changes the workflow. Instead of sending the message, you **mail it to
tomorrow**:

1. Paste the draft exactly as angrily as you wrote it, plus a line of context
   ("to my roommate, about the dishes").
2. An open-weight model rewrites it into a calm version — same facts, same
   request, none of the character assassination.
3. You also get a **neutral third-party summary** of the dispute and a breakdown
   of what *each side* probably needs.
4. The letter is then **held in the post office**. It doesn't go anywhere. In
   real mode it unlocks at 09:00 the next morning, when you can take out the
   calm version and decide — with a rested brain — whether to send anything at all.

SlowPost is a sibling of my earlier project **WeVi**, a private AI mediation
space where two people talk and only share summaries both sides approve. WeVi
mediates conversations that are already happening; SlowPost catches the message
*before* it becomes a conversation you'll regret.

## The open-source stack (and why it's the whole point)

A tool that stores your angriest, most private words has no business being
locked into one vendor's closed API. Every model in SlowPost is open-weight:

| Role | Model |
|---|---|
| Rewrite + analysis | DeepSeek-V3.2 (open weights) |
| Embeddings | Qwen3-Embedding-8B |
| Rerank | Qwen3-Reranker-8B |

They're served here through SiliconFlow's OpenAI-compatible API — but because
the models are open weights, the *same code* runs fully locally against Ollama
or vLLM by changing one environment variable. Hosted today, offline tomorrow,
self-hosted whenever: that choice belongs to the user, and it only exists
because the models are open.

## How it works

**Retrieval, not just vibes.** SlowPost keeps a library of 17 de-escalation
technique cards — Nonviolent Communication, Gottman's "soft startup", repair
attempts, boundaries without threats, the overnight rule. For each draft it
runs **hybrid retrieval** (BM25 + embedding recall, merged with Reciprocal Rank
Fusion) and a **cross-encoder rerank** to pick the three techniques that fit
*this specific conflict*. Those cards are injected into the prompt, so the
rewrite is grounded in an explicit technique, not generic "be nicer" energy.

**Strict structured output.** The model must return JSON — `calmRewrite`,
`neutralSummary`, `theirNeeds`, `myNeeds`, `techniquesUsed`, `riskFlags` —
validated against a zod schema. Invalid output is retried once with the
validation error fed back.

**The hold.** Letters are stored with a release time (next morning, 09:00;
demo mode shortens it). The UI won't show the calm version until the hold
expires. Slowness is the feature.

## I measured it instead of guessing

I built a small eval harness: 12 heated Chinese drafts (roommates, partners,
clients, landlords, a 1 a.m. breakup letter…), each labeled with the technique
cards a human would pick.

- **Retrieval Recall@3: 54.2%** — strict scoring: each case labels the two cards
  a human would pick, and near-miss cards (equally valid techniques) count as
  misses. Honest number, clear headroom, and now there's a harness to improve it.
- **Generation, per model** (schema success / avg latency / avg "heat reduction"
  from a transparent lexicon metric that scores absolutes, insults, threats and
  exclamation density before vs. after; latency measured from a remote dev box,
  the in-region production server is faster):

| Model | Schema success | Latency | Heat reduction |
|---|---|---|---|
| DeepSeek-V3.2 | 12/12 (100%) | 14.3s | 86% |
| DeepSeek-V4.1-Flash | 12/12 (100%) | 17.2s | 74% |
| Qwen3.5-35B-A3B | 12/12 (100%) | 114.4s | 82% |

DeepSeek-V3.2 won on every axis — fastest *and* coolest-headed — so it's the
default. The newest model (Qwen3.5-35B-A3B) was 8× slower because of its long
reasoning traces: a neat reminder that "latest flagship" ≠ "best fit" for a
small, well-scoped job.

The eval ships in the repo (`npm run eval`) — run it, get your own numbers,
pick your own default model. That's the open-source way.

## Demo

- **Live demo: https://slowpost.wevi.top** — the public demo runs in demo mode:
  the overnight hold is shortened to 3 minutes so you can watch a letter unlock.
  (Production mode holds letters until 09:00 the next morning.)
- Repo: https://github.com/awer123456/slowpost

## What I learned

**Retrieval quality is the product.** My first instinct was to spend all the
effort on the rewrite prompt. The eval disagreed: when the wrong technique
cards were retrieved, even a perfect prompt produced generic advice. Adding the
rerank stage changed which cards got picked for most drafts, and the rewrites
immediately became more specific — a concrete rota for the roommate, a boundary
script for the parents. Grounding beats eloquence.

**Newest ≠ best fit.** I benchmarked three open-weight models expecting the
newest flagship to win. DeepSeek-V3.2 — not the newest — was fastest *and*
produced the coolest rewrites, while Qwen3.5-35B-A3B's long reasoning traces
made it 8× slower for no quality gain. For a small, well-scoped job, a boring
model with a strict schema beats a brilliant one thinking out loud.

**Define the metric before you argue about quality.** "Is this rewrite good?"
is a vibes question. Forcing myself to define *heat* — absolutes, insults,
threats, exclamation density — as a dumb, transparent lexicon score made
quality measurable and comparable across models. The metric is crude and I say
so in the repo; a crude metric you can run beats a sophisticated opinion you
can't.

Slow down. Send tomorrow. 📮
