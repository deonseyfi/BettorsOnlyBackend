# Deploying BettorsOnly to AWS EC2

Architecture: one EC2 instance running Nginx + a Node backend.

- `bettorsonly.com` and `www.bettorsonly.com` → Nginx serves the built React SPA from `/var/www/bettorsonly/dist`.
- `api.bettorsonly.com` → Nginx reverse-proxies to the Node backend on `127.0.0.1:3000`.
- All three share a single Let's Encrypt SAN certificate.

## 1. Provision the EC2 instance

1. AWS Console → **EC2** → **Launch instance**.
2. Name: `bettorsonly-prod`.
3. AMI: **Ubuntu Server 22.04 LTS** (arm64 is fine — Node runs on Graviton).
4. Instance type: **t3.small** (2 vCPU, 2 GB RAM) or **t4g.small** for arm64 Graviton. Either is ~$15/mo on-demand, ~$6/mo with a 1-year Compute Savings Plan.
5. Key pair: create or reuse a key. **Save the `.pem` file.**
6. Network settings → **Edit** → allow SSH (port 22 from your IP), HTTP (80 from anywhere), HTTPS (443 from anywhere). Nothing else.
7. Storage: 20 GB gp3 is plenty.
8. Launch.

Grab the **public IPv4 address** from the instance details.

## 2. Point DNS at the instance

At your registrar (Namecheap / GoDaddy / Cloudflare), add three A records:

| Host | Type | Value | TTL |
|---|---|---|---|
| `@` (or `bettorsonly.com`) | A | *EC2 public IP* | 300 |
| `www` | A | *EC2 public IP* | 300 |
| `api` | A | *EC2 public IP* | 300 |

Wait 2–5 minutes, then verify with `dig +short bettorsonly.com` from your laptop — it should return the EC2 IP.

## 3. Bootstrap the server

SSH in and run the bootstrap script.

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@<EC2 IP>

# Set your repo URL first if using a private repo (also add a deploy key)
export REPO_URL="git@github.com:deonseyfi/bettorsonly.git"
curl -fsSL https://raw.githubusercontent.com/deonseyfi/bettorsonly/main/deploy/scripts/setup-ec2.sh | bash
```

The script:
- installs Node 20, Nginx, Certbot, UFW
- creates a `bettors` system user and clones the repo into `/home/bettors/repo`
- creates `/etc/bettors/backend.env` with blank env vars
- installs a temporary HTTP-only Nginx config (needed for Certbot's ACME challenge)
- registers the systemd unit but doesn't start it yet

## 4. Get the SSL certificate

Once DNS is resolving, run:

```bash
sudo certbot --nginx \
  -d bettorsonly.com -d www.bettorsonly.com -d api.bettorsonly.com \
  --non-interactive --agree-tos -m you@example.com
```

Certbot writes a working HTTPS config and sets up auto-renewal.

Then swap in the full config we ship in the repo:

```bash
sudo cp /home/bettors/repo/deploy/nginx/bettorsonly.conf /etc/nginx/sites-available/bettorsonly.conf
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Fill in backend env

```bash
sudo nano /etc/bettors/backend.env
```

Set the values from your local `.env`. Do **not** commit this file. Keep the `service_role` key here only — never in the frontend.

```
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://bettorsonly.com
SUPABASE_URL=https://mgsmasktcxcgnwndqiie.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # service_role, NOT anon
STRIPE_SECRET_KEY=sk_test_...      # or sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ODDS_API_KEY=9ba4075939c70635fc0110020f3793e0
```

## 6. First deploy

```bash
sudo /home/bettors/repo/deploy/scripts/deploy.sh
```

The script pulls, builds both projects, atomically swaps the frontend build into the web root, and restarts the systemd service. It ends with a health check hitting `https://api.bettorsonly.com/health`.

## 7. Point Stripe webhook at the new URL

Stripe dashboard → **Developers → Webhooks** → **Add endpoint**:
- URL: `https://api.bettorsonly.com/api/v1/webhooks/stripe`
- Events: `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`, `payment_intent.succeeded`, `payment_intent.payment_failed`
- Copy the signing secret and paste into `STRIPE_WEBHOOK_SECRET` in `/etc/bettors/backend.env`
- `sudo systemctl restart bettors-backend`

---

## Subsequent deploys

Push to `main`, then either:

```bash
# From the EC2 host
sudo /home/bettors/repo/deploy/scripts/deploy.sh
```

or from your laptop:

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@bettorsonly.com \
  "sudo /home/bettors/repo/deploy/scripts/deploy.sh"
```

## Common maintenance

| Task | Command |
|---|---|
| Tail backend logs | `sudo journalctl -u bettors-backend -f` |
| Tail Nginx access | `sudo tail -f /var/log/nginx/bettorsonly.access.log` |
| Renew cert (auto, but force) | `sudo certbot renew --force-renewal` |
| Restart backend only | `sudo systemctl restart bettors-backend` |
| Nginx config test | `sudo nginx -t` |
| Rollback frontend | `sudo mv /var/www/bettorsonly/dist{,.broken} && sudo mv /var/www/bettorsonly/dist.old /var/www/bettorsonly/dist && sudo systemctl reload nginx` |

## Cost estimate

- t3.small on-demand: ~$15/mo
- 20 GB gp3: ~$1.60/mo
- Data transfer (light): ~$1/mo
- Route 53 hosted zone (if you use it): $0.50/mo
- **Total: ~$18/mo** (or ~$8/mo with a 1-year Savings Plan)

Plus your existing costs: Supabase (free tier fine), The Odds API ($30/mo Starter), Stripe (fee per transaction).
