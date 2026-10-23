import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "./api";
import { useWorkspace } from "./context";
import {
  Badge,
  Button,
  Empty,
  Metric,
  Notice,
  PageTitle,
  Spinner,
  Table,
  useResource,
} from "./ui";
export function TrackingPage() {
  const { workspace, version } = useWorkspace();
  const users = workspace.users.filter((u) => u.role === "rep");
  const [employee, setEmployee] = useState(users[0]?.id || workspace.user.id);
  const [date, setDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  );
  const [tick, setTick] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { data, error, loading } = useResource(
    () => api("/tracking/" + employee + "?date=" + date),
    [employee, date, version, tick],
  );
  const { data: overview } = useResource(
    () => api("/tracking?date=" + date),
    [date, version, tick],
  );
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setCursor(Math.max(0, (data?.points.length || 0) - 1));
    setPlaying(false);
  }, [data]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setCursor((c) => {
          if (c >= (data?.points.length || 1) - 1) {
            setPlaying(false);
            return c;
          }
          return c + 1;
        }),
      800,
    );
    return () => clearInterval(timer);
  }, [playing, data]);
  const points = data?.points || [],
    point = points[cursor];
  return (
    <>
      <PageTitle
        title="Field activity map"
        description="Recorded GPS evidence, route replay and gaps. Locations refresh every 30 seconds."
        actions={
          <Button secondary onClick={() => setTick((t) => t + 1)}>
            Refresh activity
          </Button>
        }
      />
      <div className="filter-bar">
        <label>
          Representative
          <select
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Activity date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {data && <Badge status={data.state.replaceAll("_", " ")} />}
      </div>
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : loading && !data ? (
        <Spinner />
      ) : (
        data && (
          <>
            <div className="metrics">
              <Metric
                label="Recorded distance"
                value={data.km + " km"}
                hint="Gaps and poor fixes excluded"
              />
              <Metric
                label="Location points"
                value={points.length}
                hint={`${points.filter((p: any) => p.mocked).length} marked as mock locations`}
              />
              <Metric
                label="Last location fix"
                value={
                  data.lastFix
                    ? new Date(data.lastFix.observed_at).toLocaleTimeString(
                        [],
                        { hour: "2-digit", minute: "2-digit" },
                      )
                    : "—"
                }
                hint={
                  data.lastFix
                    ? "Accuracy ±" + Math.round(data.lastFix.accuracy) + " m"
                    : "Awaiting location evidence"
                }
              />
              <Metric
                label="Recorded gaps"
                value={data.gaps.length}
                hint="Reason may be unknown"
              />
            </div>
            <div className="tracking-grid">
              <section className="card">
                <div className="card-heading">
                  <h3>Route replay</h3>
                  <span className="muted">{points.length} captured fixes</span>
                </div>
                {points.length ? (
                  <>
                    <Map points={points} cursor={cursor} />
                    <div className="replay">
                      <Button
                        secondary
                        disabled={points.length < 2}
                        onClick={() => {
                          if (cursor === points.length - 1) setCursor(0);
                          setPlaying(!playing);
                        }}
                      >
                        {playing ? "Pause" : "Play route"}
                      </Button>
                      <input
                        type="range"
                        aria-label="Replay position"
                        min="0"
                        max={points.length - 1}
                        value={cursor}
                        onChange={(e) => {
                          setPlaying(false);
                          setCursor(Number(e.target.value));
                        }}
                      />
                      <time>
                        {point &&
                          new Date(point.observed_at).toLocaleTimeString()}
                      </time>
                    </div>
                    <p className="muted">
                      {point &&
                        `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)} · ±${Math.round(point.accuracy)} m · Battery ${point.battery ?? "unknown"}%${point.mocked ? " · Mock location" : ""}`}
                    </p>
                  </>
                ) : (
                  <Empty
                    title="No location points for this date"
                    body={
                      data.state === "not_started"
                        ? "No shift was started. Start a shift from the Android app after submitting a day plan."
                        : "The shift has no uploaded location fixes yet. Check permissions, location services and sync on the phone."
                    }
                  />
                )}
              </section>
              <section className="card">
                <h3>Shift & evidence</h3>
                <dl className="details single">
                  <div>
                    <dt>Shift started</dt>
                    <dd>
                      {data.shift
                        ? new Date(data.shift.started_at).toLocaleString()
                        : "Not started"}
                    </dd>
                  </div>
                  <div>
                    <dt>Shift ended</dt>
                    <dd>
                      {data.shift?.ended_at
                        ? new Date(data.shift.ended_at).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Last server receipt</dt>
                    <dd>
                      {data.lastFix
                        ? new Date(data.lastFix.received_at).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                </dl>
                {data.gaps.map((g: any, i: number) => (
                  <Notice key={i} tone="warning">
                    {new Date(g.from).toLocaleTimeString()} –{" "}
                    {new Date(g.to).toLocaleTimeString()} · {g.minutes} minute
                    gap
                  </Notice>
                ))}
                {data.events.map((e: any) => (
                  <p key={e.id}>
                    {e.event.replaceAll("_", " ")}
                    <br />
                    <small>{new Date(e.observed_at).toLocaleString()}</small>
                  </p>
                ))}
              </section>
            </div>
          </>
        )
      )}
      {overview && (
        <section className="card no-padding">
          <div className="card-heading">
            <h3>Mobile area tracking</h3>
          </div>
          <Table
            rows={overview.items}
            columns={[
              { key: "name", label: "Representative" },
              {
                key: "state",
                label: "Tracking",
                render: (r) => <Badge status={r.state.replaceAll("_", " ")} />,
              },
              { key: "km", label: "Recorded km" },
              {
                key: "lastFix",
                label: "Last fix",
                render: (r) =>
                  r.lastFix
                    ? new Date(r.lastFix.observed_at).toLocaleString()
                    : "—",
              },
            ]}
            onRow={(r) => setEmployee(r.userId)}
          />
        </section>
      )}
    </>
  );
}
function Map({ points, cursor }: { points: any[]; cursor: number }) {
  const ref = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, { scrollWheelZoom: false }).setView(
      [points[0].latitude, points[0].longitude],
      14,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    if (points.length > 1)
      m.fitBounds(
        L.latLngBounds(points.map((p) => [p.latitude, p.longitude])),
        { padding: [30, 30], maxZoom: 16 },
      );
    return () => {
      m.remove();
      map.current = null;
    };
  }, [points]);
  useEffect(() => {
    const group = layer.current;
    if (!group) return;
    group.clearLayers();
    const shown = points.slice(0, cursor + 1);
    L.polyline(
      shown.map((p) => [p.latitude, p.longitude]),
      { color: "#087f83", weight: 4 },
    ).addTo(group);
    const p = points[cursor];
    if (p) {
      L.circle([p.latitude, p.longitude], {
        radius: p.accuracy,
        color: p.mocked ? "#bc3f45" : "#087f83",
        weight: 1,
        fillOpacity: 0.12,
      }).addTo(group);
      L.circleMarker([p.latitude, p.longitude], {
        radius: 7,
        color: "#fff",
        weight: 3,
        fillColor: "#087f83",
        fillOpacity: 1,
      })
        .addTo(group)
        .bindPopup(new Date(p.observed_at).toLocaleString());
    }
  }, [points, cursor]);
  return (
    <div
      ref={ref}
      className="map"
      role="img"
      aria-label="Recorded location route map"
    />
  );
}
