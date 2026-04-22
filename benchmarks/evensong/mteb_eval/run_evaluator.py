#!/usr/bin/env python3
"""
run_evaluator.py — MTEB RetrievalEvaluator comparison: BM25 vs Dense vs Adaptive-Hybrid

Uses mteb library + rank_bm25 + SearchProtocol from Phase 2.
"""

import os
import sys
import json
import time
from pathlib import Path

# Set OpenMP env before any torch/transformers import
os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')

import numpy as np

# ── Add search_protocol to path ────────────────────────────────────────────
EVAL_DIR = Path(__file__).parent
LOCOMO_HYBRID = EVAL_DIR.parent / 'locomo_hybrid'
sys.path.insert(0, str(LOCOMO_HYBRID))

# ── Imports ─────────────────────────────────────────────────────────────────
from search_protocol import SearchProtocol

import mteb
from rank_bm25 import BM25Okapi


# ── Config ────────────────────────────────────────────────────────────────────
RESULTS_DIR = EVAL_DIR / 'results'
RESULTS_DIR.mkdir(exist_ok=True)

DATASET_NAME = 'MiniwarmFacts'  # Small, no-API-key MTEB dataset

# gap_ratio threshold from Wave 3E (adaptive-hybrid decision boundary)
GAP_RATIO_THRESHOLD = 1.5


# ── Metric helpers ────────────────────────────────────────────────────────────

def rr_at_k(sorted_indices: list[int], relevant: set[int], k: int) -> float:
    """Reciprocal Rank @ K"""
    for i, idx in enumerate(sorted_indices[:k]):
        if idx in relevant:
            return 1.0 / (i + 1)
    return 0.0


def ndcg_at_k(sorted_indices: list[int], relevant: set[int], k: int) -> float:
    """NDCG @ K using binary relevance"""
    def dcg(indices: list[int]) -> float:
        return sum(1.0 / np.log2(i + 2) for i, idx in enumerate(indices) if idx in relevant)
    dcg_val = dcg(sorted_indices[:k])
    ideal = dcg(sorted(list(relevant)[:k]))
    return dcg_val / ideal if ideal > 0 else 0.0


def recall_at_k(sorted_indices: list[int], relevant: set[int], k: int) -> float:
    """Recall @ K"""
    if not relevant:
        return 0.0
    return len([i for i in sorted_indices[:k] if i in relevant]) / len(relevant)


def compute_metrics(query_ids: list[str], corpus_ids: list[str], corpus_texts: list[str],
                    relevant_map: dict[str, set[int]], results: list[list[dict]],
                    k_values=(1, 3, 5, 10, 100)) -> dict:
    """Compute MRR, NDCG, Recall at multiple K values"""
    metrics = {}
    for k in k_values:
        metrics[f'MRR@{k}'] = []
        metrics[f'NDCG@{k}'] = []
        metrics[f'Recall@{k}'] = []

    for query_id, result in zip(query_ids, results):
        relevant = relevant_map.get(query_id, set())
        sorted_indices = [int(r['id']) for r in result]

        for k in k_values:
            metrics[f'MRR@{k}'].append(rr_at_k(sorted_indices, relevant, k))
            metrics[f'NDCG@{k}'].append(ndcg_at_k(sorted_indices, relevant, k))
            metrics[f'Recall@{k}'].append(recall_at_k(sorted_indices, relevant, k))

    return {f'{name}@{k}': float(np.mean(vals)) for name, vals in metrics.items()
            for k in k_values}


# ── BM25 retriever ────────────────────────────────────────────────────────────

class BM25Retriever:
    def __init__(self, texts: list[str]):
        tokenized = [t.lower().split() for t in texts]
        self.bm25 = BM25Okapi(tokenized)

    def search(self, query: str, top_k: int = 10) -> list[dict]:
        scores = self.bm25.get_scores(query.lower().split())
        top_idx = np.argsort(scores)[::-1][:top_k]
        return [{'id': str(idx), 'score': float(scores[idx])} for idx in top_idx]


# ── Adaptive Hybrid ──────────────────────────────────────────────────────────

class AdaptiveHybrid:
    """BM25 first, then dense if gap_ratio > threshold"""
    def __init__(self, bm25: BM25Retriever, dense: SearchProtocol, threshold: float = 1.5):
        self.bm25 = bm25
        self.dense = dense
        self.threshold = threshold

    def search(self, query: str, top_k: int = 10) -> list[dict]:
        bm25_results = self.bm25.search(query, top_k=1)
        if not bm25_results:
            return self.dense.search(query, top_k=top_k)
        bm25_top1_score = bm25_results[0]['score']
        dense_results = self.dense.search(query, top_k=top_k)
        if not dense_results:
            return bm25_results
        dense_top1_score = dense_results[0]['score']
        gap_ratio = dense_top1_score / bm25_top1_score if bm25_top1_score > 0 else float('inf')
        if gap_ratio > self.threshold:
            return dense_results
        return bm25_results


# ── Main ────────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("MTEB RetrievalEvaluator — BM25 vs Dense vs Adaptive-Hybrid")
    print("=" * 60)

    # Load dataset
    print(f"\n[1] Loading MTEB dataset: {DATASET_NAME}")
    model = mteb.get_model('BAAI/bge-m3')
    task = mteb.get_task(DATASET_NAME)
    dataset = task.load_dataset()

    corpus = dataset['test'].cast_to_rmlcorpus()
    queries = dataset['test'].to_dict()['queries']  # query_id -> query string
    relevant = dataset['test'].to_dict()['relevant_docs']  # query_id -> {doc_id: score}

    corpus_ids = [c['id'] for c in corpus]
    corpus_texts = [c['text'] for c in corpus]

    print(f"  Corpus: {len(corpus_ids)} docs | Queries: {len(queries)}")

    # Build retrievers
    print("\n[2] Building retrievers...")

    # BM25
    print("  Building BM25 index...")
    bm25 = BM25Retriever(corpus_texts)
    print(f"  BM25 ready ({len(corpus_texts)} docs)")

    # Dense (BGE-M3 via SearchProtocol)
    print("  Building BGE-M3 dense index (this may take a few minutes)...")
    dense = SearchProtocol(retriever='hybrid', use_faiss=False)
    t0 = time.time()
    dense.index([{'id': c['id'], 'text': c['text']} for c in corpus])
    print(f"  Dense index ready ({dense.corpus_size} docs, {time.time()-t0:.1f}s)")

    # Adaptive-Hybrid
    adaptive = AdaptiveHybrid(bm25, dense, threshold=GAP_RATIO_THRESHOLD)

    # Run retrievers
    retrievers = {
        'bm25': bm25,
        'dense': dense,
        'adaptive_hybrid': adaptive,
    }

    query_ids = list(queries.keys())
    query_strings = [queries[qid] for qid in query_ids]

    results_by_retriever = {}

    for name, retriever in retrievers.items():
        print(f"\n[3.{name}] Searching {len(query_strings)} queries...")
        t0 = time.time()
        raw_results = retriever.search_batch(query_strings, top_k=10)
        elapsed = time.time() - t0
        results_by_retriever[name] = raw_results
        print(f"  {name}: {len(raw_results)} queries in {elapsed:.2f}s ({elapsed/len(raw_results)*1000:.0f}ms/query)")

    # Compute metrics
    print("\n[4] Computing metrics...")
    all_metrics = {}
    for name, results in results_by_retriever.items():
        metrics = compute_metrics(query_ids, corpus_ids, corpus_texts, relevant, results)
        all_metrics[name] = metrics
        print(f"\n  {name}:")
        for k in (1, 3, 5, 10, 100):
            print(f"    MRR@{k}: {metrics[f'MRR@{k}']:.4f}  NDCG@{k}: {metrics[f'NDCG@{k}']:.4f}  Recall@{k}: {metrics[f'Recall@{k}']:.4f}")

    # Save results
    output = {
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'dataset': DATASET_NAME,
        'retrievers': all_metrics,
    }

    output_path = RESULTS_DIR / f'mteb_eval_{time.strftime("%Y%m%d_%H%M%S")}.json'
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✅ Results saved to {output_path}")
    return output


if __name__ == '__main__':
    main()
