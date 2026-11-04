@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请先安装 Node.js 20 或更高版本后重试：https://nodejs.org/
  pause
  exit /b 1
)

rem 版本门槛与 npm run desktop 的要求一致（>= 20）；用 parseInt 取主版本号比较。
node -e "process.exit(parseInt(process.versions.node, 10) >= 20 ? 0 : 1)"
if errorlevel 1 (
  for /f "delims=" %%v in ('node --version 2^>nul') do echo 需要 Node.js 20 或更高版本，当前为 %%v。
  echo 请升级 Node.js 后重试：https://nodejs.org/
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
