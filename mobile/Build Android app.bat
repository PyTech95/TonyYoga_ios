@echo off
rem Double-click to build the signed TonYoga Android app bundle (.aab) for Google Play.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-android.ps1"
if errorlevel 1 pause
