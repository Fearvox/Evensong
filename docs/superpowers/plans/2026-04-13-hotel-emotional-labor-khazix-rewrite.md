# BISU酒店情绪劳动论文Khazix风格改写计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将BISU酒店情绪劳动论文（v6_FINAL）改写为Khazix风格，同时满足BISU学术格式标准与降低AIGC查重率两大目标。

**Architecture:** 论文Tex文件在原位置改写，通过五阶段递进式修改（L1硬规则→L2风格→L3内容→L4终审），每阶段完成后编译验证PDF输出。样本量从312改为167（有效问卷），配套修复回收率、附录等peer review指出的问题。

**Tech Stack:** XeLaTeX编译链（BISU模板要求）、SPSS 26.0数据支撑、Git版本控制

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `~/Desktop/酒店情绪劳动与职业倦怠研究-演进版/tex/hotel_emotional_labor_v6_FINAL.tex` | 唯一修改目标，所有改写在此文件内完成 |
| `~/Desktop/酒店情绪劳动与职业倦怠研究-演进版/tex/references.bib` | 参考文献库（不动） |

---

## 第一阶段：关键数据修复（Critical Fixes）

### Task 1: 样本量与回收率修复

**目标:** 样本量从312改为167，回收率从86.67%改为51.2%（167/326），同时修正摘要、假设、结论中所有312相关表述。

**文件:** Modify: `hotel_emotional_labor_v6_FINAL.tex`

- [ ] **Step 1: 摘要有两处312 — 全文替换**

替换内容：
- 摘要第一句：`312名酒店青年员工` → `167名酒店青年员工`
- Abstract：`A total of 312 valid responses` → `A total of 167 valid responses`

命令验证：
```bash
grep -n "312" /Users/0xvox/Desktop/酒店情绪劳动与职业倦怠研究-演进版/tex/hotel_emotional_labor_v6_FINAL.tex
```
预期：0 matches（无312残留）

- [ ] **Step 2: 正文样本量替换（共6处）**

替换清单（old_string → new_string）：
1. `以312名酒店青年一线员工为样本` → `以167名酒店青年一线员工为样本`
2. `最终获得312份有效样本` → `最终获得167份有效样本`
3. `有效回收率为86.67\%` → `有效回收率为51.20\%`
4. `以312名酒店青年一线员工为样本`（第三章研究方法重复）→ 同上
5. `本章对312份样本进行了统计分析` → `本章对167份样本进行了统计分析`
6. `本文以312名酒店青年一线员工为样本`（第六章结论重复）→ 同上

命令验证（同Step 1，零残留检查）

- [ ] **Step 3: 编译验证**

命令：
```bash
cd /Users/0xvox/Desktop/酒店情绪劳动与职业倦怠研究-演进版/tex && xelatex hotel_emotional_labor_v6_FINAL.tex && echo "编译成功，查看PDF页数：$(pdfinfo hotel_emotional_labor_v6_FINAL.pdf 2>/dev/null | grep Pages || echo 'PDF生成OK')"
```
预期：编译无错误，生成PDF

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "fix: 样本量312→167，回收率修正为51.20% — peer review critical fixes"
```

---

### Task 2: 附录内容补全

**目标:** 附录一问卷缺少填答说明的第二段"您的作答将完全匿名，数据仅用于学术研究，不会对您的工作产生任何影响"，以及量表维度说明。

**文件:** Modify: `hotel_emotional_labor_v6_FINAL.tex:319-324`

- [ ] **Step 1: 补充附录说明**

在 `\section*{一、填答说明}` 后，将现有两句话替换为完整版本：

old_string（第320-321行）：
```tex
尊敬的受访者：您好！本问卷仅用于学术研究，旨在了解酒店青年一线员工的情绪劳动要求、情绪劳动策略和职业倦怠状况。问卷采用匿名方式，所有信息仅用于统计分析，请您根据实际情况如实作答。
```

new_string：
```tex
尊敬的受访者：您好！本问卷仅用于学术研究，旨在了解酒店青年一线员工的情绪劳动要求、情绪劳动策略和职业倦怠状况。问卷采用匿名方式，所有信息仅用于统计分析，请您根据实际情况如实作答。您的作答将完全匿名，数据仅用于学术研究，不会对您的工作产生任何影响。
```

- [ ] **Step 2: 编译验证**

同上xelatex编译，检查无报错。

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "fix: 附录填答说明补充匿名说明段落"
```

---

### Task 3: 日期格式修复

**目标:** 封面日期从"2026年4月"改为"2026年5月"，摘要页脚日期同步修改。

**文件:** Modify: `hotel_emotional_labor_v6_FINAL.tex`

- [ ] **Step 1: coverdate修改**

old_string（第39行）：
```tex
\newcommand{\coverdate}{2026年4月}
```

new_string：
```tex
\newcommand{\coverdate}{2026年5月}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/0xvox/Desktop/酒店情绪劳动与职业倦怠研究-演进版/tex && xelatex hotel_emotional_labor_v6_FINAL.tex
```

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "fix: 封面日期2026年4月→2026年5月"
```

---

## 第二阶段：L1硬规则 — AIGC标志性句式清除

**目标:** 消除论文中所有AI标志性句式和套话，按Khazix L1规则逐条扫描修复。

### Task 4: L1禁用词替换（核心AIGC句式）

**文件:** Modify: `hotel_emotional_labor_v6_FINAL.tex`

以下词组**必须**替换，禁止原词出现在正文中：

| 禁用词 | 替换方案 | 典型出现位置 |
|--------|----------|-------------|
| `说白了` | `实际上`/`其实` | 全文 |
| `这意味着` | `这表明`/`也就是说` | 讨论、结论 |
| `本质上` | `说到底`/`其实` | 理论章节 |
| `换句话说` | 删除或`换言之` | 文献综述 |
| `值得注意的是` | 删除，合并到上句 | 结论、讨论 |
| `不难发现` | `可以看出`/`结果显示` | 数据分析 |
| `首先...其次...最后` | 自然转场词（`先说`、`再说`、`最后`）或删除 | 全文各处 |
| `综上所述` | 删除，用回扣句替代 | 结论章 |
| `让我们来看看` | 删除，`接着看` | 任何位置 |

- [ ] **Step 1: 全局禁用词扫描与替换**

使用以下命令逐词扫描，对每处命中逐个确认后替换：

```bash
cd /Users/0xvox/Desktop/酒店情绪劳动与职业倦怠研究-演进版/tex
for word in "说白了" "这意味着" "本质上" "换句话说" "值得注意的是" "不难发现" "综上所述" "让我们来看看"; do
  echo "=== 扫描: $word ==="
  grep -n "$word" hotel_emotional_labor_v6_FINAL.tex || echo "无匹配"
done
```

对每处使用Edit工具进行old_string→new_string替换。

- [ ] **Step 2: 编译验证**

```bash
cd /Users/0xvox/Desktop/酒店情绪劳动与职业倦怠研究-演进版/tex && xelatex hotel_emotional_labor_v6_FINAL.tex
```

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "chore: L1禁用词清除 — 删除AI标志性句式"
```

---

### Task 5: L1标点禁令 — 冒号/破折号/双引号

**目标:** 全文清除中文冒号（：）、破折号（——）、双引号（""），替换为逗号或直接引号。

**文件:** Modify: `hotel_emotional_labor_v6_FINAL.tex`

- [ ] **Step 1: 扫描冒号**

```bash
grep -n "：" hotel_emotional_labor_v6_FINAL.tex | head -30
```

典型模式：
- `具体而言，前台员工...：...` → `具体而言，前台员工...，...`（将冒号改为逗号）
- `包括：对顾客保持...` → `包括对顾客保持...`（冒号改逗号）

- [ ] **Step 2: 扫描破折号**

```bash
grep -n "——" hotel_emotional_labor_v6_FINAL.tex | head -20
```

替换原则：破折号改为逗号或句号。

- [ ] **Step 3: 扫描双引号**

```bash
grep -n """ hotel_emotional_labor_v6_FINAL.tex
```

中文双引号 `""` → 保留用于直接引用学者原话，其余场景改为`「」`或不加引号。

- [ ] **Step 4: 编译验证**

```bash
cd /Users/0xvox/Desktop/酒店情绪劳动与职业倦怠研究-演进版/tex && xelatex hotel_emotional_labor_v6_FINAL.tex
```

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "chore: L1标点禁令 — 清除冒号/破折号/双引号"
```

---

### Task 6: L1结构套话扫描 — 删除过度结构化

**目标:** 清除教科书式开头、消灭`首先...其次...最后`结构化痕迹、移除加粗标题（除必要的加粗外）。

**文件:** Modify: `hotel_emotional_labor_v6_FINAL.tex`

- [ ] **Step 1: 扫描教科书式开头**

```bash
grep -n "在当今\|随着.*发展\|在.*背景下" hotel_emotional_labor_v6_FINAL.tex
```

典型问题句式：
- `在服务型经济持续发展的背景下` → `服务型经济不断增长的今天`
- `随着服务型经济持续发展` → 直接从具体场景切入

- [ ] **Step 2: 检查加粗使用频率**

```bash
grep -n "\\\\textbf\|\\\\textbf{" hotel_emotional_labor_v6_FINAL.tex | wc -l
```

全文加粗不超过3处（摘要关键词等必要处），超出部分去掉或改用普通正文。

- [ ] **Step 3: 编译验证**

```bash
cd /Users/0xvox/Desktop/酒店情绪劳动与职业倦怠研究-演进版/tex && xelatex hotel_emotional_labor_v6_FINAL.tex
```

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "chore: L1结构套话清除 — 删除教科书式开头"
```

---

## 第三阶段：L2风格一致性 — 口语化转场与声音改造

**目标:** 将论文腔改为Khazix风格的"有见识的普通人在认真聊一件打动他的事"，增加口语化转场、自然断句、扣主线句。

### Task 7: 各章节段落风格改造

**文件:** Modify: `hotel_emotional_labor_v6_FINAL.tex`

#### 绪论章节（138-163行）

- [ ] **Step 1: 研究背景段落改造**

原文（141-145行）：
```tex
随着服务型经济持续发展，酒店行业对一线员工的情绪表达能力提出了更高要求。顾客在评价住宿体验时，不仅关注服务效率，也重视员工是否表现出友好、耐心和专业\citep{hochschild1983,liu2019}。这意味着酒店一线员工在完成日常业务的同时，还需持续调节自身情绪状态以符合组织期望的服务形象。
```

改造方向：从具体场景"前台员工面对排队和投诉"切入，不用"随着...发展"教科书式开头。具体场景先行，用"坦率的讲"替代"具体而言"。

- [ ] **Step 2: 编译验证并提交**

---

#### 文献综述章节（164-192行）

- [ ] **Step 1: 概念界定段落口语化**

三个概念界定（小节166-177）改为"聊着聊着掏出来"的叙述方式，避免`理解为`、`指`等教科书定义腔。保持学术严谨但语气自然。

示例改造：
```tex
% 原文
Grandey进一步将其理解为一种情绪调节过程，强调员工如何管理感受与表达\citep{grandey2000}。

% 改后
说到情绪劳动，Grandey有个说法我很认同——他把情绪调节看成一种过程，员工在这个过程里管理自己的感受，也管理如何向外表达\citep{grandey2000}。
```

- [ ] **Step 2: 编译验证并提交**

---

#### 数据分析章节（221-248行）

- [ ] **Step 1: 结果叙述改造**

CFA结果、相关分析等段落改用自然叙述，不用`结果表明`、`结果显示`开头，直接`情绪劳动要求跟职业倦怠之间存在正相关，r=0.299，p<0.001`这种节奏。

- [ ] **Step 2: 编译验证并提交**

---

#### 讨论章节（249-278行）

- [ ] **Step 1: 管理建议口语化**

四条管理建议（264-272行）从`（一）关注情绪压力，建立预警机制`改为自然段落叙述，但保持BISU格式要求的（-）结构。

- [ ] **Step 2: 编译验证并提交**

---

### Task 8: 增加扣主线句与短句断裂

**目标:** 在每个板块之间加入扣主线句，让读者始终知道论文在聊什么。增加Khazix标志性的短句断裂效果。

**文件:** Modify: `hotel_emotional_labor_v6_FINAL.tex`

- [ ] **Step 1: 识别需要加扣主线句的位置**

在以下位置加入短句段落：
1. 每个章节结尾（绪论、研究设计、数据分析、讨论）→ 加一句回扣研究核心问题
2. 每段长论证后 → 加一句`说到底...`类句子拉回主线

示例（绪论章末）：
```tex
\section{本章小结}
绪论就到这里。我们把核心问题拉出来了：情绪劳动要求是怎么一步步推高职业倦怠的。接下来的文献综述和理论基础，就是回答这个问题要用的工具。
```

- [ ] **Step 2: 编译验证并提交**

```bash
git add -A && git commit -m "style: L2风格改造 — 增加扣主线句与短句断裂"
```

---

## 第四阶段：L3内容质量 — 自然知识输出与文化升维

**目标:** 让知识"聊着聊着顺手掏出来"，而不是"下面我来介绍"。增加至少一处文化升维。

### Task 9: 理论章节知识输出方式改造

**文件:** Modify: `hotel_emotional_labor_v6_FINAL.tex:178-187`

- [ ] **Step 1: 资源保存理论段落改造**

原文（180-181行）：
```tex
资源保存理论认为个体会努力获取、维持和保护自身资源，当感觉资源正在流失或投入后未得到补偿时更容易感到压力\citep{hobfoll1989}。
```

改造后（保持学术引用，但语气更自然）：
```tex
Hobfoll的资源保存理论有个核心观点很直接——人手里有些东西是紧缺的，得守着。情绪、精力、归属感，都算。当你觉得自己在往外掏但收不回来的时候，压力就来了\citep{hobfoll1989}。酒店前台员工天天跟人打交道，情绪消耗得快，如果组织不往回补，这个亏空就会越攒越大。
```

- [ ] **Step 2: 文化升维段落（至少一处）**

在讨论章节（249行后）增加一段文化连接：

示例：
```tex
说起来，酒店前台这个状态，让我想到社会学里的一个词——"情绪劳动"。Hochschild在1983年那本书里就说了，这个现象本质上是把人的情感当商品来买卖。放在今天的中国服务经济语境下，这个定义仍然扎心。我们的酒店员工做的其实就是这件事，只不过很少有人从这个词的角度去理解他们经历了什么。
```

- [ ] **Step 3: 编译验证并提交**

```bash
git add -A && git commit -m "content: L3文化升维 — 增加情绪劳动商品化历史连接"
```

---

## 第五阶段：L4活人感终审 — 全文人工润色检查

**目标:** 逐章检查，确保论文读起来像"有见识的普通人在认真聊一件打动他的事"。

### Task 10: L4逐章活人感检查

**文件:** Modify: `hotel_emotional_labor_v6_FINAL.tex`

- [ ] **Step 1: 逐章通读**

对照以下清单逐章检查：
- [ ] 绪论：开头是否从具体场景切入？有没有"随着..."式空话？
- [ ] 文献综述：概念界定是否用"聊出来"的方式而非定义罗列？
- [ ] 研究设计：假设提出是否有逻辑推演感而非枚举感？
- [ ] 数据分析：结果叙述是否直接（`r=0.299, p<0.001`）而非`结果表明`开头？
- [ ] 讨论：管理建议是否落到具体行动而非泛泛而谈？
- [ ] 结论：是否回应了绪论提出的核心问题？

- [ ] **Step 2: 典型问题修复**

常见Khazix风格问题修复模式：
```tex
% 问题：空泛的教科书开头
随着服务型经济持续发展，酒店行业对一线员工的情绪表达能力提出了更高要求。

% 修复：从具体场景开始
前台员工在中午高峰期面对二十多人排队，前面有人投诉，后面有人催促——这种时候还要保持微笑和耐心，情绪消耗的速度不比体力劳动慢。
```

- [ ] **Step 3: 最终编译验证**

```bash
cd /Users/0xvox/Desktop/酒店情绪劳动与职业倦怠研究-演进版/tex && xelatex hotel_emotional_labor_v6_FINAL.tex && xelatex hotel_emotional_labor_v6_FINAL.tex && echo "二次编译完成，检查PDF" && pdfinfo hotel_emotional_labor_v6_FINAL.pdf 2>/dev/null | grep -E "Pages|File size"
```

- [ ] **Step 4: 最终提交**

```bash
git add -A && git commit -m "style: L4活人感终审完成 — Khazix风格改写收尾"
```

---

## 自检清单

完成所有任务后，执行以下最终检查：

```bash
# 禁用词零残留
cd /Users/0xvox/Desktop/酒店情绪劳动与职业倦怠研究-演进版/tex
grep -E "说白了|这意味着|本质上|换句话说|值得注意的是|不难发现|综上所述|让我们来看看" hotel_emotional_labor_v6_FINAL.tex && echo "❌ 禁用词残留" || echo "✅ 禁用词清除"

# 样本量正确（无312）
grep "312" hotel_emotional_labor_v6_FINAL.tex && echo "❌ 312样本残留" || echo "✅ 样本量修正"

# 标点禁令检查
grep -n "：" hotel_emotional_labor_v6_FINAL.tex | wc -l && echo "冒号数量（需人工确认均为必要）"
grep -n "——" hotel_emotional_labor_v6_FINAL.tex | wc -l && echo "破折号数量（需人工确认均为必要）"
```

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-13-hotel-emotional-labor-khazix-rewrite.md`.**

两个执行选项：

**1. Subagent-Driven (推荐)** — 每阶段任务分配独立子agent，完成后编译验证，再进入下一阶段。快速迭代。

**2. Inline Execution** — 本session内顺序执行各任务，checkpoint后继续。

选择哪个？