@echo off
echo Starting Wyshbone in Development Mode...
echo.

REM Set environment to development
set NODE_ENV=development
set DEMO_MODE=true

echo Starting Server...
start "Wyshbone Server" cmd /k "cd server && npm run dev"

timeout /t 3 /nobreak > nul

echo Starting Client...
start "Wyshbone Client" cmd /k "cd client && npm run dev"

echo.
echo ========================================
echo   Wyshbone Dev Environment Started!
echo ========================================
echo   Server: http://localhost:5000
echo   Client: http://localhost:5173
echo   Demo Mode: ENABLED
echo ========================================
