@echo off
copy "%USERPROFILE%\Downloads\skull.zip" "%USERPROFILE%\OneDrive\Desktop\continuum UI\public\skull.zip" > "%~dp0\copy-bmw.log" 2>&1
dir "%USERPROFILE%\OneDrive\Desktop\continuum UI\public\skull.zip" >> "%~dp0\copy-bmw.log" 2>&1
