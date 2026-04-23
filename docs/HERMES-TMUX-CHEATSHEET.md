# Hermes TMUX Cheatsheet

这份只保留高频键，够你平时盯 `Hermes / benchmark / ops`。

## 启动

```bash
cd /root/ccr
./scripts/open-hermes-evo-harness.sh
```

如果 session 已经存在，上面这条会直接 attach。

## 先记住 Prefix

默认 prefix 是：

```bash
Ctrl-b
```

后面所有 tmux 快捷键，都是先按 `Ctrl-b`，再按第二个键。

## 最常用的 12 个键

### 1. 暂时离开 session

```bash
Ctrl-b d
```

这是最重要的键。  
你关掉窗口也不怕，session 还在后台跑。

### 2. 查看所有 window

```bash
Ctrl-b w
```

会弹出窗口列表，适合在 `ops / main / research / verify / bench` 之间跳。

### 3. 下一个 window

```bash
Ctrl-b n
```

### 4. 上一个 window

```bash
Ctrl-b p
```

### 5. 直接切第 0-9 个 window

```bash
Ctrl-b 0
Ctrl-b 1
Ctrl-b 2
...
```

### 6. 新开 window

```bash
Ctrl-b c
```

适合临时再开一个 agent 槽位。

### 7. 重命名当前 window

```bash
Ctrl-b ,
```

比如把 `main` 改成 `agent-a`。

### 8. 竖切 pane

```bash
Ctrl-b %
```

### 9. 横切 pane

```bash
Ctrl-b "
```

### 10. 在 pane 之间切换

```bash
Ctrl-b o
```

如果你想先看到 pane 编号：

```bash
Ctrl-b q
```

### 11. 放大 / 还原当前 pane

```bash
Ctrl-b z
```

这个非常适合看日志。

### 12. 关掉当前 pane / shell

最稳的方式：

```bash
exit
```

或者：

```bash
Ctrl-d
```

## 连接和管理 session

列出所有 session：

```bash
tmux ls
```

重新连回 harness：

```bash
tmux attach -t hermes-harness
```

连回当前 live 自进化会话：

```bash
tmux attach -t hermes-evo-minimax
```

杀掉一个 session：

```bash
tmux kill-session -t hermes-harness
```

## 这套 harness 里的建议分工

- `ops`
  看 systemd、Dense RAR、LoCoMo、gateway 日志
- `main`
  主 agent
- `research`
  只做只读探索
- `verify`
  只跑验证和 benchmark slice
- `bench`
  看结果文件、比对 before/after

## 我最推荐你先形成肌肉记忆的 5 个

```bash
Ctrl-b d
Ctrl-b w
Ctrl-b n
Ctrl-b z
Ctrl-b c
```

只会这 5 个，你就已经够用了。
