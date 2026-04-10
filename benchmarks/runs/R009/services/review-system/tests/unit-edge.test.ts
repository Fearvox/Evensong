import { describe, it, expect, beforeEach } from 'bun:test';
import { ReviewSystemService } from '../src/index.ts';
import { NotFoundError, ValidationError, ConflictError, AuthorizationError } from '../../../shared/errors.ts';

let svc: ReviewSystemService;

const paper = (overrides = {}) => ({
  title: 'Edge Case Paper',
  authorId: 'edge-author',
  authorOrganizationId: 'org-edge',
  abstract: 'Edge case abstract for testing',
  ...overrides,
});

beforeEach(() => {
  svc = new ReviewSystemService();
});

describe('edge: co-author conflict detection', () => {
  it('detects co-author in reviewer history', async () => {
    const { review } = await svc.submitForReview(paper({ authorId: 'famous-author' }));
    const reviewer = await svc.registerReviewer({
      userId: 'reviewer-x',
      name: 'Reviewer X',
      organizationId: 'org-far',
      coAuthorHistory: ['famous-author'],
    });
    const result = await svc.detectConflicts(review.id, reviewer.id);
    expect(result.hasConflict).toBe(true);
    expect(result.reasons.some(r => r.includes('co-authored with the paper author'))).toBe(true);
  });

  it('detects co-author is reviewer themselves', async () => {
    const { review } = await svc.submitForReview(paper({ coAuthorIds: ['reviewer-coauthor'] }));
    const reviewer = await svc.registerReviewer({
      userId: 'reviewer-coauthor',
      name: 'Co Reviewer',
      organizationId: 'org-far',
    });
    const result = await svc.detectConflicts(review.id, reviewer.id);
    expect(result.hasConflict).toBe(true);
    expect(result.reasons.some(r => r.includes('co-author of the paper'))).toBe(true);
  });

  it('detects co-author shared history with a co-author', async () => {
    const { review } = await svc.submitForReview(paper({ coAuthorIds: ['coauthor-of-paper'] }));
    const reviewer = await svc.registerReviewer({
      userId: 'reviewer-y',
      name: 'Y',
      organizationId: 'org-far',
      coAuthorHistory: ['coauthor-of-paper'],
    });
    const result = await svc.detectConflicts(review.id, reviewer.id);
    expect(result.hasConflict).toBe(true);
  });

  it('no conflict when reviewer is from different org and no history', async () => {
    const { review } = await svc.submitForReview(paper());
    const reviewer = await svc.registerReviewer({
      userId: 'clean-reviewer',
      name: 'Clean',
      organizationId: 'org-clean',
      coAuthorHistory: [],
    });
    const result = await svc.detectConflicts(review.id, reviewer.id);
    expect(result.hasConflict).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });
});

describe('edge: stage transitions', () => {
  it('cannot submit feedback on pending review', async () => {
    const { review } = await svc.submitForReview(paper());
    const reviewer = await svc.registerReviewer({ userId: 'r1', name: 'R', organizationId: 'org-r' });
    await expect(svc.submitFeedback(review.id, reviewer.id, 'Feedback')).rejects.toThrow(ConflictError);
  });

  it('cannot score pending review', async () => {
    const { review } = await svc.submitForReview(paper());
    const reviewer = await svc.registerReviewer({ userId: 'r1', name: 'R', organizationId: 'org-r' });
    await expect(svc.scorePaper(review.id, reviewer.id, { novelty: 5, methodology: 5, clarity: 5, significance: 5 })).rejects.toThrow(ConflictError);
  });

  it('cannot complete review without feedback and scores', async () => {
    const { review } = await svc.submitForReview(paper());
    const reviewer = await svc.registerReviewer({ userId: 'r1', name: 'R', organizationId: 'org-r' });
    await svc.assignReviewer(review.id, reviewer.id);
    await expect(svc.completeReview(review.id, reviewer.id)).rejects.toThrow(ValidationError);
  });

  it('cannot reassign completed review', async () => {
    const { review } = await svc.submitForReview(paper());
    const rev = await svc.registerReviewer({ userId: 'r1', name: 'R', organizationId: 'org-r' });
    await svc.assignReviewer(review.id, rev.id);
    await svc.submitFeedback(review.id, rev.id, 'Done');
    await svc.scorePaper(review.id, rev.id, { novelty: 7, methodology: 7, clarity: 7, significance: 7 });
    await svc.completeReview(review.id, rev.id);
    const rev2 = await svc.registerReviewer({ userId: 'r2', name: 'R2', organizationId: 'org-r2' });
    await expect(svc.reassignReviewer(review.id, rev2.id)).rejects.toThrow(ConflictError);
  });

  it('cannot reassign rejected review', async () => {
    const { review } = await svc.submitForReview(paper());
    await svc.rejectReview(review.id, 'Out of scope');
    const rev = await svc.registerReviewer({ userId: 'r1', name: 'R', organizationId: 'org-r' });
    await expect(svc.reassignReviewer(review.id, rev.id)).rejects.toThrow(ConflictError);
  });
});

describe('edge: score boundary values', () => {
  it('accepts score of exactly 1', async () => {
    const { review } = await svc.submitForReview(paper());
    const reviewer = await svc.registerReviewer({ userId: 'r1', name: 'R', organizationId: 'org-r' });
    await svc.assignReviewer(review.id, reviewer.id);
    const result = await svc.scorePaper(review.id, reviewer.id, { novelty: 1, methodology: 1, clarity: 1, significance: 1 });
    expect(result.weightedScore).toBe(1);
  });

  it('accepts score of exactly 10', async () => {
    const { review } = await svc.submitForReview(paper());
    const reviewer = await svc.registerReviewer({ userId: 'r1', name: 'R', organizationId: 'org-r' });
    await svc.assignReviewer(review.id, reviewer.id);
    const result = await svc.scorePaper(review.id, reviewer.id, { novelty: 10, methodology: 10, clarity: 10, significance: 10 });
    expect(result.weightedScore).toBe(10);
  });

  it('rejects NaN score', async () => {
    const { review } = await svc.submitForReview(paper());
    const reviewer = await svc.registerReviewer({ userId: 'r1', name: 'R', organizationId: 'org-r' });
    await svc.assignReviewer(review.id, reviewer.id);
    await expect(svc.scorePaper(review.id, reviewer.id, { novelty: NaN, methodology: 5, clarity: 5, significance: 5 })).rejects.toThrow(ValidationError);
  });

  it('rejects Infinity score', async () => {
    const { review } = await svc.submitForReview(paper());
    const reviewer = await svc.registerReviewer({ userId: 'r1', name: 'R', organizationId: 'org-r' });
    await svc.assignReviewer(review.id, reviewer.id);
    await expect(svc.scorePaper(review.id, reviewer.id, { novelty: Infinity, methodology: 5, clarity: 5, significance: 5 })).rejects.toThrow(ValidationError);
  });
});

describe('edge: multiple reassignments', () => {
  it('tracks reassign count across multiple reassignments', async () => {
    const { review } = await svc.submitForReview(paper());
    const r1 = await svc.registerReviewer({ userId: 'r1', name: 'R1', organizationId: 'org-1' });
    const r2 = await svc.registerReviewer({ userId: 'r2', name: 'R2', organizationId: 'org-2' });
    const r3 = await svc.registerReviewer({ userId: 'r3', name: 'R3', organizationId: 'org-3' });

    await svc.assignReviewer(review.id, r1.id);
    const v1 = await svc.reassignReviewer(review.id, r2.id);
    expect(v1.reassignCount).toBe(1);

    const v2 = await svc.reassignReviewer(review.id, r3.id);
    expect(v2.reassignCount).toBe(2);
  });
});

describe('edge: getReviewerWorkload', () => {
  it('throws NotFoundError for unknown reviewer', async () => {
    await expect(svc.getReviewerWorkload('bad-id')).rejects.toThrow(NotFoundError);
  });

  it('reports completed count correctly', async () => {
    const { review } = await svc.submitForReview(paper());
    const rev = await svc.registerReviewer({ userId: 'r1', name: 'R', organizationId: 'org-r' });
    await svc.assignReviewer(review.id, rev.id);
    await svc.submitFeedback(review.id, rev.id, 'Done');
    await svc.scorePaper(review.id, rev.id, { novelty: 7, methodology: 7, clarity: 7, significance: 7 });
    await svc.completeReview(review.id, rev.id);
    const { completedCount } = await svc.getReviewerWorkload(rev.id);
    expect(completedCount).toBe(1);
  });
});
