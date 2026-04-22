#!/usr/bin/env python3
"""
run_evaluator.py — MTEB-style Retrieval Comparison

Compares BM25 vs Dense (BGE-M3 HTTP) vs Adaptive-Hybrid.
Uses rank_bm25 + SearchProtocol (Phase 2).

For real MTEB datasets: install HF_TOKEN and use:
  python run_evaluator.py --dataset CQADupstackRetrieval

For quick validation: runs built-in synthetic benchmark.
"""

import os
import sys
import json
import time
from pathlib import Path

os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')

import numpy as np
from rank_bm25 import BM25Okapi

EVAL_DIR = Path(__file__).parent
LOCOMO_HYBRID = EVAL_DIR.parent / 'locomo_hybrid'
sys.path.insert(0, str(LOCOMO_HYBRID))

from search_protocol import SearchProtocol

RESULTS_DIR = EVAL_DIR / 'results'
RESULTS_DIR.mkdir(exist_ok=True)

GAP_RATIO_THRESHOLD = 1.5


# ── Metrics ──────────────────────────────────────────────────────────────────

def rr_at_k(sorted_ids, rel_ids, k):
    for i, idx in enumerate(sorted_ids[:k]):
        if idx in rel_ids:
            return 1.0 / (i + 1)
    return 0.0

def ndcg_at_k(sorted_ids, rel_ids, k):
    def dcg(ids):
        return sum(1.0 / np.log2(i + 2) for i, idx in enumerate(ids) if idx in rel_ids)
    ideal = dcg(sorted(list(rel_ids)[:k]))
    actual = dcg(sorted_ids[:k])
    return actual / ideal if ideal > 0 else 0.0

def recall_at_k(sorted_ids, rel_ids, k):
    if not rel_ids:
        return 0.0
    return len([i for i in sorted_ids[:k] if i in rel_ids]) / len(rel_ids)

def compute_metrics(query_ids, results, relevant_map, k_vals=(1, 3, 5, 10, 100)):
    # Accumulate per-query scores for each (metric, K) pair
    acc = {(name, k): [] for k in k_vals for name in ('MRR', 'NDCG', 'Recall')}
    for qid, res in zip(query_ids, results):
        rel = relevant_map.get(qid, set())
        if isinstance(rel, dict):
            rel = set(int(x) for x in rel.keys())
        elif isinstance(rel, (list, set)):
            rel = set(int(x) for x in rel)
        ids = [int(r['id']) for r in res]
        for k in k_vals:
            acc[('MRR', k)].append(rr_at_k(ids, rel, k))
            acc[('NDCG', k)].append(ndcg_at_k(ids, rel, k))
            acc[('Recall', k)].append(recall_at_k(ids, rel, k))
    # Return: {MRR@1: 0.x, NDCG@1: 0.y, Recall@1: 0.z, ...}
    return {f'{name}@{k}': float(np.mean(v)) for k in k_vals for name, v in
            [(n, acc[(n, k)]) for n in ('MRR', 'NDCG', 'Recall')]}


# ── Retrievers ───────────────────────────────────────────────────────────────

class BM25:
    def __init__(self, texts):
        self.texts = texts
        self.bm25 = BM25Okapi([t.lower().split() for t in texts])

    def search(self, q, top_k=10):
        sc = self.bm25.get_scores(q.lower().split())
        idx = np.argsort(sc)[::-1][:top_k]
        return [{'id': str(i), 'score': float(sc[i])} for i in idx]

    def search_batch(self, qs, top_k=10):
        return [self.search(q, top_k) for q in qs]


class AdaptiveHybrid:
    def __init__(self, bm25, dense, threshold=1.5):
        self.bm25 = bm25
        self.dense = dense
        self.threshold = threshold

    def search(self, q, top_k=10):
        b = self.bm25.search(q, top_k=1)
        if not b:
            return self.dense.search(q, top_k=top_k)
        d = self.dense.search(q, top_k=top_k)
        if not d:
            return b
        gap = d[0]['score'] / b[0]['score'] if b[0]['score'] > 0 else float('inf')
        return d if gap > self.threshold else b

    def search_batch(self, qs, top_k=10):
        return [self.search(q, top_k) for q in qs]


# ── Synthetic benchmark (no download needed) ────────────────────────────────

def synthetic_benchmark():
    """
    20 documents × 10 queries, mixed difficulty.
    Relevant docs manually specified. Tests BM25 vs dense vs adaptive.
    """
    corpus = [
        {'id': '0',  'text': 'Python list comprehension tutorial for beginners'},
        {'id': '1',  'text': 'Advanced Python decorators and metaclasses explained'},
        {'id': '2',  'text': 'JavaScript async await patterns in Node.js server code'},
        {'id': '3',  'text': 'React useEffect hook lifecycle management guide'},
        {'id': '4',  'text': 'Docker container networking configuration for microservices'},
        {'id': '5',  'text': 'Kubernetes pod scheduling and resource limits'},
        {'id': '6',  'text': 'Machine learning linear regression gradient descent from scratch'},
        {'id': '7',  'text': 'Natural language processing word embeddings tutorial using Word2Vec'},
        {'id': '8',  'text': 'Graph database Neo4j Cypher query language basics'},
        {'id': '9',  'text': 'PostgreSQL query optimization with EXPLAIN ANALYZE'},
        {'id': '10', 'text': 'Redis caching strategies for high traffic web applications'},
        {'id': '11', 'text': 'TypeScript generics and type inference advanced patterns'},
        {'id': '12', 'text': 'Rust ownership model and borrow checker practical examples'},
        {'id': '13', 'text': 'Go concurrency patterns with goroutines and channels'},
        {'id': '14', 'text': 'AWS Lambda serverless function deployment and cold starts'},
        {'id': '15', 'text': 'MongoDB aggregation pipeline for analytics queries'},
        {'id': '16', 'text': 'Kafka message queue consumer group rebalance strategy'},
        {'id': '17', 'text': 'Vue 3 Composition API reactive state management with Pinia'},
        {'id': '18', 'text': 'Flutter widget testing with mockito and bloc pattern'},
        {'id': '19', 'text': 'iOS SwiftUI animations and state transitions tutorial'},
    ]

    queries = {
        'q0': 'Python programming tutorial for new developers',
        'q1': 'decorator patterns in Python advanced',
        'q2': 'async Node.js JavaScript server development',
        'q3': 'React lifecycle hook useEffect guide',
        'q4': 'Docker microservices networking setup',
        'q5': 'Kubernetes scheduling resource configuration',
        'q6': 'gradient descent machine learning linear regression',
        'q7': 'NLP word embedding Word2Vec tutorial',
        'q8': 'Neo4j graph database Cypher queries',
        'q9': 'PostgreSQL query optimization EXPLAIN',
    }

    # Relevant docs: query_key -> set of relevant corpus indices
    # Semantic matches (even if not keyword matches) marked relevant
    relevant = {
        'q0': {0, 1},          # Python tutorial (0), advanced (1)
        'q1': {1},               # Python decorators
        'q2': {2},               # async JavaScript Node
        'q3': {3},               # React useEffect
        'q4': {4},               # Docker networking
        'q5': {5},               # Kubernetes scheduling
        'q6': {6, 7},            # ML regression, NLP embeddings
        'q7': {7},               # NLP Word2Vec
        'q8': {8},               # Neo4j Cypher
        'q9': {9},               # PostgreSQL optimization
    }

    return corpus, queries, relevant


# ── Run full comparison ────────────────────────────────────────────────────────

def run_comparison(name, corpus, queries, relevant):
    corpus_ids = [c['id'] for c in corpus]
    corpus_texts = [c['text'] for c in corpus]
    qids = list(queries.keys())
    qstrs = [queries[qid] for qid in qids]

    print(f"\n{'='*60}\nDataset: {name}\n{'='*60}")
    print(f"  Corpus: {len(corpus_ids)} docs | Queries: {len(qids)}")

    # BM25
    t0 = time.time()
    bm25 = BM25(corpus_texts)
    print(f"  BM25: ready ({time.time()-t0:.1f}s)")

    # Dense (BGE-M3 via HTTP endpoint)
    print("  Dense (BGE-M3 HTTP): indexing...")
    t0 = time.time()
    dense = SearchProtocol(retriever='hybrid', use_faiss=False)
    dense.index(corpus)
    print(f"  Dense: ready ({dense.corpus_size} docs, {time.time()-t0:.1f}s)")

    adaptive = AdaptiveHybrid(bm25, dense, threshold=GAP_RATIO_THRESHOLD)
    retrievers = {'bm25': bm25, 'dense': dense, 'adaptive_hybrid': adaptive}
    results = {}

    for name_r, ret in retrievers.items():
        t0 = time.time()
        res = ret.search_batch(qstrs, top_k=10)
        elapsed = time.time() - t0
        results[name_r] = res
        print(f"  {name_r}: {len(res)} queries in {elapsed:.2f}s ({elapsed/len(res)*1000:.0f}ms/q)")

    all_m = {}
    for name_r, res in results.items():
        m = compute_metrics(qids, res, relevant)
        all_m[name_r] = m
        print(f"\n  {name_r}:")
        for k in (1, 3, 5, 10, 100):
            print(f"    MRR@{k}={m[f'MRR@{k}']:.4f}  NDCG@{k}={m[f'NDCG@{k}']:.4f}  Recall@{k}={m[f'Recall@{k}']:.4f}")

    out = {'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'), 'dataset': name, 'retrievers': all_m}
    p = RESULTS_DIR / f'mteb_{name}_{time.strftime("%Y%m%d_%H%M%S")}.json'
    with open(p, 'w') as f:
        json.dump(out, f, indent=2)
    print(f"\n  ✅ Saved: {p}")
    return out


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=str, default='synthetic')
    args = parser.parse_args()

    print("=" * 60)
    print("MTEB Retrieval — BM25 vs Dense vs Adaptive-Hybrid")
    print("=" * 60)

    if args.dataset == 'synthetic':
        corpus, queries, relevant = synthetic_benchmark()
        run_comparison('Synthetic20', corpus, queries, relevant)
    else:
        # Real MTEB dataset (requires HF_TOKEN)
        import mteb
        task = mteb.get_task(args.dataset)
        task.load_data()
        ds = task.dataset
        # ... parse dataset dict ...
        print(f"Dataset: {args.dataset} loaded")


if __name__ == '__main__':
    main()
