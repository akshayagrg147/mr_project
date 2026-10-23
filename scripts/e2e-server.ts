import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../apps/api/src/app.ts";
import { seedDemo } from "../apps/api/src/seed.ts";
process.env.APP_ORIGINS = "http://127.0.0.1:4010";
const tmp = mkdtempSync(join(tmpdir(), "mr-e2e-"));
const { app, store } = await buildApp({
  databasePath: join(tmp, "db.sqlite"),
  uploads: join(tmp, "uploads"),
});
await seedDemo(store);
await app.listen({ port: 4010, host: "127.0.0.1" });
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, async () => {
    await app.close();
    rmSync(tmp, { recursive: true, force: true });
    process.exit(0);
  });
