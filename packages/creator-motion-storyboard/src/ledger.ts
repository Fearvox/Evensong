import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { LedgerEntry, StoryboardOutput } from "./types";

const DEFAULT_LEDGER_DIR = join(process.cwd(), ".ledger");
const LEDGER_FILE = "storyboard-transforms.jsonl";

let ledgerDir = DEFAULT_LEDGER_DIR;

/** Override the ledger directory (for testing). */
export function setLedgerDir(dir: string): void {
  ledgerDir = dir;
}

/** Record a transformation in the append-only ledger. */
export async function record(
  output: StoryboardOutput,
): Promise<LedgerEntry> {
  const entry: LedgerEntry = {
    capsuleId: output.capsuleId,
    timestamp: output.generatedAt,
    sceneCount: output.sceneCount,
    totalDurationMs: output.totalDurationMs,
    htmlByteLength: Buffer.byteLength(output.html, "utf-8"),
  };

  await mkdir(ledgerDir, { recursive: true });
  const line = JSON.stringify(entry) + "\n";
  await appendFile(join(ledgerDir, LEDGER_FILE), line, "utf-8");

  return entry;
}
