# Deployment and operations

## Supported installation

Single Node 24 server, persistent local SQL volume, private uploads directory, HTTPS reverse proxy. SQLite WAL permits concurrent reads and serializes writes. Do not run multiple API replicas or store the DB on an unreliable network filesystem. Size the fleet through load testing; no production scale claim has been made.

1. `npm ci && npm run build`.
2. Copy `.env.example` into your deployment configuration. The process inherits environment variables; use `node --env-file=.env --import tsx apps/api/src/server.ts` when loading a local file. `NODE_ENV=production` enables secure cookies. Set `APP_ORIGINS` to the exact HTTPS origin and `HOST=127.0.0.1` behind the proxy. Set `TRUST_PROXY=1` only when a trusted local reverse proxy overwrites forwarded headers.
3. Use an empty, private database path and upload directory, readable/writable only by the service account. Schema version 1 is applied automatically. Back up before upgrading the schema.
4. Initialize the real company with `node --import tsx scripts/init-company.ts`. Supply COMPANY_CODE, COMPANY_NAME, ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD through protected environment/secret management. No password is printed. Add managers and representatives through Field team. Never seed demonstration accounts in production.
5. Run a service supervisor with restart on failure and a private log destination. Health endpoint: `/api/health`. Serve `/api` and the built web application from the same origin. Proxy uploads up to 10 MB. Redirect HTTP to HTTPS and terminate TLS with a valid certificate.
6. `node --import tsx scripts/backup.ts /private/backup/path` creates an online SQLite backup. Back up uploads alongside it. Encrypt backups and restrict access. Test restoration into a different empty directory; never overwrite a running database. Restore with the API stopped and validate health and a representative record before reopening access.
7. Run `node --import tsx scripts/retention.ts` daily using your deployment scheduler. It deletes expired location points/device events according to each company’s retention period. This is an operating step, not an automation installed on this computer. Keep business and approval audit records according to the client’s separately agreed retention policy.

## Android distribution

- Choose the final enterprise-supported phone/Android/MDM combination and test the exact firmware. The debug APK is for testing. Configure HTTPS and your company server at sign-in.
- Generate and securely retain a release signing key outside this repository. Configure Android Studio signing or your protected CI signing configuration. This project intentionally includes no production key/password.
- Build release APK/AAB (`:app:assembleRelease` / `:app:bundleRelease`) after configuring the real server/distribution process. Android release traffic cannot use HTTP.
- Enroll work-only phones in the selected Android Enterprise fully managed solution. Validate any Samsung Knox battery optimization and force-stop prevention policies, SKU compatibility and licences with the fleet provider. Device administration is separate from this ordinary field app.
- Tracking requires explicit shift start and precise permission. The foreground notification remains visible. Background permission is an optional separate system-settings step for boot recovery. Notification permission should also be enabled for recovery prompts.
- WorkManager retries are deferred by Android battery/network scheduling. The app shows unsynced/conflicting operations. Do not clear app data or uninstall a phone that holds unsynced work.
- Long-running GPS/battery, Recents dismissal, OS process death, reboot, permission changes, force-stop policy, doze and full-shift field tests must be executed on the final managed hardware.

## Integrations and external content

ERP, email, SMS and FCM are explicitly unconfigured. Add adapters only after receiving the real API contracts, sandbox credentials and delivery expectations. In-app announcements and pull sync work locally. Reset access is administered through employee setup; no email delivery is simulated.

Product descriptions in the demo are fictional. Replace them with approved company material. Upload PDF presentations through Products & detailing content; the native app opens authenticated downloads with the installed document viewer.

## Security boundaries

Opaque 12-hour sessions are stored hashed on the server. Browser cookies are HTTP-only and same-site; mutations require an allowed Origin. Android tokens are encrypted using Android Keystore. Passwords use salted scrypt. Each request rechecks active account, role, tenant and hierarchy. Decisions cannot approve the actor’s own work. Attachments are type/size validated and require authorization. CSV exports neutralize formula prefixes. Client timestamps and mock flags are evidence, not proof against a compromised/rooted device.

No formal penetration test or production deployment has been performed. Before launch, complete the client acceptance matrix, a restore drill, fleet load testing, external integration tests and the chosen distribution/privacy notices.
