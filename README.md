# Zenith-app.net

React + TypeScript web app scaffold for Zenith-app.net.

## Why this stack

- React gets the web product shipped quickly.
- The UI and business logic can later be wrapped with Electron for desktop.
- Vite keeps local development and builds fast.

## Scripts

- `npm run dev`: Start local dev server.
- `npm run dev:web`: Start local Vite web server.
- `npm run dev:api`: Start backend API server on `http://localhost:8787`.
- `npm run build`: Type-check and create production build.
- `npm run preview`: Preview the built app.
- `npm run lint`: Run lint checks.

## Backend API (current)

The backend is implemented in `backend/src/index.ts` with SQLite persistence (`better-sqlite3`).
Default DB file: `backend/data/zenith.db`.

### Security Features
- **Rate limiting**: 5 attempts per 15 minutes on auth endpoints (`/api/auth/signup` and `/api/auth/login`).
- **Helmet**: Security headers (CSP, X-Frame-Options, HSTS, etc.).
- **CORS validation**: Restrict origins to `ALLOWED_ORIGINS` (default: localhost dev servers).
- **JWT tokens**: 7-day expiry; all write operations require bearer token.
- **Password hashing**: bcrypt (cost factor 12); legacy plaintext auto-migrated on login.

### Environment Variables
- `PORT`: API server port (default `8787`).
- `APP_LATEST_VERSION`: value returned by updates endpoint.
- `DB_PATH`: custom SQLite file path.
- `JWT_SECRET`: signing key for auth tokens (required in production).
- `ALLOWED_ORIGINS`: comma-separated list of allowed CORS origins (e.g., `http://localhost:3000,https://zenith-app.net`).
- `NODE_ENV`: set to `production` in production (enables stricter error messages).

### API Endpoints
- `GET /api/health`: Health check.
- `POST /api/auth/signup`: Create account (rate limited).
- `POST /api/auth/login`: Login (rate limited).
- `POST /api/auth/logout`: Logout (client-side clearing of token is primary method).
- `GET /api/state`: Combined state snapshot for devices/drive/hivemind/tokens (`Bearer` token required).
- `GET /api/devices`: List devices (`Bearer` token required).
- `POST /api/devices`: Add device (`Bearer` token required).
- `PATCH /api/devices/:id`: Update device (`Bearer` token required).
- `DELETE /api/devices/:id`: Delete device (`Bearer` token required).
- `GET /api/drive`: List drive nodes (`Bearer` token required).
- `POST /api/drive`: Create drive node (`Bearer` token required).
- `PATCH /api/drive/:id`: Rename/update drive node (`Bearer` token required).
- `DELETE /api/drive/:id`: Delete drive node recursively (`Bearer` token required).
- `POST /api/hivemind/dispatch`: Split query across online devices and reward tokens (`Bearer` token required).
- `GET /api/updates/latest`: Returns update metadata for desktop updater integration.

## Desktop plan (next phase)

1. Add an Electron shell that loads the Vite build output.
2. Move shared logic into `src/core` so web and desktop use the same code.
3. Add desktop-specific adapters for file system, notifications, and updates.

## Production Deployment (DigitalOcean)

### Initial Setup (one-time)

1. **SSH into your droplet** (Ubuntu):
   ```bash
   ssh root@104.248.39.92
   ```

2. **Create zenith user and set up project**:
   ```bash
   adduser zenith
   su - zenith
   git clone https://github.com/YOUR_GITHUB_USERNAME/zenith-app.git
   cd zenith-app
   npm install
   npm run build
   ```

3. **Create production `.env`**:
   ```bash
   cat > .env << 'EOF'
   NODE_ENV=production
   PORT=8787
   JWT_SECRET=$(openssl rand -base64 32)
   ALLOWED_ORIGINS=https://zenith-app.net
   DB_PATH=/home/zenith/zenith-app/backend/data/zenith.db
   APP_LATEST_VERSION=0.1.0
   EOF
   ```

4. **Set up systemd backend service**:
   ```bash
   sudo cp zenith-backend.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable zenith-backend
   sudo systemctl start zenith-backend
   ```

5. **Set up auto-deploy (systemd timer)**:
   ```bash
   sudo cp zenith-deploy.service zenith-deploy.timer /etc/systemd/system/
   sudo chmod +x deploy.sh
   sudo mkdir -p /var/log && sudo touch /var/log/zenith-deploy.log
   sudo chown zenith:zenith /var/log/zenith-deploy.log
   sudo systemctl daemon-reload
   sudo systemctl enable zenith-deploy.timer
   sudo systemctl start zenith-deploy.timer
   ```

6. **Set up nginx reverse proxy**:
   ```bash
   sudo apt-get install nginx
   sudo tee /etc/nginx/sites-available/zenith-app.net > /dev/null << 'EOF'
   server {
     listen 80;
     listen [::]:80;
     server_name zenith-app.net;
     return 301 https://$server_name$request_uri;
   }

   server {
     listen 443 ssl http2;
     listen [::]:443 ssl http2;
     server_name zenith-app.net;

     ssl_certificate /etc/letsencrypt/live/zenith-app.net/fullchain.pem;
     ssl_certificate_key /etc/letsencrypt/live/zenith-app.net/privkey.pem;
     ssl_protocols TLSv1.2 TLSv1.3;
     ssl_ciphers HIGH:!aNULL:!MD5;

     root /home/zenith/Zenith-app/dist;
     index index.html;

     # Serve static assets
     location /assets {
       expires 1y;
       add_header Cache-Control "public, immutable";
     }

     # API proxy
     location /api {
       proxy_pass http://localhost:8787;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_cache_bypass $http_upgrade;
     }

     # SPA fallback
     location / {
       try_files $uri /index.html;
     }
   }
   EOF
   ```

7. **Enable nginx config**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/zenith-app.net /etc/nginx/sites-enabled/
   sudo systemctl restart nginx
   ```

8. **Set up SSL with Let's Encrypt**:
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot certonly --nginx -d zenith-app.net
   ```

### Monitoring & Logs

- **Backend logs**: `sudo journalctl -u zenith-backend -f`
- **Deploy logs**: `sudo tail -f /var/log/zenith-deploy.log`
- **Timer status**: `sudo systemctl status zenith-deploy.timer`
- **Check next deploy time**: `sudo systemctl list-timers zenith-deploy.timer`

### Auto-Deploy Workflow

1. Commit and push to GitHub
2. The `zenith-deploy.timer` runs hourly (every 60 minutes after boot)
3. `deploy.sh` fetches latest changes and rebuilds if needed
4. Service automatically restarts on new deployment
5. DNS serves the updated app immediately

No SSH required after initial setup! Just push to GitHub.
