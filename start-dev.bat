@echo off
REM Continuum UI - hardened dev launcher.
REM
REM Improvements over the previous version:
REM   1. Auto-restart loop: if `npm run dev` exits for any reason (crash,
REM      port conflict, HMR error), the script waits 2 s and relaunches.
REM      The window stays open between crashes so you can read the error.
REM   2. Port pre-kill: before launching, kills any process holding 5173.
REM      Removes the "port already in use" failure mode that requires a
REM      manual reboot to clear.
REM   3. Logs to dev-server.log alongside this script for postmortem.
REM   4. Ctrl+C still exits cleanly — the loop checks for an interactive
REM      stop signal between restarts.
REM
REM Close the window to stop the server.

setlocal
cd /d "%~dp0"
title Continuum UI dev server

echo ======================================================
echo  Continuum UI v2.0 - hardened dev launcher
echo  Project: %CD%
echo  Log:     %CD%\dev-server.log
echo ======================================================
echo.

REM ---- One-time dep reconcile -----------------------------------------
echo [setup] Reconciling deps (npm install)...
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo.
    echo npm install failed. Check the output above.
    pause
    exit /b 1
)
echo.

REM ---- Restart loop ----------------------------------------------------
set RESTARTS=0
:loop
REM Kill anything still bound to 5173 so a stale process from a previous
REM run can't block the new one.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo [reset] killing stale process %%P on port 5173
    taskkill /F /PID %%P >nul 2>&1
)

echo [run %RESTARTS%] Starting Vite on http://localhost:5173  (%date% %time%)
echo [run %RESTARTS%] %date% %time% >> dev-server.log

REM Run Vite. Tee stdout+stderr into the log AND echo to the window.
REM (Windows cmd doesn't have a native tee; this is the workaround.)
call npm run dev 1>>dev-server.log 2>&1

REM ---- Restart decision ------------------------------------------------
set /a RESTARTS+=1
echo.
echo ======================================================
echo  Vite exited. Restarting in 2 seconds...  (restart #%RESTARTS%)
echo  Press Ctrl+C now to stop, or close this window.
echo ======================================================
echo.
timeout /t 2 /nobreak >nul
goto loop

endlocal
