#!/usr/bin/env bash
# Sign, notarize and staple Fyso.app and its dmg (D35, D85). Called by build.sh when
# SIGN_IDENTITY is set; also usable on its own:
#   SIGN_IDENTITY="Developer ID Application: Fyso (TEAMID)" NOTARY_PROFILE=fyso-notary \
#     installer/macos/sign.sh installer/macos/dist/Fyso.app
#   … same for installer/macos/dist/Fyso.dmg (after the dmg is built from the stapled app).
#
# SIGN_IDENTITY   name (or SHA-1) of a "Developer ID Application" identity in the keychain,
#                 see `security find-identity -v -p codesigning`. "-" signs ad hoc, for local
#                 checks only: Gatekeeper still blocks a downloaded copy.
# NOTARY_PROFILE  keychain profile saved with `xcrun notarytool store-credentials`.
#                 Unset: sign only (no notarization, no staple).
set -euo pipefail
target=${1:?usage: sign.sh <Fyso.app> | <Fyso.dmg>}
identity=${SIGN_IDENTITY:?set SIGN_IDENTITY (see installer/macos/sign.sh)}
flags=(--force --sign "$identity")
[ "$identity" = - ] || flags+=(--timestamp)

case $target in
  *.app)
    # swiftDialog keeps its author's Developer ID signature: it is sealed as a helper,
    # never re-signed (no --deep).
    codesign --verify --strict "$target/Contents/Helpers/Dialog.app"
    # Every other nested Mach-O (e.g. a bundled tool binary in Resources or Helpers) is signed
    # first, inside out, with the same identity and hardened runtime: notarization rejects
    # unsigned or ad-hoc nested code, and the app's seal then covers the signed files.
    while IFS= read -r -d '' f; do
      if file -b "$f" | grep -q 'Mach-O'; then codesign "${flags[@]}" --options runtime "$f"; fi
    done < <(find "$target/Contents" -type f -not -path "$target/Contents/MacOS/*" \
               -not -path "$target/Contents/Helpers/Dialog.app/*" -print0)
    # The bundled web login's recorded checksum must match the signed file, and is written
    # before the app is sealed so the app's signature covers it (D87).
    [ ! -f "$target/Contents/Helpers/tinyauth" ] || "$(dirname "$0")/build-tinyauth.sh" --record "$target"
    codesign "${flags[@]}" --options runtime "$target"
    codesign --verify --strict --verbose=2 "$target"
    ;;
  *.dmg)
    codesign "${flags[@]}" "$target"
    codesign --verify --verbose=2 "$target"
    ;;
  *) echo "sign.sh: expected a .app or .dmg, got $target" >&2; exit 2 ;;
esac

if [ "$identity" = - ] || [ -z "${NOTARY_PROFILE:-}" ]; then
  echo "signed (not notarized): $target"; exit 0
fi

# Notarization uploads a zip of the app (or the dmg itself) and waits for Apple's verdict;
# on failure the service's log names the offending file.
upload=$target; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
case $target in *.app) upload="$tmp/upload.zip"; ditto -c -k --keepParent "$target" "$upload" ;; esac
xcrun notarytool submit "$upload" --keychain-profile "$NOTARY_PROFILE" --wait | tee "$tmp/notary.txt"
id=$(sed -n 's/^ *id: //p' "$tmp/notary.txt" | head -1)
if ! grep -q 'status: Accepted' "$tmp/notary.txt"; then
  xcrun notarytool log "$id" --keychain-profile "$NOTARY_PROFILE" || true
  exit 1
fi
xcrun stapler staple "$target"
xcrun stapler validate "$target"
case $target in
  *.app) spctl --assess --type execute --verbose=2 "$target" ;;
  *.dmg) spctl --assess --type open --context context:primary-signature --verbose=2 "$target" ;;
esac
echo "signed, notarized and stapled: $target"
