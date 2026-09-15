#!/bin/sh
# Copies back-office/certificates to Google Drive and verifies every byte.
#
#   sh scripts/backup-certificates.sh            # run now
#   tail ~/Library/Logs/folaadeleke-certificate-backup.log
#
# Why Google Drive: ~/Documents on this Mac syncs to iCloud, and so does
# the iCloud "backup" taken on 2026-09-09 — both copies live in the same
# Apple account. This copy lives in a Google account, so losing either
# account still leaves one copy. The certificates exist nowhere else: they
# are gitignored (buyer names against editions) and the PDFs were printed
# from these files.
#
# What it does:
#   1. rsync the tree into <Drive>/folaadeleke-certificates-backup/certificates/
#      WITHOUT --delete, so a file removed from the source by mistake is
#      still in the backup. Pass --prune to mirror deletions too.
#   2. Write MANIFEST.sha256 from the SOURCE tree (one hash per file).
#   3. Verify the COPY against that manifest — the run fails unless every
#      source file is present in Google Drive with the same hash.
#   4. Write README.txt and append one line to the log. A failure also
#      raises a macOS notification, since nobody reads logs on a Sunday.
#
# Scheduled weekly by scripts/launchd/com.folaadeleke.certificate-backup.plist
# (Sunday 20:00; launchd runs a missed slot at the next wake).

set -eu

SRC="/Users/jide/Documents/Business/AI-projects/folaadeleke/back-office/certificates"
DEST_ROOT="${FA_BACKUP_DEST:-$HOME/Library/CloudStorage/GoogleDrive-stephena005@me.com/My Drive/folaadeleke-certificates-backup}"
LOG="$HOME/Library/Logs/folaadeleke-certificate-backup.log"
PRUNE=""
[ "${1:-}" = "--prune" ] && PRUNE="--delete"

stamp() { date '+%Y-%m-%d %H:%M:%S %Z'; }
log() { printf '%s  %s\n' "$(stamp)" "$1" | tee -a "$LOG"; }
notify() {
  osascript -e "display notification \"$1\" with title \"Certificate backup\" subtitle \"folaadeleke\"" >/dev/null 2>&1 || true
}
fail() { log "FAILED: $1"; notify "FAILED — $1"; exit 1; }

mkdir -p "$(dirname "$LOG")"
[ -d "$SRC" ] || fail "source missing: $SRC"
# The CloudStorage folder only exists while Google Drive is running and signed in.
[ -d "$(dirname "$DEST_ROOT")" ] || fail "Google Drive is not mounted at $(dirname "$DEST_ROOT") — is Google Drive running?"
mkdir -p "$DEST_ROOT/certificates"

log "start  $SRC -> $DEST_ROOT${PRUNE:+ (prune)}"

# 1. copy
rsync -a $PRUNE --exclude '.DS_Store' "$SRC/" "$DEST_ROOT/certificates/" || fail "rsync exited $?"

# 2. manifest from the source
TMP_MANIFEST="$(mktemp)"
( cd "$SRC" && find . -type f ! -name '.DS_Store' -print0 | sort -z | xargs -0 shasum -a 256 ) \
  | sed 's|  \./|  certificates/|' > "$TMP_MANIFEST"
COUNT=$(wc -l < "$TMP_MANIFEST" | tr -d ' ')
[ "$COUNT" -gt 0 ] || fail "manifest is empty"
cp "$TMP_MANIFEST" "$DEST_ROOT/MANIFEST.sha256"
rm -f "$TMP_MANIFEST"

# 3. verify the copy
if ! ( cd "$DEST_ROOT" && shasum -a 256 -c MANIFEST.sha256 --quiet ) >>"$LOG" 2>&1; then
  fail "verification of the Google Drive copy failed — see $LOG"
fi

# 4. readme + log
SIZE=$(du -sh "$SRC" | cut -f1)   # source size; the Drive mount over-reports
cat > "$DEST_ROOT/README.txt" <<EOF
Fola Adeleke® — certificate backup (Google Drive copy)
Last run   $(stamp)
Source     $SRC
Files      $COUNT verified, $SIZE

Contents
  certificates/   the full tree: certificate HTML, PDFs, the verify-token map,
                  and superseded/ (originals replaced by text-layer versions)
  MANIFEST.sha256 a SHA-256 for every source file at the time of the run

To verify this backup at any time:
  cd "\$(dirname "\$0")" && shasum -a 256 -c MANIFEST.sha256

Files deleted from the source are kept here (the copy is not pruned), so
this folder can hold more than the manifest lists. Run the script with
--prune to mirror deletions.

This is the OFF-ACCOUNT copy: the source and the iCloud backup both live
in the same Apple account; this one lives in Google Drive.
Script: scripts/backup-certificates.sh in the folaadeleke repo, run weekly
by launchd (com.folaadeleke.certificate-backup).
EOF

log "ok     $COUNT files verified, $SIZE"
