#!/usr/bin/env bash
#
# One-shot bootstrap for a fresh Ubuntu 22.04 EC2 instance.
# Run as the default `ubuntu` user (has sudo). Idempotent — safe to re-run.
#
# Expects two repo URLs. Set via environment variables before running:
#   export BACKEND_REPO_URL="git@github.com:deonseyfi/BettorsOnlyBackend.git"
#   export FRONTEND_REPO_URL="git@github.com:deonseyfi/BettorsOnlyFrontEnd.git"

set -euo pipefail

: "${BACKEND_REPO_URL:?Set BACKEND_REPO_URL before running}"
: "${FRONTEND_REPO_URL:?Set FRONTEND_REPO_URL before running}"

BACKEND_DIR="/home/bettors/backend"
FRONTEND_DIR="/home/bettors/frontend"
NODE_MAJOR=20

echo "== 1. System packages =="
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg git nginx ufw

echo "== 2. Node.js ${NODE_MAJOR} via NodeSource =="
if ! command -v node >/dev/null || [ "$(node -v | grep -oE '[0-9]+' | head -1)" != "$NODE_MAJOR" ]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node --version
npm --version

echo "== 3. Application user =="
if ! id bettors >/dev/null 2>&1; then
  sudo useradd --system --create-home --shell /bin/bash bettors
fi

echo "== 4. Directories =="
sudo mkdir -p /var/www/bettorsonly/dist /var/www/certbot /etc/bettors
sudo chown -R bettors:bettors /var/www/bettorsonly

echo "== 5. Firewall =="
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

echo "== 6. Repo checkouts =="
if [ ! -d "$BACKEND_DIR/.git" ]; then
  sudo -u bettors git clone "$BACKEND_REPO_URL" "$BACKEND_DIR"
fi
if [ ! -d "$FRONTEND_DIR/.git" ]; then
  sudo -u bettors git clone "$FRONTEND_REPO_URL" "$FRONTEND_DIR"
fi

echo "== 7. Backend env file =="
if [ ! -f /etc/bettors/backend.env ]; then
  sudo tee /etc/bettors/backend.env >/dev/null <<'EOF'
# BettorsOnly production backend env. Fill these in before starting the service.
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://bettorsonly.com
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
ODDS_API_KEY=
EOF
  sudo chown root:bettors /etc/bettors/backend.env
  sudo chmod 640 /etc/bettors/backend.env
  echo "  → created /etc/bettors/backend.env — fill in the blanks now."
fi

echo "== 8. Frontend env file (baked into build) =="
# Vite reads .env.production at build time and inlines VITE_* values into the JS bundle.
# We keep it in the source dir; it's fine because anon keys are public by design.
if [ ! -f "$FRONTEND_DIR/.env.production" ]; then
  sudo -u bettors tee "$FRONTEND_DIR/.env.production" >/dev/null <<'EOF'
VITE_API_URL=https://api.bettorsonly.com/api/v1
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
EOF
  echo "  → created $FRONTEND_DIR/.env.production — fill in the anon key now."
fi

echo "== 9. systemd unit =="
sudo cp "$BACKEND_DIR/deploy/systemd/bettors-backend.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable bettors-backend
# Don't start yet — env files are empty.

echo "== 10. Temporary Nginx site (HTTP only, so Certbot can issue certs) =="
sudo tee /etc/nginx/sites-available/bettorsonly.conf >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name bettorsonly.com www.bettorsonly.com api.bettorsonly.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 404;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/bettorsonly.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "== 11. Certbot =="
sudo snap install core || true
sudo snap refresh core
sudo snap install --classic certbot || true
sudo ln -sf /snap/bin/certbot /usr/bin/certbot

PUBLIC_IP=$(curl -fsSL https://checkip.amazonaws.com || echo '<this EC2 public IP>')

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "  Bootstrap complete."
echo ""
echo "  Next steps:"
echo "    1. Verify DNS is pointing at this instance:"
echo "         dig +short bettorsonly.com     # should return $PUBLIC_IP"
echo "         dig +short api.bettorsonly.com # should return $PUBLIC_IP"
echo ""
echo "    2. Get SSL cert (wait until DNS resolves):"
echo "         sudo certbot --nginx -d bettorsonly.com -d www.bettorsonly.com -d api.bettorsonly.com \\"
echo "              --non-interactive --agree-tos -m you@example.com"
echo ""
echo "    3. Swap in the full Nginx config:"
echo "         sudo cp $BACKEND_DIR/deploy/nginx/bettorsonly.conf /etc/nginx/sites-available/bettorsonly.conf"
echo "         sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "    4. Fill in secrets:"
echo "         sudo nano /etc/bettors/backend.env"
echo "         sudo -u bettors nano $FRONTEND_DIR/.env.production"
echo ""
echo "    5. Deploy:"
echo "         sudo $BACKEND_DIR/deploy/scripts/deploy.sh"
echo "─────────────────────────────────────────────────────────────"
