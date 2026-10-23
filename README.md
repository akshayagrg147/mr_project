# MR Connect

Native Android field application, React administration workspace and persistent Fastify API, implementing the reviewed [Figma](https://www.figma.com/design/zSHQ1nfFnGLMCKUBhTSUwz?node-id=18%3A173).

The product covers SFA field operations. The provided recording has no audio, so spoken Hindi requirements remain unavailable. Proposed approval/GPS/allowance policies are configurable. Finance, payroll, manufacturing and e-commerce are outside the reviewed SFA scope.

## Run locally

Use **Node 24.11+** (`nvm use`), then:

```sh
npm ci
npm run seed:demo
npm run build
npm start
```

Open **http://127.0.0.1:4000**. The demo seed runs only on an empty development database. Never seed a live company database.

Development with hot reload: `npm run dev` → http://127.0.0.1:5173.

Demo company code: **VIDYA**. Local demonstration password: **Demo-only-2026!**

| User                   | Role                  |
| ---------------------- | --------------------- |
| admin@mrconnect.test   | Company administrator |
| manager@mrconnect.test | Reporting manager     |
| aman@mrconnect.test    | Representative        |
| priya@mrconnect.test   | Representative        |

All demo people, customers, products, visits and orders are fictional. Demo visits do not claim real GPS evidence.

## Android

Open `apps/android` in Android Studio, or run:

```sh
cd apps/android
./gradlew :app:assembleDebug
```

Requires Android SDK 36, JDK 17+ supported by Gradle 8.14, and network access for Maven dependencies. Set the SDK path in your untracked `local.properties`. APK: `apps/android/app/build/outputs/apk/debug/app-debug.apk`.

The debug app defaults to `http://10.0.2.2:4000`, which reaches the host API from the Android emulator. Debug cleartext is limited to emulator/loopback hosts. For physical devices, configure an HTTPS server on the sign-in screen. Release builds require HTTPS, a real company URL and your own signing key. No production key is included.

Sign in as Aman, inspect the existing day plan, start a work shift and grant precise location. For calls, choose a customer → record call → remarks/GPS or exception → product detailing → samples/POB → save. Expenses, leave, tour plans, masters, reminders, RCPA, sales, campaigns, challans and reports are in More. Prepare a daily report from Today; submit it from its detail screen. Review it as manager in the web admin.

Tracking uses a visible Android foreground location service, persisted outbox, Android Keystore-encrypted session token and WorkManager retries. Location points retain observed and received timestamps, accuracy and mock flags. Tracking stops when a shift ends, with a 16-hour safety maximum. Ordinary Android Force Stop can stop the service; managed Samsung policy support and physical-device acceptance remain required for the intended fleet.

## Verify

```sh
npm run check
npm run test:e2e
./scripts/android-check.sh
./scripts/android-check.sh --device
```

Browser tests create an isolated temporary company/database and never modify the local demo workspace. Android tests use a dedicated emulator and controlled HTTP responses for offline queue tests. See [test coverage and remaining acceptance](docs/TESTING.md), [deployment](docs/DEPLOYMENT.md), [API](docs/API.md) and [scope coverage](docs/COVERAGE.md).

## Main directories

- `apps/api`: authentication, role/tenant authorization, business rules, persistence, uploads and reports.
- `apps/admin`: Figma-based connected web admin.
- `apps/android`: Kotlin/Compose app, location service and durable offline synchronization.
- `packages/shared`: module schema and policy defaults shared by API/admin; Android receives the same catalog from the API.
- `review`: original evidence and Figma handoff.
- `docs`: operating notes, coverage and actual verification record.

No production deployment, ERP exchange, email delivery, SMS or remote push is enabled. The admin displays these services as unconfigured until the real contracts and credentials are available.
