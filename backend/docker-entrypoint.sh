#!/bin/sh
# Persistent disks (e.g. on Render) are mounted owned by root. Hand the data directory to the
# unprivileged "node" user, then run the app as that user.
set -e
mkdir -p "${DATA_DIR:-/data}"
chown -R node:node "${DATA_DIR:-/data}" 2>/dev/null || true
exec setpriv --reuid=node --regid=node --init-groups "$@"
