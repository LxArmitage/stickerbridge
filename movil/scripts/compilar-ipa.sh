#!/usr/bin/env bash
# Compila la app de iPhone sin firmar y deja movil/StickerBridge.ipa.
#
# Corre en una Mac (Codemagic o GitHub Actions; ver codemagic.yaml y
# .github/workflows/iphone.yml). El .ipa se instala desde Windows con
# Sideloadly y un Apple ID normal, que lo firma al instalarlo. Es una build de
# desarrollo (expo-dev-client): el JS lo sigue entregando `npx expo start` en la
# PC, pero esta sí trae el módulo que entrega los packs a WhatsApp.
set -euo pipefail
cd "$(dirname "$0")/.."

xcodebuild -version
node --version

npm ci
npx expo prebuild --platform ios --clean

workspace="$(ls -d ios/*.xcworkspace | head -1)"
scheme="$(basename "$workspace" .xcworkspace)"
echo "workspace=$workspace scheme=$scheme"
xcodebuild \
  -workspace "$workspace" \
  -scheme "$scheme" \
  -configuration Debug \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -derivedDataPath build \
  -quiet \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY=""

app="$(ls -d build/Build/Products/Debug-iphoneos/*.app | head -1)"
rm -rf ipa StickerBridge.ipa
mkdir -p ipa/Payload
cp -R "$app" ipa/Payload/
(cd ipa && zip -qry ../StickerBridge.ipa Payload)
ls -lh StickerBridge.ipa
