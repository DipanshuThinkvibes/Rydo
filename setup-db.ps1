Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Setting up RYDO PostgreSQL Database & Starting API    " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$psqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
if (-not (Test-Path $psqlPath)) {
    $psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
    if ($psqlCmd) { $psqlPath = $psqlCmd.Source }
    else {
        Write-Host "Error: Could not find psql.exe at $psqlPath" -ForegroundColor Red
        exit 1
    }
}

$pgPassword = Read-Host "Enter your PostgreSQL 'postgres' password (press Enter if it is 'postgres')"
if ([string]::IsNullOrWhiteSpace($pgPassword)) {
    $pgPassword = "postgres"
}

$env:PGPASSWORD = $pgPassword

Write-Host "`n1/4. Creating PostgreSQL user 'rydo' and database 'rydo'..." -ForegroundColor Cyan
& $psqlPath -U postgres -h localhost -p 5432 -c "CREATE USER rydo WITH PASSWORD 'rydo' SUPERUSER;" 2>$null
& $psqlPath -U postgres -h localhost -p 5432 -c "ALTER USER rydo WITH PASSWORD 'rydo' SUPERUSER;" 2>$null
& $psqlPath -U postgres -h localhost -p 5432 -c "CREATE DATABASE rydo OWNER rydo;" 2>$null

Write-Host "`n2/4. Running Prisma database migrations..." -ForegroundColor Cyan
npm run db:migrate

Write-Host "`n3/4. Seeding demo accounts..." -ForegroundColor Cyan
npm run db:seed

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "  Setup complete! Starting RYDO API on port 4000...      " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
npm run dev -w @rydo/api

