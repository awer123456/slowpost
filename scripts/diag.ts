import fs from "node:fs";
import path from "node:path";
import { embed, rerank } from "../src/llm.js";
import { allCards } from "../src/retrieval.js";

// Diagnostic: for each eval case, show where the expected cards get lost:
// BM25 top8? embedding top8? fused top8? reranked top3?

const cards = allCards();
const cases = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "data/eval-cases.json"), "utf8"));

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  tokens.push(...(text.toLowerCase().match(/[a-z0-9]+/g) ?? []));
  const han = text.replace(/[^\p{Script=Han}]/gu, "");
  for (let i = 0; i < han.length - 1; i++) tokens.push(han.slice(i, i + 2));
  for (const ch of han) tokens.push(ch);
  return tokens;
}
function cardText(c: (typeof cards)[number]): string {
  return `${c.title}。${c.principle} 关键词：${c.tags.join("、")}。示例：${c.example}`;
}
const K1 = 1.5, B = 0.75;
const docTokens = cards.map((c) => tokenize(cardText(c)));
const docLen = docTokens.map((t) => t.length);
const avgDl = docLen.reduce((a, b) => a + b, 0) / docLen.length;
const df = new Map<string, number>();
for (const toks of docTokens) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
function bm25(query: string): number[] {
  const q = tokenize(query);
  return docTokens.map((toks, i) => {
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    let s = 0;
    for (const qt of q) {
      const f = tf.get(qt) ?? 0;
      if (!f) continue;
      const idf = Math.log(1 + (cards.length - (df.get(qt) ?? 0) + 0.5) / ((df.get(qt) ?? 0) + 0.5));
      s += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * docLen[i]) / avgDl)));
    }
    return s;
  });
}
const rank = (scores: number[]) => scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
const cos = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
};

const cacheRaw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "data/embeddings-cache.json"), "utf8"));
const cardVecs: number[][] = Array.isArray(cacheRaw) ? cacheRaw : cacheRaw.vectors;

for (const c of cases) {
  const q = `${c.context} ${c.draft}`;
  const bm = rank(bm25(q));
  const [qv] = await embed([q]);
  const vec = rank(cardVecs.map((v) => cos(qv, v)));
  const fused = new Map<number, number>();
  bm.slice(0, 8).forEach((d, p) => fused.set(d, (fused.get(d) ?? 0) + 1 / (60 + p + 1)));
  vec.slice(0, 8).forEach((d, p) => fused.set(d, (fused.get(d) ?? 0) + 1 / (60 + p + 1)));
  const cand = [...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([i]) => i);
  const rr = await rerank(q, cand.map((i) => cardText(cards[i])), 3);
  const top3 = rr.map((r) => cards[cand[r.index]].id);
  const id = (i: number) => cards[i].id;
  console.log(`\n${c.id} expected=${c.expectedCards.join(",")}`);
  console.log(`  final top3 : ${top3.join(", ")}`);
  for (const exp of c.expectedCards) {
    const inBm = bm.slice(0, 8).map(id).includes(exp);
    const inVec = vec.slice(0, 8).map(id).includes(exp);
    const inCand = cand.map(id).includes(exp);
    const inTop = top3.includes(exp);
    console.log(`  ${exp}: bm25top8=${inBm} vectop8=${inVec} fused8=${inCand} top3=${inTop} (bm25rank=${bm.map(id).indexOf(exp) + 1}, vecrank=${vec.map(id).indexOf(exp) + 1})`);
  }
}
