@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 需要 Node.js 20 或更高版本，请先安装后重试：https://nodejs.org/
  pause
  exit /b 1
)

if not exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  if not exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    if not exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
      echo 未找到 Microsoft Edge，请先安装 Edge 后重试。
      pause
      exit /b 1
    )
  )
)

echo 正在启动 MoneyBrain（首次启动会自动构建并初始化数据库，请稍候）...
call npm run desktop:open
if errorlevel 1 (
  echo.
  echo 启动失败。请查看上方日志；依赖安装可先执行 npm install。
  pause
)
endlocal
