// R009 Evensong III — Insight Engine: Core Unit Tests
// Target: 35+ tests, STRICTLY under 450 lines
import { describe, it, expect, beforeEach } from 'bun:test';
import { InsightEngineService } from '../src/index.ts';
import { ValidationError, NotFoundError, ConflictError, AppError } from '../../../shared/errors.ts';
import { EventBus } from '../../../shared/events.ts';

let svc: InsightEngineService;

beforeEach(() => {
  svc = new InsightEngineService();
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function makeSeries(name = 'cpu-usage', orgId = 'org-1') {
  return svc.createSeries({ name, organizationId: orgId });
}

async function ingestMany(seriesId: string, values: number[]) {
  for (const v of values) await svc.ingestDataPoint({ seriesId, value: v });
}

// ─── Series CRUD ──────────────────────────────────────────────────────────────

describe('createSeries', () => {
  it('creates a series with required fields', async () => {
    const s = await makeSeries('temp-sensor');
    expect(s.id).toBeTruthy();
    expect(s.name).toBe('temp-sensor');
    expect(s.organizationId).toBe('org-1');
    expect(s.createdAt).toBeTruthy();
    expect(s.updatedAt).toBeTruthy();
  });

  it('stores unit and description when provided', async () => {
    const s = await svc.createSeries({
      name: 'latency',
      organizationId: 'org-1',
      unit: 'ms',
      description: 'API response latency',
    });
    expect(s.unit).toBe('ms');
    expect(s.description).toBe('API response latency');
  });

  it('throws ConflictError on duplicate name within org', async () => {
    await makeSeries('dup');
    await expect(makeSeries('dup')).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows same name in different orgs', async () => {
    const a = await svc.createSeries({ name: 'metric', organizationId: 'org-1' });
    const b = await svc.createSeries({ name: 'metric', organizationId: 'org-2' });
    expect(a.id).not.toBe(b.id);
  });

  it('throws ValidationError for empty name', async () => {
    await expect(svc.createSeries({ name: '  ', organizationId: 'org-1' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError for missing organizationId', async () => {
    await expect(svc.createSeries({ name: 'x', organizationId: '' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('trims whitespace from name', async () => {
    const s = await svc.createSeries({ name: '  mem-usage  ', organizationId: 'org-1' });
    expect(s.name).toBe('mem-usage');
  });
});

describe('getSeries', () => {
  it('retrieves an existing series', async () => {
    const s = await makeSeries('disk-io');
    const fetched = await svc.getSeries(s.id);
    expect(fetched.id).toBe(s.id);
    expect(fetched.name).toBe('disk-io');
  });

  it('throws NotFoundError for unknown id', async () => {
    await expect(svc.getSeries('nonexistent')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ValidationError for empty id', async () => {
    await expect(svc.getSeries('')).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── Ingest ───────────────────────────────────────────────────────────────────

describe('ingestDataPoint', () => {
  it('ingests a data point and returns it', async () => {
    const s = await makeSeries();
    const dp = await svc.ingestDataPoint({ seriesId: s.id, value: 42.5 });
    expect(dp.id).toBeTruthy();
    expect(dp.seriesId).toBe(s.id);
    expect(dp.value).toBe(42.5);
    expect(dp.timestamp).toBeTruthy();
  });

  it('accepts a custom timestamp', async () => {
    const s = await makeSeries();
    const ts = '2024-01-01T00:00:00.000Z';
    const dp = await svc.ingestDataPoint({ seriesId: s.id, value: 1, timestamp: ts });
    expect(dp.timestamp).toBe(ts);
  });

  it('throws for invalid timestamp', async () => {
    const s = await makeSeries();
    await expect(svc.ingestDataPoint({ seriesId: s.id, value: 1, timestamp: 'not-a-date' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError for non-finite value', async () => {
    const s = await makeSeries();
    await expect(svc.ingestDataPoint({ seriesId: s.id, value: Infinity }))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(svc.ingestDataPoint({ seriesId: s.id, value: NaN }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError for unknown series', async () => {
    await expect(svc.ingestDataPoint({ seriesId: 'ghost', value: 1 }))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── getTimeSeries ────────────────────────────────────────────────────────────

describe('getTimeSeries', () => {
  it('returns points in chronological order', async () => {
    const s = await makeSeries();
    await svc.ingestDataPoint({ seriesId: s.id, value: 3, timestamp: '2024-01-03T00:00:00Z' });
    await svc.ingestDataPoint({ seriesId: s.id, value: 1, timestamp: '2024-01-01T00:00:00Z' });
    await svc.ingestDataPoint({ seriesId: s.id, value: 2, timestamp: '2024-01-02T00:00:00Z' });
    const pts = await svc.getTimeSeries(s.id);
    expect(pts.map(p => p.value)).toEqual([1, 2, 3]);
  });

  it('filters by from/to range', async () => {
    const s = await makeSeries();
    await svc.ingestDataPoint({ seriesId: s.id, value: 10, timestamp: '2024-01-01T00:00:00Z' });
    await svc.ingestDataPoint({ seriesId: s.id, value: 20, timestamp: '2024-06-01T00:00:00Z' });
    await svc.ingestDataPoint({ seriesId: s.id, value: 30, timestamp: '2024-12-01T00:00:00Z' });
    const pts = await svc.getTimeSeries(s.id, {
      from: '2024-03-01T00:00:00Z',
      to: '2024-09-01T00:00:00Z',
    });
    expect(pts.length).toBe(1);
    expect(pts[0].value).toBe(20);
  });

  it('respects limit parameter', async () => {
    const s = await makeSeries();
    await ingestMany(s.id, [1, 2, 3, 4, 5]);
    const pts = await svc.getTimeSeries(s.id, { limit: 3 });
    expect(pts.length).toBe(3);
  });

  it('throws ValidationError for limit < 1', async () => {
    const s = await makeSeries();
    await expect(svc.getTimeSeries(s.id, { limit: 0 })).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── Statistics ───────────────────────────────────────────────────────────────

describe('computeStatistics', () => {
  it('returns zero-stats for empty series', async () => {
    const s = await makeSeries();
    const stats = await svc.computeStatistics(s.id);
    expect(stats.count).toBe(0);
    expect(stats.mean).toBe(0);
  });

  it('computes correct stats for known dataset', async () => {
    const s = await makeSeries();
    await ingestMany(s.id, [2, 4, 4, 4, 5, 5, 7, 9]);
    const stats = await svc.computeStatistics(s.id);
    expect(stats.count).toBe(8);
    expect(stats.mean).toBeCloseTo(5.0, 5);
    expect(stats.min).toBe(2);
    expect(stats.max).toBe(9);
    // sample stddev (n-1 denominator) for [2,4,4,4,5,5,7,9] ≈ 2.138
    expect(stats.stddev).toBeCloseTo(2.138, 2);
  });

  it('computes correct percentiles', async () => {
    const s = await makeSeries();
    await ingestMany(s.id, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const stats = await svc.computeStatistics(s.id);
    expect(stats.p50).toBeCloseTo(5.5, 1);
    expect(stats.p90).toBeCloseTo(9.1, 0);
    expect(stats.p99).toBeCloseTo(9.91, 0);
  });

  it('handles single value series', async () => {
    const s = await makeSeries();
    await svc.ingestDataPoint({ seriesId: s.id, value: 42 });
    const stats = await svc.computeStatistics(s.id);
    expect(stats.count).toBe(1);
    expect(stats.mean).toBe(42);
    expect(stats.stddev).toBe(0);
    expect(stats.min).toBe(42);
    expect(stats.max).toBe(42);
  });
});

// ─── Anomaly Detection ────────────────────────────────────────────────────────

describe('detectAnomalies', () => {
  it('detects outlier in dataset', async () => {
    const s = await makeSeries();
    // values near 10 except one spike at 100
    await ingestMany(s.id, [10, 11, 10, 9, 10, 10, 100, 10]);
    const result = await svc.detectAnomalies(s.id);
    expect(result.anomalies.length).toBeGreaterThanOrEqual(1);
    const spike = result.anomalies.find(a => a.value === 100);
    expect(spike).toBeDefined();
    expect(spike!.zScore).toBeGreaterThan(2.0);
  });

  it('returns empty anomalies for uniform data', async () => {
    const s = await makeSeries();
    await ingestMany(s.id, [5, 5, 5, 5, 5]);
    const result = await svc.detectAnomalies(s.id);
    expect(result.anomalies.length).toBe(0);
  });

  it('uses custom threshold', async () => {
    const s = await makeSeries();
    await ingestMany(s.id, [10, 11, 10, 9, 10, 10, 15, 10]);
    const strictResult = await svc.detectAnomalies(s.id, 3.0);
    const lenientResult = await svc.detectAnomalies(s.id, 0.5);
    expect(lenientResult.anomalies.length).toBeGreaterThan(strictResult.anomalies.length);
  });

  it('throws ValidationError for invalid threshold', async () => {
    const s = await makeSeries();
    await expect(svc.detectAnomalies(s.id, -1)).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.detectAnomalies(s.id, 0)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── Trend Analysis ───────────────────────────────────────────────────────────

describe('analyzeTrend', () => {
  it('detects increasing trend', async () => {
    const s = await makeSeries();
    await ingestMany(s.id, [1, 2, 3, 4, 5, 6, 7, 8]);
    const trend = await svc.analyzeTrend(s.id);
    expect(trend.direction).toBe('increasing');
    expect(trend.slope).toBeGreaterThan(0);
    expect(trend.rSquared).toBeCloseTo(1.0, 1);
  });

  it('detects decreasing trend', async () => {
    const s = await makeSeries();
    await ingestMany(s.id, [8, 7, 6, 5, 4, 3, 2, 1]);
    const trend = await svc.analyzeTrend(s.id);
    expect(trend.direction).toBe('decreasing');
    expect(trend.slope).toBeLessThan(0);
  });

  it('detects flat trend for constant data', async () => {
    const s = await makeSeries();
    await ingestMany(s.id, [5, 5, 5, 5, 5]);
    const trend = await svc.analyzeTrend(s.id);
    expect(trend.direction).toBe('flat');
    expect(Math.abs(trend.slope)).toBeLessThan(1e-9);
  });

  it('handles single point gracefully', async () => {
    const s = await makeSeries();
    await svc.ingestDataPoint({ seriesId: s.id, value: 7 });
    const trend = await svc.analyzeTrend(s.id);
    expect(trend.direction).toBe('flat');
    expect(trend.dataPoints).toBe(1);
  });
});

// ─── Forecast ────────────────────────────────────────────────────────────────

describe('forecastNext', () => {
  it('forecasts next value on linear data', async () => {
    const s = await makeSeries();
    await ingestMany(s.id, [1, 2, 3, 4, 5]);
    const fc = await svc.forecastNext(s.id);
    expect(fc.nextValue).toBeCloseTo(6, 0);
    expect(fc.basedOnPoints).toBe(5);
    expect(fc.confidence).toBeGreaterThan(0.9);
  });

  it('throws AppError for empty series', async () => {
    const s = await makeSeries();
    await expect(svc.forecastNext(s.id)).rejects.toBeInstanceOf(AppError);
  });

  it('returns low confidence for single point', async () => {
    const s = await makeSeries();
    await svc.ingestDataPoint({ seriesId: s.id, value: 10 });
    const fc = await svc.forecastNext(s.id);
    expect(fc.confidence).toBeLessThan(0.5);
    expect(fc.nextValue).toBe(10);
  });
});

// ─── Health ───────────────────────────────────────────────────────────────────

describe('health', () => {
  it('returns ok status with counts', async () => {
    const s = await makeSeries();
    await svc.ingestDataPoint({ seriesId: s.id, value: 1 });
    const h = await svc.health();
    expect(h.status).toBe('ok');
    expect(h.service).toBe('insight-engine');
    expect(h.seriesCount).toBe(1);
    expect(h.dataPointCount).toBe(1);
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────

describe('event bus integration', () => {
  it('publishes insight.series_created on createSeries', async () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.subscribe('insight.series_created', e => { events.push(e.type); });
    const svcWithBus = new InsightEngineService(bus);
    await svcWithBus.createSeries({ name: 'evt-test', organizationId: 'org-1' });
    expect(events).toContain('insight.series_created');
  });

  it('publishes insight.data_ingested on ingestDataPoint', async () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.subscribe('insight.data_ingested', e => { events.push(e.type); });
    const svcWithBus = new InsightEngineService(bus);
    const s = await svcWithBus.createSeries({ name: 'evt-ingest', organizationId: 'org-1' });
    await svcWithBus.ingestDataPoint({ seriesId: s.id, value: 1 });
    expect(events).toContain('insight.data_ingested');
  });
});
