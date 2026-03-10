# Quick Deployment Checklist

## Step 1: GitHub Setup (Local Machine)

```bash
cd /home/zenith/Zenith-app

git init
git add .
git commit -m "Initial commit: Zenith app"
git remote add origin https://github.com/ZenithObscure/Zenith-app-server.git
git branch -M main
git push -u origin main
```

## Step 2: Server Setup (DigitalOcean Droplet)

SSH into your droplet and run as root:

```bash
# 1. Create zenith user
adduser zenith
su - zenith

# 2. Clone and build
git clone https://github.com/ZenithObscure/Zenith-app-server.git
cd Zenith-app-server
npm install
npm run build

# 3. Create .env (exit to root first)
exit
cat > /home/zenith/zenith-app/.env << 'EOF'
NODE_ENV=production
PORT=8787
JWT_SECRET=$(openssl rand -base64 32)
ALLOWED_ORIGINS=https://zenith-app.net
DB_PATH=/home/zenith/zenith-app/backend/data/zenith.db
APP_LATEST_VERSION=0.1.0
EOF

chown zenith:zenith /home/zenith/zenith-app/.env

# 4. Setup systemd services
cp /home/zenith/zenith-app/zenith-backend.service /etc/systemd/system/
cp /home/zenith/zenith-app/zenith-deploy.service /etc/systemd/system/
cp /home/zenith/zenith-app/zenith-deploy.timer /etc/systemd/system/

chmod +x /home/zenith/zenith-app/deploy.sh
mkdir -p /var/log
touch /var/log/zenith-deploy.log
chown zenith:zenith /var/log/zenith-deploy.log

systemctl daemon-reload
systemctl enable zenith-backend
systemctl start zenith-backend
systemctl enable zenith-deploy.timer
systemctl start zenith-deploy.timer

# 5. Setup nginx
apt-get update && apt-get install -y nginx certbot python3-certbot-nginx

# Create nginx config (see DEPLOYMENT.md)
# Install SSL (certbot)
certbot certonly --nginx -d zenith-app.net
```

## Step 3: SSH Key Setup (for auto-pulls)

On server as zenith user:

```bash
ssh-keygen -t ed25519 -C "zenith-deploy@zenith-app.net" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copy the key to GitHub: https://github.com/settings/keys → "New SSH key"

Then:
```bash
git remote set-url origin git@github.com:ZenithObscure/Zenith-app-server.git
git fetch origin  # Test SSH works
```

## Step 4: Start Using It

From now on, just:

```bash
# Local machine
git add .
git commit -m "Your changes"
git push origin main

# Server auto-deploys within 1 hour
# Or manually trigger: sudo systemctl start zenith-deploy.service
```

## Verify Everything Works

```bash
# Backend running?
curl https://zenith-app.net/api/health

# Deploy logs?
sudo tail -f /var/log/zenith-deploy.log

# Next auto-deploy?
sudo systemctl list-timers zenith-deploy.timer
```

---

**Full instructions**: See [DEPLOYMENT.md](DEPLOYMENT.md)
