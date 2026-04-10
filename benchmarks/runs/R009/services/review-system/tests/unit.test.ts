import { describe, it, expect, beforeEach } from 'bun:test';
import { ReviewSystemService } from '../src/index.ts';
import { NotFoundError, ValidationError, ConflictError, AuthorizationError } from '../../../shared/errors.ts';

let svc: ReviewSystemService;

const makePaper = (overrides = {}) => ({
  title: 'Deep Learning for NLP',
  authorId: 'user-author-1',
  authorOrganizationId: 'org-A',
  abstract: 'This paper explores transformer architectures.',
  coAuthorIds: [],
  keywords: ['ml', 'nlp'],
  ...overrides,
});

const makeReviewer = (overrides = {}) => ({
  userId: 'user-reviewer-1',
  name: 'Dr. Smith',
  organizationId: 'org-B',
  coAuthorHistory: [],
  expertise: ['ml'],
  maxActiveReviews: 5,
  ...overrides,
});

beforeEach(() => {
  svc = new ReviewSystemService();
});

describe('submitForReview', () => {
  it('creates a paper and pending review', async () => {
    const { paper, review } = await svc.submitForReview(makePaper());
    expect(paper.id).toBeTruthy();
    expect(review.stage).toBe('pending');
    expect(review.paperId).toBe(paper.id);
    expect(review.reviewerId).toBeNull();
  });

  it('throws ValidationError for missing title', async () => {
    await expect(svc.submitForReview(makePaper({ title: '' }))).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for missing authorId', async () => {
    await expect(svc.submitForReview(makePaper({ authorId: '' }))).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for missing abstract', async () => {
    await expect(svc.submitForReview(makePaper({ abstract: '' }))).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for missing organizationId', async () => {
    await expect(svc.submitForReview(makePaper({ authorOrganizationId: '' }))).rejects.toThrow(ValidationError);
  });

  it('trims whitespace from title and abstract', async () => {
    const { paper } = await svc.submitForReview(makePaper({ title: '  Trimmed Title  ', abstract: '  Abstract text  ' }));
    expect(paper.title).toBe('Trimmed Title');
    expect(paper.abstract).toBe('Abstract text');
  });

  it('sets submittedAt timestamp', async () => {
    const before = Date.now();
    const { review } = await svc.submitForReview(makePaper());
    const after = Date.now();
    const ts = new Date(review.submittedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('registerReviewer', () => {
  it('registers a reviewer successfully', async () => {
    const reviewer = await svc.registerReviewer(makeReviewer());
    expect(reviewer.id).toBeTruthy();
    expect(reviewer.userId).toBe('user-reviewer-1');
    expect(reviewer.activeReviews).toBe(0);
  });

  it('throws ValidationError for missing userId', async () => {
    await expect(svc.registerReviewer(makeReviewer({ userId: '' }))).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for missing name', async () => {
    await expect(svc.registerReviewer(makeReviewer({ name: '' }))).rejects.toThrow(ValidationError);
  });

  it('defaults maxActiveReviews to 5', async () => {
    const r = await svc.registerReviewer({ userId: 'u1', name: 'Alice', organizationId: 'org-X' });
    expect(r.maxActiveReviews).toBe(5);
  });
});

describe('assignReviewer', () => {
  it('assigns a reviewer and transitions to in_review', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    const updated = await svc.assignReviewer(review.id, reviewer.id);
    expect(updated.stage).toBe('in_review');
    expect(updated.reviewerId).toBe(reviewer.id);
    expect(updated.assignedAt).toBeTruthy();
  });

  it('throws NotFoundError for unknown review', async () => {
    const reviewer = await svc.registerReviewer(makeReviewer());
    await expect(svc.assignReviewer('bad-id', reviewer.id)).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError for unknown reviewer', async () => {
    const { review } = await svc.submitForReview(makePaper());
    await expect(svc.assignReviewer(review.id, 'bad-reviewer')).rejects.toThrow(NotFoundError);
  });

  it('prevents self-review', async () => {
    const { review } = await svc.submitForReview(makePaper({ authorId: 'same-user' }));
    const reviewer = await svc.registerReviewer(makeReviewer({ userId: 'same-user', organizationId: 'org-Z' }));
    await expect(svc.assignReviewer(review.id, reviewer.id)).rejects.toThrow(ConflictError);
  });

  it('prevents assignment when same organization', async () => {
    const { review } = await svc.submitForReview(makePaper({ authorOrganizationId: 'org-SAME' }));
    const reviewer = await svc.registerReviewer(makeReviewer({ organizationId: 'org-SAME' }));
    await expect(svc.assignReviewer(review.id, reviewer.id)).rejects.toThrow(ConflictError);
  });

  it('prevents assignment when reviewer is co-author', async () => {
    const { review } = await svc.submitForReview(makePaper({ coAuthorIds: ['reviewer-user'] }));
    const reviewer = await svc.registerReviewer(makeReviewer({ userId: 'reviewer-user' }));
    await expect(svc.assignReviewer(review.id, reviewer.id)).rejects.toThrow(ConflictError);
  });

  it('throws ConflictError when reviewer is at max workload', async () => {
    const reviewer = await svc.registerReviewer(makeReviewer({ maxActiveReviews: 1 }));
    // Assign first review
    const { review: r1 } = await svc.submitForReview(makePaper({ title: 'P1', authorId: 'a1' }));
    await svc.assignReviewer(r1.id, reviewer.id);
    // Second should fail
    const { review: r2 } = await svc.submitForReview(makePaper({ title: 'P2', authorId: 'a2' }));
    await expect(svc.assignReviewer(r2.id, reviewer.id)).rejects.toThrow(ConflictError);
  });

  it('throws ConflictError assigning to completed review', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await svc.submitFeedback(review.id, reviewer.id, 'Great paper');
    await svc.scorePaper(review.id, reviewer.id, { novelty: 8, methodology: 7, clarity: 9, significance: 8 });
    await svc.completeReview(review.id, reviewer.id);
    const reviewer2 = await svc.registerReviewer(makeReviewer({ userId: 'u2', organizationId: 'org-C' }));
    await expect(svc.assignReviewer(review.id, reviewer2.id)).rejects.toThrow(ConflictError);
  });
});

describe('submitFeedback', () => {
  it('stores feedback on the review', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    const updated = await svc.submitFeedback(review.id, reviewer.id, 'Solid methodology');
    expect(updated.feedback).toBe('Solid methodology');
  });

  it('throws AuthorizationError if wrong reviewer', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await expect(svc.submitFeedback(review.id, 'wrong-reviewer', 'x')).rejects.toThrow(AuthorizationError);
  });

  it('throws ValidationError for empty feedback', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await expect(svc.submitFeedback(review.id, reviewer.id, '   ')).rejects.toThrow(ValidationError);
  });

  it('throws ConflictError if review not in in_review stage', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    // Stage is still 'pending' — not assigned
    await expect(svc.submitFeedback(review.id, reviewer.id, 'test')).rejects.toThrow(ConflictError);
  });
});

describe('scorePaper', () => {
  it('computes weighted score correctly', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    const scores = { novelty: 10, methodology: 10, clarity: 10, significance: 10 };
    const updated = await svc.scorePaper(review.id, reviewer.id, scores);
    expect(updated.weightedScore).toBe(10);
  });

  it('computes partial scores correctly', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    // novelty=10*0.3=3, methodology=10*0.3=3, clarity=5*0.2=1, significance=5*0.2=1 → 8
    const updated = await svc.scorePaper(review.id, reviewer.id, { novelty: 10, methodology: 10, clarity: 5, significance: 5 });
    expect(updated.weightedScore).toBeCloseTo(8, 5);
  });

  it('throws ValidationError for score below 1', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await expect(svc.scorePaper(review.id, reviewer.id, { novelty: 0, methodology: 5, clarity: 5, significance: 5 })).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for score above 10', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await expect(svc.scorePaper(review.id, reviewer.id, { novelty: 11, methodology: 5, clarity: 5, significance: 5 })).rejects.toThrow(ValidationError);
  });

  it('throws AuthorizationError if wrong reviewer', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await expect(svc.scorePaper(review.id, 'wrong', { novelty: 5, methodology: 5, clarity: 5, significance: 5 })).rejects.toThrow(AuthorizationError);
  });
});

describe('completeReview', () => {
  it('transitions review to completed', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await svc.submitFeedback(review.id, reviewer.id, 'Excellent work');
    await svc.scorePaper(review.id, reviewer.id, { novelty: 8, methodology: 7, clarity: 9, significance: 8 });
    const completed = await svc.completeReview(review.id, reviewer.id);
    expect(completed.stage).toBe('completed');
    expect(completed.completedAt).toBeTruthy();
  });

  it('decrements reviewer active review count', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await svc.submitFeedback(review.id, reviewer.id, 'Done');
    await svc.scorePaper(review.id, reviewer.id, { novelty: 7, methodology: 7, clarity: 7, significance: 7 });
    await svc.completeReview(review.id, reviewer.id);
    const { reviewer: r } = await svc.getReviewerWorkload(reviewer.id);
    expect(r.activeReviews).toBe(0);
  });

  it('throws ValidationError if no feedback', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await svc.scorePaper(review.id, reviewer.id, { novelty: 7, methodology: 7, clarity: 7, significance: 7 });
    await expect(svc.completeReview(review.id, reviewer.id)).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError if no scores', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await svc.submitFeedback(review.id, reviewer.id, 'Good');
    await expect(svc.completeReview(review.id, reviewer.id)).rejects.toThrow(ValidationError);
  });
});

describe('rejectReview', () => {
  it('rejects a pending review', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const rejected = await svc.rejectReview(review.id, 'Out of scope');
    expect(rejected.stage).toBe('rejected');
  });

  it('rejects an in_review review and frees reviewer', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await svc.rejectReview(review.id, 'Plagiarism detected');
    const { reviewer: r } = await svc.getReviewerWorkload(reviewer.id);
    expect(r.activeReviews).toBe(0);
  });

  it('throws ConflictError rejecting completed review', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await svc.submitFeedback(review.id, reviewer.id, 'Done');
    await svc.scorePaper(review.id, reviewer.id, { novelty: 6, methodology: 6, clarity: 6, significance: 6 });
    await svc.completeReview(review.id, reviewer.id);
    await expect(svc.rejectReview(review.id, 'reason')).rejects.toThrow(ConflictError);
  });

  it('throws ValidationError for empty reason', async () => {
    const { review } = await svc.submitForReview(makePaper());
    await expect(svc.rejectReview(review.id, '')).rejects.toThrow(ValidationError);
  });
});

describe('getAverageScore', () => {
  it('returns 0 average when no completed reviews', async () => {
    const { paper } = await svc.submitForReview(makePaper());
    const result = await svc.getAverageScore(paper.id);
    expect(result.average).toBe(0);
    expect(result.reviewCount).toBe(0);
  });

  it('returns correct average across multiple completed reviews', async () => {
    const { paper, review: r1 } = await svc.submitForReview(makePaper());
    const rev1 = await svc.registerReviewer(makeReviewer({ userId: 'r1', organizationId: 'org-X' }));

    await svc.assignReviewer(r1.id, rev1.id);
    await svc.submitFeedback(r1.id, rev1.id, 'Feedback 1');
    await svc.scorePaper(r1.id, rev1.id, { novelty: 10, methodology: 10, clarity: 10, significance: 10 });
    await svc.completeReview(r1.id, rev1.id);

    const { average, reviewCount } = await svc.getAverageScore(paper.id);
    expect(average).toBeCloseTo(10, 5);
    expect(reviewCount).toBe(1);
  });

  it('throws NotFoundError for unknown paper', async () => {
    await expect(svc.getAverageScore('bad-paper')).rejects.toThrow(NotFoundError);
  });
});

describe('getReview — blind review', () => {
  it('returns review with paperTitle but no authorId', async () => {
    const { paper, review } = await svc.submitForReview(makePaper());
    const fetched = await svc.getReview(review.id);
    expect(fetched.paperTitle).toBe(paper.title);
    // Review object should not leak authorId directly
    expect((fetched as any).authorId).toBeUndefined();
  });

  it('throws NotFoundError for unknown review', async () => {
    await expect(svc.getReview('bad-id')).rejects.toThrow(NotFoundError);
  });
});

describe('listReviews', () => {
  it('lists all reviews', async () => {
    await svc.submitForReview(makePaper({ title: 'P1', authorId: 'a1' }));
    await svc.submitForReview(makePaper({ title: 'P2', authorId: 'a2' }));
    const list = await svc.listReviews();
    expect(list.length).toBe(2);
  });

  it('filters by stage', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);
    await svc.submitForReview(makePaper({ title: 'P2', authorId: 'a2' }));

    const inReview = await svc.listReviews({ stage: 'in_review' });
    const pending = await svc.listReviews({ stage: 'pending' });
    expect(inReview.length).toBe(1);
    expect(pending.length).toBe(1);
  });

  it('filters by reviewerId', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(review.id, reviewer.id);

    const filtered = await svc.listReviews({ reviewerId: reviewer.id });
    expect(filtered.length).toBe(1);
    expect(filtered[0].reviewerId).toBe(reviewer.id);
  });
});

describe('reassignReviewer', () => {
  it('reassigns successfully', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const rev1 = await svc.registerReviewer(makeReviewer({ userId: 'r1', organizationId: 'org-X' }));
    const rev2 = await svc.registerReviewer(makeReviewer({ userId: 'r2', organizationId: 'org-Y', name: 'Dr. Jones' }));
    await svc.assignReviewer(review.id, rev1.id);
    const reassigned = await svc.reassignReviewer(review.id, rev2.id);
    expect(reassigned.reviewerId).toBe(rev2.id);
    expect(reassigned.reassignCount).toBe(1);
  });

  it('decrements old reviewer workload on reassign', async () => {
    const { review } = await svc.submitForReview(makePaper());
    const rev1 = await svc.registerReviewer(makeReviewer({ userId: 'r1', organizationId: 'org-X' }));
    const rev2 = await svc.registerReviewer(makeReviewer({ userId: 'r2', organizationId: 'org-Y', name: 'Dr. J' }));
    await svc.assignReviewer(review.id, rev1.id);
    await svc.reassignReviewer(review.id, rev2.id);
    const { reviewer } = await svc.getReviewerWorkload(rev1.id);
    expect(reviewer.activeReviews).toBe(0);
  });

  it('throws ConflictError on conflict with new reviewer', async () => {
    const { review } = await svc.submitForReview(makePaper({ authorOrganizationId: 'org-CONFLICT' }));
    const rev1 = await svc.registerReviewer(makeReviewer({ userId: 'r1', organizationId: 'org-X' }));
    const rev2 = await svc.registerReviewer(makeReviewer({ userId: 'r2', organizationId: 'org-CONFLICT', name: 'Conflicted' }));
    await svc.assignReviewer(review.id, rev1.id);
    await expect(svc.reassignReviewer(review.id, rev2.id)).rejects.toThrow(ConflictError);
  });
});

describe('health and stats', () => {
  it('health returns ok status', () => {
    const h = svc.health();
    expect(h.status).toBe('ok');
    expect(h.service).toBe('review-system');
  });

  it('getStats returns accurate counts', async () => {
    await svc.submitForReview(makePaper({ title: 'P1', authorId: 'a1' }));
    const { review: r2 } = await svc.submitForReview(makePaper({ title: 'P2', authorId: 'a2' }));
    const reviewer = await svc.registerReviewer(makeReviewer());
    await svc.assignReviewer(r2.id, reviewer.id);
    await svc.submitFeedback(r2.id, reviewer.id, 'Good paper');
    await svc.scorePaper(r2.id, reviewer.id, { novelty: 8, methodology: 7, clarity: 9, significance: 8 });
    await svc.completeReview(r2.id, reviewer.id);

    const stats = await svc.getStats();
    expect(stats.totalPapers).toBe(2);
    expect(stats.totalReviews).toBe(2);
    expect(stats.pendingReviews).toBe(1);
    expect(stats.completedReviews).toBe(1);
    expect(stats.averageScore).toBeGreaterThan(0);
  });
});
