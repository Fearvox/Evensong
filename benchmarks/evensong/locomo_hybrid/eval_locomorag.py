#!/usr/bin/env python3
"""
eval_locomorag.py - LOCOMO RAG Evaluation for BGE-M3 Dense Retriever

Runs LOCOMO benchmark evaluation comparing BGE-M3 dense vs dragon baseline.
Computes Recall@K and F1 metrics per QA pair and per category.
"""

# Fix OpenMP duplicate lib warning on macOS
import os
os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')

import json
import sys
from pathlib import Path
from typing import List, Dict, Tuple, Any

import numpy as np

# Add local module to path
sys.path.insert(0, str(Path(__file__).parent))

from rag_utils_patch import (
    get_embeddings,
    get_context_embeddings,
)

# Category names
CATEGORY_NAMES = [
    'Personal Facts',  # 0
    'Temporal',        # 1
    'Inferences',     # 2
    'Explanations',   # 3
    'Adversarial',    # 4
]

# Results directory
RESULTS_DIR = Path(__file__).parent / 'results'
RESULTS_DIR.mkdir(exist_ok=True)


def load_locomo_data(data_path: str = None) -> List[Dict]:
    """Load LOCOMO dataset."""
    if data_path is None:
        data_path = Path(__file__).parent / 'data' / 'locomo10.json'
    else:
        data_path = Path(data_path)

    with open(data_path) as f:
        return json.load(f)


def retrieve_for_question(
    question: str,
    conversation: Dict[str, Any],
    retriever: str = 'hybrid',
    top_k: int = 5
) -> Tuple[List[str], np.ndarray]:
    """
    Retrieve relevant context IDs for a question.

    Args:
        question: Query string
        conversation: LOCOMO conversation dict
        retriever: Retriever type ('hybrid' for BGE-M3)
        top_k: Number of results to return

    Returns:
        Tuple of (retrieved_ids, scores)
    """
    # Get context embeddings
    context_ids, context_embs = get_context_embeddings(
        retriever, conversation, None, None
    )

    if len(context_ids) == 0:
        return [], np.array([])

    # Get query embedding
    query_emb = get_embeddings(retriever, [question], mode='query')

    if len(query_emb) == 0:
        return [], np.array([])

    # Compute similarity (dot product = cosine sim for L2-normalized)
    context_np = context_embs.numpy() if hasattr(context_embs, 'numpy') else context_embs
    scores = np.dot(context_np, query_emb[0])

    # Get top-k
    if top_k >= len(scores):
        top_k = len(scores)

    top_k_idx = np.argsort(scores)[-top_k:][::-1]

    retrieved_ids = [context_ids[i] for i in top_k_idx]
    retrieved_scores = scores[top_k_idx]

    return retrieved_ids, retrieved_scores


def evaluate_qa(
    qa: Dict[str, Any],
    retrieved_ids: List[str]
) -> Tuple[float, float]:
    """
    Evaluate a single QA pair.

    Args:
        qa: QA dict with 'evidence' (list of context IDs) and 'answer'
        retrieved_ids: List of retrieved context IDs

    Returns:
        Tuple of (recall, f1)
    """
    evidence = set(qa.get('evidence', []))

    if not evidence:
        return 0.0, 0.0

    retrieved_set = set(retrieved_ids)

    # Recall: did we find the evidence?
    retrieved_intersection = evidence & retrieved_set
    recall = len(retrieved_intersection) / len(evidence)

    # F1: based on precision and recall
    if len(retrieved_set) == 0:
        precision = 0.0
    else:
        precision = len(retrieved_intersection) / len(retrieved_set)

    if precision + recall == 0:
        f1 = 0.0
    else:
        f1 = 2 * (precision * recall) / (precision + recall)

    return recall, f1


def run_evaluation(
    data_path: str = None,
    retriever: str = 'hybrid',
    top_k: int = 5
) -> Dict[str, Any]:
    """
    Run full LOCOMO RAG evaluation.

    Args:
        data_path: Path to locomo10.json
        retriever: Retriever type
        top_k: Number of context results to retrieve

    Returns:
        Evaluation results dict
    """
    print(f"[eval_locomorag] Loading LOCOMO data...")
    locomo_data = load_locomo_data(data_path)
    print(f"[eval_locomorag] Loaded {len(locomo_data)} conversations")

    results = {
        'retriever': retriever,
        'top_k': top_k,
        'overall': {'recall': [], 'f1': []},
        'by_category': {i: {'recall': [], 'f1': []} for i in range(5)},
        'per_conversation': [],
    }

    for conv_idx, item in enumerate(locomo_data):
        conv_id = item.get('sample_id', f'conv_{conv_idx}')
        conversation = item['conversation']
        qa_list = item['qa']

        conv_results = {
            'conv_id': conv_id,
            'num_qa': len(qa_list),
            'qa_results': []
        }

        for qa_idx, qa in enumerate(qa_list):
            question = qa['question']
            evidence = qa['evidence']
            category = qa.get('category', 0)

            # Retrieve
            retrieved_ids, scores = retrieve_for_question(
                question, conversation, retriever, top_k
            )

            # Evaluate
            recall, f1 = evaluate_qa(qa, retrieved_ids)

            # Store
            results['overall']['recall'].append(recall)
            results['overall']['f1'].append(f1)
            results['by_category'][category]['recall'].append(recall)
            results['by_category'][category]['f1'].append(f1)

            qa_result = {
                'q': question,
                'answer': qa.get('answer'),
                'evidence': evidence,
                'retrieved': retrieved_ids,
                'scores': scores.tolist() if len(scores) > 0 else [],
                'recall': recall,
                'f1': f1,
                'category': category,
                'category_name': CATEGORY_NAMES[category] if category < len(CATEGORY_NAMES) else 'Unknown'
            }
            conv_results['qa_results'].append(qa_result)

        results['per_conversation'].append(conv_results)

        print(f"[eval_locomorag] {conv_id}: {len(qa_list)} QAs, "
              f"avg recall={np.mean(conv_results['qa_results'][0]['recall'] for _ in [1]):.3f}" if conv_results['qa_results'] else "N/A")

    # Compute aggregates
    results['overall']['mean_recall'] = float(np.mean(results['overall']['recall']))
    results['overall']['mean_f1'] = float(np.mean(results['overall']['f1']))

    for cat in results['by_category']:
        cat_data = results['by_category'][cat]
        if cat_data['recall']:
            cat_data['mean_recall'] = float(np.mean(cat_data['recall']))
            cat_data['mean_f1'] = float(np.mean(cat_data['f1']))
            cat_data['count'] = len(cat_data['recall'])
        else:
            cat_data['mean_recall'] = 0.0
            cat_data['mean_f1'] = 0.0
            cat_data['count'] = 0

    return results


def print_results(results: Dict[str, Any]):
    """Print evaluation results in human-readable format."""
    print("\n" + "=" * 60)
    print(f"LOCOMO RAG Evaluation Results: {results['retriever']}")
    print(f"Top-K: {results['top_k']}")
    print("=" * 60)

    print("\n## Overall Results")
    print(f"  Recall@{results['top_k']}: {results['overall']['mean_recall']:.4f}")
    print(f"  F1: {results['overall']['mean_f1']:.4f}")

    print("\n## Per-Category Results")
    print(f"  {'Category':<20} {'Count':>6} {'Recall@K':>10} {'F1':>10}")
    print(f"  {'-'*20} {'-'*6} {'-'*10} {'-'*10}")

    for cat_idx, cat_name in enumerate(CATEGORY_NAMES):
        cat_data = results['by_category'].get(cat_idx, {})
        count = cat_data.get('count', 0)
        recall = cat_data.get('mean_recall', 0.0)
        f1 = cat_data.get('mean_f1', 0.0)
        print(f"  {cat_name:<20} {count:>6} {recall:>10.4f} {f1:>10.4f}")

    print("\n" + "=" * 60)


def main():
    import argparse

    parser = argparse.ArgumentParser(description='LOCOMO RAG Evaluation')
    parser.add_argument('--data', default=None, help='Path to locomo10.json')
    parser.add_argument('--retriever', default='hybrid', help='Retriever type')
    parser.add_argument('--top-k', type=int, default=5, help='Number of results')
    parser.add_argument('--output', default=None, help='Output JSON path')
    parser.add_argument('--skip-print', action='store_true', help='Skip printing results')

    args = parser.parse_args()

    results = run_evaluation(
        data_path=args.data,
        retriever=args.retriever,
        top_k=args.top_k
    )

    if not args.skip_print:
        print_results(results)

    # Save results
    output_path = args.output
    if output_path is None:
        output_path = RESULTS_DIR / f"locomorag_{args.retriever}_k{args.top_k}.json"
    else:
        output_path = Path(output_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to: {output_path}")

    return results


if __name__ == "__main__":
    main()
