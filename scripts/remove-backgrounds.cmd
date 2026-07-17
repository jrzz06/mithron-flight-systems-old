@echo off
REM Background Removal Script Launcher for Windows
REM Usage: remove-backgrounds.cmd

setlocal enabledelayedexpansion

echo.
echo ======================================
echo  Background Removal Script Launcher
echo ======================================
echo.
echo Choose method:
echo.
echo 1. Python (rembg) - RECOMMENDED - Best Quality
echo 2. Node.js (remove.bg API) - Requires API Key
echo 3. View Documentation
echo 4. Exit
echo.

set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" goto python_method
if "%choice%"=="2" goto nodejs_method
if "%choice%"=="3" goto view_docs
if "%choice%"=="4" exit /b 0

echo Invalid choice. Please try again.
timeout /t 2 /nobreak
cls
goto start

:python_method
echo.
echo Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

echo Installing required packages...
pip install --upgrade rembg pillow

if errorlevel 1 (
    echo ERROR: Failed to install packages. Check your Python installation.
    pause
    exit /b 1
)

echo.
echo Running background removal...
python scripts\remove-backgrounds.py

if errorlevel 1 (
    echo ERROR: Background removal failed.
    pause
    exit /b 1
)

echo.
echo SUCCESS! Images processed.
echo Next steps:
echo  1. Verify results: npm run dev
echo  2. Upload to Supabase: remove-backgrounds-upload.cmd
pause
exit /b 0

:nodejs_method
echo.
echo REMOVE_BG_API_KEY not set or invalid.
echo.
echo To use remove.bg API:
echo  1. Sign up at: https://www.remove.bg
echo  2. Get your API key
echo  3. Run: set REMOVE_BG_API_KEY=your-key-here
echo  4. Run: npm run assets:remove-backgrounds
echo.
pause
exit /b 0

:view_docs
echo.
start /wait scripts\BACKGROUND_REMOVAL_GUIDE.md
goto start

endlocal
