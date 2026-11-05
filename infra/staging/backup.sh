#!/bin/sh
# Nightly database backup (custom format, compressed). Restore with restore.sh.
set -eu
stamp=$(date +%Y%m%d-%H%M)
file="/backups/rydo-$stamp.dump"
pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$file.part"
mv "$file.part" "$file"
find /backups -name 'rydo-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
echo "backup ok: $file ($(du -h "$file" | cut -f1))"