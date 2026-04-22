"""
LOCOMO Hybrid Retriever - BGE-M3 Dense + BM25 Hybrid

Implements the four-function LOCOMO interface for hybrid dense retrieval.
BGE-M3 dense retriever with BM25 fallback.
"""

from .rag_utils_patch import (
    init_context_model,
    init_query_model,
    get_embeddings,
    get_context_embeddings,
)

__all__ = [
    'init_context_model',
    'init_query_model',
    'get_embeddings',
    'get_context_embeddings',
]
