@echo off
echo ========================================================
echo               MEDICYCLE PLATFORM LAUNCHER
echo   AI-Powered Essential Medicine Supply Optimization
echo ========================================================
echo.

echo [1/2] Starting Backend FastAPI Server on http://127.0.0.1:8000 ...
start "MEDICYCLE Backend" cmd /k "python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload"

timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend Vite Server on http://127.0.0.1:5175 ...
cd frontend
start "MEDICYCLE Frontend" cmd /k "npm run dev"

echo.
echo ========================================================
echo   MEDICYCLE is now running!
echo   Open your browser at: http://127.0.0.1:5175
echo ========================================================
