# TonYoga mobile app (Android + iOS shell)

The app is the website (`../frontend`) packaged with Capacitor 8.

| | |
| --- | --- |
| Package name (Android) | `com.tonyoga.app` — the live Play Store app "TonYoga" |
| Version | `versionName` 1.1.0, `versionCode` 2026102601 (YYYYMMDDNN) in `android/app/build.gradle` |
| Android target | API 36 (Android 16) — required by Google Play since 31 Aug 2026 |
| API the app talks to | `https://tonyoga.com/api` |
| Upload key | NOT in this folder. `build-android.ps1` asks for the `.jks` file and its password |

## Build the Android release (Windows)

1. Android Studio must be installed (latest version — it brings Java 21 and the Android SDK).
2. Double-click **Build Android app.bat**. It finds Java and the SDK, asks for the upload keystore
   (`tonyoga-upload-new.jks`, alias `tonyoga-upload`) and its password, builds, and puts
   `TonYoga-1.1.0-2026102601.aab` on the Desktop. The first build downloads about 1 GB (5–15 minutes).
3. Play Console → TonYoga → Test and release → Production → Create new release → upload the `.aab`.

## Next update

```sh
# 1. build the website for the app (from ../frontend)
REACT_APP_BACKEND_URL=https://tonyoga.com REACT_APP_SITE_URL=https://tonyoga.com BUILD_PATH=../mobile/www npx craco build
# 2. copy it into the native projects
cd ../mobile && npm install && npx cap sync
# 3. raise versionCode (new date, e.g. 2026120101) and versionName in android/app/build.gradle, then run the .bat again
```

## iOS

Needs a Mac with Xcode 26 (App Store Connect requirement since 28 Apr 2026). Use the bundle ID of the live
iPhone app: `npm install`, `npx cap add ios` (first time only), set the bundle ID / team in Xcode, raise
Version and Build, Product → Archive → Distribute App → App Store Connect.
