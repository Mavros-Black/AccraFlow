"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CalendarDays,
  CloudRain,
  HardHat,
  TriangleAlert,
  UsersRound,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Droplets,
  FlaskConical,
  Layers,
  LayoutDashboard,
  Map,
  MapPin,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Waves,
  Wrench,
  X,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";
import AccraMap from "./components/accra-map";
import {
  demoIncidents,
  demoPreviousSnapshot,
  places,
  statuses,
  type Incident,
} from "@/lib/demo";
import { demoNetwork, demoPlannedNetworkSegments } from "@/lib/demo-map";
import { demoGaugeSeries } from "@/lib/demo-observations";
const navigation = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Drainage Map", icon: Map },
  { name: "Reports & Incidents", icon: ClipboardList },
  { name: "Simulation Lab", icon: FlaskConical },
  { name: "Maintenance", icon: Wrench },
  { name: "Infrastructure", icon: Layers },
  { name: "Analytics & Reports", icon: ChartNoAxesCombined },
  { name: "Users & Permissions", icon: UsersRound },
  { name: "Settings", icon: Settings },
];
export default function Home() {
  const [page, setPage] = useState("Dashboard");
  const [accraClock, setAccraClock] = useState<{
    date: string;
    time: string;
  } | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setAccraClock({
        date: new Intl.DateTimeFormat("en-GB", {
          timeZone: "Africa/Accra",
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(now),
        time: new Intl.DateTimeFormat("en-GB", {
          timeZone: "Africa/Accra",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }).format(now),
      });
    };
    const first = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, []);
  const adminPage = page === "Users & Permissions" || page === "Settings";
  const [incidents, setIncidents] = useState<Incident[]>(demoIncidents);
  const [selected, setSelected] = useState("AF-001");
  const [center, setCenter] = useState<[number, number]>([-0.214, 5.587]);
  const [showIncidents, setShowIncidents] = useState(true);
  const [filter, setFilter] = useState("All statuses");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(false);
  const [formError, setFormError] = useState("");
  const [scenario, setScenario] = useState("");
  const [chartView, setChartView] = useState<"reports" | "rainfall">(
    "rainfall",
  );
  const [forecastPeriod, setForecastPeriod] = useState("24 hours");
  const [tasks, setTasks] = useState([
    {
      id: "WO-001",
      incident: "AF-003",
      title: "Inspect culvert opening",
      area: "Dzorwulu",
      crew: "Field team A",
      done: false,
    },
    {
      id: "WO-002",
      incident: "AF-001",
      title: "Clear demo debris",
      area: "Kaneshie",
      crew: "Field team B",
      done: false,
    },
    {
      id: "WO-003",
      incident: "AF-004",
      title: "Debris removal completed",
      area: "Osu",
      crew: "Field team C",
      done: true,
    },
  ]);
  const choose = useCallback((id: string) => {
    setSelected(id);
  }, []);
  const current = incidents.find((i) => i.id === selected) ?? incidents[0];
  const visible = incidents.filter(
    (i) =>
      (filter === "All statuses" || i.status === filter) &&
      `${i.title} ${i.area} ${i.id}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const open = incidents.filter((i) => i.status !== "Resolved").length;
  const resolvedCount = incidents.filter((i) => i.status === "Resolved").length;
  const demoCoverage = Math.round(
    (demoNetwork.features.length / demoPlannedNetworkSegments) * 100,
  );
  const percentChange = (current: number, previous: number) =>
    Math.round(((current - previous) / previous) * 100);
  const demoAreaCounts = ["Circle", "Kaneshie", "Nima", "Achimota"].map(
    (area) => ({
      area,
      count: incidents.filter(
        (incident) => incident.area === area && incident.status !== "Resolved",
      ).length,
    }),
  );
  const maxDemoAreaCount = Math.max(
    1,
    ...demoAreaCounts.map((entry) => entry.count),
  );
  const criticalCount = incidents.filter(
    (i) => i.priority === "High" && i.status !== "Resolved",
  ).length;
  function selectIncident(i: Incident) {
    setSelected(i.id);
    setCenter(i.coordinates);
  }
  function advance() {
    const next = statuses[statuses.indexOf(current.status) + 1];
    if (!next) return;
    setIncidents((items) =>
      items.map((i) =>
        i.id === current.id
          ? {
              ...i,
              status: next,
              history: [
                ...i.history,
                `${next} · ${new Date().toLocaleString("en-GH")} · local demo`,
              ],
            }
          : i,
      ),
    );
  }
  function exportCSV() {
    const rows = [
      ["ID", "Title", "Area", "Category", "Status", "Data"],
      ...incidents.map((i) => [
        i.id,
        i.title,
        i.area,
        i.category,
        i.status,
        "DEMO",
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        [
          rows
            .map((r) =>
              r.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","),
            )
            .join("\n"),
        ],
        { type: "text/csv" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "accraflow-demo-incidents.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  function submit(form: FormData) {
    const schema = z.object({
      title: z.string().trim().min(5).max(120),
      description: z.string().trim().min(15).max(2000),
      latitude: z.coerce.number().min(5.4).max(5.85),
      longitude: z.coerce.number().min(-0.45).max(0.1),
      area: z.enum([
        "Kaneshie",
        "Adabraka",
        "Dzorwulu",
        "Osu",
        "Madina",
        "Odaw",
        "Accra",
      ]),
      category: z.enum(["Blockage", "Flooding", "Debris", "Damaged culvert"]),
    });
    const result = schema.safeParse(Object.fromEntries(form));
    if (!result.success) {
      setFormError(
        "Enter a title (5–120 characters), description (15–2000 characters), and coordinates within greater Accra.",
      );
      return;
    }
    const d = result.data;
    const item: Incident = {
      id: "AF-" + crypto.randomUUID().slice(0, 6),
      title: d.title,
      description: d.description,
      coordinates: [d.longitude, d.latitude],
      area: d.area,
      category: d.category,
      priority: "Medium",
      status: "Submitted",
      history: [
        "Submitted · " + new Date().toLocaleString("en-GH") + " · local demo",
      ],
    };
    setIncidents((list) => [item, ...list]);
    selectIncident(item);
    setModal(false);
    setNotice("Demo report submitted for review. Stored in this session only.");
  }
  const reportList = (
    <section className="panel reports-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">COMMUNITY INTELLIGENCE</span>
          <h2>
            Reports & incidents <span className="demo">DEMO</span>
          </h2>
        </div>
        <button
          className="text-button"
          onClick={() => setPage("Reports & Incidents")}
        >
          View all <ArrowRight size={15} />
        </button>
      </div>
      <div className="table-tools">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Filter reports"
            placeholder="Search reports or neighbourhood…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option>All statuses</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>REPORT</th>
              <th>LOCATION</th>
              <th>PRIORITY</th>
              <th>STATUS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr
                key={i.id}
                className={selected === i.id ? "selected-row" : ""}
              >
                <td>
                  <button
                    className="report-title"
                    onClick={() => selectIncident(i)}
                  >
                    {i.title}
                    <small>{i.id} · DEMO</small>
                  </button>
                </td>
                <td>{i.area}</td>
                <td>
                  <span className={"priority " + i.priority.toLowerCase()}>
                    {i.priority}
                  </span>
                </td>
                <td>
                  <span
                    className={
                      "status " + (i.status === "Resolved" ? "resolved" : "")
                    }
                  >
                    {i.status}
                  </span>
                </td>
                <td>
                  <button
                    aria-label={"Select " + i.title}
                    onClick={() => selectIncident(i)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="empty">No demo reports match these filters.</p>
        )}
      </div>
    </section>
  );
  const maintenance = (
    <section className="panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">FIELD OPERATIONS</span>
          <h2>
            Maintenance Work Queue <span className="demo">DEMO</span>
          </h2>
        </div>
        {page === "Dashboard" ? (
          <button
            className="text-button"
            onClick={() => setPage("Maintenance")}
          >
            View all <ArrowRight size={15} />
          </button>
        ) : (
          <Wrench size={19} />
        )}
      </div>
      <div className="queue-columns">
        <span>WORK ORDER</span>
        <span>LOCATION / TASK</span>
        <span>TEAM</span>
        <span>STATUS</span>
        <span className="sr-only">Completion</span>
      </div>
      {(page === "Dashboard" ? tasks.slice(0, 3) : tasks).map((t) => (
        <div className="task" key={t.id}>
          <span className="queue-id">{t.id}</span>
          <div className="queue-details">
            <strong>{t.area}</strong>
            <button
              className="queue-incident-link"
              onClick={() => {
                const incident = incidents.find(
                  (item) => item.id === t.incident,
                );
                if (incident) {
                  selectIncident(incident);
                  setPage("Reports & Incidents");
                }
              }}
            >
              {t.title}
            </button>
          </div>
          <span className="queue-crew">{t.crew}</span>
          <span
            className={`status queue-status ${t.done ? "completed" : "assigned"}`}
          >
            {t.done ? "Completed" : "Assigned"}
          </span>
          <button
            className={"check-box " + (t.done ? "checked" : "")}
            aria-pressed={t.done}
            aria-label={"Toggle demo completion: " + t.title}
            onClick={() =>
              setTasks((all) =>
                all.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
              )
            }
          >
            {t.done && <Check size={14} />}
          </button>
        </div>
      ))}
      <p className="muted footnote">
        {page === "Dashboard" && tasks.length > 3
          ? `Showing 3 of ${tasks.length} demo work orders. `
          : ""}
        Session-only demo; changes reset on reload.
      </p>
    </section>
  );
  const simulation = (
    <section className="panel simulation">
      <div className="section-head">
        <div>
          <span className="eyebrow">ENGINEERING WORKSPACE</span>
          <h2>Simulation Lab</h2>
        </div>
        <FlaskConical className="teal" />
      </div>
      <p className="muted">
        Explore a scenario. Validated hydraulic modeling is not connected.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setScenario(
            `${data.get("catchment")} · ${data.get("rainfall")} mm / ${data.get("duration")} min · ${data.get("intervention")}`,
          );
        }}
      >
        <label>
          Catchment scenario
          <select name="catchment">
            <option>Odaw — synthetic configuration</option>
            <option>Korle — synthetic configuration</option>
          </select>
        </label>
        <div className="form-grid">
          <label>
            Rainfall depth (mm)
            <input
              name="rainfall"
              type="number"
              min="1"
              max="1000"
              defaultValue="50"
              required
            />
          </label>
          <label>
            Duration (minutes)
            <input
              name="duration"
              type="number"
              min="5"
              max="1440"
              defaultValue="60"
              required
            />
          </label>
        </div>
        <label>
          Intervention
          <select name="intervention">
            {[
              "Existing conditions",
              "Cleaning",
              "Culvert enlargement",
              "Channel upgrade",
              "Retention facility",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <button className="primary" type="submit">
          Save local configuration <ArrowRight size={16} />
        </button>
      </form>
      {scenario && (
        <div className="scenario-result">
          <strong>Configuration saved in this session</strong>
          <p>{scenario}</p>
          <span className="status">Awaiting validated model</span>
        </div>
      )}
      <div className="model-results-preview">
        <strong>
          Results <span className="demo">AWAITING MODEL</span>
        </strong>
        <div>
          <Waves size={20} /> Peak flow <b>—</b>
        </div>
        <div>
          <Droplets size={20} /> Flood extent <b>—</b>
        </div>
        <div>
          <Activity size={20} /> Time to drain <b>—</b>
        </div>
      </div>
      <p className="footnote muted">
        No depths, risk scores, flow directions, or savings are calculated.
        Surveyed geometry, elevations, rainfall provenance, calibration, and
        professional engineering review are required.
      </p>
    </section>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <div className="brand-mark">
            <svg viewBox="0 0 100 48" role="img" aria-label="AccraFlow waves">
              <path d="M3 30c15 1 22-7 33-19C48-2 65 0 77 5c10 4 18 12 20 24-8-6-16-9-25-10-13-2-22 2-34 11C28 38 16 41 3 39" />
              <path d="M3 43c14 2 24-1 36-8 12-7 22-10 34-9 10 1 17 4 24 10" />
              <path d="M4 35c15 1 24-5 35-15 11-9 23-12 34-9" />
            </svg>
          </div>
          <div>
            AccraFlow <b className="brand-ai">AI</b>
            <span>URBAN DRAINAGE & FLOOD MANAGEMENT</span>
          </div>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">A</span>
          <div>
            Accra Metropolitan<small>Ghana · Demo workspace</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              aria-label={name}
              className={page === name ? "active" : ""}
              onClick={() => setPage(name)}
            >
              <Icon size={18} style={{ flexShrink: 0 }} />
              <span>{name}</span>
              {name === "Reports & Incidents" && (
                <em title="High-priority demo reports">{criticalCount}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-note">
            <span className="live-dot" /> Local demo environment
            <p>No live sensors connected</p>
          </div>
          <button
            onClick={() =>
              setNotice(
                "AccraFlow Phase 1: use the map, select a report, or configure a scenario. All operational records are demo data.",
              )
            }
          >
            <CircleHelp size={17} /> Help & documentation
          </button>
          <div className="profile">
            <span>AK</span>
            <div>
              Akosua K.<small>Demo operator</small>
            </div>
            <Settings size={17} />
          </div>
        </div>
      </aside>
      <div
        className={
          page === "Dashboard" ? "main-shell dashboard-view" : "main-shell"
        }
      >
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="header-weather">
            <CloudRain size={30} />
            <span>
              <strong>—</strong>
              <small>Weather unavailable</small>
            </span>
          </div>
          <div className="header-calendar">
            <CalendarDays size={26} />
            <span>
              {accraClock?.date ?? "Accra date"}
              <small>
                {accraClock ? `${accraClock.time} (GMT)` : "Local time · GMT"}
              </small>
            </span>
          </div>
          <div className="header-location">
            <MapPin size={20} />{" "}
            <span>
              Accra, Ghana <small>Demo workspace</small>
            </span>
          </div>
          <div className="top-actions">
            <span className="demo">DEMO MODE</span>
            <button
              aria-label="Show notifications"
              onClick={() =>
                setNotice(
                  `${open} open demo reports. No live alerts or weather feed are connected.`,
                )
              }
            >
              <Bell size={19} />
              <i />
            </button>
            <span className="avatar">AK</span>
            <div className="header-user">
              <strong>Akosua K.</strong>
              <small>Demo operator</small>
            </div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">ACCRA DRAINAGE OPERATIONS</div>
              <h1>{page === "Dashboard" ? "City overview" : page}</h1>
              <p>
                Better visibility. Coordinated action. A more resilient Accra.
              </p>
            </div>
            <div className="heading-actions">
              <button className="secondary" onClick={exportCSV}>
                <ArrowDownToLine size={16} /> Export demo CSV
              </button>
              <button
                className="primary"
                onClick={() => {
                  setModal(true);
                  setFormError("");
                }}
              >
                <Plus size={17} /> New report
              </button>
            </div>
          </div>
          <div className="demo-banner">
            <ShieldCheck size={17} />
            <span>
              <strong>Demonstration workspace.</strong> All incidents, locations
              and metrics are synthetic. Basemap geography is real. Session
              changes reset on reload.
            </span>
          </div>
          {notice && (
            <div role="status" className="notice">
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {["Dashboard", "Drainage Map", "Reports & Incidents"].includes(
            page,
          ) && (
            <>
              <div className="kpi-grid">
                {[
                  {
                    label: "Total Reports",
                    value: incidents.length,
                    detail: `Demo reports compared with a previous synthetic snapshot of ${demoPreviousSnapshot.totalReports}`,
                    change: percentChange(
                      incidents.length,
                      demoPreviousSnapshot.totalReports,
                    ),
                    icon: ClipboardList,
                    color: "orange",
                  },
                  {
                    label: "Critical Issues",
                    value: criticalCount,
                    detail: "High priority demo reports",
                    icon: TriangleAlert,
                    color: "orange",
                  },
                  {
                    label: "In Progress",
                    value: incidents.filter((i) => i.status === "In Progress")
                      .length,
                    detail: "Demo reports in progress",
                    icon: HardHat,
                    color: "orange",
                  },
                  {
                    label: "Resolved",
                    value: resolvedCount,
                    detail: `Demo resolved reports compared with a previous synthetic snapshot of ${demoPreviousSnapshot.resolvedReports}`,
                    change: percentChange(
                      resolvedCount,
                      demoPreviousSnapshot.resolvedReports,
                    ),
                    icon: Check,
                    color: "green",
                  },
                  {
                    label: "Drainage Coverage",
                    value: `${demoCoverage}%`,
                    detail: `DEMO only: ${demoNetwork.features.length} synthetic segments out of ${demoPlannedNetworkSegments} planned sample segments. Not actual drainage coverage.`,
                    icon: Layers,
                    color: "blue",
                  },
                  {
                    label: "Flood Risk Areas",
                    value: null,
                    detail: "Validated model required",
                    icon: Waves,
                    color: "teal",
                  },
                ].map(({ label, value, detail, change, icon: Icon, color }) => (
                  <section className="kpi" key={label} title={detail}>
                    <div>
                      <span>{label}</span>
                      <Icon size={18} className={color} />
                    </div>
                    <strong
                      aria-label={
                        label === "Drainage Coverage"
                          ? `${value} synthetic demo coverage, not actual drainage coverage`
                          : undefined
                      }
                    >
                      {value === null ? "—" : value}
                    </strong>
                    {change !== undefined && (
                      <span
                        className={`kpi-trend ${change < 0 ? "negative" : ""}`}
                        aria-label={`${Math.abs(change)} percent ${change < 0 ? "decrease" : "increase"} versus previous synthetic demo snapshot`}
                      >
                        <span aria-hidden="true">{change < 0 ? "↓" : "↑"}</span>{" "}
                        {Math.abs(change)}%{" "}
                        <span className="sr-only">demo change</span>
                      </span>
                    )}
                    <small>
                      {detail} <b>DEMO</b>
                    </small>
                    {label === "Drainage Coverage" && (
                      <span
                        className="kpi-coverage-track"
                        role="img"
                        aria-label={`${demoCoverage}% demo coverage: ${demoNetwork.features.length} synthetic segments out of ${demoPlannedNetworkSegments} planned sample segments; not actual drainage coverage`}
                      >
                        <span style={{ width: `${demoCoverage}%` }} />
                      </span>
                    )}
                    {label === "Flood Risk Areas" && (
                      <span className="kpi-unavailable">NO MODEL</span>
                    )}
                  </section>
                ))}
              </div>
              <div
                className={
                  page === "Dashboard"
                    ? "workspace-grid dashboard-workspace"
                    : "workspace-grid"
                }
              >
                <section className="panel map-panel">
                  <div className="section-head">
                    <div>
                      <h2>
                        <MapPin size={18} className="teal" /> Accra Map
                      </h2>
                      <p>Accra, Greater Accra Region</p>
                    </div>
                    <div
                      className="map-modes"
                      aria-label="Workspace navigation"
                    >
                      <button
                        className="selected"
                        type="button"
                        onClick={() => setPage("Drainage Map")}
                      >
                        Map
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage("Simulation Lab")}
                      >
                        Simulate
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage("Infrastructure")}
                      >
                        Plan
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage("Maintenance")}
                      >
                        Maintain
                      </button>
                    </div>
                    <span className="map-tag">
                      <MapPin size={13} /> 5.6037° N, 0.1870° W
                    </span>
                  </div>
                  <div className="map-toolbar">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const place = String(
                          new FormData(e.currentTarget).get("place"),
                        );
                        if (places[place]) setCenter(places[place]);
                      }}
                    >
                      <Search size={15} />
                      <select name="place" aria-label="Find a neighbourhood">
                        {Object.keys(places).map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                      <button type="submit">Locate</button>
                    </form>
                    <label>
                      <input
                        type="checkbox"
                        checked={showIncidents}
                        onChange={(e) => setShowIncidents(e.target.checked)}
                      />
                      <Layers size={14} /> Demo map layers
                    </label>
                  </div>
                  <AccraMap
                    incidents={visible.filter(
                      (incident) =>
                        incident.mapVisible !== false ||
                        incident.id === selected,
                    )}
                    selected={selected}
                    onSelect={choose}
                    center={center}
                    showIncidents={showIncidents}
                  />
                  <div className="map-source">
                    Basemap:{" "}
                    {process.env.NEXT_PUBLIC_ARCGIS_API_KEY
                      ? "Esri imagery"
                      : "OpenStreetMap"}{" "}
                    · Synthetic lines, zones and incidents · Not surveyed or
                    modeled
                  </div>
                </section>
                <section className="panel context-panel">
                  <div className="section-head">
                    <h2>Incident Details</h2>
                    <span className="demo">DEMO</span>
                  </div>
                  <div
                    className="incident-photo-demo"
                    role="img"
                    aria-label="AI-generated fictional street scene, not a photo of this incident"
                  >
                    <span>DEMO · ILLUSTRATION</span>
                  </div>
                  <div className="context-id">
                    {current.id}{" "}
                    <span
                      className={"priority " + current.priority.toLowerCase()}
                    >
                      {current.priority} priority
                    </span>
                  </div>
                  <h3>{current.title}</h3>
                  <p className="location">
                    <MapPin size={14} />
                    {current.area}, Accra
                  </p>
                  <p className="description">{current.description}</p>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <span className="status">{current.status}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Category</dt>
                      <dd>{current.category}</dd>
                    </div>
                    <div>
                      <dt>Coordinates</dt>
                      <dd>
                        {current.coordinates[1].toFixed(3)},{" "}
                        {current.coordinates[0].toFixed(3)}
                      </dd>
                    </div>
                  </dl>
                  <details className="history">
                    <summary className="eyebrow">DEMO STATUS HISTORY</summary>
                    {current.history.map((h, index) => (
                      <p key={index}>
                        <i />
                        {h}
                      </p>
                    ))}
                  </details>
                  {current.status !== "Resolved" && (
                    <button className="primary full" onClick={advance}>
                      Demo: {statuses[statuses.indexOf(current.status) + 1]}{" "}
                      <ArrowRight size={15} />
                    </button>
                  )}
                  {current.status === "Verified" && (
                    <button
                      className="secondary full"
                      onClick={() => {
                        if (tasks.some((t) => t.incident === current.id)) {
                          setNotice(
                            "A demo work order already exists for this report.",
                          );
                          return;
                        }
                        setTasks((all) => [
                          ...all,
                          {
                            id:
                              "WO-" +
                              (all.length + 1).toString().padStart(3, "0"),
                            incident: current.id,
                            title: current.title,
                            area: current.area,
                            crew: "Field team A",
                            done: false,
                          },
                        ]);
                        setNotice(
                          "Demo work order created and assigned to Field team A.",
                        );
                      }}
                    >
                      Create demo work order
                    </button>
                  )}
                </section>
                {page === "Dashboard" && simulation}
              </div>
              {page !== "Dashboard" && reportList}
              {page === "Dashboard" && (
                <div className="bottom-grid">
                  {maintenance}
                  <section className="panel">
                    <div className="section-head">
                      <div>
                        <span className="eyebrow">
                          {chartView === "rainfall"
                            ? "FICTIONAL SENSOR SAMPLE"
                            : "SESSION SNAPSHOT"}
                        </span>
                        <h2>
                          {chartView === "reports"
                            ? "Reports & Work Orders"
                            : "Rainfall & Water Level"}{" "}
                          <span className="demo">DEMO</span>
                        </h2>
                      </div>
                      <select
                        aria-label="Chart view"
                        className="card-select"
                        value={chartView}
                        onChange={(event) =>
                          setChartView(
                            event.target.value as "reports" | "rainfall",
                          )
                        }
                      >
                        <option value="reports">Reports</option>
                        <option value="rainfall">Rainfall & water level</option>
                      </select>
                    </div>
                    {chartView === "reports" ? (
                      <>
                        <div className="chart-legend">
                          <span>
                            <i className="chart-bar-key" /> Demo reports
                          </span>
                          <span>
                            <i className="chart-line-key" /> Linked work orders
                          </span>
                        </div>
                        <div className="chart">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={statuses.map((status) => ({
                                status,
                                reports: incidents.filter(
                                  (incident) => incident.status === status,
                                ).length,
                                workOrders: tasks.filter((task) =>
                                  incidents.some(
                                    (incident) =>
                                      incident.id === task.incident &&
                                      incident.status === status,
                                  ),
                                ).length,
                              }))}
                              margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                            >
                              <CartesianGrid
                                stroke="#29445a"
                                strokeDasharray="2 3"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="status"
                                tick={{ fontSize: 9, fill: "#9db1c7" }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                allowDecimals={false}
                                width={24}
                                tick={{ fontSize: 10, fill: "#9db1c7" }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip
                                contentStyle={{
                                  background: "#12202e",
                                  border: "1px solid #334155",
                                  color: "#fff",
                                }}
                              />
                              <Bar
                                dataKey="reports"
                                name="Demo reports"
                                fill="#009eee"
                                maxBarSize={27}
                              />
                              <Line
                                dataKey="workOrders"
                                name="Linked work orders"
                                stroke="#bb6bea"
                                strokeWidth={2.5}
                                dot={{ r: 3, fill: "#bb6bea" }}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                        <p className="card-note">
                          Counts by incident status; work orders are grouped by
                          their linked demo report.
                        </p>
                        <div className="sr-only">
                          <table>
                            <caption>
                              Demo reports and linked work orders by incident
                              status
                            </caption>
                            <thead>
                              <tr>
                                <th>Status</th>
                                <th>Reports</th>
                                <th>Linked work orders</th>
                              </tr>
                            </thead>
                            <tbody>
                              {statuses.map((status) => (
                                <tr key={status}>
                                  <th scope="row">{status}</th>
                                  <td>
                                    {
                                      incidents.filter(
                                        (incident) =>
                                          incident.status === status,
                                      ).length
                                    }
                                  </td>
                                  <td>
                                    {
                                      tasks.filter((task) =>
                                        incidents.some(
                                          (incident) =>
                                            incident.id === task.incident &&
                                            incident.status === status,
                                        ),
                                      ).length
                                    }
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="chart-legend">
                          <span>
                            <i className="chart-bar-key" /> Demo rainfall (mm)
                          </span>
                          <span>
                            <i className="chart-line-key" /> Demo gauge level
                            (m)
                          </span>
                        </div>
                        <div
                          className="chart"
                          role="img"
                          aria-label="Fictional demo chart of rainfall and gauge water level; not actual observations or flood depths"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={demoGaugeSeries}
                              margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
                            >
                              <CartesianGrid
                                stroke="#29445a"
                                strokeDasharray="2 3"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="hour"
                                interval={1}
                                tick={{ fontSize: 9, fill: "#9db1c7" }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                yAxisId="rainfall"
                                width={24}
                                domain={[0, 60]}
                                tick={{ fontSize: 10, fill: "#9db1c7" }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                yAxisId="gauge"
                                orientation="right"
                                width={32}
                                domain={[0, 3]}
                                ticks={[0, 0.5, 1, 1.5, 2, 2.5, 3]}
                                tick={{ fontSize: 10, fill: "#9db1c7" }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip
                                contentStyle={{
                                  background: "#12202e",
                                  border: "1px solid #334155",
                                  color: "#fff",
                                }}
                              />
                              <Bar
                                yAxisId="rainfall"
                                dataKey="rainfallMm"
                                name="DEMO rainfall (mm)"
                                fill="#009eee"
                                maxBarSize={22}
                              />
                              <Line
                                yAxisId="gauge"
                                dataKey="gaugeStageM"
                                name="DEMO gauge stage (m)"
                                stroke="#bb6bea"
                                strokeWidth={2.5}
                                dot={{ r: 3, fill: "#bb6bea" }}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                        <p className="card-note">
                          Fictional sample only. Gauge stage uses an arbitrary
                          zero; it is not flood depth.
                        </p>
                        <div className="sr-only">
                          <table>
                            <caption>
                              Fictional demo rainfall and gauge-stage values;
                              not actual observations
                            </caption>
                            <thead>
                              <tr>
                                <th>Time</th>
                                <th>Demo rainfall (mm)</th>
                                <th>Demo gauge stage (m, arbitrary zero)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {demoGaugeSeries.map((point) => (
                                <tr key={point.hour}>
                                  <th scope="row">{point.hour}</th>
                                  <td>{point.rainfallMm}</td>
                                  <td>{point.gaugeStageM}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </section>
                  <section className="panel forecast-panel">
                    <div className="section-head">
                      <h2>
                        Flood Risk Forecast{" "}
                        <span className="demo">UNAVAILABLE</span>
                      </h2>
                      <select
                        aria-label="Forecast period"
                        className="card-select"
                        value={forecastPeriod}
                        onChange={(event) =>
                          setForecastPeriod(event.target.value)
                        }
                      >
                        <option value="24 hours">Next 24 hours</option>
                        <option value="48 hours">Next 48 hours</option>
                        <option value="7 days">Next 7 days</option>
                      </select>
                    </div>
                    <div className="forecast-list">
                      <p className="forecast-demo-caption">
                        OPEN DEMO REPORTS · SNAPSHOT, NOT RISK
                      </p>
                      {demoAreaCounts.map(({ area, count }) => (
                        <div className="forecast-row" key={area}>
                          <strong>{area}</strong>
                          <span className="forecast-demo-label">DEMO</span>
                          <span className="forecast-track" aria-hidden="true">
                            <i
                              style={{
                                width: `${(count / maxDemoAreaCount) * 100}%`,
                              }}
                            />
                          </span>
                          <span aria-label={`${count} open demo reports`}>
                            {count}
                          </span>
                        </div>
                      ))}
                      <p role="status">
                        No flood forecast for the next {forecastPeriod};
                        awaiting validated model data.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setPage("Simulation Lab")}
                      >
                        Configure a scenario <ArrowRight size={14} />
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
          {page === "Maintenance" && maintenance}
          {page === "Simulation Lab" && simulation}
          {page === "Analytics & Reports" && (
            <>
              {reportList}
              <div className="analytics-actions">
                <button className="secondary" onClick={() => window.print()}>
                  Print demo report
                </button>
                <button className="primary" onClick={exportCSV}>
                  Download CSV
                </button>
              </div>
            </>
          )}
          {page === "Infrastructure" && (
            <section className="panel empty-state">
              <Layers size={38} />
              <h2>No verified assets connected</h2>
              <p>
                Surveyed drainage segments, catchments and culverts will appear
                here after source approval and geometry validation.
              </p>
              <div className="source-card">
                <strong>Data provenance policy</strong>
                <p>
                  Real assets require source, survey date, geometry, condition,
                  and verification status. Synthetic incident points do not
                  represent drainage infrastructure.
                </p>
              </div>
            </section>
          )}
          {adminPage && (
            <section className="panel empty-state">
              <ShieldCheck size={38} />
              <h2>Local demonstration workspace</h2>
              <p>
                Authentication, organization roles, immutable audit storage and
                source approval require the Phase 2 backend. The demo operator
                is not an authenticated account.
              </p>
              <div className="source-card">
                <strong>Integration status</strong>
                <p>
                  Database: not configured · Authentication: not configured ·
                  Simulation service: not connected
                </p>
              </div>
            </section>
          )}
          <footer>
            <span>
              <Waves size={15} /> AccraFlow AI <span>·</span> Built for a more
              resilient city
            </span>
            <span>Phase 1 · Local demo</span>
          </footer>
        </main>
      </div>
      {modal && (
        <dialog
          ref={(node) => {
            if (node && !node.open) node.showModal();
          }}
          onCancel={() => setModal(false)}
          className="modal-overlay modal-dialog"
          aria-labelledby="report-heading"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(false);
          }}
        >
          <section className="modal">
            <div className="section-head">
              <div>
                <span className="eyebrow">SESSION-ONLY DEMO</span>
                <h2 id="report-heading">Submit a drainage report</h2>
              </div>
              <button
                autoFocus
                aria-label="Close report form"
                onClick={() => setModal(false)}
              >
                <X />
              </button>
            </div>
            <p className="muted">
              New reports start as Submitted and require review. Do not enter
              personal or sensitive information.
            </p>
            <form action={submit}>
              <label>
                Report title
                <input
                  name="title"
                  required
                  minLength={5}
                  maxLength={120}
                  placeholder="Describe the issue briefly"
                />
              </label>
              <div className="form-grid">
                <label>
                  Neighbourhood
                  <select name="area">
                    {Object.keys(places).map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Category
                  <select name="category">
                    {["Blockage", "Flooding", "Debris", "Damaged culvert"].map(
                      (c) => (
                        <option key={c}>{c}</option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Latitude
                  <input
                    name="latitude"
                    type="number"
                    step="any"
                    min="5.4"
                    max="5.85"
                    defaultValue="5.572"
                    required
                  />
                </label>
                <label>
                  Longitude
                  <input
                    name="longitude"
                    type="number"
                    step="any"
                    min="-0.45"
                    max="0.1"
                    defaultValue="-0.247"
                    required
                  />
                </label>
              </div>
              <label>
                Description
                <textarea
                  name="description"
                  required
                  minLength={15}
                  maxLength={2000}
                  rows={3}
                  placeholder="What did you observe?"
                />
              </label>
              {formError && (
                <p role="alert" className="orange">
                  {formError}
                </p>
              )}
              <p className="footnote muted">
                Photo uploads and persistent storage will be connected in Phase
                2.
              </p>
              <button className="primary full" type="submit">
                Submit demo report <ArrowRight size={16} />
              </button>
            </form>
          </section>
        </dialog>
      )}
    </div>
  );
}
