import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.ts";
import { seedDemo, demoPassword } from "../src/seed.ts";
import { today, now } from "../src/service.ts";
import { hashPassword } from "../src/auth.ts";
import { defaultPolicies } from "../../../packages/shared/src/index.ts";
import { csv } from "../src/reports.ts";
const temp = mkdtempSync(join(tmpdir(), "mr-api-test-"));
let ctx: Awaited<ReturnType<typeof buildApp>>;
const tokens: Record<string, string> = {};
const req = (
  method: string,
  path: string,
  body?: unknown,
  user = "admin",
  headers: Record<string, string> = {},
) =>
  ctx.app.inject({
    method: method as any,
    url: "/api" + path,
    payload: body as any,
    headers: {
      ...(tokens[user] ? { authorization: "Bearer " + tokens[user] } : {}),
      ...headers,
    },
  });
const result = async (
  method: string,
  path: string,
  body?: unknown,
  user = "admin",
) => {
  const r = await req(method, path, body, user);
  assert.ok(r.statusCode < 300, r.body);
  return r.json();
};
let route: any, customer: any, product: any, plan: any;
before(async () => {
  ctx = await buildApp({
    databasePath: join(temp, "db.sqlite"),
    uploads: join(temp, "uploads"),
    serveWeb: false,
  });
  await seedDemo(ctx.store);
  for (const user of ["admin", "manager", "aman", "priya"]) {
    const r = await req(
      "POST",
      "/auth/login",
      {
        companyCode: "VIDYA",
        email: user + "@mrconnect.test",
        password: demoPassword,
        client: "android",
      },
      "none",
    );
    assert.equal(r.statusCode, 200, r.body);
    tokens[user] = r.json().token;
  }
  route = (await result("GET", "/records/route")).items[0];
  customer = (
    await result("GET", "/records/customer", undefined, "aman")
  ).items.find((x: any) => x.type === "Doctor");
  product = (await result("GET", "/records/product")).items[0];
  plan = (await result("GET", "/records/dayplan", undefined, "aman")).items[0];
});
after(async () => {
  await ctx.app.close();
  rmSync(temp, { recursive: true, force: true });
});
const expense = (amount = 100) => ({
  date: today(),
  category: "TA",
  amount,
  remarks: "Integration test travel",
});
const visit = (extra: any = {}) => ({
  customerId: customer.id,
  planId: plan.id,
  visitedAt: now(),
  remarks: "Integration visit",
  location: {
    latitude: customer.latitude,
    longitude: customer.longitude,
    accuracy: 10,
    observedAt: now(),
    mocked: false,
  },
  ...extra,
});
test("health works; unauthenticated API and incorrect credentials fail", async () => {
  assert.equal(
    (await req("GET", "/health", undefined, "none")).statusCode,
    200,
  );
  assert.equal(
    (await req("GET", "/bootstrap", undefined, "none")).statusCode,
    401,
  );
  assert.equal(
    (
      await req(
        "POST",
        "/auth/login",
        {
          companyCode: "VIDYA",
          email: "aman@mrconnect.test",
          password: "wrong",
        },
        "none",
      )
    ).statusCode,
    401,
  );
});
test("web sessions are HTTP-only, CSRF guarded and revocable", async () => {
  const login = await req(
    "POST",
    "/auth/login",
    {
      companyCode: "VIDYA",
      email: "admin@mrconnect.test",
      password: demoPassword,
    },
    "none",
  );
  assert.equal(login.json().token, undefined);
  const set = login.headers["set-cookie"] as string;
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Strict/);
  const cookie = set.split(";")[0];
  const forbidden = await ctx.app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: { cookie },
    payload: {},
  });
  assert.equal(forbidden.statusCode, 403);
  const ok = await ctx.app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: { cookie, origin: "http://localhost:4000" },
    payload: {},
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(
    (await ctx.app.inject({ url: "/api/auth/me", headers: { cookie } }))
      .statusCode,
    401,
  );
});
test("malicious origin and representative admin access are rejected", async () => {
  assert.equal(
    (
      await req(
        "POST",
        "/records/product",
        { name: "X", code: "X", price: 1 },
        "aman",
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await req("GET", "/reports/audit", undefined, "aman")).statusCode,
    403,
  );
  assert.equal(
    (await req("PUT", "/policies", defaultPolicies, "aman")).statusCode,
    403,
  );
  assert.equal(
    (
      await req("POST", "/records/expense", expense(), "aman", {
        origin: "https://evil.invalid",
      })
    ).statusCode,
    403,
  );
});
test("representatives see only assigned customers; managers see their hierarchy", async () => {
  const a = (await result("GET", "/records/customer", undefined, "aman")).items;
  assert.ok(a.every((x: any) => x.assignedTo === "aman"));
  assert.ok(
    (await result("GET", "/records/customer", undefined, "manager")).items
      .length > a.length,
  );
  const other = (await result("GET", "/records/customer", undefined, "priya"))
    .items[0];
  assert.equal(
    (await req("GET", "/record/" + other.id, undefined, "aman")).statusCode,
    404,
  );
});
test("tenant identifiers never bypass isolation", async () => {
  const hash = await hashPassword(demoPassword);
  ctx.store.run(
    "INSERT INTO tenants VALUES(?,?,?,?)",
    "other-tenant",
    "OTHER",
    "Other",
    JSON.stringify(defaultPolicies),
  );
  ctx.store.run(
    "INSERT INTO users(id,tenant_id,email,name,role,password_hash) VALUES(?,?,?,?,?,?)",
    "other-user",
    "other-tenant",
    "admin@other.test",
    "Other Admin",
    "admin",
    hash,
  );
  const login = await req(
    "POST",
    "/auth/login",
    {
      companyCode: "OTHER",
      email: "admin@other.test",
      password: demoPassword,
      client: "android",
    },
    "none",
  );
  tokens.other = login.json().token;
  assert.equal(
    (await req("GET", "/record/" + customer.id, undefined, "other")).statusCode,
    404,
  );
  assert.equal(
    (await req("GET", "/tracking/aman", undefined, "other")).statusCode,
    404,
  );
  assert.equal(
    (
      await req(
        "POST",
        "/records/customer",
        {
          name: "Wrong",
          type: "Doctor",
          assignedTo: "aman",
          routeId: route.id,
          area: "X",
          clinicAddress: "Y",
        },
        "other",
      )
    ).statusCode,
    400,
  );
});
test("validation rejects invalid values, receipt omissions and excess route stops", async () => {
  for (const data of [
    expense(-1),
    expense(1000),
    { ...expense(), date: "2026-02-31" },
    { ...expense(), amount: "100" },
  ])
    assert.equal(
      (await req("POST", "/records/expense", data, "aman")).statusCode,
      400,
    );
  assert.equal(
    (
      await req(
        "POST",
        "/records/route",
        {
          name: "Invalid",
          origin: "HQ",
          distanceKm: 2,
          allowanceType: "Local",
          viaLocations: "1\n2\n3\n4\n5\n6",
        },
        "aman",
      )
    ).statusCode,
    400,
  );
});
test("offline operation IDs deduplicate and detect changed payloads", async () => {
  const key = randomUUID();
  const r = await req("POST", "/records/expense", expense(), "aman", {
    "idempotency-key": key,
  });
  assert.equal(r.statusCode, 200, r.body);
  const duplicate = await req("POST", "/records/expense", expense(), "aman", {
    "idempotency-key": key,
  });
  assert.equal(duplicate.json().id, r.json().id);
  assert.equal(
    (
      await req("POST", "/records/expense", expense(101), "aman", {
        "idempotency-key": key,
      })
    ).statusCode,
    409,
  );
});
test("optimistic concurrency prevents overwriting another device", async () => {
  const r = await result("POST", "/records/expense", expense(), "aman");
  assert.equal(
    (
      await req(
        "PUT",
        "/record/" + r.id,
        { version: r.version, data: expense(110) },
        "aman",
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await req(
        "PUT",
        "/record/" + r.id,
        { version: r.version, data: expense(120) },
        "aman",
      )
    ).json().error.code,
    "VERSION_CONFLICT",
  );
});
test("approval lifecycle locks records, requires reason, blocks self approval and permits correction", async () => {
  let r = await result("POST", "/records/expense", expense(), "aman");
  r = await result(
    "POST",
    "/record/" + r.id + "/submit",
    { version: r.version },
    "aman",
  );
  assert.equal(
    (
      await req(
        "PUT",
        "/record/" + r.id,
        { version: r.version, data: expense(200) },
        "aman",
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await req(
        "POST",
        "/record/" + r.id + "/decision",
        { version: r.version, action: "return", reason: "" },
        "manager",
      )
    ).statusCode,
    400,
  );
  r = await result(
    "POST",
    "/record/" + r.id + "/decision",
    {
      version: r.version,
      action: "return",
      reason: "Please correct the travel amount",
    },
    "manager",
  );
  assert.equal(r.status, "returned");
  r = await result(
    "PUT",
    "/record/" + r.id,
    { version: r.version, data: expense(120) },
    "aman",
  );
  r = await result(
    "POST",
    "/record/" + r.id + "/submit",
    { version: r.version },
    "aman",
  );
  r = await result(
    "POST",
    "/record/" + r.id + "/decision",
    { version: r.version, action: "approve", reason: "" },
    "manager",
  );
  assert.equal(r.status, "approved");
  assert.equal(
    (
      await req(
        "POST",
        "/record/" + r.id + "/decision",
        { version: r.version, action: "approve" },
        "admin",
      )
    ).statusCode,
    409,
  );
  let own = await result("POST", "/records/expense", expense(), "admin");
  own = await result(
    "POST",
    "/record/" + own.id + "/submit",
    { version: own.version },
    "admin",
  );
  assert.equal(
    (
      await req(
        "POST",
        "/record/" + own.id + "/decision",
        { version: own.version, action: "approve" },
        "admin",
      )
    ).statusCode,
    403,
  );
});
test("leave overlap and reversed dates are rejected", async () => {
  const data = {
    fromDate: "2027-01-02",
    toDate: "2027-01-03",
    leaveType: "Casual",
    reason: "Test leave",
  };
  await result("POST", "/records/leave", data, "aman");
  assert.equal(
    (await req("POST", "/records/leave", data, "aman")).statusCode,
    409,
  );
  assert.equal(
    (
      await req(
        "POST",
        "/records/leave",
        { ...data, toDate: "2027-01-01" },
        "aman",
      )
    ).statusCode,
    400,
  );
});
test("GPS verification uses distance, accuracy, mock state and evidence timestamp", async () => {
  const r = await result("POST", "/visits", visit(), "aman");
  assert.equal(r.verified, true);
  const far = visit({
    location: {
      latitude: 0,
      longitude: 0,
      accuracy: 10,
      observedAt: now(),
      mocked: false,
    },
  });
  assert.equal((await req("POST", "/visits", far, "aman")).statusCode, 400);
  const exception = await result(
    "POST",
    "/visits",
    {
      ...far,
      exceptionReason:
        "Customer moved clinic; master location needs correction",
    },
    "aman",
  );
  assert.equal(exception.verified, false);
  const mocked = await result(
    "POST",
    "/visits",
    visit({
      location: {
        latitude: customer.latitude,
        longitude: customer.longitude,
        accuracy: 5,
        observedAt: now(),
        mocked: true,
      },
      exceptionReason: "Emulator test mock location",
    }),
    "aman",
  );
  assert.equal(mocked.verified, false);
});
test("sample inventory and POB prices are enforced transactionally", async () => {
  const before = (
    await result("GET", "/inventory", undefined, "aman")
  ).items.find((x: any) => x.itemId === product.id).quantity;
  const r = await result(
    "POST",
    "/visits",
    visit({
      samples: [{ itemId: product.id, quantity: 2 }],
      orderLines: [{ itemId: product.id, quantity: 3 }],
    }),
    "aman",
  );
  assert.equal(r.orderTotal, product.price * 3);
  assert.equal(
    (await result("GET", "/inventory", undefined, "aman")).items.find(
      (x: any) => x.itemId === product.id,
    ).quantity,
    before - 2,
  );
  const count = (await result("GET", "/records/visit", undefined, "aman")).items
    .length;
  assert.equal(
    (
      await req(
        "POST",
        "/visits",
        visit({ samples: [{ itemId: product.id, quantity: 9999 }] }),
        "aman",
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (await result("GET", "/records/visit", undefined, "aman")).items.length,
    count,
  );
});
test("challan can be acknowledged once and discrepancies require a note", async () => {
  const c = (await result("GET", "/records/challan", undefined, "aman"))
    .items[0];
  assert.equal(
    (
      await req(
        "POST",
        "/record/" + c.id + "/acknowledge",
        { version: c.version, receivedQty: 20, notes: "" },
        "aman",
      )
    ).statusCode,
    400,
  );
  const r = await result(
    "POST",
    "/record/" + c.id + "/acknowledge",
    {
      version: c.version,
      receivedQty: 20,
      notes: "Five units missing in parcel",
    },
    "aman",
  );
  assert.equal(r.status, "acknowledged");
  assert.equal(
    (
      await req(
        "POST",
        "/record/" + c.id + "/acknowledge",
        { version: r.version, receivedQty: 20, notes: "" },
        "aman",
      )
    ).statusCode,
    409,
  );
});
test("CSV imports are all-or-nothing with row-specific errors", async () => {
  const before = (await result("GET", "/records/customer")).items.length;
  const valid = {
    name: "Imported doctor",
    type: "Doctor",
    assignedTo: "aman",
    routeId: route.id,
    area: "Delhi",
    clinicAddress: "Test address",
  };
  const bad = await req("POST", "/import/customers", {
    rows: [valid, { ...valid, name: "" }],
  });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().error.message, /Row 3/);
  assert.equal((await result("GET", "/records/customer")).items.length, before);
  await result("POST", "/import/customers", { rows: [valid] });
  assert.equal(
    (await result("GET", "/records/customer")).items.length,
    before + 1,
  );
});
test("tracking accepts offline batches, ignores duplicates, rejects tampering and exposes gaps", async () => {
  const startedAt = new Date(Date.now() - 1200000).toISOString();
  const shift = await result(
    "POST",
    "/shifts/start",
    { deviceId: "test-device-0001", startedAt },
    "aman",
  );
  const a = {
      id: randomUUID(),
      observedAt: new Date(Date.now() - 1100000).toISOString(),
      latitude: 28.65,
      longitude: 77.24,
      accuracy: 10,
      battery: 80,
      mocked: false,
    },
    b = {
      ...a,
      id: randomUUID(),
      observedAt: new Date(Date.now() - 100000).toISOString(),
      latitude: 28.66,
    };
  let r = await result(
    "POST",
    "/shifts/" + shift.id + "/points",
    { points: [a, b] },
    "aman",
  );
  assert.equal(r.inserted, 2);
  r = await result(
    "POST",
    "/shifts/" + shift.id + "/points",
    { points: [a, b] },
    "aman",
  );
  assert.equal(r.inserted, 0);
  assert.equal(
    (
      await req(
        "POST",
        "/shifts/" + shift.id + "/points",
        { points: [{ ...a, latitude: 0 }] },
        "aman",
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await req(
        "POST",
        "/shifts/" + shift.id + "/points",
        {
          points: [
            { ...a, id: randomUUID(), observedAt: "2099-01-01T00:00:00Z" },
          ],
        },
        "aman",
      )
    ).statusCode,
    400,
  );
  const view = await result("GET", "/tracking/aman?date=" + today());
  assert.equal(view.points.length, 2);
  assert.equal(view.gaps.length, 1);
  assert.equal(view.km, 0);
  assert.equal(
    (await req("GET", "/tracking/aman?date=" + today(), undefined, "priya"))
      .statusCode,
    404,
  );
  await result("POST", "/shifts/" + shift.id + "/end", {}, "aman");
  assert.equal(
    (await result("GET", "/tracking/aman?date=" + today())).state,
    "ended",
  );
});
test("DCR snapshots field activity and return opens it for correction", async () => {
  let r = await result(
    "POST",
    "/dcr",
    { date: today(), remarks: "All calls checked" },
    "aman",
  );
  r = await result(
    "POST",
    "/record/" + r.id + "/submit",
    { version: r.version },
    "aman",
  );
  assert.ok(r.visits > 0);
  assert.ok(r.pob > 0);
  assert.equal((await req("POST", "/visits", visit(), "aman")).statusCode, 409);
  assert.equal(
    (await req("POST", "/records/expense", expense(), "aman")).statusCode,
    409,
  );
  r = await result(
    "POST",
    "/record/" + r.id + "/decision",
    {
      version: r.version,
      action: "return",
      reason: "Add the final customer call",
    },
    "manager",
  );
  assert.equal((await req("POST", "/visits", visit(), "aman")).statusCode, 200);
});
test("employee hierarchy cycles and stale versions are rejected", async () => {
  const users = (await result("GET", "/users")).items;
  const manager = users.find((x: any) => x.id === "manager");
  assert.equal(
    (
      await req("PUT", "/users/manager", {
        name: manager.name,
        email: manager.email,
        role: "manager",
        managerId: "manager",
        territoryId: manager.territoryId,
        active: true,
        version: manager.version,
      })
    ).statusCode,
    400,
  );
});
test("reports are derived from data and exports neutralize spreadsheet formulas", async () => {
  for (const type of [
    "productivity",
    "deviations",
    "missed-coverage",
    "product-reach",
    "expenses",
    "pob",
    "sales",
    "inventory",
    "audit",
  ])
    assert.equal((await req("GET", "/reports/" + type)).statusCode, 200);
  assert.match(
    csv([{ name: '=HYPERLINK("bad")', value: "@cmd" }]),
    /'=HYPERLINK/,
  );
  const r = await req("GET", "/reports/pob?format=csv");
  assert.match(String(r.headers["content-type"]), /text\/csv/);
  assert.match(r.body, /representative/);
});
test("SQL injection input remains ordinary data", async () => {
  const r = await req(
    "GET",
    "/records/customer?q=" + encodeURIComponent("'; DROP TABLE users;--"),
  );
  assert.equal(r.statusCode, 200);
  assert.ok((await result("GET", "/users")).items.length >= 4);
});
test("attachments validate file signatures, authorize access and allow shared product content", async () => {
  const boundary = "test-file-boundary";
  const upload = async (content: Buffer, name: string, user: string) =>
    ctx.app.inject({
      method: "POST",
      url: "/api/attachments",
      headers: {
        authorization: "Bearer " + tokens[user],
        "content-type": "multipart/form-data; boundary=" + boundary,
      },
      payload: Buffer.concat([
        Buffer.from(
          "--" +
            boundary +
            '\r\nContent-Disposition: form-data; name="file"; filename="' +
            name +
            '"\r\nContent-Type: application/pdf\r\n\r\n',
        ),
        content,
        Buffer.from("\r\n--" + boundary + "--\r\n"),
      ]),
    });
  assert.equal(
    (await upload(Buffer.from("<html>not a PDF</html>"), "fake.pdf", "admin"))
      .statusCode,
    400,
  );
  const a = await upload(
    Buffer.from("%PDF-1.4\n% integration test\n"),
    "test.pdf",
    "admin",
  );
  assert.equal(a.statusCode, 200, a.body);
  const aid = a.json().id;
  assert.equal(
    (await req("GET", "/attachments/" + aid, undefined, "aman")).statusCode,
    404,
  );
  const privateFile = await upload(
    Buffer.from("%PDF-1.4\n% private receipt\n"),
    "private.pdf",
    "priya",
  );
  await result(
    "POST",
    "/records/expense",
    { ...expense(), remarks: privateFile.json().id },
    "aman",
  );
  assert.equal(
    (
      await req(
        "GET",
        "/attachments/" + privateFile.json().id,
        undefined,
        "aman",
      )
    ).statusCode,
    404,
  );
  const p = await result("POST", "/records/product", {
    name: "Approved material",
    code: "DOC-01",
    price: 1,
    contentId: aid,
  });
  assert.equal(
    (await req("GET", "/attachments/" + aid, undefined, "aman")).statusCode,
    200,
  );
  assert.equal(
    (await req("GET", "/attachments/" + aid, undefined, "other")).statusCode,
    404,
  );
});
test("password changes revoke all sessions and disabled accounts cannot authenticate", async () => {
  const u = await result("POST", "/users", {
    name: "Temporary User",
    email: "temporary@mrconnect.test",
    role: "rep",
    managerId: "manager",
    territoryId: null,
    active: true,
    password: "Temporary-password-2026!",
  });
  let login = await req(
    "POST",
    "/auth/login",
    {
      companyCode: "VIDYA",
      email: "temporary@mrconnect.test",
      password: "Temporary-password-2026!",
      client: "android",
    },
    "none",
  );
  tokens.temp = login.json().token;
  assert.equal(
    (await req("GET", "/bootstrap", undefined, "temp")).json().error.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  await result(
    "POST",
    "/auth/password",
    {
      currentPassword: "Temporary-password-2026!",
      newPassword: "Changed-password-2026!",
    },
    "temp",
  );
  assert.equal(
    (await req("GET", "/auth/me", undefined, "temp")).statusCode,
    401,
  );
  login = await req(
    "POST",
    "/auth/login",
    {
      companyCode: "VIDYA",
      email: "temporary@mrconnect.test",
      password: "Changed-password-2026!",
      client: "android",
    },
    "none",
  );
  tokens.temp = login.json().token;
  assert.equal(
    (await req("GET", "/bootstrap", undefined, "temp")).statusCode,
    200,
  );
  await result("PUT", "/users/" + u.id, {
    name: u.name,
    email: u.email,
    role: "rep",
    managerId: "manager",
    territoryId: null,
    active: false,
    version: 2,
  });
  assert.equal(
    (await req("GET", "/auth/me", undefined, "temp")).statusCode,
    401,
  );
  assert.equal(
    (
      await req(
        "POST",
        "/auth/login",
        {
          companyCode: "VIDYA",
          email: "temporary@mrconnect.test",
          password: "Changed-password-2026!",
        },
        "none",
      )
    ).statusCode,
    401,
  );
});
