import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import type { ProcessedMessage } from "./pipeline.js";

// The "post office": a processed letter is HELD, not sent.
// Real mode: it becomes available at 09:00 the next morning.
// Demo mode: after DEMO_HOLD_MINUTES minutes.

const FILE = path.resolve(process.cwd(), "data/letters.json");

export interface Letter {
  id: string;
  createdAt: number;
  releaseAt: number;
  draft: string;
  context: string;
  processed: ProcessedMessage;
  status: "held" | "released";
}

function load(): Letter[] {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; }
}
function save(all: Letter[]) {
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
}

export function computeReleaseAt(now = Date.now()): number {
  if (config.holdMode === "demo") return now + config.demoHoldMinutes * 60_000;
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

export function deposit(draft: string, context: string, processed: ProcessedMessage): Letter {
  const now = Date.now();
  const letter: Letter = {
    id: crypto.randomUUID().slice(0, 8),
    createdAt: now,
    releaseAt: computeReleaseAt(now),
    draft,
    context,
    processed,
    status: "held",
  };
  const all = load();
  all.unshift(letter);
  save(all.slice(0, 200));
  return letter;
}

export function listLetters(): (Letter & { available: boolean })[] {
  const now = Date.now();
  return load().map((l) => ({ ...l, available: now >= l.releaseAt }));
}

export function release(id: string): Letter | null {
  const all = load();
  const letter = all.find((l) => l.id === id);
  if (!letter) return null;
  if (Date.now() < letter.releaseAt) return letter; // still held; caller checks status
  letter.status = "released";
  save(all);
  return letter;
}
