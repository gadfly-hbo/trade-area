#!/bin/bash
# 双击停止「商圈对比分析」服务（释放 5199 端口）

PORT=5199
PIDS=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null)

if [ -z "$PIDS" ]; then
  echo "ℹ️  服务当前没有在运行。"
else
  echo "🛑 正在停止服务（PID: $PIDS）…"
  kill $PIDS
  sleep 1
  if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    kill -9 $PIDS 2>/dev/null
  fi
  echo "✅ 已停止。"
fi

read -n 1 -s -r -p "按任意键关闭窗口…"
