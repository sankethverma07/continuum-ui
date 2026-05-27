@echo off
REM Continuum UI publish — step 1, local only (no auth required).
REM Initializes git, commits everything, runs a production build.
REM Writes publish.log AND echoes to the window.

setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Continuum UI publish - step 1 (local)

set LOG=publish.log
echo Continuum UI publish step 1 start  %date% %time%>%LOG%

echo ======================================================
echo  Continuum UI publish - step 1 (local, no auth)
echo  Project: %CD%
echo  Log:     %CD%\%LOG%
echo ======================================================
echo.

REM ---- check git is available ----------------------------------------
git --version >>%LOG% 2>&1
if errorlevel 1 (
    echo [git] git not found on PATH. Install Git for Windows from https://git-scm.com/download/win
    echo [git] git not found>>%LOG%
    pause
    exit /b 1
)

REM ---- ensure .gitignore covers logs ---------------------------------
findstr /C:"dev-server.log" .gitignore >nul 2>&1
if errorlevel 1 (
    echo dev-server.log>>.gitignore
    echo publish.log>>.gitignore
    echo dist>>.gitignore 2>nul
    echo [setup] added logs to .gitignore
)

REM ---- git init if missing -------------------------------------------
if not exist .git (
    echo [git] initializing repo...
    git init -b main >>%LOG% 2>&1
    git config user.email "continuum@local" >>%LOG% 2>&1
    git config user.name "Sanketh Verma" >>%LOG% 2>&1
) else (
    echo [git] repo already initialized
)

REM Make sure main is the branch name.
git branch -M main >>%LOG% 2>&1

REM ---- stage everything that's not gitignored ------------------------
echo [git] staging files (git add .)
git add . >>%LOG% 2>&1

REM ---- commit --------------------------------------------------------
echo [git] committing...
git commit -m "Continuum UI v2.0 - public release" >>%LOG% 2>&1
if errorlevel 1 (
    echo [git] commit failed or nothing new to commit
    git log --oneline -1 2>nul
) else (
    echo [git] committed.
    git log --oneline -1
)

REM ---- production build ----------------------------------------------
echo.
echo [build] running production build (npm run build)...
call npm run build >>%LOG% 2>&1
if errorlevel 1 (
    echo [build] FAILED - see %LOG% for output
    type %LOG% | findstr /R /C:"error" /C:"FAIL"
    pause
    exit /b 1
)

echo.
echo ======================================================
echo  Step 1 complete.
echo ======================================================
echo.
echo  Repo:
git log --oneline -1
echo.
echo  Dist contents:
dir /b dist 2>nul
echo.
echo  Next - run publish-step2-deploy.bat after this.
echo.
pause
endlocal
