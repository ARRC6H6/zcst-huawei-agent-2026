#!/usr/bin/env sh
# 实验助手 · 局域网互传 一键启动（Linux / macOS）
cd "$(dirname "$0")" || exit 1

if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "未找到 Python 3，请先安装：https://www.python.org/downloads/"
  exit 1
fi

echo
echo "正在启动「实验助手 · 局域网互传」服务端（零依赖，按 Ctrl+C 停止）..."
echo
exec "$PY" lan-server.py "$@"
