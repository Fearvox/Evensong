# Session Handoff — 2026-04-10 R012 GPT-5.4 Benchmark

## 本 Session 已完成

### 研究提案（核心交付）
- `docs/evensong-research-proposal.tex` — 英文版, 17 页, xelatex 零错误
- `docs/evensong-research-proposal-zh.tex` — 中文版, 15 页, xelatex 零错误
- DASH SHATTER 配色 (#35584C 深绿 + #F0EE9B 霓虹黄)
- PreTeXt containment (`adjustbox` + `\linewidth`)
- 5 个 UI 对比度 bug 修复
- Finding 5: Grok R006 跨模型压力响应差异（双语录入）

### 已发送邮件
- **收件人:** necati.tereyagoglu@moore.sc.edu (USC Moore School)
- **主题:** AI Agent Memory & Benchmark Research — Introduction via Xander Wynn
- **附件:** evensong-research-proposal.pdf (176.6 KB)
- **通过:** hengyuan@email.sc.edu (学校 Outlook)

### EverMind 申请
- 中文提案已发给 Code cyf (EverMind 社区)

---

## 待做：R012 GPT-5.4 Benchmark

### 准备就绪的文件
- **Prompt:** `benchmarks/runs/R012-or-gpt5/prompt.md`
- **Result placeholder:** `benchmarks/runs/R012-or-gpt5/result.json` (待填)

### 执行方式：手动 REPL（和 Grok R006 一致）

**步骤:**

1. 开新 terminal tab
2. 设置环境变量:
```bash
export ANTHROPIC_BASE_URL=https://openrouter.ai/api
export ANTHROPIC_API_KEY=$OPENROUTER_API_KEY
export ANTHROPIC_MODEL=openai/gpt-5.4
```
3. 启动 DASH SHATTER:
```bash
dash-shatter
```
4. 粘贴 `benchmarks/runs/R012-or-gpt5/prompt.md` 的全部内容
5. 观察 + 截图（存到 `benchmarks/runs/R012-or-gpt5/screenshots/`）
6. 运行结束后填写 `result.json`
7. 收集 transcript

### 观察重点（和 Grok R006 对齐）
- [ ] GPT 是否问确认问题？（Grok 违反了 4+ 次）
- [ ] GPT 是否使用 subagent？用了哪个模型？（Grok 用了 3 个 Claude Sonnet）
- [ ] GPT 自报测试数 vs 实际测试数（Grok 膨胀 83%）
- [ ] 完成时间
- [ ] 自省/反思行为？
- [ ] 有无 reward hacking 迹象？

### 8 模型完成状态
| Model | Status | Next |
|-------|--------|------|
| Claude Opus 4.6 | ✅ 6 runs | — |
| Grok 4.20 | ✅ 1 run | — |
| **GPT-5.4** | **→ R012 NOW** | — |
| Gemini 3.1 Pro | ❌ | R013 |
| GLM-5.1 | ❌ | R014 |
| Qwen3 Coder+ | ❌ | R015 |
| DeepSeek R1 | ❌ | R016 |
| Kimi K2.5 | ❌ | R017 |

---

## Git 状态
- 当前分支: main
- 未 commit 的新文件: evensong-research-proposal*.tex/pdf, R012 准备文件
- 建议: commit 后再开始 benchmark
