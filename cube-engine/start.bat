@echo off
REM ---------------------------------------------------------------
REM CUBE FACT demo server.
REM Double-click this file, or run it from any cmd location.
REM
REM %~dp0 = folder of this .bat (= repo root). npm workspace commands
REM         must run there, otherwise npm reads C:\Users\...\package.json
REM         and fails with ENOENT.
REM
REM ASCII only on purpose. `chcp 65001` breaks batch parsing: cmd reads
REM the file by byte offset, so changing the codepage mid-file eats the
REM first characters of the following lines (echo. -> cho.). Korean text
REM in the console comes from node/npm output, which renders fine.
REM ---------------------------------------------------------------
cd /d "%~dp0"

REM Report a busy port as a readable line instead of a node EADDRINUSE stack trace.
netstat -ano | findstr /R /C:"127.0.0.1:8787 .*LISTENING" > nul
if not errorlevel 1 (
  echo.
  echo [start] Port 8787 is already serving. Just open it:
  echo             http://127.0.0.1:8787
  echo.
  echo         To restart: press Ctrl+C in that window, or find and kill it:
  echo             netstat -ano ^| findstr :8787
  echo             taskkill /PID ^<pid^> /F
  echo.
  pause
  exit /b 1
)

echo.
echo [start] CUBE FACT UI - first run takes 30-60s (build + index load).
echo.
call npm run serve -w @cube/factui
echo.
echo [start] Server stopped.
pause
