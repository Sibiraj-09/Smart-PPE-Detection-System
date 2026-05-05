import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Database,
  HardHat,
  Info,
  LayoutDashboard,
  List,
  Menu,
  Settings,
  LogOut,
  Video,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { absoluteVideoUrl, getStatus, getWorkers, processVideo } from "./api";
import { StatusSummary, WorkerRecord } from "./types";
import { StatusCards } from "./components/StatusCards";
import { UploadCard } from "./components/UploadCard";
import { VideoPanel } from "./components/VideoPanel";
import { WorkersTable } from "./components/WorkersTable";
  import { LEDStatusDisplay } from "./components/LEDStatusDisplay";
const initialStatus: StatusSummary = {
  totalWorkers: 0,
  safeWorkers: 0,
  unsafeWorkers: 0,
};

type SectionId = "overview" | "live" | "logs" | "violations" | "rfid" | "reports" | "settings" | "help";

type CameraConfig = {
  sourceUrl: string;
  resolution: "720p" | "1080p" | "4K";
};

type LinePositions = {
  line1: number;
  line2: number;
};

type AlertPreferences = {
  sound: boolean;
  email: boolean;
  inApp: boolean;
};

const defaultCameraConfig: CameraConfig = {
  sourceUrl: "rtsp://camera.local/stream",
  resolution: "1080p",
};

const defaultLinePositions: LinePositions = {
  line1: 120,
  line2: 260,
};

const defaultAlertPreferences: AlertPreferences = {
  sound: true,
  email: false,
  inApp: true,
};

const navItems: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "live", label: "Live Monitoring", icon: Video },
  { id: "logs", label: "Worker Entry Logs", icon: List },
  { id: "violations", label: "PPE Violations", icon: AlertTriangle },
  { id: "rfid", label: "RFID Database", icon: Database },
  { id: "reports", label: "Cognos Dashboard", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "help", label: "About / Help", icon: Info },
];

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem("smartPpeAuth") === "true");
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [status, setStatus] = useState<StatusSummary>(initialStatus);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraConfig, setCameraConfig] = useState<CameraConfig>(defaultCameraConfig);
  const [detectionSensitivity, setDetectionSensitivity] = useState("Medium");
  const [linePositions, setLinePositions] = useState<LinePositions>(defaultLinePositions);
  const [alertPreferences, setAlertPreferences] = useState<AlertPreferences>(defaultAlertPreferences);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const hasUnsafe = useMemo(() => status.unsafeWorkers > 0, [status.unsafeWorkers]);
  const unsafeWorkers = useMemo(
    () => workers.filter((worker) => worker.helmet === "No" || worker.vest === "No"),
    [workers],
  );

  function switchSection(sectionId: SectionId) {
    setActiveSection(sectionId);
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }

  function onLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (username === "sibiraj" && password === "mine123") {
      setIsAuthenticated(true);
      sessionStorage.setItem("smartPpeAuth", "true");
      setLoginError(null);
      setPassword("");
      return;
    }

    setLoginError("Invalid credentials. Use username: sibiraj and password: mine123");
  }

  function onLogout() {
    setIsAuthenticated(false);
    sessionStorage.removeItem("smartPpeAuth");
    setUsername("");
    setPassword("");
    setSidebarOpen(false);
  }

  async function refreshData() {
    const [workerRows, statusRows] = await Promise.all([getWorkers(), getStatus()]);
    const sortedWorkers = workerRows.sort((a, b) => 
      a.worker_id.localeCompare(b.worker_id, undefined, { numeric: true })
    );
    setWorkers(sortedWorkers);
    setStatus(statusRows);
  }

  async function onUpload(file: File) {
    setLoading(true);
    setError(null);

    try {
      const result = await processVideo(file);
      setVideoUrl(absoluteVideoUrl(result.videoUrl));
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected upload error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const saved = window.localStorage.getItem("smartPpeSettings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as {
          cameraConfig?: CameraConfig;
          detectionSensitivity?: string;
          linePositions?: LinePositions;
          alertPreferences?: AlertPreferences;
        };
        if (parsed.cameraConfig) {
          setCameraConfig(parsed.cameraConfig);
        }
        if (parsed.detectionSensitivity) {
          setDetectionSensitivity(parsed.detectionSensitivity);
        }
        if (parsed.linePositions) {
          setLinePositions(parsed.linePositions);
        }
        if (parsed.alertPreferences) {
          setAlertPreferences(parsed.alertPreferences);
        }
      } catch {
        // Ignore invalid stored settings
      }
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    refreshData().catch(() => {
      setError("Failed to connect to backend. Check server is running on port 5000.");
    });

    const intervalId = window.setInterval(() => {
      refreshData().catch(() => {
        // Keep UI responsive even if one poll fails.
      });
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated]);

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.localStorage.setItem(
      "smartPpeSettings",
      JSON.stringify({ cameraConfig, detectionSensitivity, linePositions, alertPreferences }),
    );
    setSettingsSaved(true);
    window.setTimeout(() => setSettingsSaved(false), 2000);
  }

  function handleLinePositionChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setLinePositions((current) => ({
      ...current,
      [name]: Number(value),
    }));
  }

  function handleAlertToggle(event: ChangeEvent<HTMLInputElement>) {
    const { name, checked } = event.target;
    setAlertPreferences((current) => ({
      ...current,
      [name]: checked,
    }));
  }

  if (!isAuthenticated) {
    return (
      <div className="login-screen min-h-screen px-4 py-6 font-display text-white sm:px-6 lg:px-10">
        <div className="login-overlay" />
        <div className="relative z-10 mx-auto flex min-h-[92vh] max-w-6xl items-center justify-center">
          <motion.form
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={onLoginSubmit}
            className="w-full max-w-md rounded-2xl border border-[#123157] bg-[#071a34]/85 p-8 shadow-neon backdrop-blur-md"
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-accent/20 p-2">
                <HardHat className="h-6 w-6 text-accent" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Smart PPE</h1>
                <p className="text-sm text-slate-300">Industrial Safety Monitoring</p>
              </div>
            </div>

            <label className="mb-2 block text-sm text-slate-200">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mb-4 w-full rounded-lg border border-slate-600 bg-[#030f22] px-3 py-2 text-white outline-none ring-accent/40 transition focus:ring"
              placeholder="Enter username"
              required
            />

            <label className="mb-2 block text-sm text-slate-200">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-5 w-full rounded-lg border border-slate-600 bg-[#030f22] px-3 py-2 text-white outline-none ring-accent/40 transition focus:ring"
              placeholder="Enter password"
              required
            />

            {loginError && <div className="mb-4 rounded-md border border-danger/70 bg-danger/15 px-3 py-2 text-sm text-danger">{loginError}</div>}

            <button type="submit" className="w-full rounded-lg bg-[#eab308] px-4 py-2.5 font-semibold text-[#0f172a] transition hover:brightness-110">
              Secure Login
            </button>
          </motion.form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#020911] via-[#05162c] to-[#0d1f3c] font-display text-white">
      <div className="flex min-h-screen">
        <aside className={`fixed left-0 top-0 z-30 flex h-full w-72 flex-col border-r border-slate-800 bg-[#071226] p-5 transition-transform duration-300 lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-lg bg-accent/20 p-2">
              <HardHat className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="text-xl font-bold">Smart PPE</p>
              <p className="text-xs text-slate-400">Safety Monitoring</p>
            </div>
          </div>

          <nav className="sidebar-nav space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  href="#"
                  key={item.id}
                  className={`nav-item ${activeSection === item.id ? "active" : ""}`}
                  data-section={item.id}
                  onClick={(e) => {
                    e.preventDefault();
                    switchSection(item.id);
                  }}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="mt-auto pt-6">
            <button
              onClick={onLogout}
              className="flex w-full items-center gap-2 rounded-xl border border-[#24354f] bg-[#06142a] px-4 py-3 text-[#ff5a1f] transition hover:bg-[#0a1a34]"
            >
              <LogOut className="h-4 w-4" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </aside>

        <div className="flex-1 lg:ml-0">
          <header className="flex items-center justify-between border-b border-slate-800 bg-[#0a1a33]/80 px-4 py-4 sm:px-6">
            <button
              className="rounded-lg border border-slate-700 p-2 text-slate-200 lg:hidden"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">Smart PPE Detection Dashboard</h1>
              <p className="text-xs text-slate-300 sm:text-sm">Industrial safety monitoring for supervisors and admins</p>
            </div>
            <div className="hidden rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300 sm:block">
              Live System
            </div>
          </header>

          <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
            {error && (
              <div className="rounded-xl border border-danger/50 bg-danger/15 px-4 py-3 text-danger">{error}</div>
            )}

            {hasUnsafe && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 rounded-xl border border-danger/70 bg-danger/15 px-4 py-3 text-danger"
              >
                <AlertOctagon className="h-5 w-5" />
                <span>Alert: Unsafe workers detected. Immediate supervisor review is recommended.</span>
              </motion.div>
            )}

            <section id="section-overview" className={`dashboard-section ${activeSection === "overview" ? "active" : ""}`}>
              <StatusCards status={status} />
              <div className="mt-6 grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-1">
                  <UploadCard onFileSelect={onUpload} loading={loading} />
                </div>
                <div className="lg:col-span-2">
                  <VideoPanel videoUrl={videoUrl} />
                </div>
              </div>
              <div className="mt-6">
                <WorkersTable workers={workers.slice(0, 10)} />
              </div>
            </section>

            <section id="section-live" className={`dashboard-section ${activeSection === "live" ? "active" : ""}`}>
              <div className="grid gap-6">
                <div>
                  <LEDStatusDisplay />
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="lg:col-span-1">
                    <UploadCard onFileSelect={onUpload} loading={loading} />
                  </div>
                  <div className="lg:col-span-2">
                    <VideoPanel videoUrl={videoUrl} />
                  </div>
                </div>
              </div>
            </section>

            <section id="section-logs" className={`dashboard-section ${activeSection === "logs" ? "active" : ""}`}>
              <WorkersTable workers={workers} />
            </section>

            <section id="section-violations" className={`dashboard-section ${activeSection === "violations" ? "active" : ""}`}>
              <div className="rounded-2xl border border-slate-700/60 bg-panelSoft p-5 shadow-neon">
                <h2 className="text-xl font-semibold text-white">PPE Violations</h2>
                <p className="mt-1 text-sm text-slate-400">Workers missing helmet or vest are shown below.</p>
                <div className="mt-4 space-y-3">
                  {unsafeWorkers.length === 0 && <p className="text-safe">No active violations found.</p>}
                  {unsafeWorkers.map((worker, idx) => (
                    <div key={`${worker.worker_id}-${idx}`} className="rounded-xl border border-danger/60 bg-danger/10 p-4">
                      <p className="font-semibold text-danger">Violation Alert</p>
                      <p className="text-slate-200">Worker: {worker.worker_id}</p>
                      <p className="text-slate-200">Helmet: {worker.helmet} | Vest: {worker.vest}</p>
                      <p className="text-slate-400">Time: {worker.time}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="section-rfid" className={`dashboard-section ${activeSection === "rfid" ? "active" : ""}`}>
              <div className="rounded-2xl border border-slate-700/60 bg-panelSoft p-5 shadow-neon">
                <h2 className="text-xl font-semibold text-white">RFID Database</h2>
                <p className="mt-2 text-slate-300">Connect RFID worker master records here for ID-to-name mapping and access control.</p>
                <div className="mt-4 rounded-lg border border-slate-700 bg-black/20 p-4 text-sm text-slate-400">
                  Placeholder: integrate RFID table from SQLite or external API.
                </div>
              </div>
            </section>

            <section id="section-reports" className={`dashboard-section ${activeSection === "reports" ? "active" : ""}`}>
              <div className="rounded-2xl border border-slate-700/60 bg-panelSoft p-5 shadow-neon">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">IBM Cognos Dashboard</h2>
                    <p className="mt-2 text-slate-300">Embedded PPE Safety dashboard from IBM Cognos Analytics.</p>
                  </div>
                  <a
                    href="https://us3.ca.analytics.ibm.com/bi/?perspective=dashboard&pathRef=.public_folders%2FShared%2BFolder%2FPPE%2BSafety%2BDashboard&action=view&mode=dashboard&subView=model0000019d9c62d8e9_00000000&nav_filter=true"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
                  >
                    Open Cognos Dashboard
                  </a>
                </div>
                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-700 bg-black/50">
                  <iframe
                    src="https://us3.ca.analytics.ibm.com/bi/?perspective=dashboard&pathRef=.public_folders%2FShared%2BFolder%2FPPE%2BSafety%2BDashboard&action=view&mode=dashboard&subView=model0000019d9c62d8e9_00000000&nav_filter=true"
                    title="IBM Cognos PPE Safety Dashboard"
                    className="h-[600px] w-full border-0"
                  />
                </div>
              </div>
            </section>

            <section id="section-settings" className={`dashboard-section ${activeSection === "settings" ? "active" : ""}`}>
              <div className="rounded-2xl border border-slate-700/60 bg-panelSoft p-6 shadow-neon">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Settings</h2>
                    <p className="mt-2 text-slate-300">Configure camera stream, detection sensitivity, line positions, and alert preferences.</p>
                  </div>
                  <div className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200">
                    Saved settings persist in browser storage
                  </div>
                </div>

                <form onSubmit={saveSettings} className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div className="space-y-6 rounded-2xl border border-slate-700 bg-[#081623]/80 p-5">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Camera configuration</h3>
                      <p className="mt-1 text-sm text-slate-400">Point the dashboard to your camera source or local stream.</p>
                    </div>
                    <div className="space-y-4">
                      <label className="block text-sm font-medium text-slate-200">Camera source URL</label>
                      <input
                        type="text"
                        value={cameraConfig.sourceUrl}
                        onChange={(e) => setCameraConfig((current) => ({ ...current, sourceUrl: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-600 bg-[#020d1f] px-4 py-3 text-white outline-none ring-accent/40 transition focus:border-accent focus:ring"
                      />

                      <label className="block text-sm font-medium text-slate-200">Resolution</label>
                      <select
                        value={cameraConfig.resolution}
                        onChange={(e) => setCameraConfig((current) => ({ ...current, resolution: e.target.value as CameraConfig["resolution"] }))}
                        className="w-full rounded-2xl border border-slate-600 bg-[#020d1f] px-4 py-3 text-white outline-none ring-accent/40 transition focus:border-accent focus:ring"
                      >
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                        <option value="4K">4K</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-6 rounded-2xl border border-slate-700 bg-[#081623]/80 p-5">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Detection and alerts</h3>
                      <p className="mt-1 text-sm text-slate-400">Tune sensitivity, line placement, and alert behavior.</p>
                    </div>
                    <div className="space-y-4">
                      <label className="block text-sm font-medium text-slate-200">Detection sensitivity</label>
                      <select
                        value={detectionSensitivity}
                        onChange={(e) => setDetectionSensitivity(e.target.value)}
                        className="w-full rounded-2xl border border-slate-600 bg-[#020d1f] px-4 py-3 text-white outline-none ring-accent/40 transition focus:border-accent focus:ring"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-slate-200">Line 1 position (LINE1_Y)</label>
                          <input
                            type="number"
                            name="line1"
                            value={linePositions.line1}
                            onChange={handleLinePositionChange}
                            className="w-full rounded-2xl border border-slate-600 bg-[#020d1f] px-4 py-3 text-white outline-none ring-accent/40 transition focus:border-accent focus:ring"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-200">Line 2 position (LINE2_Y)</label>
                          <input
                            type="number"
                            name="line2"
                            value={linePositions.line2}
                            onChange={handleLinePositionChange}
                            className="w-full rounded-2xl border border-slate-600 bg-[#020d1f] px-4 py-3 text-white outline-none ring-accent/40 transition focus:border-accent focus:ring"
                          />
                        </div>
                      </div>

                      <fieldset className="space-y-3 rounded-2xl border border-slate-700 bg-[#020d1f]/80 p-4">
                        <legend className="text-sm font-medium text-slate-200">Alert preferences</legend>
                        <label className="flex items-center gap-3 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            name="sound"
                            checked={alertPreferences.sound}
                            onChange={handleAlertToggle}
                            className="h-4 w-4 rounded border-slate-600 text-accent focus:ring-accent"
                          />
                          Sound alert
                        </label>
                        <label className="flex items-center gap-3 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            name="email"
                            checked={alertPreferences.email}
                            onChange={handleAlertToggle}
                            className="h-4 w-4 rounded border-slate-600 text-accent focus:ring-accent"
                          />
                          Email notification
                        </label>
                        <label className="flex items-center gap-3 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            name="inApp"
                            checked={alertPreferences.inApp}
                            onChange={handleAlertToggle}
                            className="h-4 w-4 rounded border-slate-600 text-accent focus:ring-accent"
                          />
                          In-app notification
                        </label>
                      </fieldset>
                    </div>
                  </div>

                  <div className="lg:col-span-2 rounded-2xl border border-slate-700 bg-[#081623]/80 p-5">
                    <h3 className="text-lg font-semibold text-white">Current settings summary</h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-700 bg-[#020d1f]/80 p-4 text-sm text-slate-300">
                        <p className="font-medium text-slate-100">Camera source</p>
                        <p>{cameraConfig.sourceUrl}</p>
                        <p className="mt-2 text-slate-400">Resolution: {cameraConfig.resolution}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-700 bg-[#020d1f]/80 p-4 text-sm text-slate-300">
                        <p className="font-medium text-slate-100">Detection sensitivity</p>
                        <p>{detectionSensitivity}</p>
                        <p className="mt-2 text-slate-400">Line1: {linePositions.line1}, Line2: {linePositions.line2}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-700 bg-[#020d1f]/80 p-4 text-sm text-slate-300 sm:col-span-2">
                        <p className="font-medium text-slate-100">Alert preferences</p>
                        <p>Sound: {alertPreferences.sound ? "On" : "Off"}, Email: {alertPreferences.email ? "On" : "Off"}, In-app: {alertPreferences.inApp ? "On" : "Off"}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-[#0f172a] transition hover:brightness-110"
                      >
                        Save settings
                      </button>
                      {settingsSaved && <span className="text-sm text-emerald-300">Settings saved locally.</span>}
                    </div>
                  </div>
                </form>
              </div>
            </section>

            <section id="section-help" className={`dashboard-section ${activeSection === "help" ? "active" : ""}`}>
              <div className="rounded-2xl border border-slate-700/60 bg-panelSoft p-6 shadow-neon">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-4 rounded-2xl border border-slate-700 bg-[#081623]/80 p-5">
                    <h2 className="text-xl font-semibold text-white">Project Info</h2>
                    <p className="text-slate-300">Smart PPE is an industrial safety monitoring dashboard designed for supervisors and admins to track worker compliance with helmet and vest PPE requirements.</p>
                    <ul className="list-disc space-y-2 pl-5 text-slate-300">
                      <li>Video-based PPE detection with helmet/vest compliance alerts.</li>
                      <li>RFID worker integration and entry log review.</li>
                      <li>Configurable detection sensitivity and line zone settings.</li>
                    </ul>
                  </div>
                  <div className="space-y-4 rounded-2xl border border-slate-700 bg-[#081623]/80 p-5">
                    <h2 className="text-xl font-semibold text-white">Instructions</h2>
                    <ol className="list-decimal space-y-2 pl-5 text-slate-300">
                      <li>Use the sidebar to access live monitoring, logs, violations, and settings.</li>
                      <li>Upload a CCTV video to start PPE detection and review alerts.</li>
                      <li>Tune sensitivity and line positions in Settings for your camera view.</li>
                      <li>Review unsafe worker alerts and export or annotate results as needed.</li>
                    </ol>
                  </div>
                </div>
                <div className="mt-6 rounded-2xl border border-slate-700 bg-[#081623]/80 p-5">
                  <h2 className="text-xl font-semibold text-white">Team details</h2>
                  <p className="mt-2 text-slate-300">Prepared for presentation with core contributors and system roles.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-700 bg-black/20 p-4">
                      <p className="font-semibold text-white">SIBIRAJ S</p>
                      <p className="text-sm text-slate-400">Project lead,Model training, data labeling, and video analysis.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-700 bg-black/20 p-4">
                      <p className="font-semibold text-white">VIJAYA PARAKAVAN KC</p>
                      <p className="text-sm text-slate-400"> Presentation design,dashboard and backend integration.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-700 bg-black/20 p-4">
                      <p className="font-semibold text-white">MATHAN S</p>
                      <p className="text-sm text-slate-400">RFID integration, hardware communication,and alerts.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-700 bg-black/20 p-4">
                      <p className="font-semibold text-white">MITHUN SARAVANAN</p>
                      <p className="text-sm text-slate-400">hardware communication and system demonstration.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
