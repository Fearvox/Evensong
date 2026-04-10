// R009 Evensong III — Insight Engine: Edge Case Tests
// Target: 15+ tests, STRICTLY under 450 lines
import { describe, it, expect, beforeEach } from 'bun:test';
import { InsightEngineService } from '../src/index.ts';
import { ValidationError, NotFoundError, ConflictError } from '../../../shared/errors.ts';

let svc: InsightEngineService;

beforeEach(() => {
  svc = new InsightEngineService();
});

async function makeSeries(name = 's1', orgId = 'org-1') {
  return svc.createSeries({ name, organizationId: orgId });
}

async function ingestMany(seriesId: string, values: number[]) {
  for (const v of values) await svc.ingestDataPoint({ seriesId, value: v });
}

// ─── Correlation ──────────────────────────────────────────────────────────────

describe('getCorrelation', () => {
  it('returns strong positive correlation for matching linear series', async () => {
    const a = await makeSeries('a');
    const b = await makeSeries('b');
    await ingestMany(a.id, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await ingestMany(b.id, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    const r = await svc.getCorrelation(a.id, b.id);
    expect(r.coefficient).toBeCloseTo(1.0, 3);
    expect(r.strength).toBe('strong');
    expect(r.direction).toBe('positive');
  });

  it('returns strong negative correlation for inverse series', async () => {
    const a = await makeSeries('a2');
    const b = await makeSeries('b2');
    await ingestMany(a.id, [1, 2, 3, 4, 5]);
    await ingestMany(b.id, [10, 8, 6, 4, 2]);
    const r = await svc.getCorrelation(a.id, b.id);
    expect(r.coefficient).toBeLessThan(-0.9);
    expect(r.direction).toBe('negative');
  });

  it('returns none for < 2 shared points', async () => {
    const a = await makeSeries('a3');
    const b = await makeSeries('b3');
    await svc.ingestDataPoint({ seriesId: a.id, value: 5 });
    // b has no points
    const r = await svc.getCorrelation(a.id, b.id);
    expect(r.strength).toBe('none');
    expect(r.coefficient).toBe(0);
  });

  it('uses only min(n_a, n_b) points for correlation', async () => {
    const a = await makeSeries('a4');
    const b = await makeSeries('b4');
    await ingestMany(a.id, [1, 2, 3, 4, 5, 6, 7, 8]);
    await ingestMany(b.id, [2, 4, 6]); // only 3 points
    const r = await svc.getCorrelation(a.id, b.id);
    // Should not throw; uses 3 points
    expect(typeof r.coefficient).toBe('number');
  });

  it('throws NotFoundError for unknown series', async () => {
    const a = await makeSeries('a5');
    await expect(svc.getCorrelation(a.id, 'ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── compareMetrics ───────────────────────────────────────────────────────────

describe('compareMetrics', () => {
  it('identifies series with highest mean as winner', async () => {
    const low = await makeSeries('low');
    const high = await makeSeries('high');
    await ingestMany(low.id, [1, 2, 3]);
    await ingestMany(high.id, [10, 20, 30]);
    const cmp = await svc.compareMetrics([low.id, high.id]);
    expect(cmp.winner?.seriesId).toBe(high.id);
    expect(cmp.statistics[low.id].mean).toBeCloseTo(2, 5);
    expect(cmp.statistics[high.id].mean).toBeCloseTo(20, 5);
  });

  it('throws ValidationError with fewer than 2 series', async () => {
    const s = await makeSeries();
    await expect(svc.compareMetrics([s.id])).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.compareMetrics([])).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError with more than 20 series', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const s = await svc.createSeries({ name: `s${i}`, organizationId: 'org-1' });
      ids.push(s.id);
    }
    await expect(svc.compareMetrics(ids)).rejects.toBeInstanceOf(ValidationError);
  });

  it('returns statistics for each series', async () => {
    const a = await makeSeries('cmp-a');
    const b = await makeSeries('cmp-b');
    await ingestMany(a.id, [1, 2, 3, 4, 5]);
    await ingestMany(b.id, [10, 20, 30]);
    const cmp = await svc.compareMetrics([a.id, b.id]);
    expect(cmp.statistics[a.id].count).toBe(5);
    expect(cmp.statistics[b.id].count).toBe(3);
  });
});

// ─── Alerts ───────────────────────────────────────────────────────────────────

describe('createAlert', () => {
  it('creates an alert with default cooldown', async () => {
    const s = await makeSeries();
    const alert = await svc.createAlert({
      seriesId: s.id,
      name: 'high-cpu',
      operator: 'gt',
      threshold: 90,
      organizationId: 'org-1',
    });
    expect(alert.id).toBeTruthy();
    expect(alert.status).toBe('active');
    expect(alert.triggerCount).toBe(0);
    expect(alert.cooldownMs).toBe(60000);
  });

  it('creates an alert with custom cooldown', async () => {
    const s = await makeSeries();
    const alert = await svc.createAlert({
      seriesId: s.id,
      name: 'fast-alert',
      operator: 'lt',
      threshold: 5,
      cooldownMs: 1000,
      organizationId: 'org-1',
    });
    expect(alert.cooldownMs).toBe(1000);
  });

  it('throws ValidationError for invalid operator', async () => {
    const s = await makeSeries();
    await expect(svc.createAlert({
      seriesId: s.id,
      name: 'bad',
      operator: 'invalid' as any,
      threshold: 10,
      organizationId: 'org-1',
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError for unknown series', async () => {
    await expect(svc.createAlert({
      seriesId: 'ghost',
      name: 'alert',
      operator: 'gt',
      threshold: 10,
      organizationId: 'org-1',
    })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('alert triggering', () => {
  it('triggers alert when threshold exceeded', async () => {
    const s = await makeSeries();
    await svc.createAlert({
      seriesId: s.id,
      name: 'over-90',
      operator: 'gt',
      threshold: 90,
      organizationId: 'org-1',
    });
    await svc.ingestDataPoint({ seriesId: s.id, value: 95 });
    const alerts = await svc.getAlerts(s.id);
    const triggered = alerts.find(a => a.status === 'triggered');
    expect(triggered).toBeDefined();
    expect(triggered!.triggerCount).toBe(1);
    expect(triggered!.lastTriggeredAt).toBeTruthy();
  });

  it('does not trigger when value is below threshold', async () => {
    const s = await makeSeries();
    await svc.createAlert({
      seriesId: s.id,
      name: 'over-90',
      operator: 'gt',
      threshold: 90,
      organizationId: 'org-1',
    });
    await svc.ingestDataPoint({ seriesId: s.id, value: 50 });
    const alerts = await svc.getAlerts(s.id);
    expect(alerts.every(a => a.status === 'active')).toBe(true);
  });

  it('can resolve a triggered alert', async () => {
    const s = await makeSeries();
    const alert = await svc.createAlert({
      seriesId: s.id,
      name: 'to-resolve',
      operator: 'gt',
      threshold: 5,
      organizationId: 'org-1',
    });
    await svc.ingestDataPoint({ seriesId: s.id, value: 10 });
    const resolved = await svc.resolveAlert(alert.id);
    expect(resolved.status).toBe('resolved');
  });

  it('throws NotFoundError resolving unknown alert', async () => {
    await expect(svc.resolveAlert('ghost-alert')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── Report generation ────────────────────────────────────────────────────────

describe('generateReport', () => {
  it('generates a complete report for a populated series', async () => {
    const s = await makeSeries();
    await ingestMany(s.id, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const report = await svc.generateReport(s.id);
    expect(report.id).toBeTruthy();
    expect(report.seriesId).toBe(s.id);
    expect(report.statistics.count).toBe(10);
    expect(report.trend.dataPoints).toBe(10);
    expect(report.forecast.basedOnPoints).toBe(10);
    expect(typeof report.anomalyCount).toBe('number');
  });

  it('generates report for empty series without throwing', async () => {
    const s = await makeSeries();
    const report = await svc.generateReport(s.id);
    expect(report.statistics.count).toBe(0);
    expect(report.forecast.confidence).toBe(0);
  });

  it('throws NotFoundError for unknown series', async () => {
    await expect(svc.generateReport('ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── _resetForTesting ─────────────────────────────────────────────────────────

describe('_resetForTesting', () => {
  it('clears all state between tests', async () => {
    const s = await makeSeries();
    await svc.ingestDataPoint({ seriesId: s.id, value: 1 });
    svc._resetForTesting();
    const h = await svc.health();
    expect(h.seriesCount).toBe(0);
    expect(h.dataPointCount).toBe(0);
    expect(h.alertCount).toBe(0);
  });
});
