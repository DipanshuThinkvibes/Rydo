#!/bin/sh
# Restore a backup INTO the running staging database (replaces its data). Run on the server:
#   docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env run --rm backup /bin/sh /restore.sh /backups/rydo-YYYYMMDD-HHMM.dump
# Stop the api first so nobody writes during the restore:  ... stop api
set -eu
file="${1:?give the .dump file to restore}"
pg_restore -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner "$file"
echo "restore ok: $file"