# Video Downloader Android APK

React + Vite + Capacitor 6 app for downloading direct public HTTP/HTTPS video file URLs to Android's Downloads folder using the native Android DownloadManager. It includes URL preview, progress polling, and locally stored history.

## Build an APK using GitHub Actions

1. Create a new GitHub repository, for example `video-downloader`.
2. Upload all files in this folder to the repository root (including `.github/workflows/build-apk.yml`).
3. Ensure the default branch is named `main`.
4. Open **Actions** in the repository and select **Build Video Downloader APK**.
5. Press **Run workflow** (or push a commit to `main`).
6. Open the completed workflow run and download the **Video-Downloader-APK** artifact.
7. Extract the artifact ZIP on your phone and install `app-debug.apk`. If Android asks, allow installation from that file manager/browser. Only install APKs you built or trust.

## Local development

Requires Node.js 20, JDK 17, Android SDK and Gradle. Run:

```bash
npm install
npm run build
npx cap add android
node scripts/register-native-plugin.mjs
npx cap sync android
cd android && gradle assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Supported URLs and limitations

- Use a direct, publicly accessible `https://.../video.mp4` or `.webm` URL. Redirecting URLs can work if they resolve to a downloadable file.
- This does not extract videos from YouTube, social media pages, DRM-protected streams, or login-only sites.
- The native Android DownloadManager handles the actual file transfer and shows a system notification. The app polls status while it is open; download history is stored in local app storage.
- The web preview mode needs the source server to permit CORS for downloading. Native Android downloads do not use browser CORS, but the server still must allow the request.
- The native plugin is written for the generated Capacitor Android app. Run the registration script only once on a freshly generated Android project; it skips a MainActivity that already registers the plugin.
