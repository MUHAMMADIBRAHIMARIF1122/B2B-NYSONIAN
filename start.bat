@echo off
echo.
echo  ========================================
echo   B2B Finance — Starting up
echo  ========================================
echo.

:: ── Kill stale process on port 3001 ──────────────────────────────────────────
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo  Killing stale process on port 3001 ^(PID %%a^)...
    taskkill /F /PID %%a >nul 2>&1
)

:: ── Kill stale process on port 5173 ──────────────────────────────────────────
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo  Killing stale process on port 5173 ^(PID %%a^)...
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── Install backend deps if missing ──────────────────────────────────────────
if not exist "%~dp0backend\node_modules" (
    echo  Installing backend dependencies...
    cd /d "%~dp0backend"
    npm install
    echo  Done.
    echo.
)

:: ── Install frontend deps if missing ─────────────────────────────────────────
if not exist "%~dp0frontend\node_modules" (
    echo  Installing frontend dependencies...
    cd /d "%~dp0frontend"
    npm install
    echo  Done.
    echo.
)

:: ── Start backend ─────────────────────────────────────────────────────────────
echo  Starting backend...
start "B2B Backend" cmd /k "cd /d "%~dp0backend" && node server.js"
timeout /t 2 /nobreak >nul

:: ── Start frontend ────────────────────────────────────────────────────────────
echo  Starting frontend...
start "B2B Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 5 /nobreak >nul

:: ── Open browser ──────────────────────────────────────────────────────────────
start "" http://localhost:5173

echo.
echo  Both servers are running.
echo  Backend:  http://localhost:3001/api/health
echo  Frontend: http://localhost:5173
echo.
echo  Close the two terminal windows to stop the app.
echo.
pause
