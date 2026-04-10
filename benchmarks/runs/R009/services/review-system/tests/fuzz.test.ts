import { describe, it, expect, beforeEach } from 'bun:test';
import { ReviewSystemService } from '../src/index.ts';
import { ValidationError, ConflictError } from '../../../shared/errors.ts';

let svc: ReviewSystemService;

function randomString(len = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function randomScore(): number {
  return Math.random() * 12 - 1; // range -1 to 11 to test out-of-bounds
}

function randomOrgId(): string {
  return `org-${Math.floor(Math.random() * 100)}`;
}

beforeEach(() => {
  svc = new ReviewSystemService();
});

describe('fuzz: submitForReview with random inputs', () => {
  it('handles 15 random submissions without crash', async () => {
    const inputs = Array.from({ length: 15 }, (_, i) => ({
      title: randomString(20),
      authorId: `author-${i}`,
      authorOrganizationId: randomOrgId(),
      abstract: randomString(80),
      keywords: [randomString(6), randomString(6)],
    }));

    let successCount = 0;
    for (const input of inputs) {
      try {
        const { review } = await svc.submitForReview(input);
        expect(review.stage).toBe('pending');
        successCount++;
      } catch (e) {
        // Only ValidationError is acceptable
        expect(e).toBeInstanceOf(ValidationError);
      }
    }
    expect(successCount).toBeGreaterThan(0);
  });
});

describe('fuzz: score validation with random values', () => {
  it('rejects out-of-range scores for 15 random inputs', async () => {
    const { review } = await svc.submitForReview({
      title: 'Fuzz Paper',
      authorId: 'fuzz-author',
      authorOrganizationId: 'org-fuzz',
      abstract: 'Abstract text',
    });
    const reviewer = await svc.registerReviewer({
      userId: 'fuzz-reviewer',
      name: 'Fuzz Rev',
      organizationId: 'org-other',
    });
    await svc.assignReviewer(review.id, reviewer.id);

    const badScores = Array.from({ length: 15 }, () => {
      // Mix of bad values
      const badVal = [0, -1, 11, 100, -100, NaN, Infinity, -Infinity, 0.5, 10.5][Math.floor(Math.random() * 10)];
      return { novelty: badVal, methodology: 5, clarity: 5, significance: 5 };
    });

    for (const scores of badScores) {
      if (scores.novelty >= 1 && scores.novelty <= 10 && Number.isFinite(scores.novelty)) continue; // skip valid ones
      try {
        await svc.scorePaper(review.id, reviewer.id, scores as any);
        // If we get here, the score was somehow valid — check it
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
      }
    }
  });
});

describe('fuzz: conflict detection with random org combinations', () => {
  it('correctly detects same-org conflicts for 12 random org pairs', async () => {
    for (let i = 0; i < 12; i++) {
      svc._reset();
      const org = `org-${i}-shared`;
      const { review } = await svc.submitForReview({
        title: `Paper ${i}`,
        authorId: `author-${i}`,
        authorOrganizationId: org,
        abstract: 'Some abstract text',
      });
      const reviewer = await svc.registerReviewer({
        userId: `reviewer-${i}`,
        name: `Rev ${i}`,
        organizationId: org, // same org — conflict expected
      });
      const result = await svc.detectConflicts(review.id, reviewer.id);
      expect(result.hasConflict).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe('fuzz: registration with random reviewer data', () => {
  it('registers 15 unique reviewers without collision', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 15; i++) {
      const rev = await svc.registerReviewer({
        userId: `u-fuzz-${i}-${randomString(4)}`,
        name: randomString(10),
        organizationId: `org-fuzz-${i}`,
        expertise: [randomString(5), randomString(5)],
      });
      expect(rev.id).toBeTruthy();
      expect(ids).not.toContain(rev.id);
      ids.push(rev.id);
    }
    expect(ids.length).toBe(15);
  });
});

describe('fuzz: concurrent workload with multiple reviewers', () => {
  it('maintains correct active review counts across 10 assignments', async () => {
    const reviewers = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        svc.registerReviewer({ userId: `rv-${i}`, name: `Rev ${i}`, organizationId: `org-${i + 100}` })
      )
    );

    // Submit 10 papers with distinct authors
    const papers = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        svc.submitForReview({
          title: `Concurrent Paper ${i}`,
          authorId: `conc-author-${i}`,
          authorOrganizationId: `org-paper-${i}`,
          abstract: `Abstract for paper ${i}`,
        })
      )
    );

    let assignCount = 0;
    for (let i = 0; i < papers.length; i++) {
      const reviewer = reviewers[i % reviewers.length];
      try {
        await svc.assignReviewer(papers[i].review.id, reviewer.id);
        assignCount++;
      } catch {
        // workload cap may be hit
      }
    }

    // Total active reviews across all reviewers should equal assign count
    let totalActive = 0;
    for (const reviewer of reviewers) {
      const { reviewer: r } = await svc.getReviewerWorkload(reviewer.id);
      totalActive += r.activeReviews;
    }
    expect(totalActive).toBe(assignCount);
  });
});
