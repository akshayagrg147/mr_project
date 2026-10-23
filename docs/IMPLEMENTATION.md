# Implementation contract

Source: reviewed Figma `zSHQ1nfFnGLMCKUBhTSUwz` and `review/requirements.md`. No spoken Hindi requirements are available. The same proposed business rules remain configurable and require client acceptance.

## Acceptance checklist

- [x] Tenant-isolated accounts, admin/manager/representative access, sessions and audit trail.
- [x] Employee hierarchy, territories, customer masters, route setup and tagging, product/content and campaigns.
- [x] Day plans, joint working, calls for all customer types, reminders, detailing, samples, inputs, POB and RCPA.
- [x] Daily reports with submit/return/correct/approve lifecycle and immutable submitted data.
- [x] Expenses/receipts/TA/DA, leave, tour plans, sponsorship and manager approvals.
- [x] Secondary/doctor sales, challan acknowledgement, sample inventory and reports/CSV exports.
- [x] Native visible foreground location service, shift boundaries, durable offline queue, retry/deduplication, gap evidence and map replay.
- [x] Android account/settings, PIN, language example, permission/empty/error/conflict states.
- [x] Connected Figma-based web admin with validated forms, filters, detail views and real persisted data.
- [x] API business/security integration tests, browser end-to-end tests, Android build/tests/emulator smoke.
- [x] Deployment, backup, configuration, test matrix and transparent physical-device acceptance record.

## Architecture

Node 24 / TypeScript / Fastify, React 19 + Vite, Kotlin + Jetpack Compose. SQLite in WAL mode provides a reproducible local installation and single-server persistent deployment. Horizontal API scaling needs a PostgreSQL migration/load test and is not claimed by this delivery. The service encapsulates storage to keep that migration possible.

Fully managed company phones are the intended fleet. Exact device, management platform and licence selection are deferred. Tracking starts with an explicit shift action and visible notification. No covert tracking or guaranteed recovery from Android Force Stop. Production signing, domain/HTTPS, external ERP/mail/push credentials and physical handset tests remain deployment work until available. Integrations without credentials must report unconfigured, never simulated success.

Implementation and local verification are complete for the reviewed SFA scope. The final physical-device and external deployment/integration gates are explicitly listed in `TESTING.md`; those are not marked as passed.
