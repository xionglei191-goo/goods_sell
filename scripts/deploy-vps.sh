#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-103.229.126.92}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/huaqi-mall}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
PM2_APP="${PM2_APP:-huaqi-mall}"
RUN_LOCAL_CHECKS="${RUN_LOCAL_CHECKS:-1}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"
RUN_SEED="${RUN_SEED:-0}"
SSH_STRICT_HOST_KEY="${SSH_STRICT_HOST_KEY:-accept-new}"

usage() {
  cat <<'USAGE'
Deploy HuaQi Mall to the configured VPS.

Usage:
  npm run deploy:vps
  bash scripts/deploy-vps.sh

Environment overrides:
  DEPLOY_HOST=103.229.126.92
  DEPLOY_USER=root
  DEPLOY_PATH=/var/www/huaqi-mall
  DEPLOY_BRANCH=main
  PM2_APP=huaqi-mall
  RUN_LOCAL_CHECKS=1     # run lint, tsc, build locally before deploying
  RUN_MIGRATIONS=1       # run prisma migrate deploy on the server
  RUN_SEED=0             # run prisma db seed on the server
  DEPLOY_PASSWORD=...    # optional; requires sshpass. Prefer SSH keys.

Examples:
  npm run deploy:vps
  DEPLOY_PATH=/www/wwwroot/goods_sell PM2_APP=goods-sell npm run deploy:vps
  DEPLOY_PASSWORD='...' npm run deploy:vps
USAGE
}

log() {
  printf '\n\033[1;36m==>\033[0m %s\n' "$*"
}

die() {
  printf '\n\033[1;31mError:\033[0m %s\n' "$*" >&2
  exit 1
}

quote() {
  printf '%q' "$1"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! -d .git ]]; then
  die "please run this script from the project root"
fi

if [[ "$RUN_LOCAL_CHECKS" == "1" ]]; then
  log "Running local checks"
  npm run lint
  npx tsc --noEmit
  npm run build
fi

log "Checking local git state"
git fetch origin "$DEPLOY_BRANCH"
local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse "origin/$DEPLOY_BRANCH")"

if [[ "$local_head" != "$remote_head" ]]; then
  die "local HEAD ($local_head) is not pushed to origin/$DEPLOY_BRANCH ($remote_head). Push first, then deploy."
fi

if [[ -n "$(git status --porcelain)" ]]; then
  die "working tree has uncommitted changes. Commit or stash them before deploying."
fi

ssh_options=(-o "ServerAliveInterval=30" -o "ServerAliveCountMax=6")
if [[ -n "$SSH_STRICT_HOST_KEY" ]]; then
  ssh_options+=(-o "StrictHostKeyChecking=$SSH_STRICT_HOST_KEY")
fi

ssh_cmd=(ssh "${ssh_options[@]}")
if [[ -n "${DEPLOY_PASSWORD:-}" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    die "DEPLOY_PASSWORD was provided, but sshpass is not installed. Install sshpass or use SSH keys."
  fi
  export SSHPASS="$DEPLOY_PASSWORD"
  ssh_cmd=(sshpass -e ssh "${ssh_options[@]}")
fi

remote="${DEPLOY_USER}@${DEPLOY_HOST}"
remote_env="DEPLOY_PATH=$(quote "$DEPLOY_PATH") DEPLOY_BRANCH=$(quote "$DEPLOY_BRANCH") PM2_APP=$(quote "$PM2_APP") RUN_MIGRATIONS=$(quote "$RUN_MIGRATIONS") RUN_SEED=$(quote "$RUN_SEED")"

log "Deploying origin/$DEPLOY_BRANCH to $remote:$DEPLOY_PATH"
"${ssh_cmd[@]}" "$remote" "$remote_env bash -s" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

log() {
  printf '\n\033[1;36m==>\033[0m %s\n' "$*"
}

die() {
  printf '\n\033[1;31mError:\033[0m %s\n' "$*" >&2
  exit 1
}

if [[ ! -d "$DEPLOY_PATH" ]]; then
  die "deploy path does not exist: $DEPLOY_PATH"
fi

cd "$DEPLOY_PATH"

if [[ ! -d .git ]]; then
  die "$DEPLOY_PATH is not a git repository"
fi

log "Pulling latest code"
git fetch origin "$DEPLOY_BRANCH"
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$DEPLOY_BRANCH" ]]; then
  git checkout "$DEPLOY_BRANCH"
fi
git pull --ff-only origin "$DEPLOY_BRANCH"

log "Installing dependencies"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

if [[ "$RUN_MIGRATIONS" == "1" ]]; then
  log "Running database migrations"
  npx prisma migrate deploy
fi

if [[ "$RUN_SEED" == "1" ]]; then
  log "Running database seed"
  npx prisma db seed
fi

log "Building application"
npm run build

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2"
  npm install -g pm2
fi

log "Restarting PM2 app: $PM2_APP"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  pm2 start npm --name "$PM2_APP" -- start
fi
pm2 save
pm2 list
REMOTE_SCRIPT

log "Deployment finished"
