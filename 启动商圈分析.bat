@echo off
rem 双击启动「商圈对比分析」页面（Windows 版：逻辑与 mac 版 .command 一致）
rem 流程：已在运行 → 直接开浏览器；否则检查 Node → 装依赖(如需) → 生成数据(如需) → 启动服务 → 打开浏览器
cd /d "%~dp0"
set PORT=5199
set URL=http://127.0.0.1:%PORT%/

rem 1) 已在运行 → 直接打开浏览器
curl -s -o NUL --max-time 1 "%URL%" >NUL 2>&1
if not errorlevel 1 (
  echo [OK] 服务已在运行，正在打开浏览器…
  start "" "%URL%"
  timeout /t 1 /nobreak >NUL
  exit /b 0
)

rem 2) 端口被其他程序占用
netstat -ano 2>NUL | findstr ":%PORT%" | findstr "LISTENING" >NUL 2>&1
if not errorlevel 1 (
  echo [!] 端口 %PORT% 被其他程序占用，无法启动。
  echo     可双击「停止商圈分析.bat」释放端口后重试。
  pause
  exit /b 1
)

rem 3) Node 环境检查
where node >NUL 2>&1
if errorlevel 1 (
  echo [X] 未检测到 Node.js，请先安装（需 20 或更高版本）:
  echo     https://nodejs.org/zh-cn 下载 LTS 版安装后，重新双击本脚本。
  pause
  exit /b 1
)

rem 4) 首次运行：安装依赖
if not exist node_modules (
  echo [..] 首次运行，正在安装依赖（约 1-2 分钟）…
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo [X] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

rem 5) 数据未生成 → 运行 ETL；已生成则检测 data/raw 是否比产物新
if not exist "public\data\index.json" (
  echo [..] 正在生成商圈数据（ETL）…
  call npm run etl
  if errorlevel 1 (
    echo [X] 数据生成失败（data/raw 下需要有商圈 md 文件）。
    pause
    exit /b 1
  )
) else (
  powershell -NoProfile -Command "try { $n=(Get-ChildItem 'data\raw' -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime; if ($n -and (Get-Item 'public\data\index.json').LastWriteTime -lt $n) { exit 1 } else { exit 0 } } catch { exit 0 }" >NUL 2>&1
  if errorlevel 1 (
    echo [..] 检测到源数据更新，正在重新生成（ETL）…
    call npm run etl
    if errorlevel 1 (
      echo [X] 数据生成失败。
      pause
      exit /b 1
    )
  )
)

rem 6) 独立最小化窗口启动服务（关掉本窗口不影响；停止用 停止商圈分析.bat）
echo [..] 正在启动服务…
start "trade-area-dev" /MIN cmd /c "npm run dev -- --port %PORT% --strictPort"

rem 7) 等待就绪（最多约 40 秒）
set /a tries=0
:waitloop
curl -s -o NUL --max-time 1 "%URL%" >NUL 2>&1
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% geq 40 (
  echo [X] 启动超时。可查看最小化窗口中的报错信息。
  pause
  exit /b 1
)
timeout /t 1 /nobreak >NUL
goto waitloop

:ready
echo [OK] 启动成功，正在打开浏览器：%URL%
echo      （服务在独立窗口中运行，最小化即可；停止请双击「停止商圈分析.bat」）
start "" "%URL%"
timeout /t 2 /nobreak >NUL
exit /b 0
