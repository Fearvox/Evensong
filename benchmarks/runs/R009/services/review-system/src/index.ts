// R009 Evensong III — Review System Service
import { randomUUID } from 'crypto';
import { InMemoryStore } from '../../../shared/db.ts';
import { NotFoundError, ValidationError, ConflictError, AuthorizationError } from '../../../shared/errors.ts';
import { createLogger } from '../../../shared/logger.ts';
import { EventBus, DomainEvent } from '../../../shared/events.ts';

// Types
export type ReviewStage = 'pending' | 'assigned' | 'in_review' | 'completed' | 'rejected';

export interface Paper {
  id: string;
  title: string;
  authorId: string;
  authorOrganizationId: string;
  coAuthorIds: string[];
  submittedAt: string;
  abstract: string;
  keywords: string[];
}

export interface Review {
  id: string;
  paperId: string;
  reviewerId: string | null;
  stage: ReviewStage;
  submittedAt: string;
  assignedAt: string | null;
  completedAt: string | null;
  // Blind review: reviewer cannot see authorId
  feedback: string | null;
  scores: ReviewScores | null;
  weightedScore: number | null;
  conflictDetected: boolean;
  reassignCount: number;
}

export interface ReviewScores {
  novelty: number;      // 1-10
  methodology: number;  // 1-10
  clarity: number;      // 1-10
  significance: number; // 1-10
}

const SCORE_WEIGHTS = { novelty: 0.3, methodology: 0.3, clarity: 0.2, significance: 0.2 };

export interface Reviewer {
  id: string;
  userId: string;
  name: string;
  organizationId: string;
  coAuthorHistory: string[]; // userIds they've co-authored with
  expertise: string[];
  activeReviews: number;
  maxActiveReviews: number;
}

export interface ReviewSystemStats {
  totalPapers: number;
  totalReviews: number;
  pendingReviews: number;
  completedReviews: number;
  rejectedReviews: number;
  averageScore: number;
}

function computeWeightedScore(scores: ReviewScores): number {
  return (
    scores.novelty * SCORE_WEIGHTS.novelty +
    scores.methodology * SCORE_WEIGHTS.methodology +
    scores.clarity * SCORE_WEIGHTS.clarity +
    scores.significance * SCORE_WEIGHTS.significance
  );
}

function validateScores(scores: ReviewScores): void {
  const fields: (keyof ReviewScores)[] = ['novelty', 'methodology', 'clarity', 'significance'];
  for (const f of fields) {
    const v = scores[f];
    if (typeof v !== 'number' || v < 1 || v > 10 || !Number.isFinite(v)) {
      throw new ValidationError(`Score '${f}' must be a number between 1 and 10`);
    }
  }
}

export class ReviewSystemService {
  private papers = new InMemoryStore<Paper>();
  private reviews = new InMemoryStore<Review>();
  private reviewers = new InMemoryStore<Reviewer>();
  private logger = createLogger('review-system');
  private bus: EventBus;

  constructor(bus?: EventBus) {
    this.bus = bus ?? new EventBus();
  }

  private emit(type: string, payload: Record<string, unknown>): void {
    const event: DomainEvent = {
      id: randomUUID(),
      type,
      source: 'review-system',
      timestamp: new Date().toISOString(),
      correlationId: randomUUID(),
      payload,
    };
    this.bus.publish(event).catch(() => {});
  }

  // Register a reviewer (separate from paper submission)
  async registerReviewer(data: {
    userId: string;
    name: string;
    organizationId: string;
    coAuthorHistory?: string[];
    expertise?: string[];
    maxActiveReviews?: number;
  }): Promise<Reviewer> {
    if (!data.userId || !data.name || !data.organizationId) {
      throw new ValidationError('userId, name, and organizationId are required');
    }
    const reviewer: Reviewer = {
      id: randomUUID(),
      userId: data.userId,
      name: data.name,
      organizationId: data.organizationId,
      coAuthorHistory: data.coAuthorHistory ?? [],
      expertise: data.expertise ?? [],
      activeReviews: 0,
      maxActiveReviews: data.maxActiveReviews ?? 5,
    };
    return this.reviewers.insert(reviewer);
  }

  // Submit a paper for review
  async submitForReview(data: {
    title: string;
    authorId: string;
    authorOrganizationId: string;
    coAuthorIds?: string[];
    abstract: string;
    keywords?: string[];
  }): Promise<{ paper: Paper; review: Review }> {
    if (!data.title?.trim()) throw new ValidationError('title is required');
    if (!data.authorId?.trim()) throw new ValidationError('authorId is required');
    if (!data.authorOrganizationId?.trim()) throw new ValidationError('authorOrganizationId is required');
    if (!data.abstract?.trim()) throw new ValidationError('abstract is required');

    const paper: Paper = {
      id: randomUUID(),
      title: data.title.trim(),
      authorId: data.authorId,
      authorOrganizationId: data.authorOrganizationId,
      coAuthorIds: data.coAuthorIds ?? [],
      submittedAt: new Date().toISOString(),
      abstract: data.abstract.trim(),
      keywords: data.keywords ?? [],
    };

    const review: Review = {
      id: randomUUID(),
      paperId: paper.id,
      reviewerId: null,
      stage: 'pending',
      submittedAt: new Date().toISOString(),
      assignedAt: null,
      completedAt: null,
      feedback: null,
      scores: null,
      weightedScore: null,
      conflictDetected: false,
      reassignCount: 0,
    };

    await this.papers.insert(paper);
    await this.reviews.insert(review);

    this.emit('review.submitted', { paperId: paper.id, reviewId: review.id });
    this.logger.info('Paper submitted for review', { paperId: paper.id });

    return { paper, review };
  }

  // Detect conflicts between a reviewer and a paper
  async detectConflicts(reviewId: string, reviewerId: string): Promise<{
    hasConflict: boolean;
    reasons: string[];
  }> {
    const review = await this.reviews.findById(reviewId);
    if (!review) throw new NotFoundError('Review', reviewId);

    const paper = await this.papers.findById(review.paperId);
    if (!paper) throw new NotFoundError('Paper', review.paperId);

    const reviewer = await this.reviewers.findById(reviewerId);
    if (!reviewer) throw new NotFoundError('Reviewer', reviewerId);

    const reasons: string[] = [];

    // Self-review prevention
    if (reviewer.userId === paper.authorId) {
      reasons.push('reviewer is the author');
    }

    // Co-author check
    if (paper.coAuthorIds.includes(reviewer.userId)) {
      reasons.push('reviewer is a co-author of the paper');
    }
    if (reviewer.coAuthorHistory.includes(paper.authorId)) {
      reasons.push('reviewer has co-authored with the paper author');
    }
    for (const coId of paper.coAuthorIds) {
      if (reviewer.coAuthorHistory.includes(coId)) {
        reasons.push(`reviewer has co-authored with co-author ${coId}`);
        break;
      }
    }

    // Same organization
    if (reviewer.organizationId === paper.authorOrganizationId) {
      reasons.push('reviewer belongs to the same organization as the author');
    }

    return { hasConflict: reasons.length > 0, reasons };
  }

  // Assign a reviewer to a review
  async assignReviewer(reviewId: string, reviewerId: string): Promise<Review> {
    const review = await this.reviews.findById(reviewId);
    if (!review) throw new NotFoundError('Review', reviewId);

    if (review.stage !== 'pending' && review.stage !== 'assigned') {
      throw new ConflictError(`Review is in '${review.stage}' stage and cannot be assigned`);
    }

    const reviewer = await this.reviewers.findById(reviewerId);
    if (!reviewer) throw new NotFoundError('Reviewer', reviewerId);

    // Check workload
    if (reviewer.activeReviews >= reviewer.maxActiveReviews) {
      throw new ConflictError(`Reviewer has reached maximum active reviews (${reviewer.maxActiveReviews})`);
    }

    // Conflict detection
    const { hasConflict, reasons } = await this.detectConflicts(reviewId, reviewerId);
    if (hasConflict) {
      throw new ConflictError(`Conflict detected: ${reasons.join('; ')}`);
    }

    const updated = await this.reviews.update(reviewId, {
      reviewerId,
      stage: 'in_review',
      assignedAt: new Date().toISOString(),
    });

    await this.reviewers.update(reviewerId, { activeReviews: reviewer.activeReviews + 1 });

    this.emit('review.assigned', { reviewId, reviewerId });
    return updated!;
  }

  async getReview(reviewId: string): Promise<Review & { paperTitle?: string }> {
    const review = await this.reviews.findById(reviewId);
    if (!review) throw new NotFoundError('Review', reviewId);

    // Blind review: don't expose author info through review object
    const paper = await this.papers.findById(review.paperId);
    return { ...review, paperTitle: paper?.title };
  }

  async listReviews(filter?: {
    stage?: ReviewStage;
    reviewerId?: string;
    paperId?: string;
  }): Promise<Review[]> {
    return this.reviews.findAll(r => {
      if (filter?.stage && r.stage !== filter.stage) return false;
      if (filter?.reviewerId && r.reviewerId !== filter.reviewerId) return false;
      if (filter?.paperId && r.paperId !== filter.paperId) return false;
      return true;
    });
  }

  async submitFeedback(reviewId: string, reviewerId: string, feedback: string): Promise<Review> {
    const review = await this.reviews.findById(reviewId);
    if (!review) throw new NotFoundError('Review', reviewId);

    if (review.stage !== 'in_review') {
      throw new ConflictError(`Review must be in 'in_review' stage to submit feedback (current: ${review.stage})`);
    }
    if (review.reviewerId !== reviewerId) {
      throw new AuthorizationError('Only the assigned reviewer can submit feedback');
    }
    if (!feedback?.trim()) {
      throw new ValidationError('Feedback cannot be empty');
    }

    const updated = await this.reviews.update(reviewId, { feedback: feedback.trim() });
    this.emit('review.feedback_submitted', { reviewId, reviewerId });
    return updated!;
  }

  async scorePaper(reviewId: string, reviewerId: string, scores: ReviewScores): Promise<Review> {
    const review = await this.reviews.findById(reviewId);
    if (!review) throw new NotFoundError('Review', reviewId);

    if (review.stage !== 'in_review') {
      throw new ConflictError(`Review must be in 'in_review' stage to score (current: ${review.stage})`);
    }
    if (review.reviewerId !== reviewerId) {
      throw new AuthorizationError('Only the assigned reviewer can score the paper');
    }

    validateScores(scores);

    const weightedScore = computeWeightedScore(scores);
    const updated = await this.reviews.update(reviewId, { scores, weightedScore });
    this.emit('review.scored', { reviewId, reviewerId, weightedScore });
    return updated!;
  }

  async completeReview(reviewId: string, reviewerId: string): Promise<Review> {
    const review = await this.reviews.findById(reviewId);
    if (!review) throw new NotFoundError('Review', reviewId);

    if (review.reviewerId !== reviewerId) {
      throw new AuthorizationError('Only the assigned reviewer can complete the review');
    }
    if (review.stage !== 'in_review') {
      throw new ConflictError(`Review must be in 'in_review' stage to complete (current: ${review.stage})`);
    }
    if (!review.feedback) {
      throw new ValidationError('Feedback must be submitted before completing the review');
    }
    if (!review.scores) {
      throw new ValidationError('Scores must be submitted before completing the review');
    }

    const updated = await this.reviews.update(reviewId, {
      stage: 'completed',
      completedAt: new Date().toISOString(),
    });

    // Decrement reviewer workload
    const reviewer = await this.reviewers.findById(reviewerId);
    if (reviewer) {
      await this.reviewers.update(reviewerId, {
        activeReviews: Math.max(0, reviewer.activeReviews - 1),
      });
    }

    this.emit('review.completed', { reviewId, reviewerId });
    return updated!;
  }

  async rejectReview(reviewId: string, reason: string): Promise<Review> {
    const review = await this.reviews.findById(reviewId);
    if (!review) throw new NotFoundError('Review', reviewId);

    if (review.stage === 'completed' || review.stage === 'rejected') {
      throw new ConflictError(`Review is already in terminal stage '${review.stage}'`);
    }
    if (!reason?.trim()) {
      throw new ValidationError('Rejection reason is required');
    }

    // Free up reviewer if assigned
    if (review.reviewerId) {
      const reviewer = await this.reviewers.findById(review.reviewerId);
      if (reviewer) {
        await this.reviewers.update(review.reviewerId, {
          activeReviews: Math.max(0, reviewer.activeReviews - 1),
        });
      }
    }

    const updated = await this.reviews.update(reviewId, {
      stage: 'rejected',
      completedAt: new Date().toISOString(),
      feedback: reason.trim(),
    });

    this.emit('review.rejected', { reviewId, reason });
    return updated!;
  }

  async reassignReviewer(reviewId: string, newReviewerId: string): Promise<Review> {
    const review = await this.reviews.findById(reviewId);
    if (!review) throw new NotFoundError('Review', reviewId);

    if (review.stage === 'completed' || review.stage === 'rejected') {
      throw new ConflictError(`Cannot reassign a review in '${review.stage}' stage`);
    }

    const newReviewer = await this.reviewers.findById(newReviewerId);
    if (!newReviewer) throw new NotFoundError('Reviewer', newReviewerId);

    if (newReviewer.activeReviews >= newReviewer.maxActiveReviews) {
      throw new ConflictError(`New reviewer has reached maximum active reviews (${newReviewer.maxActiveReviews})`);
    }

    const { hasConflict, reasons } = await this.detectConflicts(reviewId, newReviewerId);
    if (hasConflict) {
      throw new ConflictError(`Conflict with new reviewer: ${reasons.join('; ')}`);
    }

    // Release old reviewer
    if (review.reviewerId && review.reviewerId !== newReviewerId) {
      const oldReviewer = await this.reviewers.findById(review.reviewerId);
      if (oldReviewer) {
        await this.reviewers.update(review.reviewerId, {
          activeReviews: Math.max(0, oldReviewer.activeReviews - 1),
        });
      }
    }

    const updated = await this.reviews.update(reviewId, {
      reviewerId: newReviewerId,
      stage: 'in_review',
      assignedAt: new Date().toISOString(),
      reassignCount: review.reassignCount + 1,
    });

    await this.reviewers.update(newReviewerId, {
      activeReviews: newReviewer.activeReviews + 1,
    });

    this.emit('review.reassigned', { reviewId, newReviewerId, oldReviewerId: review.reviewerId });
    return updated!;
  }

  async getAverageScore(paperId: string): Promise<{ average: number; reviewCount: number; scores: number[] }> {
    const paper = await this.papers.findById(paperId);
    if (!paper) throw new NotFoundError('Paper', paperId);

    const allReviews = await this.reviews.findAll(r => r.paperId === paperId && r.stage === 'completed' && r.weightedScore !== null);
    const scores = allReviews.map(r => r.weightedScore!);
    const average = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return { average, reviewCount: scores.length, scores };
  }

  async getReviewerWorkload(reviewerId: string): Promise<{
    reviewer: Reviewer;
    activeReviews: Review[];
    completedCount: number;
  }> {
    const reviewer = await this.reviewers.findById(reviewerId);
    if (!reviewer) throw new NotFoundError('Reviewer', reviewerId);

    const activeReviews = await this.reviews.findAll(
      r => r.reviewerId === reviewerId && (r.stage === 'in_review' || r.stage === 'assigned')
    );
    const completedCount = await this.reviews.count(
      r => r.reviewerId === reviewerId && r.stage === 'completed'
    );

    return { reviewer, activeReviews, completedCount };
  }

  health(): { status: string; service: string; timestamp: string; stats: ReviewSystemStats } {
    return {
      status: 'ok',
      service: 'review-system',
      timestamp: new Date().toISOString(),
      stats: {
        totalPapers: this.papers.size,
        totalReviews: this.reviews.size,
        pendingReviews: 0,   // sync stats require async — see getStats()
        completedReviews: 0,
        rejectedReviews: 0,
        averageScore: 0,
      },
    };
  }

  async getStats(): Promise<ReviewSystemStats> {
    const allReviews = await this.reviews.findAll();
    const completed = allReviews.filter(r => r.stage === 'completed');
    const scores = completed.map(r => r.weightedScore).filter((s): s is number => s !== null);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    return {
      totalPapers: this.papers.size,
      totalReviews: this.reviews.size,
      pendingReviews: allReviews.filter(r => r.stage === 'pending').length,
      completedReviews: completed.length,
      rejectedReviews: allReviews.filter(r => r.stage === 'rejected').length,
      averageScore: avgScore,
    };
  }

  // For testing: reset state
  _reset(): void {
    this.papers.clear();
    this.reviews.clear();
    this.reviewers.clear();
  }
}
