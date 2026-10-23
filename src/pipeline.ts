import { z} from "zod";
import { chatJson} from "./llm.js";
import { retrieveTechniques, type RetrievedCard} from "./retrieval.js";
import { heatIndex} from "./tone.js";

// The core pipeline: heated draft in -> cooled, structured result out.
// 1) Hybrid retrieval picks de-escalation techniques for this specific message.
// 2) The chat model rewrites + analyses, constrained to a strict JSON schema.
// 3) Output is validated with zod; on failure we retry once with the error fed back.

export const ResultSchema = z.object({
calmRewrite: z.string().min(1),
neutralSummary: z.string().min(1),
theirNeeds: z.array(z.string()).max(5),
myNeeds: z.array(z.string()).max(5),
techniquesUsed: z.array(z.string()).max(5),
riskFlags: z.array(z.string()).max(5),
});
export type SlowPostResult = z.infer<typeof ResultSchema>;

const SYSTEM = `你是一位冷静、专业的沟通调解顾问，服务于"WeVi 中立会谈空间"的慢邮局功能。
用户会给你一段情绪激烈、准备发给某个人的消息草稿。你的任务：
1. 把它改写成冷静版：保留全部事实和核心诉求，删掉人身攻击、绝对化指责（总是/从来/根本）、威胁、讽刺；用"我"陈述感受和需要；如果原文有具体请求，保留并使其更具体。
2. 给出一段中立摘要：站在第三方立场，一两句话说清这件事的事实和分歧点，不偏向任何一方。
3. 分别提炼对方可能的需要（theirNeeds）和用户自己的需要（myNeeds），每条一句话。
4. techniquesUsed：从给定的技巧卡中，写出你实际用了哪几张（填卡片标题）。
5. riskFlags：指出原文中仍然敏感、可能引发误解的表达类型（如：翻旧账、最后通牒、以分手威胁）；没有则为空数组。
只输出 JSON，不要任何额外文字。JSON 结构：
{"calmRewrite": string, "neutralSummary": string, "theirNeeds": string[], "myNeeds": string[], "techniquesUsed": string[], "riskFlags": string[]}`;

export interface ProcessedMessage {
result: SlowPostResult;
cards: RetrievedCard[];
model: string;
latencyMs: number;
usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number};
heatBefore: number;
heatAfter: number;
}

export async function processMessage(
draft: string,
context: string,
model?: string,
): Promise<ProcessedMessage> {
const query = `${context} ${draft}`;
const cards = await retrieveTechniques(query, 3);
const cardBlock = cards
.map((c, i) => `${c.card.title}\n原则：${c.card.principle}\n示例：${c.card.example}`)
.join("\n\n");

const userPrompt = `背景：${context || "（用户未提供背景）"}
消息草稿：
"""
${draft}
"""
可参考的技巧卡：
${cardBlock}

请按系统要求输出 JSON。`;

let lastError = "";
for (let attempt = 0; attempt < 2; attempt++) {
const { content, usage, latencyMs} = await chatJson(
SYSTEM,
attempt === 0? userPrompt: `${userPrompt}\n\n上次输出不合规（${lastError}），请严格按结构重新输出。`,
model,
);
try {
const parsed = ResultSchema.parse(JSON.parse(content));
return {
result: parsed,
cards,
model: model?? "",
latencyMs,
usage,
heatBefore: heatIndex(draft),
heatAfter: heatIndex(parsed.calmRewrite),
};
} catch (e) {
lastError = e instanceof Error? e.message.slice(0, 200): String(e);
}
}
throw new Error(`Model output failed schema validation twice: ${lastError}`);
}
