import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.db.exec(`
  CREATE TABLE IF NOT EXISTS schema_versions(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, policies TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), email TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','rep')), manager_id TEXT REFERENCES users(id), territory_id TEXT, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, UNIQUE(tenant_id,email));
  CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), kind TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS records_scope ON records(tenant_id,kind,owner_id,status,deleted);
  CREATE UNIQUE INDEX IF NOT EXISTS day_unique ON records(tenant_id,kind,owner_id,json_extract(data,'$.date')) WHERE deleted=0 AND kind IN ('dayplan','tourplan','dcr');
  CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, record_id TEXT NOT NULL REFERENCES records(id), actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS inventory(tenant_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), item_type TEXT NOT NULL, item_id TEXT NOT NULL REFERENCES records(id), quantity INTEGER NOT NULL CHECK(quantity>=0), PRIMARY KEY(tenant_id,user_id,item_type,item_id));
  CREATE TABLE IF NOT EXISTS stock_ledger(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, item_type TEXT NOT NULL, item_id TEXT NOT NULL, delta INTEGER NOT NULL, source_id TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS shifts(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id), started_at TEXT NOT NULL, ended_at TEXT,device_id TEXT NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS one_shift ON shifts(tenant_id,user_id) WHERE ended_at IS NULL;
  CREATE TABLE IF NOT EXISTS points(id TEXT NOT NULL,tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,shift_id TEXT NOT NULL REFERENCES shifts(id),observed_at TEXT NOT NULL,received_at TEXT NOT NULL,latitude REAL NOT NULL,longitude REAL NOT NULL,accuracy REAL NOT NULL,battery INTEGER,mocked INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tenant_id,user_id,id));
  CREATE INDEX IF NOT EXISTS points_time ON points(tenant_id,user_id,observed_at);
  CREATE TABLE IF NOT EXISTS device_events(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,shift_id TEXT, event TEXT NOT NULL,observed_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS operations(tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,operation_id TEXT NOT NULL,request_hash TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(tenant_id,user_id,operation_id));
  CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,owner_id TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,path TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,actor_id TEXT,action TEXT NOT NULL,entity_id TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
  INSERT OR IGNORE INTO schema_versions VALUES(1,datetime('now'));
  `);
  }
  all(sql: string, ...args: any[]): any[] {
    return this.db.prepare(sql).all(...args);
  }
  get(sql: string, ...args: any[]): any {
    return this.db.prepare(sql).get(...args);
  }
  run(sql: string, ...args: any[]) {
    return this.db.prepare(sql).run(...args);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
