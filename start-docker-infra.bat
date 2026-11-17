@echo off
setlocal
echo ========================================================
echo   Starting RYDO Docker Database & Running Migrations
echo ========================================================
echo.

echo 1/4. Starting Docker database (port 5433)...
call npm run infra:up

echo.
echo Waiting 5 seconds for database to initialize...
timeout /t 5 /nobreak >nul

echo.
echo 2/4. Running Prisma database migrations...
call npm run db:migrate

echo.
echo 3/4. Seeding demo accounts (admin@rydo.local / hr@acme.test)...
call npm run db:seed

echo.
echo ========================================================
echo   Docker DB Ready! Starting RYDO API on port 4000...
echo ========================================================
echo.
call npm run dev -w @rydo/api
pause

