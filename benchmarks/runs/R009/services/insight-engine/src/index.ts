// R009 Evensong III — Insight Engine Service
import { randomUUID } from 'crypto';
import { InMemoryStore } from '../../../shared/db.ts';
import { AppError, NotFoundError, ValidationError, ConflictError } from '../../../shared/errors.ts';
import { EventBus, DomainEvent } from '../../../shared/events.ts';
import { createLogger, Logger } from '../../../shared/logger.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DataPoint {
  id: string;
  seriesId: string;
  value: number;
  timestamp: string;
  tags?: Record<string, string>;
}

export interface TimeSeries {
  id: string;
  name: string;
  description: string;
  unit: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  tags?: Record<string, string>;
}

export interface CreateSeriesInput {
  name: string;
  description?: string;
  unit?: string;
  organizationId: string;
  tags?: Record<string, string>;
}

export interface IngestInput {
  seriesId: string;
  value: number;
  timestamp?: string;
  tags?: Record<string, string>;
}

export interface Statistics {
  count: number;
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface AnomalyResult {
  seriesId: string;
  threshold: number;
  anomalies: Array<{
    dataPointId: string;
    value: number;
    timestamp: string;
    zScore: number;
  }>;
}

export interface TrendResult {
  seriesId: string;
  slope: number;
  intercept: number;
  rSquared: number;
  direction: 'increasing' | 'decreasing' | 'flat';
  dataPoints: number;
}

export interface ForecastResult {
  seriesId: string;
  nextValue: number;
  confidence: number;
  basedOnPoints: number;
}

export interface CorrelationResult {
  seriesAId: string;
  seriesBId: string;
  coefficient: number;
  strength: 'strong' | 'moderate' | 'weak' | 'none';
  direction: 'positive' | 'negative' | 'none';
}

export interface MetricComparison {
  seriesIds: string[];
  statistics: Record<string, Statistics>;
  winner?: { seriesId: string; metric: string };
}

export type AlertOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
export type AlertStatus = 'active' | 'triggered' | 'resolved';

export interface Alert {
  id: string;
  seriesId: string;
  name: string;
  operator: AlertOperator;
  threshold: number;
  cooldownMs: number;
  status: AlertStatus;
  lastTriggeredAt?: string;
  triggerCount: number;
  organizationId: string;
  createdAt: string;
}

export interface CreateAlertInput {
  seriesId: string;
  name: string;
  operator: AlertOperator;
  threshold: number;
  cooldownMs?: number;
  organizationId: string;
}

export interface Report {
  id: string;
  seriesId: string;
  generatedAt: string;
  statistics: Statistics;
  trend: TrendResult;
  anomalyCount: number;
  forecast: ForecastResult;
  organizationId: string;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  timestamp: string;
  seriesCount: number;
  dataPointCount: number;
  alertCount: number;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stddev(values: number[], avg?: number): number {
  if (values.length < 2) return 0;
  const m = avg ?? mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeStats(values: number[]): Statistics {
  if (values.length === 0) {
    return { count: 0, mean: 0, median: 0, stddev: 0, min: 0, max: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const avg = mean(values);
  return {
    count: values.length,
    mean: avg,
    median: median(sorted),
    stddev: stddev(values, avg),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

// Linear regression: y = slope * x + intercept
function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, rSquared: 0 };

  const xMean = mean(xs);
  const yMean = mean(ys);

  let ssXY = 0, ssXX = 0;
  for (let i = 0; i < n; i++) {
    ssXY += (xs[i] - xMean) * (ys[i] - yMean);
    ssXX += (xs[i] - xMean) ** 2;
  }

  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = yMean - slope * xMean;

  // r-squared
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i] - yMean) ** 2;
    ssRes += (ys[i] - (slope * xs[i] + intercept)) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, rSquared };
}

// Pearson correlation
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const xMean = mean(xs);
  const yMean = mean(ys);
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function checkAlertCondition(value: number, operator: AlertOperator, threshold: number): boolean {
  switch (operator) {
    case 'gt': return value > threshold;
    case 'lt': return value < threshold;
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    case 'eq': return value === threshold;
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateSeriesName(name: unknown): string {
  if (typeof name !== 'string') throw new ValidationError('name must be a string');
  const t = name.trim();
  if (t.length === 0) throw new ValidationError('name must not be empty');
  if (t.length > 200) throw new ValidationError('name exceeds 200 characters');
  return t;
}

function validateValue(value: unknown): number {
  if (typeof value !== 'number') throw new ValidationError('value must be a number');
  if (!isFinite(value)) throw new ValidationError('value must be finite');
  return value;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class InsightEngineService {
  private series: InMemoryStore<TimeSeries>;
  private dataPoints: InMemoryStore<DataPoint>;
  private alerts: InMemoryStore<Alert>;
  private logger: Logger;
  private bus: EventBus;

  constructor(bus?: EventBus, logger?: Logger) {
    this.series = new InMemoryStore<TimeSeries>();
    this.dataPoints = new InMemoryStore<DataPoint>();
    this.alerts = new InMemoryStore<Alert>();
    this.logger = logger ?? createLogger('insight-engine');
    this.bus = bus ?? new EventBus();
  }

  // ── Series management ────────────────────────────────────────────────────────

  async createSeries(input: CreateSeriesInput): Promise<TimeSeries> {
    const name = validateSeriesName(input.name);
    if (!input.organizationId?.trim()) throw new ValidationError('organizationId must be a non-empty string');

    const existing = await this.series.findAll(
      s => s.organizationId === input.organizationId && s.name === name
    );
    if (existing.length > 0) throw new ConflictError(`Series '${name}' already exists in this organization`);

    const now = new Date().toISOString();
    const ts: TimeSeries = {
      id: randomUUID(),
      name,
      description: input.description?.trim() ?? '',
      unit: input.unit?.trim() ?? '',
      organizationId: input.organizationId.trim(),
      createdAt: now,
      updatedAt: now,
      tags: input.tags ?? {},
    };
    const saved = await this.series.insert(ts);
    this.logger.info('Series created', { id: saved.id, name: saved.name });
    await this.publishEvent('insight.series_created', { seriesId: saved.id });
    return saved;
  }

  async getSeries(id: string): Promise<TimeSeries> {
    if (!id?.trim()) throw new ValidationError('id must be a non-empty string');
    const s = await this.series.findById(id);
    if (!s) throw new NotFoundError('TimeSeries', id);
    return s;
  }

  // ── Ingest ───────────────────────────────────────────────────────────────────

  async ingestDataPoint(input: IngestInput): Promise<DataPoint> {
    await this.getSeries(input.seriesId); // ensure series exists
    const value = validateValue(input.value);

    const ts = input.timestamp ?? new Date().toISOString();
    if (input.timestamp) {
      const d = new Date(input.timestamp);
      if (isNaN(d.getTime())) throw new ValidationError('timestamp must be a valid ISO 8601 string');
    }

    const dp: DataPoint = {
      id: randomUUID(),
      seriesId: input.seriesId,
      value,
      timestamp: ts,
      tags: input.tags ?? {},
    };
    const saved = await this.dataPoints.insert(dp);

    // Check alert conditions after ingestion
    await this.evaluateAlerts(input.seriesId, value);

    this.logger.debug('Data point ingested', { seriesId: input.seriesId, value });
    await this.publishEvent('insight.data_ingested', { seriesId: input.seriesId, value });
    return saved;
  }

  // ── Time series retrieval ────────────────────────────────────────────────────

  async getTimeSeries(
    seriesId: string,
    filter?: { from?: string; to?: string; limit?: number }
  ): Promise<DataPoint[]> {
    await this.getSeries(seriesId);
    let points = await this.dataPoints.findAll(dp => dp.seriesId === seriesId);
    if (filter?.from) {
      const from = new Date(filter.from).getTime();
      points = points.filter(dp => new Date(dp.timestamp).getTime() >= from);
    }
    if (filter?.to) {
      const to = new Date(filter.to).getTime();
      points = points.filter(dp => new Date(dp.timestamp).getTime() <= to);
    }
    points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (filter?.limit !== undefined) {
      if (filter.limit < 1) throw new ValidationError('limit must be a positive integer');
      points = points.slice(0, filter.limit);
    }
    return points;
  }

  // ── Statistics ───────────────────────────────────────────────────────────────

  async computeStatistics(seriesId: string): Promise<Statistics> {
    const points = await this.getTimeSeries(seriesId);
    const values = points.map(dp => dp.value);
    return computeStats(values);
  }

  // ── Anomaly detection ────────────────────────────────────────────────────────

  async detectAnomalies(seriesId: string, threshold = 2.0): Promise<AnomalyResult> {
    if (typeof threshold !== 'number' || !isFinite(threshold) || threshold <= 0) {
      throw new ValidationError('threshold must be a positive finite number');
    }
    const points = await this.getTimeSeries(seriesId);
    const values = points.map(dp => dp.value);
    const avg = mean(values);
    const sd = stddev(values, avg);

    const anomalies = points
      .map(dp => {
        const zScore = sd === 0 ? 0 : Math.abs((dp.value - avg) / sd);
        return { dataPointId: dp.id, value: dp.value, timestamp: dp.timestamp, zScore };
      })
      .filter(a => a.zScore >= threshold);

    return { seriesId, threshold, anomalies };
  }

  // ── Trend analysis ───────────────────────────────────────────────────────────

  async analyzeTrend(seriesId: string): Promise<TrendResult> {
    const points = await this.getTimeSeries(seriesId);
    if (points.length < 2) {
      return {
        seriesId,
        slope: 0,
        intercept: points[0]?.value ?? 0,
        rSquared: 0,
        direction: 'flat',
        dataPoints: points.length,
      };
    }

    // Use index as x-axis (0, 1, 2...) for regression
    const xs = points.map((_, i) => i);
    const ys = points.map(dp => dp.value);
    const { slope, intercept, rSquared } = linearRegression(xs, ys);

    let direction: TrendResult['direction'];
    if (Math.abs(slope) < 1e-10) direction = 'flat';
    else direction = slope > 0 ? 'increasing' : 'decreasing';

    return { seriesId, slope, intercept, rSquared, direction, dataPoints: points.length };
  }

  // ── Forecast ─────────────────────────────────────────────────────────────────

  async forecastNext(seriesId: string): Promise<ForecastResult> {
    const points = await this.getTimeSeries(seriesId);
    if (points.length === 0) {
      throw new AppError('Cannot forecast with no data points', 'INSUFFICIENT_DATA', 422);
    }
    if (points.length === 1) {
      return {
        seriesId,
        nextValue: points[0].value,
        confidence: 0.1,
        basedOnPoints: 1,
      };
    }

    const xs = points.map((_, i) => i);
    const ys = points.map(dp => dp.value);
    const { slope, intercept, rSquared } = linearRegression(xs, ys);
    const nextX = points.length;
    const nextValue = slope * nextX + intercept;

    return {
      seriesId,
      nextValue,
      confidence: Math.min(rSquared, 0.99),
      basedOnPoints: points.length,
    };
  }

  // ── Correlation ──────────────────────────────────────────────────────────────

  async getCorrelation(seriesAId: string, seriesBId: string): Promise<CorrelationResult> {
    const [aPoints, bPoints] = await Promise.all([
      this.getTimeSeries(seriesAId),
      this.getTimeSeries(seriesBId),
    ]);
    const n = Math.min(aPoints.length, bPoints.length);
    if (n < 2) {
      return {
        seriesAId,
        seriesBId,
        coefficient: 0,
        strength: 'none',
        direction: 'none',
      };
    }

    const xs = aPoints.slice(0, n).map(dp => dp.value);
    const ys = bPoints.slice(0, n).map(dp => dp.value);
    const coeff = pearson(xs, ys);
    const abs = Math.abs(coeff);

    let strength: CorrelationResult['strength'];
    if (abs >= 0.8) strength = 'strong';
    else if (abs >= 0.5) strength = 'moderate';
    else if (abs >= 0.2) strength = 'weak';
    else strength = 'none';

    let direction: CorrelationResult['direction'];
    if (abs < 0.2) direction = 'none';
    else direction = coeff > 0 ? 'positive' : 'negative';

    return { seriesAId, seriesBId, coefficient: coeff, strength, direction };
  }

  // ── Metric comparison ────────────────────────────────────────────────────────

  async compareMetrics(seriesIds: string[]): Promise<MetricComparison> {
    if (!Array.isArray(seriesIds) || seriesIds.length < 2) {
      throw new ValidationError('compareMetrics requires at least 2 series IDs');
    }
    if (seriesIds.length > 20) {
      throw new ValidationError('compareMetrics supports at most 20 series');
    }

    const statsMap: Record<string, Statistics> = {};
    let bestMean = -Infinity;
    let bestId: string | undefined;

    for (const id of seriesIds) {
      const stats = await this.computeStatistics(id);
      statsMap[id] = stats;
      if (stats.mean > bestMean) {
        bestMean = stats.mean;
        bestId = id;
      }
    }

    return {
      seriesIds,
      statistics: statsMap,
      winner: bestId ? { seriesId: bestId, metric: 'mean' } : undefined,
    };
  }

  // ── Report generation ────────────────────────────────────────────────────────

  async generateReport(seriesId: string): Promise<Report> {
    const s = await this.getSeries(seriesId);
    const [statistics, trend, anomalyResult, forecast] = await Promise.all([
      this.computeStatistics(seriesId),
      this.analyzeTrend(seriesId),
      this.detectAnomalies(seriesId),
      this.forecastNext(seriesId).catch(() => ({
        seriesId,
        nextValue: 0,
        confidence: 0,
        basedOnPoints: 0,
      })),
    ]);

    const report: Report = {
      id: randomUUID(),
      seriesId,
      generatedAt: new Date().toISOString(),
      statistics,
      trend,
      anomalyCount: anomalyResult.anomalies.length,
      forecast,
      organizationId: s.organizationId,
    };

    this.logger.info('Report generated', { seriesId, anomalyCount: report.anomalyCount });
    await this.publishEvent('insight.report_generated', { seriesId, reportId: report.id });
    return report;
  }

  // ── Alerts ────────────────────────────────────────────────────────────────────

  async createAlert(input: CreateAlertInput): Promise<Alert> {
    await this.getSeries(input.seriesId);
    const name = validateSeriesName(input.name);
    if (!['gt', 'lt', 'gte', 'lte', 'eq'].includes(input.operator)) {
      throw new ValidationError(`operator must be one of: gt, lt, gte, lte, eq`);
    }
    if (typeof input.threshold !== 'number' || !isFinite(input.threshold)) {
      throw new ValidationError('threshold must be a finite number');
    }
    if (!input.organizationId?.trim()) throw new ValidationError('organizationId must be a non-empty string');

    const cooldownMs = input.cooldownMs ?? 60000;
    if (typeof cooldownMs !== 'number' || cooldownMs < 0) {
      throw new ValidationError('cooldownMs must be a non-negative number');
    }

    const alert: Alert = {
      id: randomUUID(),
      seriesId: input.seriesId,
      name,
      operator: input.operator,
      threshold: input.threshold,
      cooldownMs,
      status: 'active',
      triggerCount: 0,
      organizationId: input.organizationId.trim(),
      createdAt: new Date().toISOString(),
    };

    const saved = await this.alerts.insert(alert);
    this.logger.info('Alert created', { id: saved.id, seriesId: saved.seriesId });
    await this.publishEvent('insight.alert_created', { alertId: saved.id, seriesId: saved.seriesId });
    return saved;
  }

  async getAlerts(seriesId?: string): Promise<Alert[]> {
    if (seriesId) {
      await this.getSeries(seriesId);
      return this.alerts.findAll(a => a.seriesId === seriesId);
    }
    return this.alerts.findAll();
  }

  async resolveAlert(alertId: string): Promise<Alert> {
    const alert = await this.alerts.findById(alertId);
    if (!alert) throw new NotFoundError('Alert', alertId);
    const updated = await this.alerts.update(alertId, { status: 'resolved' });
    if (!updated) throw new NotFoundError('Alert', alertId);
    await this.publishEvent('insight.alert_resolved', { alertId });
    return updated;
  }

  // ── Health ───────────────────────────────────────────────────────────────────

  async health(): Promise<HealthStatus> {
    const [seriesCount, dataPointCount, alertCount] = await Promise.all([
      this.series.count(),
      this.dataPoints.count(),
      this.alerts.count(),
    ]);
    return {
      status: 'ok',
      service: 'insight-engine',
      timestamp: new Date().toISOString(),
      seriesCount,
      dataPointCount,
      alertCount,
    };
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  private async evaluateAlerts(seriesId: string, value: number): Promise<void> {
    const activeAlerts = await this.alerts.findAll(
      a => a.seriesId === seriesId && a.status === 'active'
    );
    const now = Date.now();
    for (const alert of activeAlerts) {
      const inCooldown =
        alert.lastTriggeredAt &&
        now - new Date(alert.lastTriggeredAt).getTime() < alert.cooldownMs;
      if (inCooldown) continue;

      if (checkAlertCondition(value, alert.operator, alert.threshold)) {
        await this.alerts.update(alert.id, {
          status: 'triggered',
          lastTriggeredAt: new Date().toISOString(),
          triggerCount: alert.triggerCount + 1,
        });
        await this.publishEvent('insight.alert_triggered', {
          alertId: alert.id,
          seriesId,
          value,
          threshold: alert.threshold,
          operator: alert.operator,
        });
        this.logger.warn('Alert triggered', { alertId: alert.id, value, threshold: alert.threshold });
      }
    }
  }

  private async publishEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    const event: DomainEvent = {
      id: randomUUID(),
      type,
      source: 'insight-engine',
      timestamp: new Date().toISOString(),
      correlationId: randomUUID(),
      payload,
    };
    await this.bus.publish(event);
  }

  _resetForTesting(): void {
    this.series.clear();
    this.dataPoints.clear();
    this.alerts.clear();
  }
}
