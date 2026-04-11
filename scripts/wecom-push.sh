#!/usr/bin/env bash
# wecom-push.sh — 企业微信应用消息推送脚本
# 用途：从 EverOS 读取最新记忆摘要，推送到家人的个人微信
#
# 使用方式：
#   ./wecom-push.sh                    # 推送最新 EverOS 记忆摘要
#   ./wecom-push.sh "自定义消息内容"     # 推送自定义消息
#   ./wecom-push.sh --test             # 发送测试消息
#
# 环境变量（必须配置）：
#   WECOM_CORPID      — 企业微信企业 ID（管理后台 → 我的企业 → 企业信息）
#   WECOM_SECRET      — 自建应用的 Secret（应用管理 → 自建 → 你的应用）
#   WECOM_AGENTID     — 自建应用的 AgentID
#   EVERMEM_API_KEY   — EverOS API key（DASH-WECOM 专属 key）
#
# 可选环境变量：
#   WECOM_TOUSER      — 接收者 UserID，默认 @all（发给所有企业成员）
#   EVERMEM_USER_ID   — EverOS 用户标识，默认 dash-wecom

set -euo pipefail

# ─── 配置 ───────────────────────────────────────
WECOM_CORPID="${WECOM_CORPID:?错误：未设置 WECOM_CORPID}"
WECOM_SECRET="${WECOM_SECRET:?错误：未设置 WECOM_SECRET}"
WECOM_AGENTID="${WECOM_AGENTID:?错误：未设置 WECOM_AGENTID}"
EVERMEM_API_KEY="${EVERMEM_API_KEY:?错误：未设置 EVERMEM_API_KEY}"

WECOM_TOUSER="${WECOM_TOUSER:-@all}"
EVERMEM_USER_ID="${EVERMEM_USER_ID:-dash-wecom}"
EVERMEM_API_URL="${EVERMEM_API_URL:-https://api.evermind.ai}"

# ─── 获取企业微信 access_token ──────────────────
get_token() {
  local resp
  resp=$(curl -s "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECOM_CORPID}&corpsecret=${WECOM_SECRET}")
  local token
  token=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

  if [ -z "$token" ]; then
    echo "错误：获取 access_token 失败" >&2
    echo "$resp" >&2
    exit 1
  fi
  echo "$token"
}

# ─── 发送企业微信消息 ───────────────────────────
send_wecom() {
  local token="$1"
  local content="$2"

  local payload
  payload=$(python3 -c "
import json
print(json.dumps({
    'touser': '${WECOM_TOUSER}',
    'msgtype': 'text',
    'agentid': ${WECOM_AGENTID},
    'text': {'content': '''${content}'''}
}, ensure_ascii=False))
")

  local resp
  resp=$(curl -s -X POST \
    "https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}" \
    -H "Content-Type: application/json" \
    -d "$payload")

  local errcode
  errcode=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('errcode',1))" 2>/dev/null)

  if [ "$errcode" = "0" ]; then
    echo "✓ 消息已推送"
  else
    echo "✗ 推送失败: $resp" >&2
    exit 1
  fi
}

# ─── 从 EverOS 读取最新记忆 ─────────────────────
fetch_latest_memories() {
  local query="${1:-最近的工作进展}"
  local limit="${2:-5}"

  local search_body
  search_body=$(python3 -c "
import json
print(json.dumps({
    'query': '${query}',
    'user_id': '${EVERMEM_USER_ID}',
    'limit': ${limit}
}, ensure_ascii=False))
")

  local resp
  resp=$(curl -s -X GET \
    "${EVERMEM_API_URL}/api/v0/memories/search" \
    -H "Authorization: Bearer ${EVERMEM_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$search_body")

  # 提取记忆内容，格式化为摘要
  python3 -c "
import json, sys
try:
    data = json.loads('''${resp}''')
    memories = data.get('results', data.get('memories', []))
    if not memories:
        print('暂无最新记忆')
        sys.exit(0)

    lines = []
    for i, m in enumerate(memories[:${limit}], 1):
        content = m.get('memory', m.get('content', ''))
        # 截取前 200 字
        if len(content) > 200:
            content = content[:200] + '...'
        lines.append(f'{i}. {content}')

    print('\n'.join(lines))
except Exception as e:
    print(f'解析记忆失败: {e}', file=sys.stderr)
    print('无法读取记忆')
" 2>/dev/null
}

# ─── 主逻辑 ─────────────────────────────────────
main() {
  local message=""

  case "${1:-}" in
    --test)
      message="🔔 DASH-WECOM 推送测试\n\n这是一条测试消息，说明企业微信推送通道已打通。\n\n发送时间：$(date '+%Y-%m-%d %H:%M:%S')"
      ;;
    --memory)
      # 从 EverOS 拉取最新记忆并推送
      local query="${2:-最近的工作进展和 benchmark 结果}"
      echo "正在从 EverOS 读取记忆..."
      local memories
      memories=$(fetch_latest_memories "$query" 5)
      message="📋 DASH 工作记忆同步\n\n${memories}\n\n── $(date '+%m-%d %H:%M')"
      ;;
    "")
      # 无参数 = 拉取默认记忆
      echo "正在从 EverOS 读取最新记忆..."
      local memories
      memories=$(fetch_latest_memories "最近完成的任务和重要发现" 3)
      message="📋 DASH 进展速报\n\n${memories}\n\n── $(date '+%m-%d %H:%M')"
      ;;
    *)
      # 自定义消息
      message="$*"
      ;;
  esac

  echo "正在获取企业微信 token..."
  local token
  token=$(get_token)

  echo "正在推送消息..."
  send_wecom "$token" "$message"
}

main "$@"
