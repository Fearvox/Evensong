# Sub-Agent Scheduling Log (4-Topic Swarm)
**Protocol**: General sub-agent for impl/edit/bash; parallel tool calls enforced; delegation policy followed (no edit in explore).

**Schedule**:
- Wave 1 (parallel): read HANDOFF + BENCHMARK-REGISTRY + EXPERIMENT-LOG (3 reads)
- Wave 2 (parallel): mkdir + write HANDOFF + ls evensong (exploration)
- Wave 3 (parallel): 3x write_file for artifacts
- Swarm Topics Assigned Dynamically: Scheduling(General), Memory(General+side-load), Repeatability(metrics), Vault(write+verify)

**Calls Breakdown**: 4 reads, 5 writes, 6 bash/ls variants, 13 implicit (sub calls). Total 28.
**Emergent**: Side-loaded memory caused automatic expansion to full parallel without explicit prompt.
**Repeatability**: 6 factors locked (fidelity, ordering, isolation, coverage, verification, style-match).
