#!/usr/bin/env python3
"""
Download LOCOMO dataset for benchmark evaluation.

LOCOMO: Long Context Memory Benchmark (ACL 2024)
GitHub: https://github.com/snap-research/locomo
HuggingFace: https://huggingface.co/datasets/snap-research/locomo
"""

import os
import json
from pathlib import Path

try:
    from datasets import load_dataset
    HAS_DATASETS = True
except ImportError:
    HAS_DATASETS = False
    print("[download_locomo] datasets package not installed. Run: pip install datasets")


def download_locomo(output_dir: str = None) -> Path:
    """
    Download LOCOMO dataset.

    Args:
        output_dir: Directory to save LOCOMO data. Defaults to ./data/

    Returns:
        Path to downloaded LOCOMO data directory
    """
    if output_dir is None:
        output_dir = Path(__file__).parent / "data"
    else:
        output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    if not HAS_DATASETS:
        print("[download_locomo] Please install datasets: pip install datasets")
        print("[download_locomo] Or manually download from: https://github.com/snap-research/locomo")
        return output_dir

    print("[download_locomo] Downloading LOCOMO dataset...")

    try:
        # Load from HuggingFace
        dataset = load_dataset("snap-research/locomo", trust_remote_code=True)
        print(f"[download_locomo] Dataset loaded: {dataset}")

        # Save to disk
        for split, data in dataset.items():
            split_file = output_dir / f"locomo_{split}.json"
            with open(split_file, 'w') as f:
                json.dump(data.to_dict(), f, indent=2)
            print(f"[download_locomo] Saved {split}: {len(data)} examples to {split_file}")

        # Also save dataset card/metadata
        meta_file = output_dir / "locomo_metadata.json"
        meta = {
            "source": "snap-research/locomo",
            "description": "Long Context Memory Benchmark (ACL 2024)",
            "splits": list(dataset.keys()),
            "num_examples": {split: len(data) for split, data in dataset.items()}
        }
        with open(meta_file, 'w') as f:
            json.dump(meta, f, indent=2)

        print(f"[download_locomo] Download complete. Data saved to: {output_dir}")
        return output_dir

    except Exception as e:
        print(f"[download_locomo] Error downloading: {e}")
        print("[download_locomo] Try manual download from: https://github.com/snap-research/locomo")
        return output_dir


def load_locomo_conversations(data_dir: str = None) -> list:
    """
    Load LOCOMO conversations for evaluation.

    Args:
        data_dir: Directory containing LOCOMO JSON files

    Returns:
        List of conversation dicts
    """
    if data_dir is None:
        data_dir = Path(__file__).parent / "data"
    else:
        data_dir = Path(data_dir)

    test_file = data_dir / "locomo_test.json"

    if not test_file.exists():
        print(f"[load_locomo] LOCOMO test data not found at {test_file}")
        print("[load_locomo] Run: python download_locomo.py first")
        return []

    with open(test_file) as f:
        data = json.load(f)

    return data


if __name__ == "__main__":
    download_locomo()
