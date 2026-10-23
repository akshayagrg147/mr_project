import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { Store } from "./db.ts";
import { Service, now, today } from "./service.ts";
import { hashPassword, publicUser } from "./auth.ts";
import { defaultPolicies } from "../../../packages/shared/src/index.ts";
export const demoPassword = "Demo-only-2026!";
export async function seedDemo(store: Store) {
  if (store.get("SELECT id FROM tenants LIMIT 1"))
    throw new Error(
      "Demo seeding requires an empty database. Existing data was preserved.",
    );
  const hash = await hashPassword(demoPassword);
  store.run(
    "INSERT INTO tenants VALUES(?,?,?,?)",
    "tenant-demo",
    "VIDYA",
    "MR Connect · Demo workspace",
    JSON.stringify(defaultPolicies),
  );
  for (const [id, name, email, role, manager] of [
    ["admin", "Anjali Gupta", "admin@mrconnect.test", "admin", null],
    ["manager", "Anirudh Kumar", "manager@mrconnect.test", "manager", "admin"],
    ["aman", "Aman Sharma", "aman@mrconnect.test", "rep", "manager"],
    ["priya", "Priya Singh", "priya@mrconnect.test", "rep", "manager"],
  ])
    store.run(
      "INSERT INTO users(id,tenant_id,email,name,role,manager_id,password_hash) VALUES(?,?,?,?,?,?,?)",
      id,
      "tenant-demo",
      email,
      name,
      role,
      manager,
      hash,
    );
  const s = new Service(store),
    admin = publicUser(store.get("SELECT * FROM users WHERE id=?", "admin")),
    aman = publicUser(store.get("SELECT * FROM users WHERE id=?", "aman")),
    priya = publicUser(store.get("SELECT * FROM users WHERE id=?", "priya"));
  store.transaction(() => {
    const territory = s.create(admin, "territory", {
      name: "Delhi HQ",
      zone: "North zone",
      state: "Delhi",
      division: "Pharma division",
    });
    store.run("UPDATE users SET territory_id=?", territory.id);
    const route = s.create(admin, "route", {
      name: "Delhi HQ · Local route",
      origin: "Delhi HQ",
      viaLocations: "Dayalpur\nGeeta Colony\nKrishna Nagar",
      distanceKm: 32,
      allowanceType: "Local",
      frequency: 8,
      additionalAllowance: 0,
    });
    const route2 = s.create(admin, "route", {
      name: "Noida · Ex-station",
      origin: "Delhi HQ",
      viaLocations: "Mayur Vihar\nSector 18",
      distanceKm: 74,
      allowanceType: "Ex-station",
      frequency: 4,
      additionalAllowance: 100,
    });
    const products = [
      s.create(admin, "product", {
        name: "VitaD Plus",
        code: "VD-001",
        price: 180,
        category: "Nutrition",
        description:
          "Demonstration product. Replace this text with company-approved product material before use.",
      }),
      s.create(admin, "product", {
        name: "CardioCare",
        code: "CC-002",
        price: 240,
        category: "Cardiology",
        description: "Demonstration product; no medical claims.",
      }),
      s.create(admin, "product", {
        name: "GastroEase",
        code: "GE-003",
        price: 130,
        category: "Gastroenterology",
        description: "Demonstration product; no medical claims.",
      }),
    ];
    const input = s.create(admin, "input", {
      name: "Patient education leaflet",
      code: "IN-01",
      unitCost: 5,
    });
    const customers = [
      ["Dr. Alka Jain", "Doctor", "Gynaecologist", "Dayalpur", "A+"],
      [
        "Dr. Surendra Kumar",
        "Doctor",
        "General physician",
        "Geeta Colony",
        "A",
      ],
      ["Dr. Anurag Gupta", "Doctor", "Ayurvedic", "Krishna Nagar", "A"],
      ["Dr. Neha Kapoor", "Doctor", "General physician", "Mayur Vihar", "A+"],
      ["City Care Pharmacy", "Chemist", "Retail", "Dayalpur", "A"],
      [
        "Delhi Medical Stockist",
        "Stockist",
        "Distribution",
        "Geeta Colony",
        "B",
      ],
      ["Sunrise Hospital", "Hospital", "Multispecialty", "Delhi", "A"],
    ].map((c, i) =>
      s.create(admin, "customer", {
        name: c[0],
        type: c[1],
        specialty: c[2],
        area: c[3],
        class: c[4],
        assignedTo: "aman",
        routeId: route.id,
        frequency: 2,
        mobile: "987650000" + i,
        clinicAddress: "Demo address · " + c[3] + ", Delhi",
        state: "Delhi",
        pinCode: "110001",
        latitude: 28.65 + i * 0.004,
        longitude: 77.24 + i * 0.003,
      }),
    );
    s.create(admin, "customer", {
      name: "Dr. Meera Verma",
      type: "Doctor",
      assignedTo: "priya",
      routeId: route2.id,
      specialty: "General physician",
      class: "A",
      area: "Noida",
      clinicAddress: "Demo clinic, Noida",
      frequency: 2,
    });
    const date = today(),
      from = date.slice(0, 7) + "-01",
      end = date.slice(0, 7) + "-28";
    s.create(admin, "campaign", {
      name: "October product awareness",
      fromDate: from,
      toDate: end,
      productIds: products.map((x) => x.id),
      customerIds: customers.slice(0, 4).map((x) => x.id),
      description:
        "Plan focused detailing and track follow-up visits. Demo campaign.",
    });
    const plan = s.create(aman, "dayplan", {
      date,
      routeId: route.id,
      workType: "Field work",
      jointWith: "manager",
      notes: "Cover Dayalpur and Geeta Colony.",
    });
    s.create(priya, "dayplan", {
      date,
      routeId: route2.id,
      workType: "Field work",
      notes: "Noida coverage",
    });
    for (const u of [aman, priya])
      for (const product of products)
        s.stock(admin, u.id, "Sample", product.id, 60, "demo-opening");
    s.stock(admin, "aman", "Input", input.id, 100, "demo-opening");
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    for (let i = 0; i < 2; i++)
      s.insert(
        aman,
        "visit",
        {
          date,
          planId: plan.id,
          customerId: customers[i].id,
          customerName: customers[i].name,
          customerType: "Doctor",
          routeId: route.id,
          visitedAt: hourAgo,
          remarks: "Demo visit · discussed availability and next follow-up.",
          detailedProductIds: [products[i].id],
          samples: [],
          inputs: [],
          orderLines: [
            {
              itemId: products[i].id,
              quantity: 10,
              unitPrice: products[i].price,
              total: products[i].price * 10,
            },
          ],
          orderTotal: products[i].price * 10,
          location: null,
          verified: false,
          exceptionReason: "Demonstration data; no physical GPS evidence",
          distanceMeters: null,
        },
        "aman",
        "completed",
      );
    const exp = s.create(priya, "expense", {
      date,
      category: "TA",
      amount: 250,
      distanceKm: 28,
      remarks: "Metro and local travel (demo).",
    });
    s.submit(priya, exp.id, exp.version);
    const leaveDate = new Date(Date.now() + 3 * 86400000)
      .toISOString()
      .slice(0, 10);
    const leave = s.create(aman, "leave", {
      fromDate: leaveDate,
      toDate: leaveDate,
      leaveType: "Casual",
      reason: "Personal work (demo)",
    });
    s.submit(aman, leave.id, leave.version);
    const tour = s.create(aman, "tourplan", {
      date: leaveDate,
      routeId: route2.id,
      workType: "Field work",
      notes: "Proposed Noida coverage",
    });
    s.submit(aman, tour.id, tour.version);
    s.create(admin, "challan", {
      name: "CH-DEMO-0102",
      date,
      recipientId: "aman",
      itemType: "Sample",
      itemId: products[0].id,
      quantity: 25,
      notes: "Check received quantity before acknowledging.",
    });
    s.create(aman, "reminder", {
      date: leaveDate,
      customerId: customers[0].id,
      notes: "Follow up on stock availability",
      completed: "No",
    });
    s.create(aman, "sale", {
      date,
      saleType: "Doctor-wise",
      customerId: customers[0].id,
      productId: products[0].id,
      quantity: 15,
      amount: 2700,
    });
    s.create(admin, "announcement", {
      title: "Welcome to the field workspace",
      body: "This is a demonstration workspace with fictional records. Start your day plan, record calls and review your report before submitting.",
    });
  });
  return {
    companyCode: "VIDYA",
    password: demoPassword,
    users: [
      "admin@mrconnect.test",
      "manager@mrconnect.test",
      "aman@mrconnect.test",
      "priya@mrconnect.test",
    ],
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] !== "--demo" || process.env.NODE_ENV === "production")
    throw new Error("Use --demo in development only.");
  const store = new Store(
    process.env.DATABASE_PATH || ".data/mr-connect.sqlite",
  );
  const result = await seedDemo(store);
  store.close();
  console.log(
    "Demo workspace created. See README.md for local demonstration accounts.",
    { companyCode: result.companyCode, users: result.users },
  );
}
