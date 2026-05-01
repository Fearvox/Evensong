import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { record, setLedgerDir } from "../ledger";
import type { StoryboardOutput } from "../types";

const tmpDir = mkdtempSync("ledger-test-");
setLedgerDir(tmpDir);

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const sampleOutput: StoryboardOutput = {
  capsuleId: "cap-001",
  generatedAt: "2026-05-01T00:00:00.000Z",
  html: "<!DOCTYPE html><html></html>",
  sceneCount: 2,
  totalDurationMs: 5000,
};

describe("ledger.record", () => {
  it("writes a JSONL entry", async () => {
    const entry = await record(sampleOutput);
    expect(entry.capsuleId).toBe("cap-001");
    expect(entry.sceneCount).toBe(2);
    expect(entry.htmlByteLength).toBeGreaterThan(0);

    const raw = readFileSync(
      join(tmpDir, "storyboard-transforms.jsonl"),
      "utf-8",
    );
    expect(raw.trim().split("\n").length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(raw.trim().split("\n")[0]);
    expect(parsed.capsuleId).toBe("cap-001");
  });

  it("appends subsequent entries", async () => {
    await record({ ...sampleOutput, capsuleId: "cap-002", sceneCount: 3 });
    const raw = readFileSync(
      join(tmpDir, "storyboard-transforms.jsonl"),
      "utf-8",
    );
    const lines = raw.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(lines[lines.length - 1]).capsuleId).toBe("cap-002");
  });
});
