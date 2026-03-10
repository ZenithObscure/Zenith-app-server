# GitHub Setup Guide

This guide walks through setting up your GitHub repository and configuring it for the auto-deployment system.

## Initial GitHub Setup

### 1. Create a new GitHub repository

✅ **Done!** Your repo exists at: https://github.com/ZenithObscure/Zenith-app-server

### 2. Push your local code to GitHub

From your local machine in the `/home/zenith/Zenith-app` directory:

```bash
# If you haven't initialized git yet
git init
git add .
git commit -m "Initial commit: React+TypeScript frontend + Express backend"

# Add your GitHub repo as remote
git remote add origin https://github.com/ZenithObscure/Zenith-app-server.git
git branch -M main
git push -u origin main
```

If prompted for credentials, use a Personal Access Token (PAT):
- Go to https://github.com/settings/tokens
- Click "Generate new token (classic)"
- Select scopes: `repo` (full control of private repositories)
- Copy the token and paste it when prompted

### 3. Add SSH key for automated pulls on server

On your DigitalOcean droplet as the `zenith` user:

```bash
ssh-keygen -t ed25519 -C "zenith-deploy@zenith-app.net" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copy the output and:
1. Go to https://github.com/settings/keys
2. Click "New SSH key"
3. Title: `Zenith Deploy Key`
4. Paste the public key
5. Click "Add SSH key"

Then on the droplet, update the remote to use SSH:

```bash
cd /home/zenith/Zenith-app
git remote set-url origin git@github.com:ZenithObscure/Zenith-app-server.git
git fetch origin  # Test that SSH works
```

## Deployment Workflow

### Making updates:

1. Make code changes locally
2. Run `npm run build && npm run lint` to verify
3. Commit and push:
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin main
   ```

### Server auto-deploy:

- The droplet will automatically pull and deploy within the next hour
- Check status via:
  ```bash
  ssh zenith@104.248.39.92
  sudo tail -f /var/log/zenith-deploy.log
  ```

## Optional: GitHub Actions (for validation)

You can add CI/CD checks to validate builds before deployment. Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm install
      - run: npm run build
      - run: npm run lint
```

This will run tests on every push and show a green checkmark when all tests pass.

## Troubleshooting

**"Permission denied (publickey)"** when deploying:
- SSH key not added to GitHub (see step 3 above)
- Verify key works: `ssh -T git@github.com`

**Deploy script not running**:
- Check timer: `sudo systemctl status zenith-deploy.timer`
- Check service logs: `sudo journalctl -u zenith-deploy.service`

**Backend not starting after deploy**:
- Check service status: `sudo systemctl status zenith-backend`
- View logs: `sudo journalctl -u zenith-backend`

## Quick Reference

- **Force immediate deploy** (from droplet):
  ```bash
  sudo systemctl start zenith-deploy.service
  ```

- **Check next scheduled auto-deploy**:
  ```bash
  sudo systemctl list-timers zenith-deploy.timer
  ```

- **View all deploy logs**:
  ```bash
  sudo less /var/log/zenith-deploy.log
  ```
