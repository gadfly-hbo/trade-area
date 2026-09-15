#!/bin/bash
# 双击启动「商圈对比分析」页面
# 逻辑：已在运行 → 直接开浏览器；否则装依赖(如需) → 生成数据(如需) → 启动服务 → 自动打开浏览器

cd "$(dirname "$0")" || exit 1

PORT=5199
URL="http://localhost:$PORT/"
LOG=/tmp/trade-area-dev.log

pause_and_exit() {
  read -n 1 -s -r -p "按任意键关闭窗口…"
  exit 1
}

# 1) 已在运行 → 直接打开浏览器
if curl -s -o /dev/null --max-time 1 "$URL"; then
  echo "✅ 服务已在运行，正在打开浏览器…"
  open "$URL"
  sleep 1
  exit 0
fi

# 2) 端口被其他程序占用
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "⚠️  端口 $PORT 被其他程序占用，无法启动。"
  echo "    可双击「停止商圈分析.command」释放端口后重试。"
  pause_and_exit
fi

# 3) 首次运行：安装依赖
if [ ! -d node_modules ]; then
  echo "📦 首次运行，正在安装依赖（约 1-2 分钟）…"
  npm install --no-fund --no-audit || { echo "❌ 依赖安装失败"; pause_and_exit; }
fi

# 4) 数据未生成：运行 ETL
if [ ! -f public/data/index.json ]; then
  echo "📊 正在生成商圈数据…"
  npm run etl || { echo "❌ 数据生成失败（data/raw/ 下需要有商圈 xlsx 文件）"; pause_and_exit; }
fi

# 5) 后台启动服务，等待就绪
echo "🚀 正在启动服务…"
nohup npm run dev -- --port "$PORT" --strictPort > "$LOG" 2>&1 &
disown

for _ in $(seq 1 40); do
  if curl -s -o /dev/null --max-time 1 "$URL"; then
    echo "✅ 启动成功，正在打开浏览器：$URL"
    echo "   （关闭此窗口不影响服务；停止服务请双击「停止商圈分析.command」）"
    open "$URL"
    sleep 1
    exit 0
  fi
  sleep 0.5
done

echo "❌ 启动超时，日志：$LOG"
pause_and_exit
