import fs from "node:fs";
import path from "node:path";
import { processMessage } from "../src/pipeline.js";
import { retrieveTechniques } from "../src/retrieval.js";

// Eval harness: runs the full pipeline over a fixed set of heated drafts for
// each candidate open-weight model and reports:
//   - schema success rate (did the model return valid structured JSON?)
//   - heat reduction (deterministic lexicon metric, before vs after)
//   - latency and token usage
// Retrieval quality is measured separately (it is model-independent):
//   - Recall@3 of the expected technique cards per case.
// Usage: EVAL_MODELS="model-a,model-b" npm run eval

interface EvalCase { id: string; draft: string; context: string; expectedCards: string[] }

const cases: EvalCase[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "data/eval-cases.json"), "utf8"),
);

const models = (process.env.EVAL_MODELS ?? "deepseek-ai/DeepSeek-V3.2")
  .split(",").map((s) => s.trim()).filter(Boolean);

// --- retrieval recall (once, pipeline-independent)
let recallSum = 0;
for (const c of cases) {
  const got = await retrieveTechniques(`${c.context} ${c.draft}`, 3);
  const gotIds = new Set(got.map((g) => g.card.id));
  const hit = c.expectedCards.filter((id) => gotIds.has(id)).length;
  recallSum += hit / c.expectedCards.length;
}
const recall = recallSum / cases.length;
console.log(`\n## Retrieval (hybrid BM25 + embedding + RRF + rerank)\nRecall@3: ${(recall * 100).toFixed(1)}% over ${cases.length} cases\n`);

// --- per-model generation eval
interface Row {
  model: string; ok: number; total: number; avgLatency: number;
  avgHeatDrop: number; tokens: number; errors: string[];
}
const rows: Row[] = [];

for (const model of models) {
  let ok = 0, latencySum = 0, heatDropSum = 0, tokens = 0;
  const errors: string[] = [];
  for (const c of cases) {
    try {
      const r = await processMessage(c.draft, c.context, model);
      ok++;
      latencySum += r.latencyMs;
      heatDropSum += r.heatBefore > 0 ? (r.heatBefore - r.heatAfter) / r.heatBefore : 0;
      tokens += r.usage?.total_tokens ?? 0;
    } catch (e) {
      errors.push(`${c.id}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
  }
  const row: Row = {
    model, ok, total: cases.length,
    avgLatency: ok ? latencySum / ok : 0,
    avgHeatDrop: ok ? heatDropSum / ok : 0,
    tokens, errors,
  };
  rows.push(row);
  console.log(`done: ${model} (${ok}/${cases.length} ok)`);
}

console.log("\n## Generation by model\n");
console.log("| Model | Schema success | Avg latency | Avg heat reduction | Total tokens |");
console.log("|---|---|---|---|---|");
for (const r of rows) {
  console.log(`| ${r.model} | ${r.ok}/${r.total} (${((r.ok / r.total) * 100).toFixed(0)}%) | ${(r.avgLatency / 1000).toFixed(1)}s | ${(r.avgHeatDrop * 100).toFixed(0)}% | ${r.tokens} |`);
}
for (const r of rows) if (r.errors.length) console.log(`\nErrors for ${r.model}:\n- ${r.errors.join("\n- ")}`);

fs.writeFileSync(
  path.resolve(process.cwd(), "data/eval-results.json"),
  JSON.stringify({ at: new Date().toISOString(), recall, rows }, null, 2),
);
console.log("\nWrote data/eval-results.json");
