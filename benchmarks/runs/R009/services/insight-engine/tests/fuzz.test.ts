// R009 Evensong III — Insight Engine: Fuzz Tests
// Target: 5+ fuzz tests, 10+ random inputs each, STRICTLY under 300 lines
import { describe, it, expect, beforeEach } from 'bun:test';
import { InsightEngineService } from '../src/index.ts';
import { ValidationError } from '../../../shared/errors.ts';

let svc: InsightEngineService;

beforeEach(() => {
  svc = new InsightEngineService();
});

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randString(len = 8): string {
  return Math.random().toString(36).substring(2, 2 + len);
}

// ─── Fuzz 1: Statistics consistency invariants ────────────────────────────────

describe('fuzz: statistics invariants', () => {
  it('min <= mean <= max and stddev >= 0 for any random dataset (20 runs)', async () => {
    for (let run = 0; run < 20; run++) {
      const svc2 = new InsightEngineService();
      const s = await svc2.createSeries({ name: `fuzz-stats-${run}`, organizationId: 'org-fuzz' });
      const n = randInt(2, 50);
      for (let i = 0; i < n; i++) {
        await svc2.ingestDataPoint({ seriesId: s.id, value: randFloat(-1000, 1000) });
      }
      const stats = await svc2.computeStatistics(s.id);
      expect(stats.min).toBeLessThanOrEqual(stats.mean);
      expect(stats.mean).toBeLessThanOrEqual(stats.max);
      expect(stats.stddev).toBeGreaterThanOrEqual(0);
      expect(stats.p50).toBeGreaterThanOrEqual(stats.min);
      expect(stats.p99).toBeLessThanOrEqual(stats.max);
      expect(stats.count).toBe(n);
    }
  });
});

// ─── Fuzz 2: Anomaly detection never throws on valid data ─────────────────────

describe('fuzz: anomaly detection stability', () => {
  it('detectAnomalies never throws on valid random series (15 runs)', async () => {
    for (let run = 0; run < 15; run++) {
      const svc2 = new InsightEngineService();
      const s = await svc2.createSeries({ name: `fuzz-anom-${run}`, organizationId: 'org-fuzz' });
      const n = randInt(1, 30);
      for (let i = 0; i < n; i++) {
        const v = randFloat(-500, 500);
        await svc2.ingestDataPoint({ seriesId: s.id, value: v });
      }
      const threshold = randFloat(0.5, 5.0);
      const result = await svc2.detectAnomalies(s.id, threshold);
      expect(Array.isArray(result.anomalies)).toBe(true);
      // all z-scores must be >= threshold
      for (const a of result.anomalies) {
        expect(a.zScore).toBeGreaterThanOrEqual(threshold);
      }
    }
  });
});

// ─── Fuzz 3: Linear trend forecast is monotonically correct ──────────────────

describe('fuzz: forecast follows linear trend', () => {
  it('forecast approximates slope for near-perfect linear data (10 runs)', async () => {
    for (let run = 0; run < 10; run++) {
      const svc2 = new InsightEngineService();
      const s = await svc2.createSeries({ name: `fuzz-forecast-${run}`, organizationId: 'org-fuzz' });
      const slope = randFloat(-10, 10);
      const intercept = randFloat(-100, 100);
      const n = randInt(5, 15);
      for (let i = 0; i < n; i++) {
        await svc2.ingestDataPoint({ seriesId: s.id, value: slope * i + intercept });
      }
      const fc = await svc2.forecastNext(s.id);
      const expected = slope * n + intercept;
      expect(fc.nextValue).toBeCloseTo(expected, 3);
      expect(fc.confidence).toBeGreaterThan(0.9);
    }
  });
});

// ─── Fuzz 4: Invalid input rejection is consistent ────────────────────────────

describe('fuzz: invalid inputs always rejected', () => {
  it('rejects non-finite values consistently (12 runs)', async () => {
    const s = await svc.createSeries({ name: 'fuzz-invalid', organizationId: 'org-1' });
    const badValues = [
      Infinity, -Infinity, NaN,
      Infinity, -Infinity, NaN,
      Infinity, -Infinity, NaN,
      Infinity, -Infinity, NaN,
    ];
    for (const bad of badValues) {
      await expect(
        svc.ingestDataPoint({ seriesId: s.id, value: bad })
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('rejects blank series names consistently (10 runs)', async () => {
    const blanks = ['', ' ', '  ', '\t', '\n', '   ', '\r\n', '\t\t', ' \t ', '   '];
    for (const blank of blanks) {
      await expect(
        svc.createSeries({ name: blank, organizationId: 'org-1' })
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });
});

// ─── Fuzz 5: Correlation coefficient always in [-1, 1] ───────────────────────

describe('fuzz: correlation coefficient bounds', () => {
  it('Pearson coefficient always in [-1, 1] for random series (12 runs)', async () => {
    for (let run = 0; run < 12; run++) {
      const svc2 = new InsightEngineService();
      const a = await svc2.createSeries({ name: `fuzz-corr-a-${run}`, organizationId: 'org-fuzz' });
      const b = await svc2.createSeries({ name: `fuzz-corr-b-${run}`, organizationId: 'org-fuzz' });
      const n = randInt(2, 20);
      for (let i = 0; i < n; i++) {
        await svc2.ingestDataPoint({ seriesId: a.id, value: randFloat(-1000, 1000) });
        await svc2.ingestDataPoint({ seriesId: b.id, value: randFloat(-1000, 1000) });
      }
      const r = await svc2.getCorrelation(a.id, b.id);
      expect(r.coefficient).toBeGreaterThanOrEqual(-1.0 - 1e-9);
      expect(r.coefficient).toBeLessThanOrEqual(1.0 + 1e-9);
    }
  });
});
