import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import {
  defaultPolicies,
  moduleByKey,
  modules,
  type User,
  type RecordData,
} from "../../../packages/shared/src/index.ts";
import { Store } from "./db.ts";
import { HttpError, assert, publicUser } from "./auth.ts";
export const now = () => new Date().toISOString();
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const day = (value: unknown): string => {
  assert(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
      new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value,
    400,
    "Enter a valid date",
  );
  return value;
};
export function distanceMeters(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180;
  const x =
    Math.sin(((c - a) * r) / 2) ** 2 +
    Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const sharedKinds = new Set([
  "route",
  "product",
  "input",
  "campaign",
  "announcement",
  "territory",
]);
export class Service {
  constructor(public store: Store) {}
  policies(u: User) {
    return {
      ...defaultPolicies,
      ...JSON.parse(
        this.store.get("SELECT policies FROM tenants WHERE id=?", u.tenantId)
          .policies,
      ),
    };
  }
  scope(u: User): string[] {
    if (u.role === "rep") return [u.id];
    if (u.role === "admin")
      return this.store
        .all("SELECT id FROM users WHERE tenant_id=?", u.tenantId)
        .map((x) => x.id);
    const rows = this.store.all(
      `WITH RECURSIVE team(id) AS (SELECT ? UNION SELECT users.id FROM users JOIN team ON users.manager_id=team.id WHERE users.tenant_id=?) SELECT id FROM team`,
      u.id,
      u.tenantId,
    );
    return rows.map((x) => x.id);
  }
  user(u: User, id: string) {
    const row = this.store.get(
      "SELECT * FROM users WHERE tenant_id=? AND id=?",
      u.tenantId,
      id,
    );
    assert(row && this.scope(u).includes(id), 404, "Employee not found");
    return publicUser(row);
  }
  users(u: User) {
    let rows = this.store.all(
      "SELECT * FROM users WHERE tenant_id=? ORDER BY name",
      u.tenantId,
    );
    if (u.role !== "admin") {
      const ids = this.scope(u);
      rows = rows.filter((x) => ids.includes(x.id) || x.id === u.managerId);
    }
    return rows.map((x) => ({ ...publicUser(x), version: x.version }));
  }
  audit(u: User, action: string, id: string, details: unknown = {}) {
    this.store.run(
      "INSERT INTO audit VALUES(?,?,?,?,?,?,?)",
      randomUUID(),
      u.tenantId,
      u.id,
      action,
      id,
      JSON.stringify(details),
      now(),
    );
  }
  raw(u: User, id: string) {
    const row = this.store.get(
      "SELECT * FROM records WHERE tenant_id=? AND id=? AND deleted=0",
      u.tenantId,
      id,
    );
    assert(row, 404, "Record not found");
    return row;
  }
  visible(u: User, row: any) {
    if (sharedKinds.has(row.kind)) return true;
    const data = JSON.parse(row.data);
    return this.scope(u).includes(
      row.kind === "customer" ? data.assignedTo : row.owner_id,
    );
  }
  record(u: User, id: string): RecordData {
    const row = this.raw(u, id);
    assert(this.visible(u, row), 404, "Record not found");
    const owner = this.store.get(
      "SELECT name FROM users WHERE id=?",
      row.owner_id,
    );
    return {
      ...JSON.parse(row.data),
      id: row.id,
      kind: row.kind,
      ownerId: row.owner_id,
      ownerName: owner.name,
      status: row.status,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      decisions: this.store.all(
        "SELECT d.*,u.name AS actorName FROM decisions d JOIN users u ON u.id=d.actor_id WHERE d.record_id=? ORDER BY d.created_at",
        id,
      ),
    };
  }
  list(u: User, kind: string, query: Record<string, any> = {}): RecordData[] {
    assert(
      moduleByKey[kind] || ["visit", "dcr"].includes(kind),
      404,
      "Unknown module",
    );
    if (moduleByKey[kind]?.adminOnly)
      assert(u.role === "admin", 403, "Administrator access required");
    let rows = this.store
      .all(
        "SELECT * FROM records WHERE tenant_id=? AND kind=? AND deleted=0 ORDER BY created_at DESC",
        u.tenantId,
        kind,
      )
      .filter((x) => this.visible(u, x));
    let out = rows.map((x) => this.record(u, x.id));
    if (query.ownerId)
      out = out.filter(
        (x) => x.ownerId === query.ownerId || x.assignedTo === query.ownerId,
      );
    if (query.status) out = out.filter((x) => x.status === query.status);
    if (query.type) out = out.filter((x) => x.type === query.type);
    if (query.date) out = out.filter((x) => x.date === query.date);
    if (query.from)
      out = out.filter(
        (x) => (x.date || x.fromDate || x.createdAt.slice(0, 10)) >= query.from,
      );
    if (query.to)
      out = out.filter(
        (x) => (x.date || x.toDate || x.createdAt.slice(0, 10)) <= query.to,
      );
    if (query.q) {
      const q = String(query.q).toLocaleLowerCase();
      out = out.filter((x) =>
        JSON.stringify(x).toLocaleLowerCase().includes(q),
      );
    }
    return out;
  }
  insert(
    u: User,
    kind: string,
    data: unknown,
    ownerId = u.id,
    status = "active",
  ) {
    assert(
      this.scope(u).includes(ownerId),
      403,
      "Employee is outside your team",
    );
    const id = randomUUID(),
      at = now();
    this.store.run(
      "INSERT INTO records(id,tenant_id,kind,owner_id,status,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      id,
      u.tenantId,
      kind,
      ownerId,
      status,
      JSON.stringify(data),
      at,
      at,
    );
    this.audit(u, kind + ".created", id);
    return this.record(u, id);
  }
  assertWritable(u: User, r: RecordData) {
    assert(
      u.role === "admin" ||
        r.ownerId === u.id ||
        (r.kind === "customer" &&
          (r.assignedTo === u.id || u.role === "manager")),
      403,
      "You cannot edit this record",
    );
    assert(
      !["pending", "approved", "rejected", "acknowledged"].includes(r.status),
      409,
      "This record is locked. Return it for correction first",
      "RECORD_LOCKED",
    );
  }
  checkReportLock(u: User, ownerId: string, date: string) {
    const row = this.store.get(
      "SELECT id,status FROM records WHERE tenant_id=? AND kind='dcr' AND owner_id=? AND deleted=0 AND json_extract(data,'$.date')=?",
      u.tenantId,
      ownerId,
      date,
    );
    assert(
      !row || !["pending", "approved"].includes(row.status),
      409,
      "Daily report is submitted. Return it before changing field activity",
      "REPORT_LOCKED",
    );
  }
  validate(u: User, kind: string, input: any, ownerId: string) {
    const mod = moduleByKey[kind];
    assert(mod, 400, "Unsupported module");
    assert(
      input && typeof input === "object" && !Array.isArray(input),
      400,
      "Enter record fields",
    );
    const out: Record<string, any> = {};
    for (const field of mod.fields) {
      let v = input[field.key];
      if (v === undefined || v === null || v === "") {
        assert(!field.required, 400, `${field.label} is required`);
        continue;
      }
      if (field.type === "number") {
        assert(
          typeof v === "number" && Number.isFinite(v),
          400,
          `${field.label} must be a number`,
        );
        assert(
          v >= (field.min ?? -Number.MAX_VALUE) &&
            v <= (field.max ?? Number.MAX_VALUE),
          400,
          `${field.label} is outside the allowed range`,
        );
        if (["quantity", "frequency"].includes(field.key))
          assert(
            Number.isInteger(v),
            400,
            `${field.label} must be a whole number`,
          );
        if (
          ["amount", "price", "unitCost", "additionalAllowance"].includes(
            field.key,
          )
        )
          v = Math.round(v * 100) / 100;
      } else if (field.type === "multireference") {
        assert(
          Array.isArray(v) &&
            v.length <= 1000 &&
            v.every((x) => typeof x === "string"),
          400,
          `Invalid ${field.label}`,
        );
        v = [...new Set(v)];
        for (const id of v) {
          const r = this.record(u, id);
          assert(r.kind === field.ref, 400, `Invalid ${field.label}`);
        }
      } else {
        assert(
          typeof v === "string" && v.length <= 5000,
          400,
          `Invalid ${field.label}`,
        );
        v = v.trim();
        if (field.required)
          assert(v.length > 0, 400, `${field.label} is required`);
        if (field.type === "date") day(v);
        if (field.type === "select")
          assert(
            field.options?.includes(v),
            400,
            `Choose a valid ${field.label}`,
          );
        if (field.type === "reference") {
          if (field.ref === "users") {
            const ur = this.store.get(
              "SELECT * FROM users WHERE id=? AND tenant_id=? AND active=1",
              v,
              u.tenantId,
            );
            assert(ur, 400, `Invalid ${field.label}`);
            if (field.key === "assignedTo" || field.key === "recipientId")
              assert(
                this.scope(u).includes(v),
                403,
                "Employee is outside your team",
              );
          } else {
            const r = this.record(u, v);
            assert(r.kind === field.ref, 400, `Invalid ${field.label}`);
          }
        }
        if (field.type === "file") {
          const a = this.store.get(
            "SELECT * FROM attachments WHERE id=? AND tenant_id=?",
            v,
            u.tenantId,
          );
          assert(
            a && (a.owner_id === u.id || u.role === "admin"),
            400,
            "Attachment not found or not yours",
          );
        }
      }
      out[field.key] = v;
    }
    if (kind === "route")
      assert(
        !out.viaLocations ||
          out.viaLocations.split("\n").filter(Boolean).length <= 5,
        400,
        "At most five via locations are allowed",
      );
    if (out.fromDate && out.toDate)
      assert(
        out.toDate >= out.fromDate,
        400,
        "End date cannot precede start date",
      );
    if (kind === "customer") {
      if (out.mobile)
        assert(
          /^\+?[0-9 ()-]{7,20}$/.test(out.mobile),
          400,
          "Enter a valid mobile number",
        );
      if (out.pinCode)
        assert(
          /^\d{6}$/.test(out.pinCode),
          400,
          "PIN code must contain six digits",
        );
      assert(
        (out.latitude === undefined) === (out.longitude === undefined),
        400,
        "Provide both master coordinates",
      );
      if (u.role === "rep")
        assert(
          out.assignedTo === u.id,
          403,
          "You can only assign customers to yourself",
        );
    }
    if (["expense", "sale", "rcpa"].includes(kind)) {
      assert(out.date <= today(), 400, "Future field activity is not allowed");
      this.checkReportLock(u, ownerId, out.date);
    }
    if (
      kind === "expense" &&
      out.amount >= this.policies(u).receiptRequiredAbove
    )
      assert(
        out.receiptId,
        400,
        "A receipt is required above the configured threshold",
      );
    if (kind === "rcpa")
      assert(
        this.record(u, out.customerId).type === "Chemist",
        400,
        "RCPA needs a chemist",
      );
    if (kind === "sponsorship")
      assert(
        this.record(u, out.customerId).type === "Doctor",
        400,
        "Select a doctor",
      );
    if (kind === "challan") {
      const item = this.record(u, out.itemId);
      assert(
        item.kind === (out.itemType === "Sample" ? "product" : "input"),
        400,
        "Item type does not match the selected item",
      );
    }
    return out;
  }
  create(u: User, kind: string, input: any, ownerId = u.id) {
    const mod = moduleByKey[kind];
    assert(mod, 404, "Unknown module");
    if (mod.adminOnly || mod.readOnlyForRep)
      assert(u.role === "admin", 403, "Administrator access required");
    if (kind === "challan") ownerId = input.recipientId;
    const data = this.validate(u, kind, input, ownerId);
    if (kind === "dayplan")
      assert(
        data.date <= today() &&
          Date.now() - Date.parse(data.date + "T00:00:00Z") <=
            (this.policies(u).reportDeadlineDays + 1) * 86400000,
        400,
        "Day plan is outside the reporting window",
      );
    if (kind === "leave") this.noOverlappingLeave(u, ownerId, data);
    return this.insert(
      u,
      kind,
      data,
      ownerId,
      mod.approvable ? "draft" : "active",
    );
  }
  noOverlappingLeave(u: User, ownerId: string, data: any, exclude = "") {
    const overlaps = this.list(u, "leave").some(
      (r) =>
        r.id !== exclude &&
        r.ownerId === ownerId &&
        !["rejected", "returned"].includes(r.status) &&
        r.fromDate <= data.toDate &&
        r.toDate >= data.fromDate,
    );
    assert(!overlaps, 409, "A leave request already covers these dates");
  }
  update(u: User, id: string, input: any, version: number) {
    const r = this.record(u, id);
    this.assertWritable(u, r);
    assert(
      r.version === version,
      409,
      "This record changed on another device. Reload it before saving",
      "VERSION_CONFLICT",
    );
    const mod = moduleByKey[r.kind];
    assert(mod, 400, "Use the workflow action for this record");
    if (mod.adminOnly || mod.readOnlyForRep)
      assert(u.role === "admin", 403, "Administrator access required");
    const data = this.validate(u, r.kind, input, r.ownerId);
    if (r.kind === "leave") this.noOverlappingLeave(u, r.ownerId, data, id);
    if (r.kind === "dayplan") {
      assert(
        r.date === today() && data.date === r.date,
        409,
        "Past day plans are locked",
      );
      this.checkReportLock(u, r.ownerId, r.date);
    }
    if (["expense", "sale", "rcpa"].includes(r.kind))
      this.checkReportLock(u, r.ownerId, r.date);
    this.store.run(
      "UPDATE records SET data=?,version=version+1,updated_at=? WHERE id=?",
      JSON.stringify(data),
      now(),
      id,
    );
    this.audit(u, r.kind + ".updated", id, { version });
    return this.record(u, id);
  }
  remove(u: User, id: string, version: number) {
    const r = this.record(u, id);
    this.assertWritable(u, r);
    assert(
      r.version === version,
      409,
      "Record changed. Reload first",
      "VERSION_CONFLICT",
    );
    assert(
      !["visit", "dcr", "challan"].includes(r.kind),
      409,
      "Operational records are retained for audit",
    );
    if (moduleByKey[r.kind]?.readOnlyForRep || moduleByKey[r.kind]?.adminOnly)
      assert(u.role === "admin", 403, "Administrator access required");
    if (["expense", "sale", "rcpa"].includes(r.kind))
      this.checkReportLock(u, r.ownerId, r.date);
    const refs = this.store.all(
      "SELECT data FROM records WHERE tenant_id=? AND id<>? AND deleted=0",
      u.tenantId,
      id,
    );
    assert(
      !refs.some((x) =>
        Object.values(JSON.parse(x.data)).some(
          (v) =>
            v === id ||
            (Array.isArray(v) &&
              v.some(
                (y) => y === id || (typeof y === "object" && y?.itemId === id),
              )),
        ),
      ),
      409,
      "This record is referenced by activity. Keep it for history",
    );
    this.store.run(
      "UPDATE records SET deleted=1,version=version+1,updated_at=? WHERE id=?",
      now(),
      id,
    );
    this.audit(u, r.kind + ".deleted", id);
    return { ok: true };
  }
  submit(u: User, id: string, version: number) {
    const r = this.record(u, id);
    assert(
      r.ownerId === u.id || u.role === "admin",
      403,
      "Only the owner can submit",
    );
    assert(
      r.version === version,
      409,
      "Record changed. Reload first",
      "VERSION_CONFLICT",
    );
    assert(
      moduleByKey[r.kind]?.approvable || r.kind === "dcr",
      400,
      "This record has no approval workflow",
    );
    assert(
      ["draft", "returned"].includes(r.status),
      409,
      "Only draft or returned records can be submitted",
    );
    if (r.kind === "leave") this.noOverlappingLeave(u, r.ownerId, r, id);
    if (r.kind === "expense") this.validate(u, "expense", r, r.ownerId);
    if (r.kind === "dcr") {
      const visits = this.list(u, "visit", {
        ownerId: r.ownerId,
        date: r.date,
      });
      assert(
        visits.length > 0,
        400,
        "Record at least one visit before submitting",
      );
      const deadline = new Date(r.date + "T00:00:00Z");
      deadline.setUTCDate(
        deadline.getUTCDate() + this.policies(u).reportDeadlineDays,
      );
      assert(
        Date.now() <= deadline.getTime() + 86400000,
        409,
        "Reporting deadline passed. Contact your administrator",
      );
      const data = {
        date: r.date,
        remarks: r.remarks,
        visitIds: visits.map((x) => x.id),
        visits: visits.length,
        pob: visits.reduce((s, x) => s + x.orderTotal, 0),
        expenses: this.list(u, "expense", {
          ownerId: r.ownerId,
          date: r.date,
        }).reduce((s, x) => s + x.amount, 0),
      };
      this.store.run(
        "UPDATE records SET data=? WHERE id=?",
        JSON.stringify(data),
        id,
      );
    }
    this.store.run(
      "UPDATE records SET status='pending',version=version+1,updated_at=? WHERE id=?",
      now(),
      id,
    );
    this.audit(u, r.kind + ".submitted", id);
    return this.record(u, id);
  }
  decide(u: User, id: string, action: string, reason: string, version: number) {
    assert(u.role !== "rep", 403, "Manager access required");
    const r = this.record(u, id);
    assert(r.ownerId !== u.id, 403, "You cannot approve your own submission");
    assert(this.scope(u).includes(r.ownerId), 404, "Submission not found");
    assert(
      r.version === version,
      409,
      "Submission changed. Reload first",
      "VERSION_CONFLICT",
    );
    assert(
      r.status === "pending",
      409,
      "This submission has already been decided",
    );
    assert(
      ["approve", "return", "reject"].includes(action),
      400,
      "Invalid decision",
    );
    assert(
      action === "approve" || reason.trim().length >= 5,
      400,
      "Provide a reason of at least five characters",
    );
    const status = {
      approve: "approved",
      return: "returned",
      reject: "rejected",
    }[action]!;
    this.store.run(
      "UPDATE records SET status=?,version=version+1,updated_at=? WHERE id=?",
      status,
      now(),
      id,
    );
    this.store.run(
      "INSERT INTO decisions VALUES(?,?,?,?,?,?,?)",
      randomUUID(),
      u.tenantId,
      id,
      u.id,
      action,
      reason.trim(),
      now(),
    );
    this.audit(u, r.kind + "." + action, id, { reason });
    return this.record(u, id);
  }
  visit(u: User, input: any) {
    const parsed = z
      .object({
        customerId: z.string(),
        planId: z.string(),
        visitedAt: z.iso.datetime(),
        remarks: z.string().trim().min(1).max(5000),
        outcome: z
          .enum(["Met in person", "Not available", "Follow-up only"])
          .default("Met in person"),
        campaignId: z.string().optional(),
        location: z
          .object({
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
            accuracy: z.number().min(0).max(10000),
            observedAt: z.iso.datetime(),
            mocked: z.boolean().default(false),
          })
          .nullable(),
        exceptionReason: z.string().max(1000).optional(),
        detailedProductIds: z.array(z.string()).max(100).default([]),
        samples: z
          .array(
            z.object({
              itemId: z.string(),
              quantity: z.number().int().min(1).max(10000),
            }),
          )
          .max(100)
          .default([]),
        inputs: z
          .array(
            z.object({
              itemId: z.string(),
              quantity: z.number().int().min(1).max(10000),
            }),
          )
          .max(100)
          .default([]),
        orderLines: z
          .array(
            z.object({
              itemId: z.string(),
              quantity: z.number().int().min(1).max(100000),
            }),
          )
          .max(100)
          .default([]),
      })
      .strict()
      .parse(input);
    const customer = this.record(u, parsed.customerId);
    assert(
      customer.kind === "customer" && customer.assignedTo === u.id,
      403,
      "This customer is not assigned to you",
    );
    const plan = this.record(u, parsed.planId);
    assert(
      plan.kind === "dayplan" && plan.ownerId === u.id,
      400,
      "Select your day plan",
    );
    const visitDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(parsed.visitedAt));
    assert(plan.date === visitDate, 400, "Visit date must match the day plan");
    assert(
      Date.parse(parsed.visitedAt) <= Date.now() + 120000,
      400,
      "Visit time is in the future",
    );
    this.checkReportLock(u, u.id, visitDate);
    assert(
      Date.now() - Date.parse(parsed.visitedAt) <=
        (this.policies(u).reportDeadlineDays + 1) * 86400000,
      400,
      "Visit is outside the reporting window",
    );
    for (const id of parsed.detailedProductIds)
      assert(
        this.record(u, id).kind === "product",
        400,
        "Invalid detailing product",
      );
    if (parsed.campaignId) {
      const c = this.record(u, parsed.campaignId);
      assert(
        c.kind === "campaign" &&
          c.fromDate <= visitDate &&
          c.toDate >= visitDate,
        400,
        "Campaign is not active for this visit",
      );
    }
    const p = this.policies(u),
      loc = parsed.location;
    let distance: number | null = null;
    if (loc && customer.latitude !== undefined)
      distance = Math.round(
        distanceMeters(
          loc.latitude,
          loc.longitude,
          customer.latitude,
          customer.longitude,
        ),
      );
    const verified =
      !!loc &&
      !loc.mocked &&
      loc.accuracy <= p.maxAccuracyMeters &&
      Math.abs(Date.parse(loc.observedAt) - Date.parse(parsed.visitedAt)) <=
        120000 &&
      distance !== null &&
      distance <= p.gpsRadiusMeters;
    if (!verified)
      assert(
        (parsed.exceptionReason?.trim().length ?? 0) >= 5,
        400,
        "Explain the location exception before saving",
      );
    let orderTotal = 0;
    const orderLines = parsed.orderLines.map((line) => {
      const product = this.record(u, line.itemId);
      assert(product.kind === "product", 400, "Invalid order product");
      const total = (Math.round(product.price * 100) * line.quantity) / 100;
      orderTotal += total;
      return { ...line, unitPrice: product.price, total };
    });
    const r = this.insert(
      u,
      "visit",
      {
        ...parsed,
        date: visitDate,
        customerName: customer.name,
        customerType: customer.type,
        routeId: plan.routeId,
        verified,
        distanceMeters: distance,
        orderLines,
        orderTotal: Math.round(orderTotal * 100) / 100,
      },
      u.id,
      "completed",
    );
    for (const [type, lines] of [
      ["Sample", parsed.samples],
      ["Input", parsed.inputs],
    ] as const) {
      for (const line of lines) {
        const item = this.record(u, line.itemId);
        assert(
          item.kind === (type === "Sample" ? "product" : "input"),
          400,
          "Invalid stock item",
        );
        const balance = this.store.get(
          "SELECT quantity FROM inventory WHERE tenant_id=? AND user_id=? AND item_type=? AND item_id=?",
          u.tenantId,
          u.id,
          type,
          line.itemId,
        );
        assert(
          balance && balance.quantity >= line.quantity,
          409,
          "Insufficient " + type.toLowerCase() + " stock",
        );
        this.stock(u, u.id, type, line.itemId, -line.quantity, r.id);
      }
    }
    return r;
  }
  stock(
    u: User,
    userId: string,
    type: string,
    itemId: string,
    delta: number,
    sourceId: string,
  ) {
    if (delta < 0)
      this.store.run(
        "UPDATE inventory SET quantity=quantity+? WHERE tenant_id=? AND user_id=? AND item_type=? AND item_id=?",
        delta,
        u.tenantId,
        userId,
        type,
        itemId,
      );
    else
      this.store.run(
        "INSERT INTO inventory VALUES(?,?,?,?,?) ON CONFLICT(tenant_id,user_id,item_type,item_id) DO UPDATE SET quantity=quantity+excluded.quantity",
        u.tenantId,
        userId,
        type,
        itemId,
        delta,
      );
    this.store.run(
      "INSERT INTO stock_ledger VALUES(?,?,?,?,?,?,?,?)",
      randomUUID(),
      u.tenantId,
      userId,
      type,
      itemId,
      delta,
      sourceId,
      now(),
    );
  }
  acknowledge(
    u: User,
    id: string,
    version: number,
    receivedQty: number,
    notes: string,
  ) {
    const r = this.record(u, id);
    assert(
      r.kind === "challan" && r.ownerId === u.id,
      403,
      "Only the recipient can acknowledge",
    );
    assert(
      r.status === "active" && r.version === version,
      409,
      "Challan changed or already acknowledged",
    );
    assert(
      Number.isInteger(receivedQty) &&
        receivedQty >= 0 &&
        receivedQty <= r.quantity,
      400,
      "Enter a received quantity between zero and sent quantity",
    );
    if (receivedQty !== r.quantity)
      assert(notes.trim().length >= 5, 400, "Explain the quantity discrepancy");
    const data = {
      ...JSON.parse(this.raw(u, id).data),
      receivedQty,
      acknowledgedAt: now(),
      acknowledgementNotes: notes,
    };
    this.store.run(
      "UPDATE records SET data=?,status='acknowledged',version=version+1,updated_at=? WHERE id=?",
      JSON.stringify(data),
      now(),
      id,
    );
    this.stock(u, u.id, r.itemType, r.itemId, receivedQty, id);
    this.audit(u, "challan.acknowledged", id, { receivedQty });
    return this.record(u, id);
  }
  dcr(u: User, date: string, remarks: string) {
    day(date);
    assert(date <= today(), 400, "Future reports are not allowed");
    const existing = this.store.get(
      "SELECT id FROM records WHERE tenant_id=? AND kind='dcr' AND owner_id=? AND json_extract(data,'$.date')=? AND deleted=0",
      u.tenantId,
      u.id,
      date,
    );
    if (existing) {
      const r = this.record(u, existing.id);
      this.assertWritable(u, r);
      this.store.run(
        "UPDATE records SET data=?,version=version+1,updated_at=? WHERE id=?",
        JSON.stringify({ date, remarks }),
        now(),
        r.id,
      );
      return this.record(u, r.id);
    }
    return this.insert(u, "dcr", { date, remarks }, u.id, "draft");
  }
  approvals(u: User) {
    assert(u.role !== "rep", 403, "Manager access required");
    return [...modules.filter((m) => m.approvable).map((m) => m.key), "dcr"]
      .flatMap((k) => this.list(u, k))
      .filter((r) => r.status === "pending" && r.ownerId !== u.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  inventory(u: User) {
    return this.store
      .all(
        "SELECT i.*,r.data,u.name AS ownerName FROM inventory i JOIN records r ON r.id=i.item_id JOIN users u ON u.id=i.user_id WHERE i.tenant_id=?",
        u.tenantId,
      )
      .filter((r) => this.scope(u).includes(r.user_id))
      .map((r) => ({
        userId: r.user_id,
        ownerName: r.ownerName,
        itemType: r.item_type,
        itemId: r.item_id,
        name: JSON.parse(r.data).name,
        quantity: r.quantity,
      }));
  }
  dashboard(u: User, query: Record<string, any> = {}) {
    const date = query.date || today();
    day(date);
    const from = query.from || date.slice(0, 7) + "-01";
    const to = query.to || date;
    const visits = this.list(u, "visit", { from, to, ownerId: query.ownerId });
    const dayVisits = visits.filter((x) => x.date === date);
    const users = this.users(u).filter(
      (x) =>
        x.active &&
        x.role === "rep" &&
        (!query.ownerId || x.id === query.ownerId),
    );
    const plans = this.list(u, "dayplan", { date, ownerId: query.ownerId });
    const dcr = this.list(u, "dcr", { date, ownerId: query.ownerId });
    const customer = this.list(u, "customer", { ownerId: query.ownerId });
    const monthVisits = this.list(u, "visit", {
      from: date.slice(0, 7) + "-01",
      to: date,
      ownerId: query.ownerId,
    });
    return {
      date,
      from,
      to,
      users: users.length,
      active: plans.length,
      doctorCalls: dayVisits.filter((x) => x.customerType === "Doctor").length,
      totalCalls: dayVisits.length,
      planned: customer.length,
      dcrSubmitted: dcr.filter((x) =>
        ["pending", "approved"].includes(x.status),
      ).length,
      pob: visits.reduce((s, x) => s + x.orderTotal, 0),
      expenses: this.list(u, "expense", {
        from,
        to,
        ownerId: query.ownerId,
      }).reduce((s, x) => s + x.amount, 0),
      verified: dayVisits.filter((x) => x.verified).length,
      monthlyCoverage: new Set(
        monthVisits
          .filter((x) => x.customerType === "Doctor")
          .map((x) => x.customerId),
      ).size,
      customerCount: customer.filter((x) => x.type === "Doctor").length,
      trend: Array.from({ length: 7 }, (_, i) => {
        const d = new Date(date + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - 6 + i);
        const key = d.toISOString().slice(0, 10);
        const items = visits.filter((x) => x.date === key);
        return {
          date: key,
          calls: items.length,
          pob: items.reduce((s, x) => s + x.orderTotal, 0),
        };
      }),
      attention:
        u.role === "rep"
          ? [
              ...this.list(u, "expense"),
              ...this.list(u, "dcr"),
              ...this.list(u, "leave"),
            ].filter((x) => x.status === "returned")
          : this.approvals(u),
      plans,
      visits: dayVisits,
    };
  }
  idempotent(
    u: User,
    key: string | undefined,
    payload: unknown,
    fn: () => any,
  ) {
    if (key) assert(/^[\w-]{8,100}$/.test(key), 400, "Invalid operation ID");
    const hash = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    return this.store.transaction(() => {
      if (key) {
        const prev = this.store.get(
          "SELECT * FROM operations WHERE tenant_id=? AND user_id=? AND operation_id=?",
          u.tenantId,
          u.id,
          key,
        );
        if (prev) {
          assert(
            prev.request_hash === hash,
            409,
            "Operation ID was reused with different content",
            "IDEMPOTENCY_CONFLICT",
          );
          return JSON.parse(prev.response);
        }
      }
      const result = fn();
      if (key)
        this.store.run(
          "INSERT INTO operations VALUES(?,?,?,?,?)",
          u.tenantId,
          u.id,
          key,
          hash,
          JSON.stringify(result),
        );
      return result;
    });
  }
}
