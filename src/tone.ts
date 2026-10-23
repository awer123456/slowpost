// Deterministic "heat" score for a message: a simple, explainable lexicon metric.
// Used by the eval harness to measure how much a rewrite cools a message down.
// Not a research-grade toxicity model — deliberately transparent and reproducible.

// Negative / heated terms commonly found in Chinese conflict messages.
export const HEAT_WORDS: Record<string, number> = {
  你总是: 3, 从来: 2, 每次都: 2, 又是: 1, 根本: 2, 完全: 1, 一点都: 2,
  受够了: 3, 没法过: 3, 离婚: 3, 分手: 3, 滚: 4, 闭嘴: 4, 废物: 4, 垃圾: 4,
  脑子有病: 4, 有病: 3, 神经病: 4, 不要脸: 4, 自私: 3, 无能: 3, 没用: 3,
  蠢: 3, 猪头: 3, 蠢猪: 3, 装什么: 2, 别装了: 3, 别演了: 2, 演什么: 2,
  呵呵: 2, 随便你: 2, 爱咋咋: 2, 不想废话: 2,
  最后一次: 2, 警告你: 3, 等着: 2, 后悔: 1, 失望透顶: 3, 心寒: 3, 恶心: 3,
  气死: 2, 烦死: 2, 毁了: 2, 凭什么: 2, 你以为你是谁: 3, 少来: 2,
  不解释: 1, 没商量: 2, 必须: 1, 立刻: 1, 马上给我: 2, 干什么吃的: 3,
  眼瞎: 3, 耳朵聋: 3, 长没长心: 3, 良心: 1, 面子: 1, 笑话: 2,
  "！": 0.5, "!": 0.5, "？？": 1, "??": 1,
};

// Phrases where a lexicon word is used literally, not as an insult — masked
// out before scoring. Found the hard way: a perfectly calm rewrite saying
// "我们可以轮流清理垃圾吗" ("shall we take turns clearing the trash") once
// scored 64 because 垃圾 ("trash") is also an insult ("you are trash").
const NEUTRAL_PHRASES = [
  "垃圾桶", "垃圾袋", "垃圾分类", "倒垃圾", "扔垃圾", "清理垃圾",
  "收拾垃圾", "扫垃圾", "外卖垃圾", "垃圾堆放",
];

export interface ToneScore {
  score: number; // weighted heat-word hits
  hits: string[];
  exclamations: number;
}

export function toneScore(text: string): ToneScore {
  let masked = text;
  for (const phrase of NEUTRAL_PHRASES) masked = masked.split(phrase).join("〇".repeat(phrase.length));
  let score = 0;
  const hits: string[] = [];
  for (const [word, weight] of Object.entries(HEAT_WORDS)) {
    let idx = masked.indexOf(word);
    while (idx !== -1) {
      score += weight;
      hits.push(word);
      idx = masked.indexOf(word, idx + word.length);
    }
  }
  const exclamations = (text.match(/！|!/g) ?? []).length;
  return { score: Math.round(score * 10) / 10, hits, exclamations };
}

// 0..100 "heat index": saturating curve so longer rants don't explode the scale.
export function heatIndex(text: string): number {
  const { score } = toneScore(text);
  const per100 = score / Math.max(text.length, 1);
  return Math.round(100 * (1 - Math.exp(-score / 6)) * 0.7 + 100 * Math.min(per100 * 8, 0.3));
}
