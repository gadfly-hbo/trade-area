#!/bin/bash
# 双击打包「商圈对比分析」分发包：在桌面生成可直接发送的 zip
# 用 Python zipfile 打包（中文文件名带 UTF-8 标志，Windows 解压不乱码；保留可执行权限）
cd "$(dirname "$0")" || exit 1
export LANG=zh_CN.UTF-8

OUT="$HOME/Desktop/trade-area-分发包-$(date +%Y%m%d).zip"
rm -f "$OUT"

echo "📦 正在打包（不含依赖与构建产物，收方首次启动会自动安装）…"
python3 - "$OUT" <<'PYEOF'
import os, sys, zipfile
out = sys.argv[1]
EXCLUDE_DIRS = {'node_modules', 'dist', '.git', '_audit'}
EXCLUDE_FILES = {'.DS_Store'}
n = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and d != '.git']
        dirs[:] = [d for d in dirs if not (os.path.join(root, d).lstrip('./').startswith('reports/_audit'))]
        for f in files:
            if f in EXCLUDE_FILES or f.endswith('.zip'):
                continue
            p = os.path.join(root, f)
            if '_audit' in p:
                continue
            arc = os.path.relpath(p, '.')
            zi = zipfile.ZipInfo(arc, date_time=__import__('time').localtime(os.path.getmtime(p))[:6])
            zi.external_attr = (os.stat(p).st_mode & 0o777) << 16
            zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, open(p, 'rb').read())
            n += 1
print(f'  共打包 {n} 个文件')
PYEOF

SIZE=$(du -h "$OUT" | cut -f1 | tr -d ' ')
echo "✅ 打包完成（共 $SIZE）："
echo "   位置：桌面（Desktop），文件名 trade-area-分发包-$(date +%Y%m%d).zip"
echo "   已在访达中帮你定位选中，直接拖到微信/邮件发送即可。"
echo "   收方使用说明见包内「分发说明.md」。"
open -R "$OUT"
read -n 1 -s -r -p "按任意键关闭窗口…"
