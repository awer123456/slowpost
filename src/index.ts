import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.js";
import { processMessage } from "./pipeline.js";
import { deposit, listLetters, release } from "./store.js";

const app = Fastify({ logger: true });

app.register(fastifyStatic, { root: path.resolve(process.cwd(), "public") });

app.get("/api/health", async () => ({
  ok: true,
  chatModel: config.chatModel,
  embeddingModel: config.embeddingModel,
  rerankModel: config.rerankModel,
  holdMode: config.holdMode,
}));

const ProcessBody = z.object({
  draft: z.string().min(2).max(4000),
  context: z.string().max(500).default(""),
});

// Process a draft and deposit it in the post office (held until release time).
app.post("/api/process", async (req, reply) => {
  const parsed = ProcessBody.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid body", detail: parsed.error.message });
  try {
    const processed = await processMessage(parsed.data.draft, parsed.data.context);
    processed.model = config.chatModel;
    const letter = deposit(parsed.data.draft, parsed.data.context, processed);
    return { letter };
  } catch (e) {
    req.log.error(e);
    return reply.code(502).send({ error: "processing failed", detail: e instanceof Error ? e.message.slice(0, 300) : String(e) });
  }
});

app.get("/api/letters", async () => ({ letters: listLetters() }));

app.post("/api/letters/:id/release", async (req, reply) => {
  const { id } = req.params as { id: string };
  const letter = release(id);
  if (!letter) return reply.code(404).send({ error: "not found" });
  if (letter.status !== "released") {
    return reply.code(403).send({ error: "still held", releaseAt: letter.releaseAt });
  }
  return { letter };
});

app.listen({ port: config.port, host: config.host }).then(() => {
  app.log.info(`SlowPost listening on ${config.host}:${config.port}`);
});
