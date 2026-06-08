# Fastlane (iOS / Android)

Scaffold for future mobile release automation. Desktop builds use GitHub Actions (`.github/workflows/release.yml`).

## Setup

```bash
bundle install
npm ci
```

## Lanes

| Command | Purpose |
|---------|---------|
| `bundle exec fastlane ios build` | Tauri iOS release build |
| `bundle exec fastlane android build` | Tauri Android release build |
| `bundle exec fastlane ios beta` | Build + TestFlight (wire signing first) |
| `bundle exec fastlane android internal` | Build + Play internal track |

## Before first store upload

### iOS

1. Set `APPLE_ID`, `APPLE_TEAM_ID`, and App Store Connect API key (`.p8`) in CI secrets or local env.
2. Configure code signing in Xcode (`src-tauri/gen/apple/`).
3. Uncomment `upload_to_testflight` in `Fastfile`.

### Android

1. Create a Play Console service account JSON key.
2. Set `PLAY_STORE_JSON_KEY` to its path (do not commit the file).
3. Configure release signing in `src-tauri/gen/android/`.
4. Uncomment `upload_to_play_store` in `Fastfile`.

## Version

App version is read from root `package.json` by Tauri (`tauri.conf.json` → `"version": "../package.json"`). Lanes run `npm run version:sync` before building to align Rust `Cargo.toml` crate versions.
