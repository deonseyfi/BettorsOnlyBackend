#!/usr/bin/env bash
#
# Deploy both projects from their checked-out repos on the EC2 host.
# Pulls latest, builds both, swaps the frontend build into Nginx's web root,
# restarts the backend service.
#
# Run on the EC2 instance:
#   sudo /home/bettors/backend/deploy/scripts/deploy.sh
#
# For a remote deploy from your laptop:
#   ssh -i ~/.ssh/bettorsonly-key.pem ubuntu@bettorsonly.com \
#     "sudo /home/bettors/backend/deploy/scripts/deploy.sh"

set -euo pipefail

BACKEND_DIR="/home/bettors/backend"
FRONTEND_DIR="/home/bettors/frontend"
WEB_ROOT="/var/www/bettorsonly/dist"

echo "== 1. Pull latest =="
sudo -u bettors git -C "$BACKEND_DIR" fetch --all
sudo -u bettors git -C "$BACKEND_DIR" reset --hard origin/main
sudo -u bettors git -C "$FRONTEND_DIR" fetch --all
sudo -u bettors git -C "$FRONTEND_DIR" reset --hard origin/main

echo "== 2. Backend build =="
cd "$BACKEND_DIR"
sudo -u bettors npm ci
sudo -u bettors npm run build

echo "== 3. Frontend build =="
cd "$FRONTEND_DIR"
# Vite bakes VITE_* env vars in at build time from .env.production.
sudo -u bettors npm ci
sudo -u bettors npm run build

echo "== 4. Deploy frontend (atomic-ish swap) =="
sudo rm -rf "${WEB_ROOT}.new" "${WEB_ROOT}.old" 2>/dev/null || true
sudo mkdir -p "${WEB_ROOT}.new"
sudo rsync -a --delete "$FRONTEND_DIR/dist/" "${WEB_ROOT}.new/"
if [ -d "$WEB_ROOT" ]; then sudo mv "$WEB_ROOT" "${WEB_ROOT}.old"; fi
sudo mv "${WEB_ROOT}.new" "$WEB_ROOT"
sudo chown -R bettors:bettors "$WEB_ROOT"

echo "== 5. Restart backend =="
sudo systemctl restart bettors-backend
sleep 2
sudo systemctl status bettors-backend --no-pager --lines=5

echo "== 6. Health check =="
if curl -fsS https://api.bettorsonly.com/health >/dev/null; then
  echo "  ✓ Backend healthy"
else
  echo "  ✗ Backend not responding — check: sudo journalctl -u bettors-backend -n 50"
  exit 1
fi

echo ""
echo "Deploy complete."
