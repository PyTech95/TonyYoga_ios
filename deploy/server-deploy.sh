#!/usr/bin/env bash
# =============================================================================
# Tony Yoga — update the live server (backend + website) safely.
#
#   sudo bash server-deploy.sh check                       # look only, change nothing
#   sudo bash server-deploy.sh deploy tony2028-main-updated.zip
#   sudo bash server-deploy.sh rollback                    # put the previous version back
#   sudo bash server-deploy.sh auto-refresh                # optional, see the end of this file
#
# What "deploy" does, in order:
#   1. finds the backend folder, how it is started, the website folder and the API address
#   2. backs up the code, the current website and the MongoDB database
#   3. updates the backend code (your .env, venv and uploads are kept), restarts it and
#      checks /api/health — if the backend doesn't come back, the old code is restored
#   4. builds the new website in a separate folder (the live site keeps running), then
#      swaps it in with one rename; files that only exist on the server (.well-known,
#      Google/Bing verification files, .htaccess…) are carried over
#   5. checks the live pages; if the home page fails, the old website is put back
#
# Everything is detected automatically. If "check" can't find something, set it in front:
#   sudo APP_DIR=/var/www/tony WEB_ROOT=/var/www/tony/frontend/build bash server-deploy.sh deploy update.zip
# Settings: APP_DIR BACKEND_DIR FRONTEND_DIR WEB_ROOT SERVICE (systemd:NAME | pm2:NAME |
#   supervisor:NAME) BACKEND_PORT API_URL SITE_URL BACKUP_DIR KEEP_BACKUPS SKIP_DB_BACKUP=1
# =============================================================================
set -Eeuo pipefail

SITE_URL="${SITE_URL:-https://tonyoga.com}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tonyoga}"
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"
STATE_FILE="$BACKUP_DIR/last-deploy.env"
TS="$(date +%Y%m%d-%H%M%S)"

if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'; else B=""; G=""; Y=""; R=""; N=""; fi
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s==> %s%s\n' "$B" "$*" "$N"; }
ok()   { printf '  %s✔%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
bad()  { printf '  %s✘%s %s\n' "$R" "$N" "$*"; }
die()  { printf '\n%sSTOPPED:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------
is_tony_backend() { [ -f "$1/server.py" ] && [ -d "$1/routers" ] && grep -qs "tony" "$1/server.py" "$1/core.py" 2>/dev/null; }

DETECT_NOTES=()
SERVICE_PID=""

detect_backend_process() {
  # Look at what is listening on TCP ports and find the Tony Yoga Python process.
  have ss || return 0
  local line pid port cwd
  while read -r line; do
    pid="$(grep -o 'pid=[0-9]*' <<<"$line" | head -1 | cut -d= -f2)"
    port="$(awk '{print $4}' <<<"$line" | sed 's/.*://')"
    [ -n "$pid" ] || continue
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    [ -n "$cwd" ] && ! is_tony_backend "$cwd" && is_tony_backend "$cwd/backend" && cwd="$cwd/backend"
    if [ -n "$cwd" ] && is_tony_backend "$cwd"; then
      : "${BACKEND_DIR:=$cwd}"
      : "${BACKEND_PORT:=$port}"
      SERVICE_PID="$pid"
      return 0
    fi
  done < <(ss -ltnp 2>/dev/null | tail -n +2 | grep -Ei 'python|uvicorn|gunicorn' || true)
}

detect_service() {
  [ -n "${SERVICE:-}" ] && return 0
  local pid="$SERVICE_PID" unit cg p name
  if [ -n "$pid" ]; then
    # pm2 and supervisor show up as a parent process.
    p="$pid"
    for _ in 1 2 3 4 5 6; do
      p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')"
      [ -n "$p" ] && [ "$p" -gt 1 ] 2>/dev/null || break
      if grep -qa 'PM2' "/proc/$p/cmdline" 2>/dev/null; then
        PM2_USER="$(ps -o user= -p "$pid" | tr -d ' ')"
        name="$(pm2_name_for_pid "$pid")"
        SERVICE="pm2:${name:-?}"; return 0
      fi
      if grep -qa 'supervisord' "/proc/$p/cmdline" 2>/dev/null; then
        SERVICE="supervisor:$(supervisor_name_for_pid "$pid")"; return 0
      fi
    done
    cg="$(cat "/proc/$pid/cgroup" 2>/dev/null || true)"
    if grep -qE 'docker|containerd' <<<"$cg"; then SERVICE="docker:?"; return 0; fi
    unit="$(grep -o '[^/]*\.service' <<<"$cg" | grep -v '^user@' | tail -1 || true)"
    if [ -n "$unit" ]; then SERVICE="systemd:${unit%.service}"; return 0; fi
  fi
  # Not running right now: look for a systemd unit that starts this backend.
  if have systemctl && [ -n "${BACKEND_DIR:-}" ]; then
    for unit in $(systemctl list-unit-files --type=service --no-legend 2>/dev/null | awk '{print $1}'); do
      if systemctl cat "$unit" 2>/dev/null | grep -q "$BACKEND_DIR"; then SERVICE="systemd:${unit%.service}"; return 0; fi
    done
  fi
}

PM2_USER=""
pm2_as() {
  # Run pm2 as the user who owns the pm2 processes (pm2 keeps a separate list per user).
  local user="${PM2_USER:-root}"
  if [ "$user" = "$(id -un)" ] && have pm2; then pm2 "$@"; else sudo -iu "$user" pm2 "$@"; fi
}
pm2_name_for_pid() {
  local pid="$1" user
  user="$(ps -o user= -p "$pid" | tr -d ' ')"
  PM2_USER="$user" pm2_as jlist 2>/dev/null | python3 -c '
import json,sys
pid=int(sys.argv[1]); folder=sys.argv[2]
try: apps=json.load(sys.stdin)
except Exception: apps=[]
hit=[a for a in apps if a.get("pid")==pid] or [a for a in apps if folder and folder in str((a.get("pm2_env") or {}).get("pm_cwd",""))]
print(hit[0].get("name","") if hit else "")
' "$pid" "${BACKEND_DIR:-}" 2>/dev/null || true
}

supervisor_name_for_pid() {
  have supervisorctl || { echo "?"; return; }
  supervisorctl status 2>/dev/null | awk -v p="pid $1," '$0 ~ p {print $1}' | head -1
}

find_backend_by_search() {
  [ -n "${BACKEND_DIR:-}" ] && return 0
  local found=() f d
  while IFS= read -r f; do
    d="$(dirname "$f")"; is_tony_backend "$d" && found+=("$d")
  done < <(find /var/www /home /root /opt /srv -maxdepth 6 -type f -name server.py -path '*backend*' -not -path '*/node_modules/*' -not -path '*/venv/*' -not -path '*/.venv/*' 2>/dev/null)
  if [ "${#found[@]}" -eq 1 ]; then BACKEND_DIR="${found[0]}"
  elif [ "${#found[@]}" -gt 1 ]; then DETECT_NOTES+=("Several backend folders found: ${found[*]} — set BACKEND_DIR=… or APP_DIR=…")
  fi
}

detect_web_root() {
  [ -n "${WEB_ROOT:-}" ] && return 0
  local host; host="$(sed -E 's#https?://##; s#/.*##' <<<"$SITE_URL")"
  if have nginx; then
    WEB_ROOT="$(nginx -T 2>/dev/null | python3 -c '
import re,sys
host=sys.argv[1]; text=sys.stdin.read()
text=re.sub(r"#[^\n]*","",text)
roots=[]
# walk server { … } blocks (brace matching)
i=0
for m in re.finditer(r"\bserver\s*\{",text):
    start=m.end(); depth=1; j=start
    while j<len(text) and depth:
        depth += text[j]=="{"; depth -= text[j]=="}"; j+=1
    block=text[start:j]
    names=" ".join(re.findall(r"server_name\s+([^;]+);",block))
    if host in names.split() or ("www."+host) in names.split():
        roots += re.findall(r"\broot\s+([^;\s]+)\s*;",block)
# prefer a root that looks like a React build
roots=[r.strip("\"'"'"'") for r in roots]
roots.sort(key=lambda r:(not r.rstrip("/").endswith("build"), len(r)))
print(roots[0] if roots else "")
' "$host" 2>/dev/null || true)"
    [ -n "$WEB_ROOT" ] && { WEB_SERVER=nginx; return 0; }
  fi
  if have apache2ctl || have httpd; then
    WEB_ROOT="$(grep -rhsi -B30 "Server\(Name\|Alias\).*$host" /etc/apache2/sites-enabled /etc/httpd/conf.d 2>/dev/null | grep -i DocumentRoot | head -1 | awk '{print $2}' | tr -d '"' || true)"
    [ -n "$WEB_ROOT" ] && { WEB_SERVER=apache; return 0; }
  fi
  if [ -f /etc/caddy/Caddyfile ]; then
    WEB_ROOT="$(grep -A20 "$host" /etc/caddy/Caddyfile | grep -m1 -E '^\s*root' | awk '{print $NF}' || true)"
    [ -n "$WEB_ROOT" ] && { WEB_SERVER=caddy; return 0; }
  fi
  if [ -n "${FRONTEND_DIR:-}" ] && [ -f "$FRONTEND_DIR/build/index.html" ]; then WEB_ROOT="$FRONTEND_DIR/build"; WEB_SERVER="?"; fi
}

detect_api_url() {
  [ -n "${API_URL:-}" ] && return 0
  local f v
  if [ -n "${FRONTEND_DIR:-}" ]; then
    for f in .env.production.local .env.local .env.production .env; do
      v="$(grep -hs '^REACT_APP_BACKEND_URL=' "$FRONTEND_DIR/$f" | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r' || true)"
      [ -n "$v" ] && { API_URL="$v"; API_SOURCE="$FRONTEND_DIR/$f"; return 0; }
    done
  fi
  if [ -n "${WEB_ROOT:-}" ] && ls "$WEB_ROOT"/static/js/main.*.js >/dev/null 2>&1; then
    v="$(grep -ohE '"https?://[^"`]+/api"' "$WEB_ROOT"/static/js/main.*.js | head -1 | tr -d '"' | sed 's#/api$##' || true)"
    [ -n "$v" ] && { API_URL="$v"; API_SOURCE="the live website bundle"; return 0; }
  fi
}

find_python() {
  # Keep the venv path as is (resolving the symlink would lose the venv's packages).
  local c
  if [ -n "$SERVICE_PID" ]; then
    c="$(tr '\0' '\n' < "/proc/$SERVICE_PID/cmdline" 2>/dev/null | head -1)"
    case "$c" in /*python*) [ -x "$c" ] && { echo "$c"; return; };; esac
  fi
  for c in "$BACKEND_DIR/venv/bin/python" "$BACKEND_DIR/.venv/bin/python" "$BACKEND_DIR/../venv/bin/python" "$BACKEND_DIR/../.venv/bin/python"; do
    [ -x "$c" ] && { echo "$c"; return; }
  done
  command -v python3 || true
}

env_value() { grep -hs "^$1=" "$BACKEND_DIR/.env" | tail -1 | cut -d= -f2- | sed -E 's/^["'"'"']//; s/["'"'"']$//' | tr -d '\r'; }

detect_all() {
  detect_backend_process
  if [ -n "${APP_DIR:-}" ]; then : "${BACKEND_DIR:=$APP_DIR/backend}"; fi
  find_backend_by_search
  if [ -n "${BACKEND_DIR:-}" ]; then
    BACKEND_DIR="$(readlink -f "$BACKEND_DIR")"
    : "${APP_DIR:=$(dirname "$BACKEND_DIR")}"
  fi
  if [ -z "${FRONTEND_DIR:-}" ] && [ -n "${APP_DIR:-}" ] && [ -f "$APP_DIR/frontend/package.json" ]; then FRONTEND_DIR="$APP_DIR/frontend"; fi
  detect_service
  : "${BACKEND_PORT:=8001}"
  WEB_SERVER="${WEB_SERVER:-}"
  detect_web_root
  [ -n "${WEB_ROOT:-}" ] && WEB_ROOT="$(readlink -m "$WEB_ROOT")"
  API_SOURCE="${API_SOURCE:-you}"
  detect_api_url
  PYTHON="${PYTHON:-$( [ -n "${BACKEND_DIR:-}" ] && find_python || true)}"
}

# ---------------------------------------------------------------------------
# check
# ---------------------------------------------------------------------------
report() {
  local problems=0 v mem disk node_v quiet="${1:-}"
  step "Tony Yoga server check ($(hostname), $(date))"
  [ "$(id -u)" -eq 0 ] && ok "running as root" || { bad "run with sudo"; problems=$((problems+1)); }

  if [ -n "${BACKEND_DIR:-}" ] && is_tony_backend "$BACKEND_DIR"; then ok "backend folder: $BACKEND_DIR"
  else bad "backend folder not found — set APP_DIR=/path/that/contains/backend"; problems=$((problems+1)); fi
  [ -n "${FRONTEND_DIR:-}" ] && ok "frontend source folder: $FRONTEND_DIR" || warn "no frontend source folder on the server (fine — the website is built from the update zip)"

  case "${SERVICE:-}" in
    systemd:*|supervisor:*) ok "backend runs as: $SERVICE (port $BACKEND_PORT)";;
    pm2:\?) bad "backend runs under pm2 but its name wasn't found — set SERVICE=pm2:NAME"; problems=$((problems+1));;
    pm2:*) ok "backend runs as: $SERVICE (pm2 user ${PM2_USER:-?}, port $BACKEND_PORT)";;
    docker:*) bad "backend runs in Docker — this script doesn't rebuild images; send me 'docker ps' output"; problems=$((problems+1));;
    *) bad "couldn't tell how the backend is started — set SERVICE=systemd:NAME or pm2:NAME"; problems=$((problems+1));;
  esac
  if curl -fsS -m 5 "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1; then ok "backend health: http://127.0.0.1:$BACKEND_PORT/api/health answers"
  else warn "backend health check on port $BACKEND_PORT didn't answer"; fi

  if [ -n "${BACKEND_DIR:-}" ] && [ -f "$BACKEND_DIR/.env" ]; then
    ok "backend .env found"
    [ -n "$(env_value MONGO_URL)" ] && ok "MONGO_URL set (database: $(env_value DB_NAME))" || warn "MONGO_URL not in backend/.env (maybe set in the service instead)"
    v="$(env_value FRONTEND_URL)"; [ -n "$v" ] && ok "FRONTEND_URL=$v" || warn "FRONTEND_URL not set — add FRONTEND_URL=$SITE_URL (payment return page for the apps)"
    v="$(env_value CORS_ORIGINS)"
    if [ -n "$v" ]; then
      local missing=""
      for o in "$SITE_URL" https://localhost capacitor://localhost; do grep -q "$o" <<<"$v" || missing="$missing $o"; done
      [ -z "$missing" ] && ok "CORS_ORIGINS allows the website and both apps" || warn "CORS_ORIGINS is missing:$missing (add them, comma-separated, then restart the backend)"
    else warn "CORS_ORIGINS not in backend/.env (maybe set in the service)"; fi
    v="$(env_value PRERENDER_COMMAND)"; [ -n "$v" ] && ok "PRERENDER_COMMAND set (admin edits refresh Google's copy)" || say "  · PRERENDER_COMMAND not set yet (optional: run 'auto-refresh' after deploying)"
  fi
  if [ -n "${PYTHON:-}" ] && "$PYTHON" -c 'import fastapi, motor' 2>/dev/null; then ok "backend python: $PYTHON ($("$PYTHON" -V 2>&1))"
  else bad "backend python with its packages not found (${PYTHON:-none}) — set PYTHON=/path/to/venv/bin/python"; problems=$((problems+1)); fi

  if [ -n "${WEB_ROOT:-}" ] && [ -f "$WEB_ROOT/index.html" ]; then ok "website folder: $WEB_ROOT (served by ${WEB_SERVER:-?})"
  else bad "website folder not found — set WEB_ROOT=/path/your/web/server/serves"; problems=$((problems+1)); fi
  if [ "${WEB_SERVER:-}" = nginx ]; then
    if nginx -T 2>/dev/null | grep -q 'uri/index.html'; then ok "nginx serves pre-rendered pages (\$uri/index.html)"
    else warn "nginx try_files lacks \$uri/index.html — Google won't see the pre-rendered pages (deploy prints the fix)"; fi
  fi
  [ -n "${API_URL:-}" ] && ok "API address for the website build: $API_URL (from $API_SOURCE)" || { bad "API address not found — set API_URL=https://… (what the website calls)"; problems=$((problems+1)); }

  if have node; then
    node_v="$(node -v | sed 's/v//; s/\..*//')"
    [ "$node_v" -ge 18 ] && ok "node $(node -v)" || { bad "node $(node -v) is too old — need 18 or newer"; problems=$((problems+1)); }
  else bad "node not installed (need 18+)"; problems=$((problems+1)); fi
  have yarn && ok "yarn $(yarn -v)" || { have corepack && warn "yarn missing — will enable it with corepack" || { bad "yarn missing (npm i -g yarn)"; problems=$((problems+1)); }; }
  have unzip && ok "unzip available" || { bad "unzip missing (apt install unzip)"; problems=$((problems+1)); }
  if have mongodump; then ok "mongodump available for the database backup"; else warn "mongodump not installed — the backup will use Python instead"; fi

  mem="$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
  local swap; swap="$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)"
  if [ "$mem" -lt 1500 ] && [ "$swap" -lt 1024 ]; then warn "only ${mem} MB free memory and ${swap} MB swap — the website build may run out of memory (see guide: add swap)"
  else ok "memory: ${mem} MB free, ${swap} MB swap"; fi
  disk="$(df -Pm "${APP_DIR:-/}" 2>/dev/null | awk 'NR==2 {print $4}' || true)"; disk="${disk:-0}"
  [ "$disk" -ge 3000 ] && ok "disk: ${disk} MB free" || { bad "only ${disk} MB free disk — need about 3 GB"; problems=$((problems+1)); }

  for n in "${DETECT_NOTES[@]}"; do warn "$n"; done
  echo
  if [ "$problems" -eq 0 ]; then [ "$quiet" = quiet ] || say "${G}${B}Ready to deploy.${N} Run: sudo bash $0 deploy /path/to/tony2028-main-updated.zip"
  else say "${R}${B}$problems thing(s) to fix before deploying${N} (see ✘ above)."; fi
  return "$problems"
}

# ---------------------------------------------------------------------------
# helpers for deploy / rollback
# ---------------------------------------------------------------------------
restart_backend() {
  local kind="${SERVICE%%:*}" name="${SERVICE#*:}"
  # A failed restart is not fatal here: the health check that follows decides what happens.
  case "$kind" in
    systemd) systemctl restart "$name" || warn "systemctl restart reported an error";;
    supervisor) supervisorctl restart "$name" >/dev/null || warn "supervisorctl restart reported an error";;
    pm2) PM2_USER="${PM2_USER:-$(stat -c %U "$BACKEND_DIR")}" pm2_as restart "$name" --update-env >/dev/null || warn "pm2 restart reported an error";;
    *) die "don't know how to restart the backend ($SERVICE)";;
  esac
}

log_hint() {
  case "${SERVICE%%:*}" in
    systemd) echo "journalctl -u ${SERVICE#*:} -n 80 --no-pager";;
    supervisor) echo "supervisorctl tail -8000 ${SERVICE#*:}";;
    pm2) echo "pm2 logs ${SERVICE#*:} --lines 80";;
    *) echo "the backend's log";;
  esac
}

wait_healthy() {
  # wait_healthy new  → also requires the new /api/pages endpoint (proves the new code is running)
  local _
  for _ in $(seq 1 45); do
    if curl -fsS -m 4 "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
      [ "${1:-}" != new ] && return 0
      curl -fsS -m 4 "http://127.0.0.1:$BACKEND_PORT/api/pages" >/dev/null 2>&1 && return 0
    fi
    sleep 2
  done
  return 1
}

route_list() {
  # Every "METHOD /path" the running backend answers (FastAPI's /openapi.json). Empty if unavailable.
  curl -fsS -m 10 "http://127.0.0.1:$BACKEND_PORT/openapi.json" 2>/dev/null \
    | "$PYTHON" -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
for p,ops in sorted(d.get("paths",{}).items()):
    for m in sorted(ops):
        if m.lower() in ("get","post","put","patch","delete"): print(m.upper()+" "+p)' 2>/dev/null | LC_ALL=C sort -u || true
}

backup_database() {
  local out="$1" url db
  url="$(env_value MONGO_URL)"; db="$(env_value DB_NAME)"
  if [ "${SKIP_DB_BACKUP:-0}" = 1 ]; then warn "database backup skipped (SKIP_DB_BACKUP=1)"; return 0; fi
  [ -n "$url" ] && [ -n "$db" ] || die "MONGO_URL / DB_NAME not found in $BACKEND_DIR/.env — set SKIP_DB_BACKUP=1 only if you have your own backup"
  if have mongodump && mongodump --quiet --uri="$url" --db="$db" --archive="$out/mongo-$db.archive.gz" --gzip 2>/dev/null; then
    ok "database backed up with mongodump → $out/mongo-$db.archive.gz"; return 0
  fi
  MONGO_URL="$url" DB_NAME="$db" "$PYTHON" - "$out" <<'PY' || die "database backup failed — fix the error above or set SKIP_DB_BACKUP=1 if you have another backup"
import gzip, os, sys
from pymongo import MongoClient
from bson import json_util
out = sys.argv[1]
db = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=15000)[os.environ["DB_NAME"]]
total = 0
os.makedirs(f"{out}/mongo-json", exist_ok=True)
for name in db.list_collection_names():
    with gzip.open(f"{out}/mongo-json/{name}.jsonl.gz", "wt", encoding="utf-8") as fh:
        for doc in db[name].find():
            fh.write(json_util.dumps(doc) + "\n"); total += 1
print(f"  ✔ database backed up with Python → {out}/mongo-json ({total} documents)")
PY
}

carry_over_server_files() {
  # Copy top-level files/folders that exist only on the server (verification files,
  # .well-known, .htaccess…) into the new build. Pages the old build pre-rendered are
  # skipped so deleted pages don't come back.
  local old="$1" new="$2" name skip
  skip="$(python3 - "$old/.prerender-manifest.json" <<'PY' 2>/dev/null || true
import json, sys
try:
    routes = json.load(open(sys.argv[1]))
except Exception:
    routes = []
print("\n".join(sorted({r.strip("/").split("/")[0] for r in routes if isinstance(r, str) and r.strip("/")})))
PY
)"
  shopt -s dotglob nullglob
  for path in "$old"/*; do
    name="$(basename "$path")"
    [ -e "$new/$name" ] && continue
    case "$name" in static|asset-manifest.json|.prerender-manifest.json) continue;; esac
    grep -qx "$name" <<<"$skip" && continue
    cp -a "$path" "$new/" && ok "kept server file: $name"
  done
  shopt -u dotglob nullglob
}

match_owner() {
  # Give the files just copied from the release ($1) the owner of the folder they went into ($2),
  # without touching anything else in it (venv, uploads, the live website…).
  local src="$1" dst="$2" e name
  shopt -s dotglob nullglob
  for e in "$src"/*; do
    name="$(basename "$e")"
    case "$name" in node_modules|build|venv|.venv|.env|.env.*) continue;; esac
    [ -e "$dst/$name" ] && chown -R --reference="$dst" "$dst/$name" 2>/dev/null || true
  done
  shopt -u dotglob nullglob
}

save_state() {
  mkdir -p "$BACKUP_DIR"
  cat > "$STATE_FILE" <<EOF
DEPLOY_TS='$TS'
BACKEND_DIR='$BACKEND_DIR'
FRONTEND_DIR='${FRONTEND_DIR:-}'
WEB_ROOT='$WEB_ROOT'
SERVICE='$SERVICE'
PM2_USER='${PM2_USER:-}'
BACKEND_PORT='$BACKEND_PORT'
CODE_BACKUP='$1'
WEB_PREVIOUS='$2'
EOF
}

prune_backups() {
  local dirs
  mapfile -t dirs < <(ls -1dt "$BACKUP_DIR"/20* 2>/dev/null || true)
  if [ "${#dirs[@]}" -gt "$KEEP_BACKUPS" ]; then
    for d in "${dirs[@]:$KEEP_BACKUPS}"; do rm -rf "$d"; done
    ok "kept the last $KEEP_BACKUPS backups"
  fi
  mapfile -t dirs < <(ls -1dt "$WEB_ROOT".previous-* 2>/dev/null || true)
  if [ "${#dirs[@]}" -gt 2 ]; then for d in "${dirs[@]:2}"; do rm -rf "$d"; done; fi
}

site_get() {
  # site_get PATH [extra curl args] — fetch a page from this server's own web server
  # (https first, then http following redirects), falling back to the public address.
  local host p="$1"; shift
  host="$(sed -E 's#https?://##; s#/.*##' <<<"$SITE_URL")"
  curl -skL -m 15 --resolve "$host:443:127.0.0.1" --resolve "$host:80:127.0.0.1" "$@" "https://$host$p" 2>/dev/null && return 0
  curl -skL -m 15 --resolve "$host:80:127.0.0.1" "$@" "http://$host$p" 2>/dev/null && return 0
  curl -skL -m 15 "$@" "$SITE_URL$p" 2>/dev/null
}

verify_site() { site_get / -o /dev/null -w '%{http_code}' || true; }

# ---------------------------------------------------------------------------
# deploy
# ---------------------------------------------------------------------------
deploy() {
  local zip="${1:-}"
  [ -n "$zip" ] && [ -f "$zip" ] || die "give the update zip: sudo bash $0 deploy /root/tony2028-main-updated.zip"
  zip="$(readlink -f "$zip")"
  report quiet || die "fix the ✘ items above first (or set the settings shown in the top of this script)"
  [ -n "$PYTHON" ] || die "backend python not found"

  local out="$BACKUP_DIR/$TS" work="/var/tmp/tonyoga-release-$TS" rel
  mkdir -p "$out" "$work"

  step "1/6 Unpacking the update"
  unzip -q "$zip" -d "$work"
  rel="$(dirname "$(find "$work" -maxdepth 3 -type f -path '*/backend/server.py' | head -1)")"
  rel="$(dirname "$rel")"
  [ -f "$rel/backend/server.py" ] && [ -f "$rel/frontend/package.json" ] || die "the zip doesn't look like the Tony Yoga project"
  ok "update unpacked in $rel"

  step "2/6 Backing up code, website and database → $out"
  tar -C "$(dirname "$BACKEND_DIR")" --exclude='venv' --exclude='.venv' --exclude='__pycache__' --exclude='node_modules' \
      -czf "$out/backend.tar.gz" "$(basename "$BACKEND_DIR")"
  ok "backend code → $out/backend.tar.gz"
  if [ -n "${FRONTEND_DIR:-}" ]; then
    tar -C "$(dirname "$FRONTEND_DIR")" --exclude='node_modules' --exclude='build' -czf "$out/frontend-src.tar.gz" "$(basename "$FRONTEND_DIR")"
    ok "frontend source → $out/frontend-src.tar.gz"
  fi
  backup_database "$out"
  cp "$zip" "$out/" 2>/dev/null || true

  step "3/6 Updating the backend"
  # Remember every API route the live backend has, so nothing that exists only on this server gets lost.
  route_list > "$out/routes-before.txt"
  local req_changed=0
  cmp -s "$rel/backend/requirements.txt" "$BACKEND_DIR/requirements.txt" || req_changed=1
  # Copy the new code over the old (keeps .env, venv, uploads and anything else that is only on the server).
  (cd "$rel/backend" && tar --exclude='.env' --exclude='venv' --exclude='.venv' --exclude='__pycache__' -cf - .) | (cd "$BACKEND_DIR" && tar --no-same-owner -xf -)
  match_owner "$rel/backend" "$BACKEND_DIR"
  if [ "$req_changed" = 1 ]; then
    say "  requirements.txt changed — installing Python packages"
    "$PYTHON" -m pip install -q -r "$BACKEND_DIR/requirements.txt"
  else ok "Python packages unchanged"; fi
  if [ -f "$BACKEND_DIR/requirements-ios.txt" ] && ! "$PYTHON" -c "import appstoreserverlibrary" >/dev/null 2>&1; then
    say "  installing the Apple in-app purchase package (requirements-ios.txt)"
    "$PYTHON" -m pip install -q -r "$BACKEND_DIR/requirements-ios.txt" || warn "couldn't install requirements-ios.txt"
  fi
  restart_backend
  local backend_ok=1 missing=""
  if wait_healthy new; then
    route_list > "$out/routes-after.txt"
    if [ -s "$out/routes-before.txt" ] && [ -s "$out/routes-after.txt" ]; then
      missing="$(LC_ALL=C comm -23 "$out/routes-before.txt" "$out/routes-after.txt")"
    fi
    if [ -n "$missing" ]; then
      bad "the new backend is missing API routes the live one had:"
      printf '%s\n' "$missing" | head -20 | sed 's/^/      /'
      backend_ok=0
    else
      ok "backend restarted and healthy (new /api/pages answers; all $(wc -l < "$out/routes-before.txt") previous API routes still there)"
    fi
  else
    bad "backend didn't come back"
    backend_ok=0
  fi
  if [ "$backend_ok" = 0 ]; then
    say "  restoring the previous backend code"
    tar -C "$(dirname "$BACKEND_DIR")" -xzf "$out/backend.tar.gz"
    restart_backend; wait_healthy && warn "previous backend restored and running" || bad "previous backend also not answering — check: $(log_hint)"
    die "backend update stopped — the site is on the previous version. Send this output to Rajeev. Logs: $(log_hint)"
  fi

  step "4/6 Building the new website (the live site keeps running)"
  local fe="$rel/frontend" f
  if [ -n "${FRONTEND_DIR:-}" ]; then
    for f in .env .env.production .env.local .env.production.local; do [ -f "$FRONTEND_DIR/$f" ] && cp "$FRONTEND_DIR/$f" "$fe/"; done
  fi
  {
    echo "REACT_APP_BACKEND_URL=$API_URL"
    echo "REACT_APP_SITE_URL=$SITE_URL"
  } > "$fe/.env.production.local"
  if ! have yarn; then corepack enable >/dev/null 2>&1 || npm i -g yarn >/dev/null; fi
  local memtotal; memtotal="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
  export NODE_OPTIONS="--max-old-space-size=$(( memtotal > 4096 ? 3072 : (memtotal > 2048 ? 1536 : 1024) ))"
  say "  installing packages (1–3 minutes)…"
  if ! (cd "$fe" && yarn install --frozen-lockfile --network-timeout 600000 --silent) > "$out/yarn-install.log" 2>&1; then
    (cd "$fe" && yarn install --network-timeout 600000 --silent) > "$out/yarn-install.log" 2>&1 || { tail -30 "$out/yarn-install.log"; die "package install failed (log: $out/yarn-install.log). The backend is updated; the old website is still live."; }
  fi
  say "  building (2–5 minutes)…"
  if ! (cd "$fe" && GENERATE_SOURCEMAP=false CI=false PRERENDER_API_URL="http://127.0.0.1:$BACKEND_PORT/api" yarn build) > "$out/build.log" 2>&1; then
    tail -40 "$out/build.log"
    die "website build failed (log: $out/build.log). The backend is updated; the old website is still live."
  fi
  grep '^\[prerender\]' "$out/build.log" | sed 's/^/  /' || true
  [ -f "$fe/build/index.html" ] && ls "$fe"/build/static/js/main.*.js >/dev/null 2>&1 || die "website build failed (log: $out/build.log). The old website is still live."
  grep -q 'ty-prerender' "$fe/build/index.html" && ok "website built and pre-rendered ($(find "$fe/build" -name index.html | wc -l) pages)" || warn "website built, but pre-rendering didn't run"

  step "5/6 Switching the website (one rename)"
  local next="$WEB_ROOT.next-$TS" prev="$WEB_ROOT.previous-$TS"
  cp -a "$fe/build" "$next"
  carry_over_server_files "$WEB_ROOT" "$next"
  chown -R --reference="$WEB_ROOT" "$next" 2>/dev/null || true
  mv "$WEB_ROOT" "$prev" && mv "$next" "$WEB_ROOT"
  save_state "$out/backend.tar.gz" "$prev"
  ok "website switched (previous one kept at $prev)"
  # Keep the source on the server in step with what is live.
  if [ -n "${FRONTEND_DIR:-}" ]; then
    (cd "$fe" && tar --exclude='node_modules' --exclude='build' --exclude='.env*' -cf - .) | (cd "$FRONTEND_DIR" && tar --no-same-owner -xf -)
    match_owner "$fe" "$FRONTEND_DIR"
    ok "frontend source on the server updated"
  fi
  for f in VPS_DEPLOYMENT.md UPDATE_NOTES_MOBILE_SEO.md deploy; do [ -e "$rel/$f" ] && cp -a "$rel/$f" "$APP_DIR/" 2>/dev/null || true; done
  # Small copy of the pre-render script, used by 'auto-refresh' (admin edits → Google's copy).
  mkdir -p "$APP_DIR/prerender/scripts" "$APP_DIR/prerender/src/seo"
  cp "$fe/scripts/prerender.mjs" "$APP_DIR/prerender/scripts/"; cp "$fe/src/seo/seoData.mjs" "$APP_DIR/prerender/src/seo/"

  step "6/6 Checking the live site"
  local code; code="$(verify_site)"; code="${code: -3}"
  if [ "$code" = 200 ]; then ok "home page answers 200"
  elif [ -z "$code" ] || [ "$code" = 000 ]; then warn "couldn't open the site from the server itself — open $SITE_URL in your browser to check"
  else
    bad "home page answered '$code' — putting the previous website back"
    mv "$WEB_ROOT" "$WEB_ROOT.failed-$TS" && mv "$prev" "$WEB_ROOT"
    die "website switch rolled back. The new build is in $WEB_ROOT.failed-$TS; send me this output."
  fi
  if site_get /about | grep -q 'ty-prerender'; then ok "/about is served as a pre-rendered page (Google can read it)"
  else
    warn "/about isn't served from its pre-rendered file. In your nginx site config change the location / line to:"
    say  "      try_files \$uri \$uri/index.html /index.html;"
    say  "    then: sudo nginx -t && sudo systemctl reload nginx"
  fi
  site_get /api/pages | grep -q '"slug"' && ok "API reachable through the website (/api/pages)" || warn "couldn't reach /api/pages through the website from the server (check after DNS/SSL)"
  if site_get /api/health | grep -q '"visitor_ip_header": *false'; then
    warn "nginx doesn't pass the visitor's IP to the backend (per-visitor limits fall back to site-wide ones). In the location /api block add:"
    say  "      proxy_set_header X-Real-IP \$remote_addr;"
    say  "      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
    say  "    then: sudo nginx -t && sudo systemctl reload nginx"
  fi
  if [ "${WEB_SERVER:-}" = nginx ]; then nginx -t >/dev/null 2>&1 && systemctl reload nginx 2>/dev/null || true; fi

  prune_backups
  rm -rf "$work"
  echo
  say "${G}${B}Deployed.${N} Backup: $out"
  say "Open $SITE_URL, $SITE_URL/about and $SITE_URL/admin (Site images, Custom pages) to check."
  say "If anything looks wrong:  sudo bash $0 rollback"
  [ -z "$(env_value PRERENDER_COMMAND)" ] && say "Optional: sudo bash $0 auto-refresh   (admin edits update Google's copy automatically)"
  return 0
}

# ---------------------------------------------------------------------------
# rollback
# ---------------------------------------------------------------------------
rollback() {
  [ -f "$STATE_FILE" ] || die "no previous deploy recorded in $STATE_FILE"
  # shellcheck disable=SC1090
  . "$STATE_FILE"
  step "Rolling back the deploy from $DEPLOY_TS"
  [ -f "$CODE_BACKUP" ] || die "backup $CODE_BACKUP is missing"
  tar -C "$(dirname "$BACKEND_DIR")" -xzf "$CODE_BACKUP"
  ok "backend code restored"
  restart_backend
  wait_healthy && ok "backend running" || warn "backend not answering yet — check its logs"
  if [ -d "$WEB_PREVIOUS" ]; then
    mv "$WEB_ROOT" "$WEB_ROOT.rolled-back-$TS" && mv "$WEB_PREVIOUS" "$WEB_ROOT"
    ok "previous website restored (the new one is kept at $WEB_ROOT.rolled-back-$TS)"
  else warn "previous website folder $WEB_PREVIOUS not found — website left as is"; fi
  local db_backup; db_backup="$(dirname "$CODE_BACKUP")"
  rm -f "$STATE_FILE"
  say ""
  say "Rolled back. The database was not touched (this update adds data, it doesn't change existing data)."
  say "A database copy from before the deploy is in $db_backup if you ever need it."
}

# ---------------------------------------------------------------------------
# auto-refresh: let the backend re-write the pre-rendered pages after admin edits
# ---------------------------------------------------------------------------
auto_refresh() {
  report >/dev/null || true
  [ -n "${BACKEND_DIR:-}" ] && [ -n "${WEB_ROOT:-}" ] && [ -n "${API_URL:-}" ] || die "run 'check' first and fix what it reports"
  local kit="$APP_DIR/prerender" node_bin user cmd
  [ -f "$kit/scripts/prerender.mjs" ] || die "run 'deploy' first (it installs $kit)"
  node_bin="$(command -v node)"
  user="$( [ -n "$SERVICE_PID" ] && ps -o user= -p "$SERVICE_PID" | tr -d ' ' || stat -c %U "$BACKEND_DIR")"
  cmd="cd $kit && BUILD_PATH=$WEB_ROOT REACT_APP_BACKEND_URL=$API_URL REACT_APP_SITE_URL=$SITE_URL PRERENDER_API_URL=http://127.0.0.1:$BACKEND_PORT/api $node_bin scripts/prerender.mjs"
  sed -i '/^PRERENDER_COMMAND=/d' "$BACKEND_DIR/.env"
  printf 'PRERENDER_COMMAND="%s"\n' "$cmd" >> "$BACKEND_DIR/.env"
  ok "PRERENDER_COMMAND added to $BACKEND_DIR/.env"
  # The backend's user must be able to rewrite the website's HTML files.
  if ! sudo -u "$user" test -w "$WEB_ROOT"; then chown -R "$user" "$WEB_ROOT" && ok "website folder now writable by '$user'"; fi
  sudo -u "$user" env BUILD_PATH="$WEB_ROOT" REACT_APP_BACKEND_URL="$API_URL" REACT_APP_SITE_URL="$SITE_URL" PRERENDER_API_URL="http://127.0.0.1:$BACKEND_PORT/api" \
    "$node_bin" "$kit/scripts/prerender.mjs" | tail -2 | sed 's/^/  /' || warn "test run failed — check the output above"
  restart_backend; wait_healthy new && ok "backend restarted"
  say "Admin → SEO & Google now shows 'Search-engine copy: …' with an 'Update now' button."
}

# ---------------------------------------------------------------------------
case "${1:-}" in
  check) detect_all; report || true;;
  deploy) [ "$(id -u)" -eq 0 ] || die "run with sudo"; detect_all; deploy "${2:-}";;
  rollback) [ "$(id -u)" -eq 0 ] || die "run with sudo"; rollback;;
  auto-refresh) [ "$(id -u)" -eq 0 ] || die "run with sudo"; detect_all; auto_refresh;;
  *) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 1;;
esac
