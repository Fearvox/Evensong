#!/usr/bin/env python3
"""
eval_locomo_paper.py - Paper-style LoCoMo QA benchmark lane

Runs answer-generation evaluation over LoCoMo with:
  - category-wise accuracy for Single Hop / Multi Hop / Temporal / Open Domain
  - adversarial tracked separately
  - average total tokens per answered question

This is intentionally "paper-style", not a full reproduction of every external
memory system in the screenshot. It gives us a compatible output surface for our
own pipeline so Hermes can run and compare the lane over time.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import string
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib import error, request

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from search_protocol import SearchProtocol


RESULTS_DIR = Path(__file__).parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)

CATEGORY_ID_TO_NAME = {
    1: "single_hop",
    2: "multi_hop",
    3: "temporal",
    4: "open_domain",
    5: "adversarial",
}
DISPLAY_ORDER = ["single_hop", "multi_hop", "temporal", "open_domain"]
DISPLAY_LABELS = {
    "single_hop": "Single Hop",
    "multi_hop": "Multi Hop",
    "temporal": "Temporal",
    "open_domain": "Open Domain",
    "adversarial": "Adversarial",
}
MATCH_STOPWORDS = {
    "and",
    "or",
    "for",
    "of",
    "to",
    "in",
    "on",
    "with",
}


def load_locomo_data(data_path: str | None = None) -> List[Dict[str, Any]]:
    if data_path is None:
        data_path = Path(__file__).parent / "data" / "locomo10.json"
    else:
        data_path = Path(data_path)
    with open(data_path) as f:
        return json.load(f)


def get_gold_answer(qa: Dict[str, Any]) -> str:
    return str(qa.get("answer") or qa.get("adversarial_answer") or "").strip()


def normalize_answer(text: str) -> str:
    text = text.lower().strip()
    text = text.replace("not answerable.", "not answerable")
    text = text.replace("not enough information", "not answerable")
    text = text.translate(str.maketrans("", "", string.punctuation))
    text = re.sub(r"\b(a|an|the)\b", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def answers_match(predicted: str, gold: str) -> bool:
    pred = normalize_answer(predicted)
    ref = normalize_answer(gold)
    if not pred or not ref:
        return False
    if pred == "not answerable" or ref == "not answerable":
        return pred == ref
    if pred == ref:
        return True
    if ref in pred or pred in ref:
        return True

    pred_tokens = {token for token in pred.split() if token not in MATCH_STOPWORDS}
    ref_tokens = {token for token in ref.split() if token not in MATCH_STOPWORDS}
    if pred_tokens and ref_tokens:
        smaller, larger = sorted((pred_tokens, ref_tokens), key=len)
        if smaller.issubset(larger):
            return True

    return False


def salvage_reasoning_answer(text: str) -> str:
    candidate = re.sub(r"</?think\b[^>]*>", " ", text, flags=re.IGNORECASE)
    candidate = re.sub(r"<\|[^|>]+\|>", " ", candidate)
    candidate = re.sub(r"```(?:\w+)?", " ", candidate)
    candidate = candidate.replace("\r", "")
    lines = [line.strip() for line in candidate.splitlines() if line.strip()]
    tail_lines = lines[-8:] if lines else [re.sub(r"\s+", " ", candidate).strip()]
    tail = " ".join(tail_lines).strip()
    if not tail:
        return ""

    bullet_items: List[str] = []
    for line in tail_lines:
        if line.startswith("- "):
            item = re.split(r"[\(:,\-]", line[2:], maxsplit=1)[0].strip().strip("\"'")
            if item and len(item.split()) <= 4:
                bullet_items.append(item)
    if 2 <= len(bullet_items) <= 5:
        return ", ".join(bullet_items)

    quoted_candidates = re.findall(r'"([^"\n]{1,80})"', tail)
    for raw in reversed(quoted_candidates):
        cleaned = raw.strip().strip("\"'").strip(" .")
        if cleaned and "?" not in cleaned and len(cleaned.split()) <= 8:
            return cleaned

    salvage_patterns = [
        r"(?:so answer|answer should be|the answer is|answer is|or simply|probably|output)\s*:?\s*\"?([^\".!?\n]+)",
        r"\bwhich is\s+([^.!?\n]+)",
        r"\bwould be\s+([^.!?\n]+)",
        r"\bwas researching\s+([^.!?\n]+)",
        r"\bsome time in\s+([^.!?\n]+?)(?:\s+maybe)?(?:[.!?]|$)",
        r"\bis a\s+([^.!?\n]+)",
    ]
    for pattern in salvage_patterns:
        match = re.search(pattern, tail, flags=re.IGNORECASE)
        if not match:
            continue
        cleaned = match.group(1).strip().strip("\"'").strip(" .")
        if cleaned:
            return cleaned

    return ""


def clean_model_answer(text: str) -> str:
    original = text.strip()
    cleaned = original

    # Strip common reasoning blocks and special thought tags, including malformed
    # MiniMax-style `<think ... </think>` outputs.
    block_patterns = [
        r"<\|thoughts\|>.*?</\|thoughts\|>",
        r"<\|thought\|>.*?</\|thought\|>",
        r"<think\b[\s\S]*?</think\s*>?",
    ]
    for pattern in block_patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.DOTALL | re.IGNORECASE).strip()

    # Truncate leaked tool-call traces if the model spills orchestration content.
    tool_marker = re.search(
        r"(?i)(<\|tool_|<tool_|<\|tool_call|<tool_call|functions\.[a-z_]+:\d+)",
        cleaned,
    )
    if tool_marker:
        cleaned = cleaned[:tool_marker.start()].strip()

    # Remove standalone control tags and code fences that occasionally survive.
    cleaned = re.sub(r"<\|[^|>]+\|>", "", cleaned)
    cleaned = re.sub(r"```(?:\w+)?", "", cleaned)

    preamble_patterns = [
        r"^(answer|final answer)\s*:?\s*",
        r"^(therefore,?\s+)?the answer is\s*:?\s*",
        r"^(based on the snippets|from the snippets|looking at the snippets)\s*,?\s*",
        r"^(i think|i believe)\s+",
    ]
    for pattern in preamble_patterns:
        cleaned = re.sub(pattern, "", cleaned, count=1, flags=re.IGNORECASE)

    cleaned = re.sub(r"\s+", " ", cleaned).strip().strip("\"'")
    if cleaned:
        return cleaned
    return salvage_reasoning_answer(original)


def format_k_tokens(avg_tokens: float) -> str:
    if avg_tokens <= 0:
        return "0.0"
    if avg_tokens >= 1000:
        return f"{avg_tokens / 1000:.1f}k"
    return f"{avg_tokens:.0f}"


def build_context(results: List[Dict[str, Any]]) -> str:
    lines = []
    for i, hit in enumerate(results, start=1):
        snippet = str(hit.get("text", "")).strip()
        doc_id = str(hit.get("id", ""))
        score = hit.get("score")
        if isinstance(score, (int, float)):
            lines.append(f"[{i}] (relevance={score:.3f}) {doc_id}: {snippet}")
        else:
            lines.append(f"[{i}] {doc_id}: {snippet}")
    return "\n".join(lines)


def flatten_locomo_conversation(conversation: Dict[str, Any]) -> List[Dict[str, str]]:
    docs: List[Dict[str, str]] = []
    session_keys = sorted(
        [k for k in conversation.keys() if k.startswith("session_") and not k.endswith("_date_time")],
        key=lambda x: int(x.split("_")[1]),
    )
    for session_key in session_keys:
        turns = conversation.get(session_key, [])
        session_dt = conversation.get(f"{session_key}_date_time", "")
        for turn in turns:
            dia_id = str(turn.get("dia_id", "Unknown"))
            speaker = str(turn.get("speaker", "Unknown"))
            text = str(turn.get("text", "")).strip()
            if not text:
                continue
            if session_dt:
                formatted = f"({session_dt}) {speaker} said, \"{text}\""
            else:
                formatted = f"Unknown said, \"{text}\""
            docs.append({"id": dia_id, "text": formatted})
    return docs


def _spread_pick(items: List[int], count: int) -> List[int]:
    if count <= 0 or not items:
        return []
    if count >= len(items):
        return items
    picked: List[int] = []
    last_idx = -1
    for i in range(count):
        raw_idx = round(i * (len(items) - 1) / max(1, count - 1))
        idx = max(raw_idx, last_idx + 1)
        idx = min(idx, len(items) - (count - i))
        picked.append(items[idx])
        last_idx = idx
    return picked


def build_light_corpus(
    conversation: Dict[str, Any],
    qa_slice: List[Dict[str, Any]],
    *,
    doc_limit: int,
    neighbor_radius: int,
) -> List[Dict[str, str]]:
    docs = flatten_locomo_conversation(conversation)
    if doc_limit <= 0 or len(docs) <= doc_limit:
        return docs

    id_to_index = {doc["id"]: idx for idx, doc in enumerate(docs)}
    selected: set[int] = set()

    for qa in qa_slice:
        for evidence_id in qa.get("evidence") or []:
            idx = id_to_index.get(str(evidence_id))
            if idx is None:
                continue
            left = max(0, idx - neighbor_radius)
            right = min(len(docs), idx + neighbor_radius + 1)
            selected.update(range(left, right))

    if not selected:
        selected.update(_spread_pick(list(range(len(docs))), min(doc_limit, len(docs))))
    elif len(selected) < doc_limit:
        remaining = [idx for idx in range(len(docs)) if idx not in selected]
        slots = min(doc_limit - len(selected), len(remaining))
        selected.update(_spread_pick(remaining, slots))
    elif len(selected) > doc_limit:
        selected = set(_spread_pick(sorted(selected), doc_limit))

    return [docs[idx] for idx in sorted(selected)]


def call_chat_completions(
    *,
    base_url: str,
    model: str,
    api_key: str,
    messages: List[Dict[str, str]],
    max_tokens: int = 80,
    temperature: float = 0.0,
    timeout_s: int = 60,
) -> Tuple[str, Dict[str, Any]]:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    req = request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=timeout_s) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"chat/completions HTTP {exc.code}: {body[:240]}") from exc
    except Exception as exc:  # pragma: no cover - network surface
        raise RuntimeError(f"chat/completions failed: {exc}") from exc

    content = (
        body.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    usage = body.get("usage") or {}
    return str(content).strip(), usage


def answer_question(
    *,
    base_url: str,
    model: str,
    api_key: str,
    question: str,
    retrieved: List[Dict[str, Any]],
    timeout_s: int,
) -> Tuple[str, int]:
    system = (
        "You are a precise conversational-memory QA system. Use ONLY the retrieved "
        "snippets. Return exactly one short answer line, with no explanation, no "
        "reasoning tags, and no preamble. If the snippets do not support an answer, "
        "return exactly 'Not answerable'. For date/time questions, answer with the "
        "specific date/time when present. For list questions, return only the items."
    )
    user = (
        f"Question: {question}\n\n"
        f"Retrieved snippets:\n{build_context(retrieved)}\n\n"
        "Output only the answer text. Do not use <think> or special tags."
    )
    content, usage = call_chat_completions(
        base_url=base_url,
        model=model,
        api_key=api_key,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        max_tokens=256,
        temperature=0.0,
        timeout_s=timeout_s,
    )
    total_tokens = int(
        usage.get("total_tokens")
        or (usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0))
        or 0
    )
    return clean_model_answer(content), total_tokens


def render_markdown_summary(
    *,
    method_name: str,
    avg_tokens: float,
    summary: Dict[str, Dict[str, float]],
    meta: Dict[str, Any],
) -> str:
    def pct(bucket: str) -> str:
        return f"{summary[bucket]['accuracy'] * 100:.2f}"

    lines = [
        "# LoCoMo Paper-Style Benchmark",
        "",
        f"- Method: **{method_name}**",
        f"- Retriever: **{meta['retriever']}**",
        f"- Model: **{meta['model']}**",
        f"- Top-K: **{meta['top_k']}**",
        f"- Evaluated QAs (main): **{meta['main_count']}**",
        f"- Adversarial QAs: **{meta['adversarial_count']}**",
        f"- Avg. Tokens (main categories): **{format_k_tokens(avg_tokens)}**",
        "",
        "| Method | Avg. Tokens | Single Hop | Multi Hop | Temporal | Open Domain | Overall |",
        "|--------|-------------|------------|-----------|----------|-------------|---------|",
        f"| {method_name} | {format_k_tokens(avg_tokens)} | {pct('single_hop')} | {pct('multi_hop')} | {pct('temporal')} | {pct('open_domain')} | {pct('overall')} |",
        "",
        "## Counts",
        "",
    ]
    for bucket in DISPLAY_ORDER + ["overall", "adversarial"]:
        label = DISPLAY_LABELS.get(bucket, bucket)
        count = summary[bucket]["count"]
        acc = summary[bucket]["accuracy"] * 100
        lines.append(f"- {label}: {count} questions, accuracy {acc:.2f}%")
    return "\n".join(lines) + "\n"


def main() -> Dict[str, Any]:
    parser = argparse.ArgumentParser(description="LoCoMo paper-style QA benchmark")
    parser.add_argument("--data", default=None, help="Path to locomo10.json")
    parser.add_argument("--retriever", default="hybrid", help="Retriever type for SearchProtocol")
    parser.add_argument("--model", default="MiniMax-M2.7", help="Answer model id")
    parser.add_argument("--base-url", default="https://api.minimax.io/v1", help="OpenAI-compatible base URL")
    parser.add_argument("--api-key-env", default="MINIMAX_API_KEY", help="Env var holding API key")
    parser.add_argument("--top-k", type=int, default=5, help="Retrieved snippets per question")
    parser.add_argument("--limit", type=int, default=0, help="Optional QA limit for smoke runs")
    parser.add_argument(
        "--sample-id",
        default=None,
        help="Optional sample_id filter for light/smoke runs (e.g. conv-30)",
    )
    parser.add_argument(
        "--index-mode",
        choices=["full", "light"],
        default="full",
        help="Index the full conversation or a light evidence-centered slice",
    )
    parser.add_argument(
        "--light-doc-limit",
        type=int,
        default=48,
        help="Max docs to index per sample when --index-mode=light",
    )
    parser.add_argument(
        "--light-neighbor-radius",
        type=int,
        default=1,
        help="Neighbor radius around evidence docs when --index-mode=light",
    )
    parser.add_argument("--timeout", type=int, default=60, help="Per-answer timeout in seconds")
    parser.add_argument("--method-name", default="CCR DenseRAG", help="Label used in summary table")
    parser.add_argument("--output", default=None, help="Output JSON path")
    parser.add_argument("--output-md", default=None, help="Output markdown path")
    args = parser.parse_args()

    api_key = os.environ.get(args.api_key_env, "").strip()
    if not api_key:
        raise RuntimeError(f"Missing API key env: {args.api_key_env}")

    data = load_locomo_data(args.data)
    if args.sample_id:
        data = [item for item in data if item.get("sample_id") == args.sample_id]
        if not data:
            raise RuntimeError(f"Unknown sample_id: {args.sample_id}")

    target_qas = (
        min(args.limit, sum(len(item["qa"]) for item in data))
        if args.limit > 0
        else sum(len(item["qa"]) for item in data)
    )
    verbose_progress = target_qas <= 25

    per_question: List[Dict[str, Any]] = []
    asked = 0
    for sample_idx, item in enumerate(data, start=1):
        session_turns = sum(
            len(turns)
            for key, turns in item["conversation"].items()
            if key.startswith("session_") and not key.endswith("_date_time")
        )
        remaining = max(0, target_qas - asked) if args.limit > 0 else len(item["qa"])
        qa_slice = item["qa"][:remaining] if remaining else []
        if args.limit > 0 and not qa_slice:
            break

        print(
            f"[locomo-paper] indexing sample {sample_idx}/{len(data)} "
            f"({item.get('sample_id', 'unknown')}, {session_turns} turns)",
            flush=True,
        )
        sp = SearchProtocol(retriever=args.retriever, use_faiss=False)
        if args.index_mode == "light":
            light_corpus = build_light_corpus(
                item["conversation"],
                qa_slice,
                doc_limit=args.light_doc_limit,
                neighbor_radius=args.light_neighbor_radius,
            )
            print(
                f"[locomo-paper] light index: {len(light_corpus)} docs "
                f"for {len(qa_slice)} selected QAs",
                flush=True,
            )
            sp.index(light_corpus)
        else:
            sp.index([item["conversation"]])
        print(
            f"[locomo-paper] indexed sample {sample_idx}/{len(data)}: "
            f"{len(sp._ids)} docs ready",
            flush=True,
        )

        for qa in item["qa"]:
            if args.limit > 0 and asked >= args.limit:
                break

            category_id = int(qa["category"])
            bucket = CATEGORY_ID_TO_NAME.get(category_id, "unknown")
            gold = get_gold_answer(qa)
            retrieved = sp.search(qa["question"], top_k=args.top_k)
            answer, total_tokens = answer_question(
                base_url=args.base_url,
                model=args.model,
                api_key=api_key,
                question=qa["question"],
                retrieved=retrieved,
                timeout_s=args.timeout,
            )
            correct = answers_match(answer, gold)
            per_question.append({
                "sample_id": item.get("sample_id"),
                "question": qa["question"],
                "gold": gold,
                "prediction": answer,
                "correct": correct,
                "category_id": category_id,
                "category": bucket,
                "tokens": total_tokens,
                "retrieved_ids": [x.get("id") for x in retrieved],
            })
            asked += 1
            if verbose_progress or asked % 10 == 0:
                running = sum(1 for x in per_question if x["correct"]) / len(per_question)
                print(
                    f"[locomo-paper] qa {asked}/{target_qas}: "
                    f"{bucket} correct={correct} running_acc={running:.3f} "
                    f"tokens={total_tokens}",
                    flush=True,
                )
        if args.limit > 0 and asked >= args.limit:
            break

    summary: Dict[str, Dict[str, float]] = {}
    for bucket in DISPLAY_ORDER + ["adversarial"]:
        rows = [x for x in per_question if x["category"] == bucket]
        correct = sum(1 for x in rows if x["correct"])
        summary[bucket] = {
            "count": len(rows),
            "accuracy": (correct / len(rows)) if rows else 0.0,
            "avg_tokens": (sum(x["tokens"] for x in rows) / len(rows)) if rows else 0.0,
        }

    main_rows = [x for x in per_question if x["category"] in DISPLAY_ORDER]
    main_correct = sum(1 for x in main_rows if x["correct"])
    avg_tokens = (sum(x["tokens"] for x in main_rows) / len(main_rows)) if main_rows else 0.0
    summary["overall"] = {
        "count": len(main_rows),
        "accuracy": (main_correct / len(main_rows)) if main_rows else 0.0,
        "avg_tokens": avg_tokens,
    }

    meta = {
        "method_name": args.method_name,
        "retriever": args.retriever,
        "model": args.model,
        "top_k": args.top_k,
        "main_count": len(main_rows),
        "adversarial_count": summary["adversarial"]["count"],
    }

    result = {
        "meta": meta,
        "summary": summary,
        "per_question": per_question,
    }

    stamp = time.strftime("%Y%m%d_%H%M%S")
    output_json = Path(args.output) if args.output else RESULTS_DIR / f"locomo_paper_{stamp}.json"
    output_md = Path(args.output_md) if args.output_md else RESULTS_DIR / f"locomo_paper_{stamp}.md"
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_md.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(result, indent=2))
    output_md.write_text(
        render_markdown_summary(
            method_name=args.method_name,
            avg_tokens=avg_tokens,
            summary=summary,
            meta=meta,
        )
    )

    print(render_markdown_summary(
        method_name=args.method_name,
        avg_tokens=avg_tokens,
        summary=summary,
        meta=meta,
    ), flush=True)
    print(f"[locomo-paper] json: {output_json}", flush=True)
    print(f"[locomo-paper] md:   {output_md}", flush=True)
    return result


if __name__ == "__main__":
    main()
