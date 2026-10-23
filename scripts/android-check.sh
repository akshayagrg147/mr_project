#!/bin/sh
set -eu
cd "$(dirname "$0")/../apps/android"
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
if [ "${1:-}" = "--device" ]; then ./gradlew :app:connectedDebugAndroidTest; fi
