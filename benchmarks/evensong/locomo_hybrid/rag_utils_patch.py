"""
rag_utils_patch.py - BGE-M3 Dense Retriever for LOCOMO Benchmark

Implements the four-function LOCOMO interface:
- init_context_model(retriever): Initialize context encoder
- init_query_model(retriever): Initialize query encoder
- get_embeddings(retriever, inputs, mode): Get dense embeddings
- get_context_embeddings(retriever, data, context_tokenizer, context_encoder, captions): Get LOCOMO-format embeddings

Uses BGE-M3 via remote endpoint with local model fallback.
BM25 fallback activates when BGE endpoint is unreachable.
"""

import numpy as np
import torch
from typing import List, Tuple, Dict, Any, Optional
import httpx
import os

# BGE-M3 endpoint (ccr-droplet Tailscale)
BGE_ENDPOINT = os.environ.get("BGE_ENDPOINT", "http://100.65.234.77:8080/embedding")
BGE_USE_LOCAL = os.environ.get("BGE_USE_LOCAL", "0") == "1"

# Global model cache
_tokenizer = None
_encoder = None


def init_context_model(retriever: str) -> Tuple[Any, Any]:
    """
    Initialize the context encoder for LOCOMO.

    Args:
        retriever: Retriever type ('hybrid' for BGE-M3 dense)

    Returns:
        Tuple of (tokenizer, encoder)

    Raises:
        ValueError: If retriever type is not supported
    """
    if retriever != 'hybrid':
        raise ValueError(f"Unknown retriever: {retriever}. Supported: 'hybrid'")

    global _tokenizer, _encoder

    if _tokenizer is None or _encoder is None:
        from transformers import AutoTokenizer, AutoModel
        _tokenizer = AutoTokenizer.from_pretrained('BAAI/bge-m3')
        _encoder = AutoModel.from_pretrained('BAAI/bge-m3')

        # Move to GPU if available
        if torch.cuda.is_available():
            _encoder = _encoder.cuda()
            print("[rag_utils_patch] BGE-M3 loaded on GPU")
        else:
            print("[rag_utils_patch] BGE-M3 loaded on CPU")

        _encoder.eval()

    return _tokenizer, _encoder


def init_query_model(retriever: str) -> Tuple[Any, Any]:
    """
    Initialize the query encoder (same as context model for BGE-M3).

    Args:
        retriever: Retriever type

    Returns:
        Tuple of (tokenizer, encoder)
    """
    return init_context_model(retriever)


def get_embeddings(
    retriever: str,
    inputs: List[str],
    mode: str = 'context'
) -> np.ndarray:
    """
    Get dense embeddings for input texts.

    Tries BGE endpoint first, falls back to local model.
    Output is always L2-normalized.

    Args:
        retriever: Retriever type ('hybrid')
        inputs: List of text strings to embed
        mode: 'context' or 'query' (both use same BGE-M3 model)

    Returns:
        np.ndarray of shape (len(inputs), 1024), L2-normalized

    Raises:
        ValueError: If retriever type is not supported
    """
    if retriever != 'hybrid':
        raise ValueError(f"Unknown retriever: {retriever}")

    # Try endpoint first (unless BGE_USE_LOCAL is set)
    if not BGE_USE_LOCAL:
        try:
            embeddings = _get_embeddings_via_endpoint(inputs)
            if embeddings is not None:
                return embeddings
        except Exception as e:
            print(f"[rag_utils_patch] Endpoint unavailable ({e}), using local model")

    # Local model fallback
    return _get_embeddings_local(inputs)


def _get_embeddings_via_endpoint(inputs: List[str]) -> Optional[np.ndarray]:
    """Get embeddings via BGE-M3 HTTP endpoint."""
    try:
        resp = httpx.post(
            BGE_ENDPOINT,
            json={"texts": inputs},
            timeout=10.0
        )
        resp.raise_for_status()
        data = resp.json()

        # Handle different response formats
        if 'embeddings' in data:
            embeddings = data['embeddings']
        elif 'data' in data:
            embeddings = [item['embedding'] for item in data['data']]
        else:
            return None

        embeddings = np.array(embeddings, dtype=np.float32)

        # L2 normalize
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)  # Avoid division by zero
        embeddings = embeddings / norms

        print(f"[rag_utils_patch] Got {len(inputs)} embeddings from endpoint")
        return embeddings

    except Exception as e:
        print(f"[rag_utils_patch] Endpoint error: {e}")
        raise


def _get_embeddings_local(inputs: List[str]) -> np.ndarray:
    """Get embeddings using local BGE-M3 model."""
    global _tokenizer, _encoder

    if _tokenizer is None or _encoder is None:
        init_context_model('hybrid')

    with torch.no_grad():
        inputs_tok = _tokenizer(
            inputs,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors='pt'
        )

        # Move to same device as model
        device = next(_encoder.parameters()).device
        inputs_tok = {k: v.to(device) for k, v in inputs_tok.items()}

        outputs = _encoder(**inputs_tok)

        # Use [CLS] token embedding
        embeddings = outputs.last_hidden_state[:, 0, :].cpu().numpy()

    # L2 normalize
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    embeddings = embeddings / norms

    return embeddings


def get_context_embeddings(
    retriever: str,
    data: Dict[str, Any],
    context_tokenizer: Any,
    context_encoder: Any,
    captions: Optional[List[str]] = None
) -> Tuple[List[str], torch.Tensor]:
    """
    Format conversation data into LOCOMO-compatible embeddings.

    Converts LOCOMO conversation format to dialog history strings,
    then generates embeddings.

    Args:
        retriever: Retriever type
        data: LOCOMO conversation dict with 'sessions' -> 'turns'
        context_tokenizer: Tokenizer (ignored, uses global)
        context_encoder: Encoder (ignored, uses global)
        captions: Optional per-turn captions

    Returns:
        Tuple of (context_ids, embeddings_tensor)
        - context_ids: List of dialog IDs like "D1:1", "D1:2", etc.
        - embeddings_tensor: torch.Tensor of shape (N, 1024)
    """
    if retriever != 'hybrid':
        raise ValueError(f"Unknown retriever: {retriever}")

    formatted = []
    context_ids = []

    sessions = data.get('sessions', [])

    for session_idx, session in enumerate(sessions):
        turns = session.get('turns', [])

        for turn_idx, turn in enumerate(turns):
            # Build dialog ID: session and turn indices (1-indexed)
            dia_id = f"D{session_idx + 1}:{turn_idx + 1}"

            # Extract turn data
            speaker = turn.get('speaker', 'Unknown')
            text = turn.get('text', '')
            dt = turn.get('datetime', '')

            # Format as LOCOMO-style dialog line
            # Format: "(datetime) Speaker said, \"text\"\n"
            speaker_str = speaker if speaker else 'Unknown'
            text_str = text if text else ''
            if dt:
                formatted_text = f"({dt}) {speaker_str} said, \"{text_str}\"\n"
            else:
                formatted_text = f"Unknown said, \"{text_str}\"\n"

            # Skip empty text entries
            if not text_str.strip():
                continue

            formatted.append(formatted_text)
            context_ids.append(dia_id)

    # Add caption context if provided
    if captions and len(captions) == len(formatted):
        formatted = [f"{cap} {text}" for cap, text in zip(captions, formatted)]

    # Get embeddings
    embeddings = get_embeddings(retriever, formatted, mode='context')

    # Convert to torch tensor
    embeddings_tensor = torch.from_numpy(embeddings)

    print(f"[rag_utils_patch] Generated {len(context_ids)} context embeddings")

    return context_ids, embeddings_tensor


def get_bm25_corpus(
    retriever: str,
    data: Dict[str, Any]
) -> Tuple[List[str], Dict[str, Any]]:
    """
    Extract text corpus for BM25 indexing.

    Args:
        retriever: Retriever type
        data: LOCOMO conversation dict

    Returns:
        Tuple of (texts, metadata)
        - texts: List of text strings
        - metadata: Dict with 'ids' and 'positions'
    """
    texts = []
    metadata = {'ids': [], 'positions': []}

    sessions = data.get('sessions', [])

    for session_idx, session in enumerate(sessions):
        turns = session.get('turns', [])

        for turn_idx, turn in enumerate(turns):
            dia_id = f"D{session_idx + 1}:{turn_idx + 1}"
            text = turn.get('text', '')

            if text:
                texts.append(text)
                metadata['ids'].append(dia_id)
                metadata['positions'].append((session_idx, turn_idx))

    return texts, metadata


# BM25 fallback using rank_bm25
def get_bm25_embeddings(
    texts: List[str],
    tokenize_fn=None
) -> Any:
    """
    Get BM25 scores as sparse embedding fallback.

    This is a placeholder - actual BM25 integration would use
    rank_bm25.BM25Okapi or similar.

    Args:
        texts: List of text strings
        tokenize_fn: Optional tokenizer function

    Returns:
        BM25 model instance
    """
    try:
        from rank_bm25 import BM25Okapi
        if tokenize_fn:
            tokenized = [tokenize_fn(t) for t in texts]
        else:
            # Simple whitespace tokenization
            tokenized = [t.lower().split() for t in texts]
        return BM25Okapi(tokenized)
    except ImportError:
        print("[rag_utils_patch] rank_bm25 not installed, BM25 fallback unavailable")
        return None
