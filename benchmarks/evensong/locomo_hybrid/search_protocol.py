#!/usr/bin/env python3
"""
search_protocol.py - MTEB-compatible Retrieval Interface with FAISS

Wraps BGE-M3 dense retriever from rag_utils_patch with MTEB-compatible
SearchProtocol interface. Uses FAISS IndexFlatIP for efficient retrieval.

Usage:
    from search_protocol import SearchProtocol
    sp = SearchProtocol(use_faiss=True)
    sp.index(corpus=[{'id': 'D1:1', 'text': '...'}, ...])
    results = sp.search('query', top_k=10)
    # results: [{'id': 'D1:1', 'score': 0.95, 'text': '...'}, ...]
"""

import os
os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')

from typing import List, Dict, Any, Optional
import numpy as np

from rag_utils_patch import get_embeddings, get_context_embeddings

# FAISS is optional
try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False
    faiss = None


class SearchProtocol:
    """
    MTEB-compatible dense retrieval interface.

    Wraps BGE-M3 endpoint + rag_utils_patch for corpus indexing and query search.
    Supports both brute-force and FAISS-accelerated retrieval.

    Usage:
        sp = SearchProtocol()              # uses 'hybrid' retriever (BGE-M3)
        sp = SearchProtocol(use_faiss=True)  # FAISS-accelerated
        sp.index(corpus=[...])              # build index
        results = sp.search('query')        # retrieve top-k
    """

    def __init__(self, retriever: str = 'hybrid', use_faiss: bool = False):
        """
        Initialize SearchProtocol.

        Args:
            retriever: Retriever type ('hybrid' = BGE-M3 dense)
            use_faiss: If True, use FAISS IndexFlatIP for fast search.
                       Requires FAISS to be installed (pip install faiss-cpu).
        """
        if use_faiss and not FAISS_AVAILABLE:
            raise ImportError(
                "FAISS not installed. Install with: pip install faiss-cpu"
            )

        self.retriever = retriever
        self.use_faiss = use_faiss and FAISS_AVAILABLE
        self._ids: List[str] = []
        self._texts: List[str] = []
        self._embeddings: Optional[np.ndarray] = None
        self._built = False
        self._faiss_index = None

    def index(self, corpus: List[Dict], batch_size: int = 50):
        """
        Build index from corpus documents.

        Uses BGE-M3 endpoint (batch_size=50 to avoid timeout).
        Stores L2-normalized embeddings.

        Args:
            corpus: List of dicts with 'id' (str) and 'text' (str) fields.
                   May also be a single LOCOMO-format conversation dict.
            batch_size: Embedding batch size (default 50)

        Raises:
            ValueError: If corpus is empty or missing required fields
        """
        if not corpus:
            raise ValueError("Corpus cannot be empty")

        # Detect LOCOMO format vs flat corpus
        first = corpus[0]
        if 'session_' in first or all(k in first for k in ['speaker_a', 'speaker_b']):
            # LOCOMO format: single conversation dict
            self._index_locomoconv(corpus[0])
        else:
            # Flat format: list of {id, text} dicts
            self._index_flat(corpus, batch_size)

        # Build FAISS index if enabled
        if self.use_faiss:
            self._build_faiss_index()

        self._built = True
        backend = "FAISS" if self.use_faiss else "brute-force"
        print(f"[SearchProtocol] Indexed {len(self._ids)} documents ({backend})")

    def _index_flat(self, corpus: List[Dict], batch_size: int):
        """Index flat corpus [{id, text, ...}]."""
        self._ids = []
        self._texts = []

        for doc in corpus:
            doc_id = doc.get('id', doc.get('doc_id'))
            text = doc.get('text', '')
            if not text:
                continue
            self._ids.append(str(doc_id))
            self._texts.append(text)

        self._embeddings = get_embeddings(
            self.retriever, self._texts, mode='context'
        )

    def _index_locomoconv(self, conv: Dict[str, Any]):
        """Index LOCOMO conversation format (dict with session_N keys)."""
        ctx_ids, ctx_embs = get_context_embeddings(
            self.retriever, conv, None, None
        )
        self._ids = ctx_ids
        self._embeddings = ctx_embs.numpy()
        self._texts = self._reconstruct_locomotexts(conv)

    def _reconstruct_locomotexts(self, conv: Dict[str, Any]) -> List[str]:
        """Reconstruct formatted text list matching ctx_ids order."""
        session_keys = sorted(
            [k for k in conv.keys() if k.startswith('session_') and not k.endswith('_date_time')],
            key=lambda x: int(x.split('_')[1])
        )
        texts = []
        for session_key in session_keys:
            turns = conv.get(session_key, [])
            dt_key = session_key + '_date_time'
            session_dt = conv.get(dt_key, '')
            for turn in turns:
                speaker = turn.get('speaker', 'Unknown')
                text = turn.get('text', '')
                if not text.strip():
                    continue
                if session_dt:
                    texts.append(f"({session_dt}) {speaker} said, \"{text}\"")
                else:
                    texts.append(f"Unknown said, \"{text}\"")
        return texts

    def _build_faiss_index(self):
        """Build FAISS IndexFlatIP from stored embeddings."""
        if self._embeddings is None or len(self._ids) == 0:
            return

        dim = self._embeddings.shape[1]
        self._faiss_index = faiss.IndexFlatIP(dim)
        # Embeddings are already L2-normalized; IndexFlatIP uses inner product = cosine sim
        self._faiss_index.add(self._embeddings.astype(np.float32))
        print(f"[SearchProtocol] FAISS index built: {self._faiss_index.ntotal} vectors")

    def search(self, query: str, top_k: int = 10) -> List[Dict]:
        """
        Search index for query.

        Uses FAISS if enabled, otherwise brute-force dot-product.

        Args:
            query: Query string
            top_k: Number of results to return (default 10)

        Returns:
            List of dicts: [{'id': str, 'score': float, 'text': str}, ...]
            Sorted by score descending.

        Raises:
            RuntimeError: If index not built (call index() first)
        """
        if not self._built:
            raise RuntimeError("Index not built. Call index() first.")

        # Embed query
        q_emb = get_embeddings(self.retriever, [query], mode='query')
        if len(q_emb) == 0:
            return []

        q_vec = q_emb[0].astype(np.float32).reshape(1, -1)

        if self.use_faiss and self._faiss_index is not None:
            scores, indices = self._faiss_index.search(q_vec, min(top_k, self._faiss_index.ntotal))
            scores = scores[0]
            indices = indices[0]
            results = []
            for score, idx in zip(scores, indices):
                if idx < 0:
                    continue
                results.append({
                    'id': self._ids[idx],
                    'score': float(score),
                    'text': self._texts[idx] if idx < len(self._texts) else '',
                })
        else:
            # Brute-force dot product
            scores = np.dot(self._embeddings, q_emb[0])
            if top_k >= len(scores):
                top_k = len(scores)
            top_k_idx = np.argsort(scores)[-top_k:][::-1]
            results = []
            for idx in top_k_idx:
                results.append({
                    'id': self._ids[idx],
                    'score': float(scores[idx]),
                    'text': self._texts[idx] if idx < len(self._texts) else '',
                })

        return results

    def search_batch(self, queries: List[str], top_k: int = 10) -> List[List[Dict]]:
        """Search multiple queries at once (more efficient with batching)."""
        if not self._built:
            raise RuntimeError("Index not built. Call index() first.")

        q_embs = get_embeddings(self.retriever, queries, mode='query')
        if len(q_embs) == 0:
            return [[] for _ in queries]

        all_results = []
        for q_vec in q_embs:
            q_vec_f = q_vec.astype(np.float32).reshape(1, -1)
            if self.use_faiss and self._faiss_index is not None:
                scores, indices = self._faiss_index.search(q_vec_f, min(top_k, self._faiss_index.ntotal))
                results = []
                for score, idx in zip(scores[0], indices[0]):
                    if idx < 0:
                        continue
                    results.append({
                        'id': self._ids[idx],
                        'score': float(score),
                        'text': self._texts[idx] if idx < len(self._texts) else '',
                    })
            else:
                scores = np.dot(self._embeddings, q_vec)
                top_k_idx = np.argsort(scores)[-top_k:][::-1]
                results = [{
                    'id': self._ids[idx],
                    'score': float(scores[idx]),
                    'text': self._texts[idx] if idx < len(self._texts) else '',
                } for idx in top_k_idx]
            all_results.append(results)

        return all_results

    def save_index(self, path: str):
        """Save FAISS index to disk. No-op if FAISS not used."""
        if not self.use_faiss or self._faiss_index is None:
            return
        faiss.write_index(self._faiss_index, path)
        # Save id mapping separately
        meta = {'ids': self._ids, 'texts': self._texts}
        import json
        with open(path + '.meta', 'w') as f:
            json.dump(meta, f)
        print(f"[SearchProtocol] Index saved to {path}")

    def load_index(self, path: str):
        """Load FAISS index from disk. No-op if FAISS not used."""
        if not self.use_faiss or not FAISS_AVAILABLE:
            return
        self._faiss_index = faiss.read_index(path)
        import json
        with open(path + '.meta') as f:
            meta = json.load(f)
        self._ids = meta['ids']
        self._texts = meta['texts']
        self._built = True
        print(f"[SearchProtocol] Index loaded from {path}")

    @property
    def corpus_size(self) -> int:
        """Number of indexed documents."""
        return len(self._ids) if self._built else 0

    def __repr__(self) -> str:
        backend = "FAISS" if (self.use_faiss and FAISS_AVAILABLE) else "brute-force"
        return f"SearchProtocol(retriever={self.retriever}, docs={self.corpus_size}, backend={backend})"
