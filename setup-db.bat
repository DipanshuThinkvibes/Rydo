@echo off
setlocal
echo ========================================================
echo   Setting up RYDO PostgreSQL Database and Starting API
echo ========================================================
echo.

set PSQL="C:\Program Files\PostgreSQL\18\bin\psql.exe"
if not exist %PSQL% (
  set PSQL=psql
)

set /p PGPASS="Enter your PostgreSQL 'postgres' password (press Enter if it is 'postgres'): "
if "%PGPASS%"=="" set PGPASS=postgres
set PGPASSWORD=%PGPASS%

echo.
echo 1/4. Creating PostgreSQL user 'rydo' and database 'rydo'...
%PSQL% -U postgres -h localhost -p 5432 -c "CREATE USER rydo WITH PASSWORD 'rydo' SUPERUSER;" >nul 2>&1
%PSQL% -U postgres -h localhost -p 5432 -c "ALTER USER rydo WITH PASSWORD 'rydo' SUPERUSER;" >nul 2>&1
%PSQL% -U postgres -h localhost -p 5432 -c "CREATE DATABASE rydo OWNER rydo;" >nul 2>&1

echo.
echo 2/4. Running Prisma database migrations...
call npm run db:migrate

echo.
echo 3/4. Seeding demo accounts (admin@rydo.local / hr@acme.test)...
call npm run db:seed

echo.
echo ========================================================
echo   Setup Complete! Starting RYDO API on port 4000...
echo ========================================================
echo.
call npm run dev -w @rydo/api
pause

