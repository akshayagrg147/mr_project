# Verification and acceptance record

Automated results are recorded below after the final run. These tests cover identified business/security boundaries and primary journeys; they are not a claim that every possible input, phone firmware or operating-system state has been tested.

## Automated suites

| Layer                   | Cases | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API integration         |    21 | Auth/session/cookie/Origin checks, roles and tenant/hierarchy isolation, input/receipt/date validation, idempotency, optimistic conflicts, return/resubmit/approve, self-approval block, leave overlap, GPS quality/mock/distance, transactional stock/POB, challan repeat prevention, atomic imports, tracking gaps and deduplication, DCR locks, employee cycles, reports/CSV injection, SQL injection inputs, attachment access and password/session revocation |
| Browser end to end      |     6 | Admin sign-in, customer create/edit/persistence/search, manager return reason/history, all module navigation, CSV download, empty tracking, CSV import failure, mobile viewport/overflow and session expiry                                                                                                                                                                                                                                                        |
| Android JVM             |     5 | Valid, mocked, stale/future, inaccurate/missing-master and boundary GPS evidence                                                                                                                                                                                                                                                                                                                                                                                   |
| Android instrumentation |     4 | Durable offline queue, dependency replacement and stable operation IDs; visible version conflicts; native visit journey against the API; foreground service point delivery before/after the activity moves to background and explicit shift end                                                                                                                                                                                                                    |

Node tests create a temporary SQLite database. Browser tests create a separate temporary company and backend on port 4010; static assets are excluded from API throttling. Android instrumentation uses the dedicated MRConnect_QA Android 15/API 35 emulator. Field journey/tracking tests intentionally add fictional visits and mock location evidence to the local demo workspace at port 4000. Mock locations are marked and remain unverified.

Commands:

```sh
npm run check
npm run test:e2e
./scripts/android-check.sh --device
```

Android HTML/XML test and lint reports are under `apps/android/app/build/reports/`. Browser HTML output is `playwright-report/index.html`; traces are retained only for failures. The dependency audit command is `npm audit`.

## Manual/physical-device release acceptance — not yet run

The final company phone/Android/management configuration is deferred by the user. These cases remain required before approving production tracking:

| Case                                                                  | Acceptance evidence                                                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 8–12 hour field shift, screen mostly locked                           | Observed fix interval/gap distribution, battery use, temperature and upload latency                         |
| Recents dismissal                                                     | Service/notification behavior and continued timestamped fixes on exact firmware                             |
| OS memory kill                                                        | Recovery behavior, visible gap and retained outbox; no silently fabricated fixes                            |
| Force Stop                                                            | Ordinary-app stop behavior; supported managed-device prevention policy verified separately                  |
| Reboot / locked boot / user unlock                                    | Permission-dependent recovery or actionable resume prompt; no false live state                              |
| Doze, battery saver and OEM optimization                              | Measured delivery gaps and approved enterprise policy behavior                                              |
| Location off/on, precise→approximate, revoked permission              | Visible state, failed verification and recovery without data loss                                           |
| No network, intermittent mobile data, airplane mode                   | Durable order, no duplicate visits/stock consumption, observed timestamps retained                          |
| Upload interrupted after server commit                                | Idempotent replay returns same record, no double stock movement                                             |
| GPS indoors, urban canyon, master missing, mocked/rooted device       | Accuracy/exception handling; rooted-device spoof resistance requires a separate enterprise control decision |
| App update with pending work, storage pressure, uninstall restriction | Retained queue and clear recovery instructions; never clear unsynced data                                   |
| Manager hierarchy/permissions and approved business policy            | Client signs off on role matrix, deadlines, receipts, TA/DA, correction rules and retention                 |
| Real ERP/mail/push and production deployment                          | Sandbox integration tests, HTTPS/distribution/signing, backup restore and load tests                        |

## Final results

All 36 automated cases passed (21 API + 6 browser + 5 Android JVM + 4 emulator). TypeScript, web production build, Android debug build and Android lint passed; lint has zero errors and 21 warnings (dependency update/style suggestions). The online database backup was reopened successfully: integrity check OK, no foreign-key violations and employee records readable. See `verification.json` and `test-results/` for the recorded output. Physical-device and production acceptance checks above remain unrun.
