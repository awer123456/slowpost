import fs from "node:fs";
import path from "node:path";
import { retrieveTechniques } from "../src/retrieval.js";

// Retrieval-only recall measurement (fast; no generation calls).
const cases = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "data/eval-cases.json"), "utf8"));
let sum = 0;
for (const c of cases) {
  const got = await retrieveTechniques(`${c.context} ${c.draft}`, 3);
  const ids = got.map((g) => g.card.id);
  const hit = c.expectedCards.filter((id: string) => ids.includes(id)).length;
  sum += hit / c.expectedCards.length;
  console.log(`${c.id} recall=${hit}/${c.expectedCards.length} top3=${ids.join(",")} expected=${c.expectedCards.join(",")}`);
}
console.log(`\nRecall@3: ${((sum / cases.length) * 100).toFixed(1)}% over ${cases.length} cases`);
