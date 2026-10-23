import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { embed, rerank } from "./llm.js";

// Hybrid retrieval over the de-escalation technique card library:
//   1) BM25 lexical recall + embedding semantic recall
//   2) Reciprocal Rank Fusion to merge the two lists
//   3) Cross-encoder rerank (Qwen3-Reranker) for final precision
// Card embeddings are computed once and cached on disk.

export interface Card {
  id: string;
  title: string;
  titleEn: string;
  tags: string[];
  principle: string;
  example: string;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const cards: Card[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "cards.json"), "utf8"));
const CACHE_FILE = path.join(DATA_DIR, "embeddings-cache.json");

export function allCards(): Card[] {
  return cards;
}

function cardText(c: Card): string {
  return `${c.title}。${c.principle} 关键词：${c.tags.join("、")}。示例：${c.example}`;
}

// --- tokenization: character bigrams + latin words (works for Chinese without a segmenter)
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const latin = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  tokens.push(...latin);
  const han = text.replace(/[^\p{Script=Han}]/gu, "");
  for (let i = 0; i < han.length - 1; i++) tokens.push(han.slice(i, i + 2));
  for (const ch of han) tokens.push(ch);
  return tokens;
}

// --- BM25
const K1 = 1.5, B = 0.75;
const docTokens = cards.map((c) => tokenize(cardText(c)));
const docLen = docTokens.map((t) => t.length);
const avgDl = docLen.reduce((a, b) => a + b, 0) / docLen.length;
const df = new Map<string, number>();
for (const toks of docTokens) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);

function bm25Scores(query: string): number[] {
  const qToks = tokenize(query);
  return docTokens.map((toks, i) => {
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    let s = 0;
    for (const qt of qToks) {
      const f = tf.get(qt) ?? 0;
      if (!f) continue;
      const idf = Math.log(1 + (cards.length - (df.get(qt) ?? 0) + 0.5) / ((df.get(qt) ?? 0) + 0.5));
      s += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * docLen[i]) / avgDl)));
    }
    return s;
  });
}

// --- embeddings with on-disk cache, keyed by a hash of the card texts so
// editing a card can never silently reuse stale vectors.
let cardVectors: number[][] | null = null;
async function getCardVectors(): Promise<number[][]> {
  if (cardVectors) return cardVectors;
  const texts = cards.map(cardText);
  const hash = crypto.createHash("sha256").update(texts.join("\n")).digest("hex").slice(0, 16);
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (cached.hash === hash && cached.vectors?.length === cards.length) {
      cardVectors = cached.vectors;
      return cardVectors!;
    }
  } catch { /* no cache yet */ }
  cardVectors = await embed(texts);
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ hash, vectors: cardVectors }));
  return cardVectors;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

export interface RetrievedCard {
  card: Card;
  rerankScore: number | null;
  sources: string[]; // which retriever surfaced it
}

export async function retrieveTechniques(query: string, topK = 3): Promise<RetrievedCard[]> {
  const bm = bm25Scores(query);
  const bmRank = rankOrder(bm);

  let vecRank: number[] = [];
  try {
    const [qVec] = await embed([query]);
    const vecs = await getCardVectors();
    const sims = vecs.map((v) => cosine(qVec, v));
    vecRank = rankOrder(sims);
  } catch { /* semantic recall unavailable (local mode) — BM25 still works */ }

  // Reciprocal Rank Fusion
  const fused = new Map<number, { score: number; sources: string[] }>();
  const addRank = (rank: number[], source: string) => {
    rank.forEach((docIdx, pos) => {
      const cur = fused.get(docIdx) ?? { score: 0, sources: [] };
      cur.score += 1 / (60 + pos + 1);
      cur.sources.push(source);
      fused.set(docIdx, cur);
    });
  };
  addRank(bmRank, "bm25");
  if (vecRank.length) addRank(vecRank, "embedding");

  // The library is small: let the reranker see a wide candidate pool (top 12
  // of the fusion) instead of cutting to 8 before it — most recall losses in
  // our eval happened at exactly that cut.
  const candidates = [...fused.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 12);

  // Rerank for precision; fall back to fusion order if rerank is unavailable.
  // The reranker is instruction-aware, so phrase the query as the task.
  try {
    const docs = candidates.map(([i]) => cardText(cards[i]));
    const ranked = await rerank(
      `为下面这条冲突消息选择最适用的沟通技巧。消息：${query}`,
      docs,
      topK,
    );
    return ranked.map((r) => ({
      card: cards[candidates[r.index][0]],
      rerankScore: r.score,
      sources: candidates[r.index][1].sources,
    }));
  } catch {
    return candidates.slice(0, topK).map(([i, meta]) => ({
      card: cards[i], rerankScore: null, sources: meta.sources,
    }));
  }
}

function rankOrder(scores: number[]): number[] {
  return scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
}
