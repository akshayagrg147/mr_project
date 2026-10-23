import { Store } from "../apps/api/src/db.ts";
const store = new Store(process.env.DATABASE_PATH || ".data/mr-connect.sqlite");
for (const t of store.all("SELECT id,policies FROM tenants")) {
  const days = JSON.parse(t.policies).retentionDays || 180;
  const before = new Date(Date.now() - days * 86400000).toISOString();
  const result = store.transaction(() => {
    store.run(
      "DELETE FROM device_events WHERE tenant_id=? AND observed_at<?",
      t.id,
      before,
    );
    return store.run(
      "DELETE FROM points WHERE tenant_id=? AND observed_at<?",
      t.id,
      before,
    );
  });
  console.log("Location retention applied:", {
    tenant: t.id,
    deleted: result.changes,
    before,
  });
}
store.close();
