@echo off
REM Budget Mantra - Windows Local Setup Script
REM Run this script after cloning the repository

echo.
echo ========================================
echo   Budget Mantra - Local Setup (Windows)
echo ========================================
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [X] Node.js is not installed
    echo     Download from: https://nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js found

REM Check Python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [X] Python is not installed
    echo     Download from: https://python.org
    pause
    exit /b 1
)
echo [OK] Python found

REM Check Yarn
where yarn >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [X] Yarn is not installed
    echo     Install with: npm install -g yarn
    pause
    exit /b 1
)
echo [OK] Yarn found

echo.
echo Setting up Backend...
echo ----------------------

cd backend

REM Create virtual environment
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing Python dependencies...
pip install -r requirements.txt --quiet

REM Install emergentintegrations
echo Installing AI integration library...
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ --quiet 2>nul

REM Create .env if needed
if not exist ".env" (
    echo Creating backend .env file...
    copy .env.example .env >nul
    echo [!] Please edit backend\.env with your settings
)

cd ..

echo.
echo Setting up Frontend...
echo ----------------------

cd frontend

REM Install dependencies
echo Installing Node dependencies...
call yarn install --silent

REM Create .env if needed
if not exist ".env" (
    echo Creating frontend .env file...
    copy .env.example .env >nul
)

cd ..

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Next Steps:
echo.
echo 1. Start MongoDB:
echo    - Run MongoDB service or use MongoDB Atlas
echo.
echo 2. Edit environment files:
echo    - backend\.env  (MongoDB URL, JWT secret)
echo    - frontend\.env (Backend URL)
echo.
echo 3. Start Backend (Terminal 1):
echo    cd backend
echo    venv\Scripts\activate
echo    uvicorn server:app --reload --port 8001
echo.
echo 4. Start Frontend (Terminal 2):
echo    cd frontend
echo    yarn start
echo.
echo 5. Open http://localhost:3000
echo.
pause
