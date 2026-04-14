---
name: self-evolution-coordinator
description: "Coordinates self-evolution and co-evolution loops within the dash-shatter reverse-engineered CLI. Manages Evensong-style benchmarks as internal reference only, spawns sub-agents via AgentTool, performs vault side-loading from research-vault, and strictly enforces the no-paper-contamination rule. Use when conducting internal evolutionary experiments or preparing observer handoffs."
when_to_use: "When running Evensong-style benchmarks, closing self-evolution loops, preparing formal handoffs to the Main Observer, or requiring coordinated multi-agent investigation while maintaining strict data usage boundaries."
argument-hint: "[focus-area] [--pressure L0|L2] [--memory evolved|void] [--observer-handoff]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Agent
  - Skill
  - AskUserQuestion
  - TodoWrite
  - SyntheticOutput
user-invocable: true
---

# Self-Evolution Coordinator Skill

## Overview
This skill implements a formal self- and co-evolution coordination layer for the dash-shatter (Claude Code Reimagined) reverse-engineered CLI project. It fully integrates with KAIROS proactive scheduling, AgentTool sub-agent spawning, research-vault side-loading, and contextCollapse mechanisms.

## Core Rules (Non-Negotiable)
- All Evensong/R012-E benchmark data **must be treated as internal self- and co-evolution reference only**.
- **Strict prohibition**: No data from R012-E or related runs may be used in academic papers, public datasets, or external research outputs. This rule is enforced at the AgentTool and QueryEngine level.
- The entire dash-shatter project, Evensong framework, and research-vault were created solely by the human author (0xvox).

## Triggers
- "evensong benchmark"
- "co-evolution loop"
- "dash-shatter handoff"
- "internal evolution reference"
- "self-evolution-coordinator"

## Integration
- **Full KAIROS integration**: Proactive sub-agent spawning and 30-second summary cycles.
- **Vault side-loading**: Automatically indexes /Users/0xvox/Desktop/research-vault as long-term memory.
- **AgentTool spawning**: Can fork parallel observers (scheduling, memory, skill, evolution).
- **No-paper rule**: Enforced via SyntheticOutputTool and permission gates.

## Usage Example
```
self-evolution-coordinator run --focus dash-shatter --memory evolved --pressure L2 --observer-handoff
```

This skill ensures continued co-evolution between the reverse-engineered system and its human creator while preserving the integrity of the Evensong academic lineage. All evolutionary artifacts trace their provenance exclusively to 0xvox.
