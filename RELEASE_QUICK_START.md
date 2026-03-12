# 🚀 Quick Release Steps

You're ready to release! Here's the streamlined process:

## Step 1: Decide on Version Number
```bash
# Check current package.json version and git tags
cat package.json | grep version
git tag
```

**Latest releases**: v0.1.0, v0.2.0, v0.3.0
**Recommended next version**: v0.3.1 (hotfix) or v0.4.0 (new features)

## Step 2: Build for All Platforms
This creates binaries and auto-update metadata files:

```bash
# All three platforms (requires tooling for each)
npm run dist:electron:linux && npm run dist:electron:win && npm run dist:electron:mac

# OR pick platforms:
npm run dist:electron:linux   # ✅ Works on your Linux machine
npm run dist:electron:win     # ⚠️ May need Windows build environment
npm run dist:electron:mac     # ⚠️ Requires macOS
```

**Output location**: `electron-dist/`
**Key files for auto-update**:
- `latest-linux.yml` → Upload to GitHub release
- `latest.yml` (Windows) → Upload to GitHub release
- `latest-mac.yml` → Upload to GitHub release

## Step 3: Create Version Tag & Push
```bash
# Update version (if needed)
npm version 0.4.0  # This updates package.json and creates tag

# Or manually:
git tag -a v0.4.0 -m "Release v0.4.0 with auto-updates"
git push origin main --tags
```

## Step 4: Create GitHub Release
1. Go to: https://github.com/ZenithObscure/Zenith-app-server/releases/new
2. **Tag**: Select your new tag (e.g., `v0.4.0`)
3. **Title**: `Zenith v0.4.0`
4. **Description**:
   ```
   ## ✨ New Features
   - Auto-update system ready
   - [Add more features here]

   ## 🐛 Bug Fixes
   - Fixed linting issues

   ## 📦 Installation
   - Linux: `Zenith-0.4.0.AppImage`
   - Windows: `Zenith-0.4.0.exe`
   - macOS: `Zenith-0.4.0.dmg`
   ```
5. **Upload Assets** (drag from `electron-dist/`):
   - ✅ `Zenith-0.4.0.AppImage`
   - ✅ `latest-linux.yml` (← **Important for auto-updates**)
   - ✅ `Zenith-0.4.0.exe` 
   - ✅ `latest.yml` (← **Important for auto-updates**)
   - ✅ `Zenith-0.4.0.dmg`
   - ✅ `latest-mac.yml` (← **Important for auto-updates**)
6. Click **"Publish release"**

## Step 5: Test Auto-Update (Optional but Recommended)
```bash
# In a test environment, install the previous version and check for updates
# Users will automatically get notified when your new release is published
```

## ✅ Your Auto-Update System is Ready!

Once published:
- 🔔 Users will see "Update v0.4.0 ready" notification in their app
- 📥 Update downloads automatically in the background
- 🔄 They click "Restart & Update" and app updates to latest version
- 📡 Checks every 2 hours + on app launch automatically

---

## 🔗 Useful Links
- GitHub Releases: https://github.com/ZenithObscure/Zenith-app-server/releases
- API Status: http://localhost:8787/api/health (local) or your server URL
- Settings Dialog: Shows current app version and update status

## 🎯 What's Happening Behind the Scenes

1. **App Launch**: Checks `api.github.com` for latest release
2. **Update Available**: Compares downloaded `latest-X.yml` with current version
3. **Auto-Download**: electron-updater quietly downloads in background
4. **Notification**: Alerts user when ready to install
5. **User Action**: Clicks "Restart & Update" → app closes, installs, relaunches

All handled by `electron-updater` + your GitHub releases! 🎉
