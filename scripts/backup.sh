#!/bin/bash
# Snapshot the Vault to a local backup dir (timestamped tar.gz), keep last 14.
set -e
VAULT="${VAULT_PATH:-$HOME/local-life-os-vault}"
DEST="$HOME/local-life-os-backups"
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M%S)
tar -czf "$DEST/vault-$STAMP.tar.gz" -C "$(dirname "$VAULT")" "$(basename "$VAULT")"
# prune: keep the 14 most recent
ls -1t "$DEST"/vault-*.tar.gz | tail -n +15 | xargs -I{} rm -f {} 2>/dev/null || true
echo "backed up to $DEST/vault-$STAMP.tar.gz"
