export type Role = "admin" | "manager" | "rep";
export type User = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
  managerId: string | null;
  territoryId: string | null;
  active: boolean;
  mustChangePassword: boolean;
};
export type Field = {
  key: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "select"
    | "reference"
    | "multireference"
    | "file";
  required?: boolean;
  options?: string[];
  ref?: string;
  min?: number;
  max?: number;
  hint?: string;
};
export type Module = {
  key: string;
  title: string;
  singular: string;
  icon: string;
  group: string;
  fields: Field[];
  columns: string[];
  approvable?: boolean;
  adminOnly?: boolean;
  readOnlyForRep?: boolean;
};
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  extra: Partial<Field> = {},
): Field => ({ key, label, type, ...extra });
const ref = (key: string, label: string, kind: string, required = true) =>
  f(key, label, "reference", { ref: kind, required });
const date = () => f("date", "Date", "date", { required: true });
export const modules: Module[] = [
  {
    key: "territory",
    title: "Territories & head quarters",
    singular: "Territory",
    icon: "building",
    group: "People & masters",
    adminOnly: true,
    columns: ["name", "zone", "state", "division"],
    fields: [
      f("name", "Head quarter", "text", { required: true }),
      f("zone", "Zone", "text", { required: true }),
      f("state", "State", "text", { required: true }),
      f("division", "Division", "text", { required: true }),
    ],
  },
  {
    key: "customer",
    title: "Customer directory",
    singular: "Customer",
    icon: "stethoscope",
    group: "People & masters",
    columns: ["name", "type", "specialty", "area", "class", "routeId"],
    fields: [
      f("name", "Customer name", "text", { required: true }),
      f("type", "Customer type", "select", {
        required: true,
        options: ["Doctor", "Chemist", "Hospital", "Stockist"],
      }),
      ref("assignedTo", "Assigned representative", "users"),
      ref("routeId", "Route", "route"),
      f("specialty", "Specialty"),
      f("class", "Class", "select", { options: ["A+", "A", "B", "C"] }),
      f("frequency", "Visits per month", "number", { min: 1, max: 31 }),
      f("mobile", "Mobile number"),
      f("gender", "Gender", "select", {
        options: ["Female", "Male", "Other", "Prefer not to say"],
      }),
      f("qualification", "Qualification"),
      f("area", "Area", "text", { required: true }),
      f("state", "State"),
      f("clinicAddress", "Clinic / business address", "textarea", {
        required: true,
      }),
      f("residenceAddress", "Residence address", "textarea"),
      f("pinCode", "PIN code"),
      f("latitude", "Master latitude", "number", { min: -90, max: 90 }),
      f("longitude", "Master longitude", "number", { min: -180, max: 180 }),
    ],
  },
  {
    key: "route",
    title: "Routes & coverage",
    singular: "Route",
    icon: "route",
    group: "People & masters",
    columns: ["name", "origin", "distanceKm", "allowanceType", "frequency"],
    fields: [
      f("name", "Route name", "text", { required: true }),
      f("origin", "Origin", "text", { required: true }),
      f("viaLocations", "Via locations", "textarea", {
        hint: "One per line, at most five",
      }),
      f("distanceKm", "Master distance (km)", "number", {
        required: true,
        min: 0,
        max: 2000,
      }),
      f("allowanceType", "DA type", "select", {
        required: true,
        options: ["Local", "Ex-station", "Outstation"],
      }),
      f("frequency", "Visits per month", "number", { min: 1, max: 31 }),
      f("additionalAllowance", "Additional allowance (₹)", "number", {
        min: 0,
      }),
    ],
  },
  {
    key: "product",
    title: "Products & detailing content",
    singular: "Product",
    icon: "pill",
    group: "People & masters",
    readOnlyForRep: true,
    columns: ["name", "code", "price", "category"],
    fields: [
      f("name", "Product name", "text", { required: true }),
      f("code", "Product code", "text", { required: true }),
      f("price", "Unit price (₹)", "number", { required: true, min: 0 }),
      f("category", "Category"),
      f("description", "Approved detailing notes", "textarea"),
      f("contentId", "Presentation PDF", "file"),
    ],
  },
  {
    key: "input",
    title: "Promotional inputs",
    singular: "Input",
    icon: "package",
    group: "People & masters",
    readOnlyForRep: true,
    columns: ["name", "code", "unitCost"],
    fields: [
      f("name", "Input name", "text", { required: true }),
      f("code", "Input code", "text", { required: true }),
      f("unitCost", "Unit cost (₹)", "number", { min: 0 }),
    ],
  },
  {
    key: "campaign",
    title: "Campaign management",
    singular: "Campaign",
    icon: "target",
    group: "Field operations",
    readOnlyForRep: true,
    columns: ["name", "fromDate", "toDate", "description"],
    fields: [
      f("name", "Campaign name", "text", { required: true }),
      f("fromDate", "Start date", "date", { required: true }),
      f("toDate", "End date", "date", { required: true }),
      f("productIds", "Products", "multireference", { ref: "product" }),
      f("customerIds", "Participating customers", "multireference", {
        ref: "customer",
      }),
      f("description", "Campaign brief", "textarea", { required: true }),
    ],
  },
  {
    key: "dayplan",
    title: "Day plans",
    singular: "Day plan",
    icon: "calendar-days",
    group: "Field operations",
    columns: ["date", "ownerName", "routeId", "workType", "jointWith"],
    fields: [
      date(),
      ref("routeId", "Route", "route"),
      f("workType", "Working type", "select", {
        required: true,
        options: [
          "Field work",
          "Joint work",
          "Meeting",
          "Training",
          "Administration",
        ],
      }),
      ref("jointWith", "Work with", "users", false),
      f("notes", "Plan notes", "textarea"),
    ],
  },
  {
    key: "tourplan",
    title: "Tour plans",
    singular: "Tour day",
    icon: "calendar-days",
    group: "Field operations",
    approvable: true,
    columns: ["date", "ownerName", "routeId", "workType", "status"],
    fields: [
      date(),
      ref("routeId", "Route", "route"),
      f("workType", "Working type", "select", {
        required: true,
        options: [
          "Field work",
          "Joint work",
          "Meeting",
          "Training",
          "Administration",
        ],
      }),
      ref("jointWith", "Work with", "users", false),
      f("notes", "Tour notes", "textarea"),
    ],
  },
  {
    key: "expense",
    title: "Expenses & TA/DA",
    singular: "Expense",
    icon: "wallet",
    group: "Approvals & reporting",
    approvable: true,
    columns: ["date", "ownerName", "category", "amount", "status"],
    fields: [
      date(),
      f("category", "Category", "select", {
        required: true,
        options: ["TA", "DA", "Hotel", "Meals", "Other"],
      }),
      f("amount", "Claim amount (₹)", "number", {
        required: true,
        min: 0.01,
        max: 1000000,
      }),
      f("distanceKm", "Travel distance (km)", "number", { min: 0, max: 2000 }),
      f("remarks", "Remarks", "textarea", { required: true }),
      f("receiptId", "Receipt", "file"),
    ],
  },
  {
    key: "leave",
    title: "Leave requests",
    singular: "Leave request",
    icon: "calendar-days",
    group: "Approvals & reporting",
    approvable: true,
    columns: ["ownerName", "fromDate", "toDate", "leaveType", "status"],
    fields: [
      f("fromDate", "From", "date", { required: true }),
      f("toDate", "To", "date", { required: true }),
      f("leaveType", "Leave type", "select", {
        required: true,
        options: ["Casual", "Sick", "Annual", "Unpaid"],
      }),
      f("reason", "Reason", "textarea", { required: true }),
    ],
  },
  {
    key: "sponsorship",
    title: "Sponsorship requests",
    singular: "Sponsorship request",
    icon: "target",
    group: "Approvals & reporting",
    approvable: true,
    columns: ["ownerName", "customerId", "campaignId", "amount", "status"],
    fields: [
      ref("customerId", "Doctor", "customer"),
      ref("campaignId", "Campaign", "campaign"),
      f("amount", "Amount (₹)", "number", {
        required: true,
        min: 0.01,
        max: 1000000,
      }),
      f("reason", "Business purpose", "textarea", { required: true }),
    ],
  },
  {
    key: "sale",
    title: "Sales activity",
    singular: "Sales entry",
    icon: "wallet",
    group: "Sales & inventory",
    columns: [
      "date",
      "ownerName",
      "saleType",
      "customerId",
      "productId",
      "quantity",
      "amount",
    ],
    fields: [
      date(),
      f("saleType", "Sale type", "select", {
        required: true,
        options: ["Secondary", "Doctor-wise"],
      }),
      ref("customerId", "Customer", "customer"),
      ref("productId", "Product", "product"),
      f("quantity", "Units", "number", {
        required: true,
        min: 1,
        max: 1000000,
      }),
      f("amount", "Sales value (₹)", "number", {
        required: true,
        min: 0,
        max: 100000000,
      }),
    ],
  },
  {
    key: "challan",
    title: "Challan receipts",
    singular: "Challan",
    icon: "package",
    group: "Sales & inventory",
    readOnlyForRep: true,
    columns: ["name", "date", "ownerName", "itemId", "quantity", "status"],
    fields: [
      f("name", "Challan number", "text", { required: true }),
      date(),
      ref("recipientId", "Recipient", "users"),
      f("itemType", "Item type", "select", {
        required: true,
        options: ["Sample", "Input"],
      }),
      f("itemId", "Product / input ID", "text", { required: true }),
      f("quantity", "Sent quantity", "number", {
        required: true,
        min: 1,
        max: 1000000,
      }),
      f("notes", "Dispatch notes", "textarea"),
    ],
  },
  {
    key: "reminder",
    title: "Call reminders",
    singular: "Reminder",
    icon: "bell",
    group: "Field operations",
    columns: ["date", "customerId", "notes", "completed"],
    fields: [
      date(),
      ref("customerId", "Customer", "customer"),
      f("notes", "Reminder", "textarea", { required: true }),
      f("completed", "Completed", "select", {
        required: true,
        options: ["No", "Yes"],
      }),
    ],
  },
  {
    key: "rcpa",
    title: "RCPA observations",
    singular: "RCPA entry",
    icon: "chart-no-axes-combined",
    group: "Field operations",
    columns: [
      "date",
      "ownerName",
      "customerId",
      "productId",
      "competitor",
      "quantity",
    ],
    fields: [
      date(),
      ref("customerId", "Chemist", "customer"),
      ref("productId", "Product", "product"),
      f("competitor", "Competitor brand", "text", { required: true }),
      f("quantity", "Monthly units", "number", {
        required: true,
        min: 0,
        max: 1000000,
      }),
      f("notes", "Observation", "textarea"),
    ],
  },
  {
    key: "announcement",
    title: "Head-office updates",
    singular: "Update",
    icon: "bell",
    group: "People & masters",
    readOnlyForRep: true,
    columns: ["title", "body", "createdAt"],
    fields: [
      f("title", "Title", "text", { required: true }),
      f("body", "Message", "textarea", { required: true }),
    ],
  },
];
export const moduleByKey = Object.fromEntries(modules.map((m) => [m.key, m]));
export type RecordData = Record<string, any> & {
  id: string;
  kind: string;
  ownerId: string;
  ownerName: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export const statusLabels: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  returned: "Returned",
  rejected: "Rejected",
  active: "Active",
  acknowledged: "Acknowledged",
  completed: "Completed",
};
export const defaultPolicies = {
  gpsRadiusMeters: 200,
  maxAccuracyMeters: 100,
  staleAfterMinutes: 5,
  reportDeadlineDays: 7,
  receiptRequiredAbove: 500,
  localDA: 250,
  exStationDA: 400,
  outstationDA: 650,
  taPerKm: 3.5,
  trackingIntervalSeconds: 60,
  retentionDays: 180,
};
export const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
