#!/bin/sh
# Backs up the Postgres database and the uploaded files of one deployment.
#
# Kamal has no backup feature of its own; this script only uses what the deploy already has: the Postgres container
# (`docker exec pg_dump`) and the uploads either as a host directory (Kamal mounts /srv/jarvis-web/uploads) or as a
# Docker volume (compose). Put it on a timer — see docs/kamal.md.
#
# Usage:
#   deploy/backup.sh                          # Kamal defaults
#   UPLOADS_VOLUME=jarvis-web_uploads deploy/backup.sh   # compose
set -eu

BACKUP_DIR=${BACKUP_DIR:-./backups}
DB_CONTAINER=${DB_CONTAINER:-jarvis-web-db}
DB_USER=${POSTGRES_USER:-jarvis}
DB_NAME=${POSTGRES_DB:-jarvis}
UPLOADS_DIR=${UPLOADS_DIR:-/srv/jarvis-web/uploads}
UPLOADS_VOLUME=${UPLOADS_VOLUME:-}
KEEP_DAYS=${KEEP_DAYS:-14}

stamp=$(date +%F)
mkdir -p "$BACKUP_DIR"
absolute_backup_dir=$(cd "$BACKUP_DIR" && pwd)

echo "database: $DB_CONTAINER ($DB_USER@$DB_NAME)"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$absolute_backup_dir/db-$stamp.sql.gz"

if [ -n "$UPLOADS_VOLUME" ]; then
  echo "uploads: volume $UPLOADS_VOLUME"
  docker run --rm \
    -v "$UPLOADS_VOLUME:/data:ro" \
    -v "$absolute_backup_dir:/backup" \
    alpine:3 sh -c "tar czf /backup/uploads-$stamp.tgz -C /data ."
else
  echo "uploads: directory $UPLOADS_DIR"
  tar czf "$absolute_backup_dir/uploads-$stamp.tgz" -C "$UPLOADS_DIR" .
fi

# Retention, in days. Only files this script writes, so a stray file in the directory is never deleted.
find "$absolute_backup_dir" -maxdepth 1 -name 'db-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
find "$absolute_backup_dir" -maxdepth 1 -name 'uploads-*.tgz' -mtime "+$KEEP_DAYS" -delete

ls -lh "$absolute_backup_dir"
echo "done: keep $KEEP_DAYS days, copy these files off the server (rsync/rclone) — a backup on the same disk is not a backup"
