@echo off
REM Continuum — non-interactive deploy of the ingest-asset Edge Function.
REM Uses a Personal Access Token (env var SUPABASE_ACCESS_TOKEN) so no
REM browser OAuth flow is required. Token is read from .pat file in the
REM project root (gitignored).

setlocal
cd /d "%~dp0"

if not exist ".pat" (
  > deploy.log echo .pat file not found. Paste your Supabase Personal Access Token into a file named ".pat" in the project root, then re-run.
  type deploy.log
  exit /b 1
)

set /p SUPABASE_ACCESS_TOKEN=<.pat

> deploy.log 2>&1 (
  echo === %DATE% %TIME% ===
  echo === deploying ingest-asset to vboofvtfhtszsocowius ===
  call npx --yes supabase@latest functions deploy ingest-asset --project-ref vboofvtfhtszsocowius --no-verify-jwt
  echo === done ===
)

type deploy.log
