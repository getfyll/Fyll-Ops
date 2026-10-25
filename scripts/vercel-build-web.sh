#!/usr/bin/env sh
set -eu

npx expo export -p web

mkdir -p dist/onesignal
cp web/onesignal/OneSignalSDKWorker.js dist/onesignal/OneSignalSDKWorker.js
cp web/onesignal/OneSignalSDKUpdaterWorker.js dist/onesignal/OneSignalSDKUpdaterWorker.js

# Keep root-level workers for backward compatibility.
cp web/OneSignalSDKWorker.js dist/OneSignalSDKWorker.js
cp web/OneSignalSDKUpdaterWorker.js dist/OneSignalSDKUpdaterWorker.js
cp web/OneSignalSDK.sw.js dist/OneSignalSDK.sw.js

# Publish the release notes so open tabs can detect a new version and offer a refresh.
cp src/data/release-notes.json dist/release-notes.json

# fyll.app landing page (middleware.js serves it at "/" on fyll.app and www.fyll.app).
mkdir -p dist/landing
cp -R web/landing/. dist/landing/
