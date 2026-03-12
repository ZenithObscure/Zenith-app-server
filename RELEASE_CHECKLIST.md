# Zenith Release Checklist

## 🎯 Pre-Release (Local Machine)

### 1. Code Preparation
- [x] Fix linting issues
- [x] Commit changes to GitHub
- [x] Push to GitHub main branch
- [ ] Run full test suite (if applicable)
- [ ] Verify no TypeScript errors: `npm run build`
- [ ] Check lint: `npm run lint`

### 2. Version Management
- [ ] Current version in `package.json`: **0.1.0**
- [ ] Decide on version bump (e.g., 0.2.0, 0.3.0, 1.0.0)
- [ ] Update `package.json` version if needed
- [ ] Commit version bump: `git add package.json && git commit -m "chore: bump to v0.X.X"`
- [ ] Push to GitHub: `git push origin main`

### 3. Create Git Tag & Release
```bash
# Create annotated tag (required for GitHub releases)
git tag -a v0.X.X -m "Release v0.X.X - [Release description]"

# Push tag to GitHub
git push origin v0.X.X
```

## 🔨 Build for Release (All Platforms)

### Option A: Linux (AppImage)
```bash
npm run dist:electron:linux
# Creates: electron-dist/Zenith-0.X.X.AppImage
# Also creates: electron-dist/latest-linux.yml (for auto-updates)
```

### Option B: Windows (NSIS installer)
```bash
npm run dist:electron:win
# Creates: electron-dist/Zenith-0.X.X.exe
# Creates 32-bit and 64-bit versions
```

### Option C: macOS (DMG)
```bash
npm run dist:electron:mac
# Creates: electron-dist/Zenith-0.X.X.dmg
# Creates both x64 and ARM64 architectures
```

### All Platforms at Once
```bash
npm run dist:electron:linux && npm run dist:electron:win && npm run dist:electron:mac
# This requires build tools for all three platforms
```

## 📦 GitHub Release Creation

1. Go to: https://github.com/ZenithObscure/Zenith-app-server/releases
2. Click "Draft a new release"
3. **Tag version**: `v0.X.X` (exact match with your git tag)
4. **Release title**: `Zenith v0.X.X`
5. **Description**: 
   ```markdown
   ## What's New
   - Feature 1
   - Feature 2
   - Bug fixes

   ## Auto-Update
   This release includes auto-update support. Existing users will be notified 
   when this version is available and can update directly from the app.

   ## Installation
   - Linux: Download `Zenith-0.X.X.AppImage`
   - Windows: Download `Zenith-0.X.X.exe`
   - macOS: Download `Zenith-0.X.X.dmg`
   ```
6. **Upload assets**:
   - Drag and drop from `electron-dist/`:
     - `Zenith-0.X.X.AppImage`
     - `latest-linux.yml` (needed for Linux auto-updates)
     - `Zenith-0.X.X.exe` (Windows)
     - `latest.yml` (Windows auto-updates)
     - `Zenith-0.X.X.dmg` (macOS)
     - `latest-mac.yml` (macOS auto-updates)
7. Click "Publish release"

## 🔄 Auto-Update Configuration

The auto-update system uses `electron-updater` which reads from GitHub releases:

- **Linux**: Checks `https://github.com/ZenithObscure/Zenith-app-server/releases/download/v0.X.X/latest-linux.yml`
- **Windows**: Checks `https://github.com/ZenithObscure/Zenith-app-server/releases/download/v0.X.X/latest.yml`
- **macOS**: Checks `https://github.com/ZenithObscure/Zenith-app-server/releases/download/v0.X.X/latest-mac.yml`

**⚠️ Important**: electron-builder automatically generates `latest-X.yml` files during build. These **must** be uploaded to the GitHub release for auto-updates to work.

## ✅ Testing Auto-Update (Before Full Release)

1. **Create a pre-release on GitHub** with a future version
2. **Manually trigger update check**:
   ```javascript
   // In DevTools console (Electron app)
   window.electronAPI?.onUpdateAvailable((v) => console.log('Update available:', v))
   ```
3. **Verify update notification appears** in the UI
4. **Check that "Restart & Update" button works**
5. **Confirm app restarts with new version**

## 🚀 Server Deployment

The backend server on DigitalOcean automatically deploys when you push to GitHub.

### Manual Deployment Steps (if needed)
```bash
# SSH into server
ssh zenith@104.248.39.92

# Navigate to app directory
cd /home/zenith/Zenith-app

# Pull latest from GitHub
git pull origin main

# Install dependencies
npm install

# Build (frontend + backend)
npm run build

# Restart backend service
sudo systemctl restart zenith-backend

# Check logs
sudo journalctl -u zenith-backend -f
```

## 📢 Communicating the Release

1. **Version endpoint** returns the latest version automatically:
   - Endpoint: `GET http://localhost:8787/api/app-status`
   - Returns: `{ latestVersion: "0.X.X", ... }`
   
2. **In-app notification** system:
   - Electron detects new version on launch
   - Native notification appears when update is downloaded
   - Banner shows in settings with "Restart & Update" button

## ⚠️ Troubleshooting Auto-Updates

### Users don't see update notification
1. Check they're running an older version (compare with GitHub releases)
2. Verify `latest-X.yml` files are uploaded to GitHub release
3. Confirm `package.json` version is higher than user's current version
4. Check browser DevTools: `window.electronAPI.getVersion()`

### Update downloads but won't install
1. Check GitHub release assets are properly uploaded
2. Verify file signatures (if enabled in electron-builder)
3. Check disk space on user's machine
4. Review `electron-updater` logs in app data directory

### Network/Firewall Issues
- electron-updater connects to: `api.github.com` and `github.com`
- Ensure DNS resolution works for GitHub domains

## 📋 Final Release Checklist

- [ ] All code committed and pushed to GitHub
- [ ] Git tag created and pushed
- [ ] `package.json` version updated
- [ ] Build artifacts created for all platforms
- [ ] GitHub release created with all assets
- [ ] `latest-X.yml` files included in release
- [ ] Auto-update tested on local build
- [ ] Backend server is running and healthy
- [ ] Backend returns correct `latestVersion` in API
- [ ] Documentation updated (if applicable)

## 🎉 After Release

1. Monitor update adoption in app telemetry
2. Watch for auto-update error reports
3. Be ready to hotfix critical issues
4. Document release notes for next iteration

---

**Next Release Version**: Decide on bump strategy (semantic versioning)
- `0.2.0` - Minor feature addition
- `0.3.0` - Multiple features or significant changes
- `1.0.0` - Major release / production-ready
