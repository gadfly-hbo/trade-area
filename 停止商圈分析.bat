@echo off
rem 双击停止「商圈对比分析」服务（释放 5199 端口，Windows 版）
cd /d "%~dp0"
set PORT=5199
set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano 2^>NUL ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  set FOUND=1
  echo [..] 正在停止服务（PID: %%a）…
  taskkill /F /PID %%a >NUL 2>&1
)
if "%FOUND%"=="0" (
  echo [i] 服务当前没有在运行。
) else (
  echo [OK] 已停止。
)
pause
