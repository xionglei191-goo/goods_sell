#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -f .env.deploy.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.deploy.local
  set +a
fi

DEPLOY_HOST="${DEPLOY_HOST:-103.229.126.92}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/data/goods_sell}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
PM2_APP="${PM2_APP:-goods_sell}"
DEPLOY_MODE="${DEPLOY_MODE:-archive}"
RUN_LOCAL_CHECKS="${RUN_LOCAL_CHECKS:-1}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"
RUN_SEED="${RUN_SEED:-0}"
SSH_STRICT_HOST_KEY="${SSH_STRICT_HOST_KEY:-accept-new}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"

usage() {
  cat <<'USAGE'
Deploy HuaQi Mall to the configured VPS.

Usage:
  npm run deploy:vps
  bash scripts/deploy-vps.sh

Environment overrides:
  DEPLOY_HOST=103.229.126.92
  DEPLOY_USER=root
  DEPLOY_PATH=/data/goods_sell
  DEPLOY_BRANCH=main
  PM2_APP=goods_sell
  DEPLOY_MODE=archive   # archive for this VPS; git for git-backed deploy dirs
  RUN_LOCAL_CHECKS=1     # run lint, tsc, build locally before deploying
  RUN_MIGRATIONS=1       # run prisma migrate deploy on the server
  RUN_SEED=0             # run prisma db seed on the server
  DEPLOY_SSH_KEY=~/.ssh/goods_sell_deploy_ed25519
  DEPLOY_PASSWORD=...    # optional; requires sshpass. Prefer SSH keys.

Examples:
  npm run deploy:vps
  DEPLOY_PATH=/www/wwwroot/goods_sell PM2_APP=goods_sell npm run deploy:vps
  DEPLOY_MODE=git npm run deploy:vps
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
if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  ssh_options+=(-i "$DEPLOY_SSH_KEY" -o "IdentitiesOnly=yes")
fi

ssh_cmd=(ssh "${ssh_options[@]}")
scp_cmd=(scp "${ssh_options[@]}")
if [[ -n "${DEPLOY_PASSWORD:-}" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    die "DEPLOY_PASSWORD was provided, but sshpass is not installed. Install sshpass or use SSH keys."
  fi
  export SSHPASS="$DEPLOY_PASSWORD"
  ssh_cmd=(sshpass -e ssh "${ssh_options[@]}")
  scp_cmd=(sshpass -e scp "${ssh_options[@]}")
fi

remote="${DEPLOY_USER}@${DEPLOY_HOST}"
remote_env="DEPLOY_PATH=$(quote "$DEPLOY_PATH") DEPLOY_BRANCH=$(quote "$DEPLOY_BRANCH") PM2_APP=$(quote "$PM2_APP") RUN_MIGRATIONS=$(quote "$RUN_MIGRATIONS") RUN_SEED=$(quote "$RUN_SEED")"

deploy_remote() {
  "${ssh_cmd[@]}" "$remote" "$remote_env RELEASE_ARCHIVE=${1:+$(quote "$1")} bash -s" <<'REMOTE_SCRIPT'
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

if [[ -n "${RELEASE_ARCHIVE:-}" ]]; then
  if [[ ! -f "$RELEASE_ARCHIVE" ]]; then
    die "release archive does not exist on server: $RELEASE_ARCHIVE"
  fi
  log "Extracting release archive"
  tar -xzf "$RELEASE_ARCHIVE" -C "$DEPLOY_PATH"
else
  if [[ ! -d .git ]]; then
    die "$DEPLOY_PATH is not a git repository. Use DEPLOY_MODE=archive for this server."
  fi
  log "Pulling latest code"
  git fetch origin "$DEPLOY_BRANCH"
  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" != "$DEPLOY_BRANCH" ]]; then
    git checkout "$DEPLOY_BRANCH"
  fi
  git pull --ff-only origin "$DEPLOY_BRANCH"
fi

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
pm2 describe "$PM2_APP" >/dev/null
log "PM2 app is online: $PM2_APP"
REMOTE_SCRIPT
}

case "$DEPLOY_MODE" in
  archive)
    release_name="goods_sell-${local_head:0:7}.tar.gz"
    local_release="${TMPDIR:-/tmp}/$release_name"
    remote_release="/tmp/$release_name"
    log "Creating release archive: $local_release"
    git archive --format=tar.gz -o "$local_release" HEAD
    log "Uploading release archive to $remote:$remote_release"
    "${scp_cmd[@]}" "$local_release" "$remote:$remote_release"
    log "Deploying archive to $remote:$DEPLOY_PATH"
    deploy_remote "$remote_release"
    rm -f "$local_release"
    ;;
  git)
    log "Deploying origin/$DEPLOY_BRANCH to $remote:$DEPLOY_PATH"
    deploy_remote ""
    ;;
  *)
    die "unsupported DEPLOY_MODE: $DEPLOY_MODE"
    ;;
esac

log "Deployment finished"
