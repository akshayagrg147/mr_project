import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./styles.css";
import { api, json } from "./api";
import { WorkspaceContext, type Workspace } from "./context";
import { Button, Icon, Notice, Spinner } from "./ui";
import {
  Activity,
  Approvals,
  Inventory,
  Overview,
  RecordsPage,
  Reports,
  Team,
} from "./pages";
import { TrackingPage } from "./TrackingPage";
import { Account, Settings } from "./Settings";
import type { User } from "../../../packages/shared/src/index.ts";
function App() {
  const [user, setUser] = useState<User | null>();
  useEffect(() => {
    api("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  if (user === undefined) return <Spinner />;
  if (!user) return <Login onSuccess={setUser} />;
  if (user.mustChangePassword)
    return (
      <div className="access-page">
        <Notice>
          Change your temporary password to unlock your workspace.
        </Notice>
        <Account />
      </div>
    );
  return <WorkspaceApp user={user} logout={() => setUser(null)} />;
}
function Login({ onSuccess }: { onSuccess: (u: User) => void }) {
  const [code, setCode] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [help, setHelp] = useState(false);
  return (
    <div className="login-page">
      <div className="login-story">
        <Link className="brand" to="/">
          <Icon name="briefcase-medical" size={30} />
          MR Connect
        </Link>
        <div>
          <span className="eyebrow lime">CONNECTED FIELD OPERATIONS</span>
          <h1>
            Every visit.
            <br />A stronger
            <br />
            connection.
          </h1>
          <p>
            A clear view of your field force.
            <br />A focused workspace for every representative.
          </p>
          <div className="story-points">
            <span>01 · Plan with purpose</span>
            <span>02 · Capture the complete visit</span>
            <span>03 · Decide with confidence</span>
          </div>
        </div>
        <small>Mobile field app + administration workspace</small>
      </div>
      <main className="login-form">
        <div className="login-box">
          <span className="eyebrow">YOUR COMPANY WORKSPACE</span>
          <h1>{help ? "Account & access assistance" : "Welcome back"}</h1>
          <p className="muted">
            {help
              ? "Your company administrator manages employee access."
              : "Sign in to manage a more connected field team."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              try {
                if (help) {
                  const r = await api(
                    "/auth/access-help",
                    json("POST", { companyCode: code, email }),
                  );
                  setError(r.message);
                } else {
                  const r = await api(
                    "/auth/login",
                    json("POST", {
                      companyCode: code,
                      email,
                      password,
                      client: "web",
                    }),
                  );
                  onSuccess(r.user);
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="field">
              <label htmlFor="company-code">Company code *</label>
              <input
                id="company-code"
                required
                autoComplete="organization"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Your company code"
              />
            </div>
            <div className="field">
              <label htmlFor="user-email">Employee ID / email *</label>
              <input
                id="user-email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            {!help && (
              <div className="field">
                <label htmlFor="user-password">Password *</label>
                <input
                  id="user-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            {error && <Notice tone={help ? "info" : "error"}>{error}</Notice>}
            <Button disabled={busy} className="full-width">
              {busy
                ? "Please wait…"
                : help
                  ? "Get access instructions"
                  : "Sign in"}
            </Button>
          </form>
          <button
            className="text-button access-link"
            onClick={() => {
              setHelp(!help);
              setError("");
            }}
          >
            {help ? "Back to sign-in" : "Forgot password or need access?"}
          </button>
          <p className="login-foot">
            Company-issued device? Your administrator will provide your account
            and deployment instructions.
          </p>
        </div>
      </main>
    </div>
  );
}
const nav = [
  ["/", "house", "Overview"],
  ["/team", "users", "Field team"],
  ["/customers", "stethoscope", "Customers"],
  ["/module/route", "route", "Routes & territories"],
  ["/module/tourplan", "calendar-days", "Tour plans"],
  ["/tracking", "map-pin", "Calls & tracking"],
  ["/approvals", "shield-check", "Approvals"],
  ["/module/sale", "wallet", "POB & sales"],
  ["/inventory", "package", "Samples & inputs"],
  ["/module/campaign", "target", "Campaigns"],
  ["/reports", "chart-no-axes-combined", "Reports"],
  ["/settings", "settings", "Settings"],
];
function WorkspaceApp({ user, logout }: { user: User; logout: () => void }) {
  const [workspace, setWorkspace] = useState<Workspace>(),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [toast, setToast] = useState(""),
    [search, setSearch] = useState(""),
    [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  const refresh = useCallback(async () => {
    const r = await api<Workspace>("/bootstrap");
    setWorkspace(r);
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  if (error)
    return (
      <div className="access-page">
        <Notice tone="error">{error}</Notice>
        <Button onClick={() => location.reload()}>Retry</Button>
      </div>
    );
  if (!workspace) return <Spinner />;
  return (
    <WorkspaceContext.Provider
      value={{ workspace, refresh, notify: setToast, version }}
    >
      <div className="app-shell">
        <aside className={menu ? "sidebar open" : "sidebar"}>
          <Link className="brand" to="/">
            <Icon name="briefcase-medical" size={28} />
            MR Connect
          </Link>
          <span className="sidebar-label">ADMIN WORKSPACE</span>
          <nav aria-label="Main navigation">
            {nav
              .filter(
                ([path]) =>
                  user.role !== "rep" ||
                  !["/team", "/approvals"].includes(path),
              )
              .map(([path, icon, title]) => (
                <NavLink
                  end={path === "/"}
                  key={path}
                  to={path}
                  onClick={() => setMenu(false)}
                >
                  <Icon name={icon} size={20} />
                  {title}
                </NavLink>
              ))}
          </nav>
          <div className="workspace-note">
            <small>PHARMA DIVISION</small>
            <strong>{workspace.company.code} · Field operations</strong>
            <small>
              {user.name} · {user.role}
            </small>
          </div>
          <button
            className="logout"
            onClick={async () => {
              await api("/auth/logout", json("POST", {}));
              logout();
            }}
          >
            <Icon name="log-out" size={22} />
            <span>Sign out</span>
          </button>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            <span className="company-title">
              {workspace.company.code} / Pharma division
            </span>
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate("/customers?q=" + encodeURIComponent(search));
              }}
            >
              <Icon name="search" size={22} />
              <input
                aria-label="Search customers"
                placeholder="Search customers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </form>
            <Link
              className="icon-button"
              aria-label="Head-office updates"
              to="/module/announcement"
            >
              <Icon name="bell" />
            </Link>
            <Link
              className="avatar"
              aria-label="Account settings"
              to="/settings?tab=account"
            >
              {user.name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </Link>
          </header>
          <main className="content">
            {workspace.company.name.includes("Demo") && (
              <div className="demo-banner">
                DEMO WORKSPACE · Fictional records for testing
              </div>
            )}
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/team" element={<Team />} />
              <Route
                path="/customers"
                element={<RecordsPage key="customer" kind="customer" />}
              />
              {workspace.modules.map((m) => (
                <Route
                  key={m.key}
                  path={"/module/" + m.key}
                  element={<RecordsPage key={m.key} kind={m.key} />}
                />
              ))}
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/tracking" element={<TrackingPage />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <footer className="content-footer">
              <Link to="/activity">Calls & daily reports</Link>
              <Link to="/module/expense">Expenses</Link>
              <Link to="/module/leave">Leave</Link>
              <Link to="/module/sponsorship">Sponsorship</Link>
              <Link to="/module/rcpa">RCPA</Link>
              <Link to="/module/reminder">Reminders</Link>
              <Link to="/module/dayplan">Day plans</Link>
            </footer>
          </main>
        </div>
        {toast && (
          <div className="toast" role="status">
            ✓ {toast}
          </div>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
