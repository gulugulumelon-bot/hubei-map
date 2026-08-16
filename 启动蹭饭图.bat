@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)
echo 正在启动蹭饭图（平面版），浏览器将自动打开 http://127.0.0.1:8000 ...
start "" /b cmd /c "timeout /t 1 >nul & start http://127.0.0.1:8000"
node server.js
pause
