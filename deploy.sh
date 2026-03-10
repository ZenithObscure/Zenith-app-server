#!/bin/bash
# Deployment script for Zenith backend
# Checks GitHub repo for updates and auto-deploys every hour via cron

set -e

REPO_DIR="/home/zenith/Zenith-app"
SERVICE_NAME="zenith-backend"
LOG_FILE="/var/log/zenith-deploy.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "=== Starting deployment check ==="

cd "$REPO_DIR"

# Fetch latest from origin
git fetch origin main || { log "Git fetch failed"; exit 1; }

# Check if there are new commits
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  log "No updates available (local=$LOCAL, remote=$REMOTE)"
  exit 0
fi

log "Updates found. Deploying (local=$LOCAL, remote=$REMOTE)"

# Pull latest code
git pull origin main || { log "Git pull failed"; exit 1; }

# Install dependencies
npm install >> "$LOG_FILE" 2>&1 || { log "npm install failed"; exit 1; }

# Build frontend and backend
npm run build >> "$LOG_FILE" 2>&1 || { log "Build failed"; exit 1; }

# Restart backend service
systemctl restart $SERVICE_NAME || { log "Failed to restart service"; exit 1; }

log "✓ Deployment successful. Service restarted."
