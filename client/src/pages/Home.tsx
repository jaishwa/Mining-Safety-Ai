import { useEffect, useMemo, useState } from "react";
import { clientSimulation, type SimulationAction } from "@/lib/clientSimulation";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Camera,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  CloudFog,
  Crosshair,
  Database,
  Droplets,
  Eye,
  Gauge,
  HardHat,
  Layers3,
  MapPinned,
  Menu,
  Navigation,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Thermometer,
  Truck,
  Users,
  Volume2,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

type View = "dashboard" | "live" | "risk" | "map" | "near-misses" | "vehicles" | "analytics" | "settings";

const navItems: { id: View; label: string; icon: typeof Activity }[] = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "live", label: "Live Monitoring", icon: Camera },
  { id: "risk", label: "Risk Analysis", icon: ShieldAlert },
  { id: "map", label: "Safety Map", icon: MapPinned },
  { id: "near-misses", label: "Near Misses", icon: AlertTriangle },
  { id: "vehicles", label: "Vehicles", icon: Truck },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

const riskClass = (level: string) => `risk-${level.toLowerCase()}`;
const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const formatAgo = (timestamp: number) => {
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`;
};

function RiskPill({ level, score }: { level: string; score?: number }) {
  return <span className={`risk-pill ${riskClass(level)}`}><span className="risk-dot" />{level}{score !== undefined ? ` ${score}` : ""}</span>;
}

function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return <div className="section-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>{action}</div>;
}

function KpiCard({ label, value, suffix, detail, icon: Icon, tone = "neutral" }: { label: string; value: string | number; suffix?: string; detail: string; icon: typeof Activity; tone?: string }) {
  return <div className={`kpi-card ${tone}`}><div className="kpi-top"><span>{label}</span><Icon size={16} /></div><div className="kpi-value">{value}<small>{suffix}</small></div><div className="kpi-detail">{detail}</div></div>;
}

function StatusChip({ label, active = true, inverse = false }: { label: string; active?: boolean; inverse?: boolean }) {
  return <span className={`status-chip ${active ? "active" : ""} ${inverse ? "inverse" : ""}`}><span className="status-dot" />{label}</span>;
}

function RiskSparkline({ trend }: { trend: { label: string; risk: number; visibility: number }[] }) {
  const points = trend.map((item, index) => `${(index / (trend.length - 1)) * 100},${100 - item.risk}`).join(" ");
  const visibilityPoints = trend.map((item, index) => `${(index / (trend.length - 1)) * 100},${100 - item.visibility}`).join(" ");
  return <div className="sparkline-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="sparkline"><polyline points={visibilityPoints} className="sparkline-visibility" /><polyline points={points} className="sparkline-risk" /></svg><div className="sparkline-labels"><span>−18 min</span><span>NOW</span></div></div>;
}

function SafetyMap({ data, compact = false }: { data: Snapshot; compact?: boolean }) {
  return <div className={`safety-map ${compact ? "compact" : ""}`}>
    <div className="map-toolbar"><span><Layers3 size={14} /> SITE GRID / NORTH SECTOR</span><span className="map-coordinates">48° 12' 16.4" N · 106° 38' 04.9" W</span></div>
    <div className="map-grid"><div className="road road-a" /><div className="road road-b" /><div className="road road-c" /><div className="restricted restricted-a">RESTRICTED</div><div className="restricted restricted-b">NO ENTRY</div>
      {data.heatmap.map((hotspot) => <div key={hotspot.zone} className="heatspot" style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%`, opacity: 0.24 + hotspot.intensity / 140 }}><span>{hotspot.events}</span></div>)}
      {data.vehicles.map((vehicle) => <div key={vehicle.id} className="map-vehicle" style={{ left: `${vehicle.x}%`, top: `${vehicle.y}%` }}><div className={`map-zone ${riskClass(vehicle.risk)}`} style={{ width: `${vehicle.zoneSize * 2.6}px`, height: `${vehicle.zoneSize * 1.7}px` }} /><div className="map-vehicle-marker"><Truck size={compact ? 12 : 15} /></div><span>{vehicle.name}</span></div>)}
      {data.objects.map((object) => <div key={object.id} className={`map-object ${riskClass(object.risk)}`} style={{ left: `${object.x}%`, top: `${object.y}%` }}><span className="map-object-ping" /><span>{object.label}</span></div>)}
      <div className="map-north">N<Navigation size={12} /></div><div className="map-scale">0 ─── 50 ─── 100 m</div>
    </div>
    {!compact && <div className="map-legend"><span><i className="legend-dot vehicle" /> Vehicles</span><span><i className="legend-dot person" /> Personnel</span><span><i className="legend-dot hotspot" /> Risk hotspot</span><span><i className="legend-dot restricted" /> Restricted</span></div>}
  </div>;
}

/* ─── REALISTIC THERMAL CAMERA FEED ──────────────────────────────────────────
   Single source of truth:
   object.x and object.y from the simulation state directly position BOTH the
   visible thermal heat signature AND its surrounding YOLO bounding box.
   No plain white rectangles. True thermal/infrared visualization.
──────────────────────────────────────────────────────────────────────────── */

function LiveFeed({ data }: { data: Snapshot }) {
  const primary = data.highestRisk;
  const phase = data.simulation.phase;
  const visibility = data.environment.visibility;

  return (
    <div className="feed-shell">
      {/* Top bar with authentic thermal camera telemetry */}
      <div className="feed-topbar">
        <span>
          <span className="rec-dot" />
          THERMAL CAMERA / CAM-04 · NORTH HAUL ROAD · SIMULATED THERMAL FEED
        </span>
        <span>
          FRAME {String(phase).padStart(3, "0")} · 1920×1080 · 30 FPS · FOV 92°
        </span>
      </div>

      {/* Realistic Thermal Camera Viewport */}
      <div className="feed-scene">
        {/* Dynamic atmospheric dust layer reacting to simulation visibility */}
        <div
          className="feed-dust-layer"
          style={{
            opacity: Math.max(0.12, ((100 - visibility) / 100) * 0.75),
          }}
        />

        {/* Authentic FLIR thermal sensor scanlines and vignette */}
        <div className="feed-scanlines" />
        <div className="feed-vignette" />

        {/* Camera targeting reticle / crosshair */}
        <div className="feed-crosshair">
          <Crosshair size={32} />
        </div>

        {/* Dynamic Safety Zone Corridor projected down the haul road */}
        <svg
          className="feed-safety-zone"
          viewBox="0 0 800 450"
          preserveAspectRatio="none"
        >
          <polygon
            points="280,450 365,245 435,245 520,450"
            fill="rgba(34, 197, 94, 0.04)"
            stroke={
              primary?.risk === "CRITICAL"
                ? "rgba(239, 68, 68, 0.65)"
                : primary?.risk === "HIGH"
                ? "rgba(249, 115, 22, 0.55)"
                : "rgba(34, 197, 94, 0.35)"
            }
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />
        </svg>

        {/* Critical Warning Banner when TTC is imminent (< 3.0s) */}
        {primary?.ttc && primary.ttc < 3.0 && (
          <div className="critical-warning-banner">
            <AlertOctagon size={14} />
            <span>
              CRITICAL COLLISION RISK · TTC {primary.ttc.toFixed(1)}s · BRAKING ENGAGED
            </span>
          </div>
        )}

        {/* ── TRACKED OBJECTS: THERMAL SIGNATURES + YOLO BOUNDING BOXES ── */}
        {/* Strictly bound to the single source of truth: object.x% and object.y% */}
        {data.objects.map((object) => {
          const isPerson = object.id === "person-07";
          const isTruck = object.id === "truck-02";
          const isObstacle = object.id === "obstacle-01";
          const riskKey = object.risk.toLowerCase();

          return (
            <div
              key={object.id}
              className="thermal-object-anchor"
              style={{ left: `${object.x}%`, top: `${object.y}%` }}
            >
              {/* 1. VISIBLE THERMAL HEAT SIGNATURE */}
              {isPerson && (
                <>
                  <div className={`thermal-heat-aura aura-${riskKey}`} />
                  <img
                    src="/thermal_worker.jpg"
                    alt="Thermal human silhouette PERSON #07"
                    className="thermal-sprite worker-sprite"
                  />
                </>
              )}

              {isTruck && (
                <img
                  src="/thermal_truck.jpg"
                  alt="Thermal mining haul truck TRUCK #02"
                  className="thermal-sprite truck-sprite"
                />
              )}

              {isObstacle && (
                <img
                  src="/thermal_obstacle.jpg"
                  alt="Thermal road obstacle OBSTACLE #01"
                  className="thermal-sprite obstacle-sprite"
                />
              )}

              {/* 2. YOLO BOUNDING BOX (NO solid background, 100% transparent!) */}
              <div
                className={`yolo-box yolo-${riskKey} ${
                  isPerson ? "worker-box" : isTruck ? "truck-box" : "obstacle-box"
                }`}
              >
                {/* Header Badge: Track ID + Confidence */}
                <div className="yolo-label">
                  <span>{object.label}</span>
                  <span>{Math.round(object.confidence * 100)}%</span>
                </div>

                {/* Telemetry Tag: Distance, Speed, TTC, Intent */}
                <div className="yolo-telemetry">
                  <div>
                    <b>{object.distance}m</b> ·{" "}
                    <b>
                      {object.relativeSpeed > 0 ? "+" : ""}
                      {object.relativeSpeed} km/h
                    </b>
                    {object.ttc !== null && (
                      <>
                        {" "}
                        · <b>{object.ttc.toFixed(1)}s TTC</b>
                      </>
                    )}
                  </div>
                  <div>
                    {isPerson && object.intent}
                    {isTruck && "MOVING AWAY · HAUL TRUCK"}
                    {isObstacle && object.sensorStatus}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Top-Left OSD: AI Architecture */}
        <div className="feed-hud-top-left">
          <span>AI MODEL: YOLO + TRACKING</span>
          <strong>
            MODE: SIMULATION · {data.objects.length} OBJECTS DETECTED
          </strong>
        </div>

        {/* Top-Right OSD: Target Telemetry & TTC */}
        <div className="feed-hud-top-right">
          <span>NEAREST HAZARD: {primary?.label ?? "NONE"}</span>
          {primary?.ttc ? (
            <div className="ttc-active">TTC: {primary.ttc.toFixed(1)}s</div>
          ) : (
            <div>CLOSING: NONE</div>
          )}
          <span>DYNAMIC BUBBLE: {data.vehicles[0]?.zoneSize}m</span>
        </div>

        {/* Bottom-Right OSD: Thermal Palette Scale */}
        <div className="feed-hud-bottom-right">
          <span>COLD</span>
          <div className="thermal-legend-bar" />
          <span>HOT</span>
          <span>{data.environment.temperature}°C</span>
        </div>
      </div>

      {/* Footer bar */}
      <div className="feed-footer">
        <span>
          <span className="live-dot" /> SIMULATED THERMAL FEED
        </span>
        <span>1920 × 1080</span>
        <span>30 FPS</span>
        <span>FUSED: THERMAL + RADAR</span>
        <span>AI: YOLO+TRACKING</span>
      </div>
    </div>
  );
}

function AlertList({ data, onAcknowledge }: { data: Snapshot; onAcknowledge: (id: string) => void }) {
  return <div className="alert-list">{data.alerts.slice(0, 4).map(alert => <div key={alert.id} className={`alert-row ${alert.acknowledged ? "acknowledged" : ""}`}><div className={`alert-icon ${riskClass(alert.level)}`}>{alert.level === "CRITICAL" ? <AlertOctagon size={15} /> : <Bell size={15} />}</div><div className="alert-copy"><div className="alert-row-top"><b>{alert.title}</b><span>{formatAgo(alert.timestamp)}</span></div><p>{alert.message}</p><div className="alert-row-bottom"><RiskPill level={alert.level} /><span>{alert.id}</span>{!alert.acknowledged && <button className="text-button" onClick={() => onAcknowledge(alert.id)}><Check size={12} /> ACK</button>}</div></div></div>)}</div>;
}

function ObjectTable({ data }: { data: Snapshot }) {
  return <div className="table-wrap"><table><thead><tr><th>TRACK ID</th><th>TYPE</th><th>DISTANCE</th><th>REL. SPEED</th><th>INTENT</th><th>CONF.</th><th>RISK</th></tr></thead><tbody>{data.objects.map(object => <tr key={object.id}><td className="mono strong">{object.label}</td><td><span className="object-type">{object.kind === "PERSON" ? <HardHat size={12} /> : object.kind === "VEHICLE" ? <Truck size={12} /> : <Target size={12} />}{object.kind}</span></td><td className="mono">{object.distance} m</td><td className="mono">{object.relativeSpeed > 0 ? "+" : ""}{object.relativeSpeed} km/h</td><td><span className="intent-text">{object.intent}</span></td><td className="mono">{Math.round(object.confidence * 100)}%</td><td><RiskPill level={object.risk} score={object.riskScore} /></td></tr>)}</tbody></table></div>;
}

function Dashboard({ data, setView, onAcknowledge }: { data: Snapshot; setView: (view: View) => void; onAcknowledge: (id: string) => void }) {
  const primary = data.highestRisk;
  return <div className="page-stack"><div className="page-heading"><div><div className="eyebrow">CONTROL ROOM / LIVE OPERATIONS</div><h1>Predictive collision prevention</h1><p>Visibility-aware safety intelligence for active mining corridors.</p></div><div className="heading-actions"><StatusChip label="SYSTEM OPERATIONAL" /><span className="last-update"><Clock3 size={13} /> {formatTime(data.system.lastUpdate)}</span></div></div>
    <div className="kpi-grid"><KpiCard label="CURRENT RISK" value={primary?.riskScore ?? 0} suffix="/100" detail={`${primary?.label ?? "—"} · ${primary?.distance ?? "—"} m nearest`} icon={ShieldAlert} tone="risk" /><KpiCard label="VISIBILITY" value={data.environment.visibility} suffix="%" detail={`${data.environment.band} · ${data.environment.weather}`} icon={CloudFog} tone="visibility" /><KpiCard label="AVG TTC" value={data.analytics.averageTtc} suffix="s" detail="Across tracked objects" icon={Gauge} /><KpiCard label="SAFETY SCORE" value={data.analytics.safetyScore} suffix="/100" detail="TRUCK-001 session score" icon={ShieldCheck} /></div>
    <div className="control-strip"><div className="scenario-copy"><span className="scenario-label"><Zap size={13} /> ACTIVE DEMO SCENARIO</span><b>Truck / worker path intersection</b><span>Dust visibility decline → predictive braking → near-miss capture</span></div><div className="scenario-progress"><div className="progress-label"><span>SIMULATION PROGRESS</span><b>{Math.min(100, Math.round((data.simulation.phase / 27) * 100))}%</b></div><div className="progress-track"><span style={{ width: `${Math.min(100, Math.round((data.simulation.phase / 27) * 100))}%` }} /></div></div><div className="simulation-actions"><button className="icon-button" onClick={() => setView("live")} aria-label="Open live monitoring"><Eye size={16} /></button><span className="mode-label"><span className="live-dot" /> {data.system.mode}</span></div></div>
    <div className="dashboard-grid"><div className="panel span-7"><SectionTitle eyebrow="SENSOR FUSION / THERMAL + CAMERA + RADAR + LIDAR" title="Live thermal corridor view" action={<button className="link-button" onClick={() => setView("live")}>Open live <ChevronRight size={14} /></button>} /><LiveFeed data={data} /></div><div className="panel span-5"><SectionTitle eyebrow="PRIORITIZED ALERTS" title="Operator attention" action={<button className="link-button" onClick={() => setView("risk")}>View all <ChevronRight size={14} /></button>} /><AlertList data={data} onAcknowledge={onAcknowledge} /></div><div className="panel span-7"><SectionTitle eyebrow="DYNAMIC SAFETY BUBBLES" title="Site risk map" action={<button className="link-button" onClick={() => setView("map")}>Full map <ChevronRight size={14} /></button>} /><SafetyMap data={data} compact /></div><div className="panel span-5"><SectionTitle eyebrow="COLLISION PREDICTION" title="Risk / visibility trend" action={<div className="chart-legend"><span><i className="line-swatch risk" /> Risk</span><span><i className="line-swatch visibility" /> Visibility</span></div>} /><RiskSparkline trend={data.riskTrend} /><div className="chart-callout"><div><span>PEAK RISK</span><b>{Math.max(...data.riskTrend.map(item => item.risk))}/100</b></div><div><span>LOWEST VISIBILITY</span><b>{Math.min(...data.riskTrend.map(item => item.visibility))}%</b></div></div></div></div>
    <div className="panel"><SectionTitle eyebrow="OBJECT TRACKING / LAST FRAME" title={`${data.objects.length} objects in scene`} action={<button className="link-button" onClick={() => setView("live")}>Tracking details <ChevronRight size={14} /></button>} /><ObjectTable data={data} /></div>
  </div>;
}

function LivePage({ data }: { data: Snapshot }) {
  return <div className="page-stack"><div className="page-heading"><div><div className="eyebrow">LIVE MONITORING / THERMAL CAM-04</div><h1>Detection and tracking</h1><p>Thermal infrared detection, bounding boxes, dynamic safety zones, fused sensor confidence, and operator actions.</p></div><div className="heading-actions"><StatusChip label="THERMAL FEED" /><StatusChip label="FUSED SENSORS" /><span className="yolo-chip"><span>AI MODEL</span><strong>YOLO+TRACKING</strong><span>SIMULATION</span></span></div></div><div className="live-layout"><div className="panel live-main"><SectionTitle eyebrow="THERMAL CAMERA FEED / SIMULATED · INFRARED DETECTION · NORTH HAUL ROAD" title="North haul road — thermal view" action={<span className="mono subtle">1920 × 1080 · 30 FPS</span>} /><LiveFeed data={data} /></div><div className="panel telemetry-panel"><SectionTitle eyebrow="PRIMARY TRACK" title={data.highestRisk?.label ?? "—"} /><div className={`primary-risk-card ${riskClass(data.highestRisk?.risk ?? "LOW")}`}><span>CURRENT RISK</span><strong>{data.highestRisk?.riskScore ?? 0}<small>/100</small></strong><RiskPill level={data.highestRisk?.risk ?? "LOW"} /></div><div className="telemetry-list"><div><span>Distance</span><b>{data.highestRisk?.distance ?? "—"} m</b></div><div><span>Relative speed</span><b>{data.highestRisk?.relativeSpeed ?? "—"} km/h</b></div><div><span>Time-to-collision</span><b>{data.highestRisk?.ttc ? `${data.highestRisk.ttc.toFixed(1)} s` : "—"}</b></div><div><span>Worker intent</span><b>{data.highestRisk?.intent ?? "—"}</b></div><div><span>Confidence</span><b>{Math.round((data.highestRisk?.confidence ?? 0) * 100)}%</b></div><div><span>Sensor state</span><b>{data.highestRisk?.sensorStatus ?? "—"}</b></div></div><div className="uncertainty-note"><AlertTriangle size={14} /><span>Low-confidence detections expand risk weighting inside the critical safety region.</span></div></div></div><div className="panel"><SectionTitle eyebrow="TRACKED OBJECTS" title="Object registry" action={<span className="mono subtle">AUTO-REFRESH 1s</span>} /><ObjectTable data={data} /></div></div>;
}

function RiskPage({ data, onAcknowledge }: { data: Snapshot; onAcknowledge: (id: string) => void }) {
  return <div className="page-stack"><div className="page-heading"><div><div className="eyebrow">RISK ANALYSIS / PREDICTIVE ENGINE</div><h1>Why the system is warning</h1><p>Risk is not distance alone. The engine fuses speed, TTC, visibility, intent, confidence, and zone violation.</p></div><div className="heading-actions"><span className="formula-chip">TTC = distance ÷ relative speed</span></div></div><div className="risk-analysis-grid"><div className="panel risk-hero"><div className="risk-hero-top"><div><div className="eyebrow">HIGHEST PRIORITY / {data.highestRisk?.label}</div><h2>{data.highestRisk?.risk === "CRITICAL" ? "Critical collision risk" : `${data.highestRisk?.risk ?? "LOW"} collision risk`}</h2><p>Worker path intersection predicted under {data.environment.band.toLowerCase()} visibility.</p></div><div className={`score-ring ${riskClass(data.highestRisk?.risk ?? "LOW")}`}><b>{data.highestRisk?.riskScore ?? 0}</b><span>/100</span></div></div><div className="factor-grid"><div><span>TTC</span><b>{data.highestRisk?.ttc ? `${data.highestRisk.ttc.toFixed(1)} s` : "NO CLOSING"}</b><small>time-to-collision</small></div><div><span>VISIBILITY</span><b>{data.environment.visibility}%</b><small>{data.environment.band}</small></div><div><span>ZONE STATUS</span><b>{data.highestRisk?.zoneViolation ? "VIOLATED" : "CLEAR"}</b><small>dynamic bubble</small></div><div><span>CONFIDENCE</span><b>{Math.round((data.highestRisk?.confidence ?? 0) * 100)}%</b><small>{data.highestRisk?.sensorStatus}</small></div></div><div className="reason-banner"><ShieldAlert size={16} /><div><b>Recommended operator response</b><span>Reduce speed and hold position until PERSON #07 clears the forward safety zone.</span></div></div></div><div className="panel"><SectionTitle eyebrow="VISIBILITY-AWARE LOGIC" title="Adaptive safety bubble" /><div className="bubble-diagram"><div className="bubble-ring rear" /><div className="bubble-ring lateral" /><div className="bubble-ring forward" /><div className="bubble-truck"><Truck size={24} /></div><div className="bubble-object"><HardHat size={15} /><span>PERSON #07</span></div><span className="bubble-label forward-label">{data.vehicles[0]?.zoneSize}m FORWARD</span><span className="bubble-label lateral-label">LATERAL</span></div><div className="bubble-stats"><span><b>+{Math.round((100 - data.environment.visibility) * 0.18)}%</b> visibility margin</span><span><b>{data.vehicles[0]?.zoneSize}m</b> forward zone</span><span><b>{data.vehicles[0]?.speed} km/h</b> vehicle speed</span></div></div></div><div className="risk-bottom-grid"><div className="panel"><SectionTitle eyebrow="ALERT ESCALATION" title="Deduplicated alert queue" /><AlertList data={data} onAcknowledge={onAcknowledge} /></div><div className="panel"><SectionTitle eyebrow="MODEL HEALTH" title="Uncertainty handling" /><div className="model-health"><div className="health-line"><span>Detection confidence</span><b>{Math.round((data.highestRisk?.confidence ?? 0) * 100)}%</b><i><em style={{ width: `${(data.highestRisk?.confidence ?? 0) * 100}%` }} /></i></div><div className="health-line"><span>Sensor agreement</span><b>{data.highestRisk?.sensorStatus.includes("DISAGREEMENT") ? "2 / 3" : "3 / 3"}</b><i><em style={{ width: data.highestRisk?.sensorStatus.includes("DISAGREEMENT") ? "66%" : "100%" }} /></i></div><div className="health-line"><span>Tracking continuity</span><b>98.4%</b><i><em style={{ width: "98.4%" }} /></i></div><div className="model-note"><Database size={14} /><span>YOLO+Tracking architecture (simulation mode). Accepts Thermal Camera, RGB Camera, LiDAR, Radar, GPS, and vehicle telemetry inputs.</span></div></div></div></div></div>;
}

function MapPage({ data }: { data: Snapshot }) {
  const [riskOnly, setRiskOnly] = useState(false);
  return <div className="page-stack"><div className="page-heading"><div><div className="eyebrow">SITE INTELLIGENCE / 2D OPERATIONS MAP</div><h1>Safety map</h1><p>Dynamic safety bubbles, vehicle positions, personnel, restricted zones, and collision hotspots.</p></div><div className="heading-actions"><button className={`filter-button ${riskOnly ? "selected" : ""}`} onClick={() => setRiskOnly(!riskOnly)}><SlidersHorizontal size={14} /> {riskOnly ? "Risk filter on" : "All activity"}</button></div></div><div className="panel map-page-panel"><SafetyMap data={{ ...data, vehicles: riskOnly ? data.vehicles.filter(vehicle => vehicle.risk === "HIGH" || vehicle.risk === "CRITICAL") : data.vehicles, objects: riskOnly ? data.objects.filter(object => object.risk !== "LOW") : data.objects }} /><div className="map-detail-grid">{data.heatmap.map(hotspot => <div className="map-detail-card" key={hotspot.zone}><span className="map-detail-index">0{data.heatmap.indexOf(hotspot) + 1}</span><div><b>{hotspot.zone}</b><span>{hotspot.events} safety events · {hotspot.intensity}% intensity</span></div><ArrowUpRight size={15} /></div>)}</div></div></div>;
}

function NearMissPage({ data }: { data: Snapshot }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<(typeof data.events)[number] | null>(null);
  const [sortNewest, setSortNewest] = useState(true);
  const filtered = useMemo(() => data.events.filter(event => `${event.id} ${event.vehicle} ${event.object} ${event.zone} ${event.eventType}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sortNewest ? b.timestamp - a.timestamp : a.timestamp - b.timestamp), [data.events, query, sortNewest]);
  return <div className="page-stack"><div className="page-heading"><div><div className="eyebrow">EVENT LOG / PREDICTIVE SAFETY</div><h1>Near-miss monitoring</h1><p>Review situations where predictive intervention prevented a collision or surfaced uncertainty.</p></div><div className="heading-actions"><span className="count-badge">{data.events.length} EVENTS</span></div></div><div className="panel"><div className="table-toolbar"><div className="search-input"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search event, vehicle, object, zone" /></div><button className="filter-button" onClick={() => setSortNewest(!sortNewest)}><Clock3 size={14} /> {sortNewest ? "Newest first" : "Oldest first"}</button></div><div className="table-wrap"><table className="events-table"><thead><tr><th>EVENT ID</th><th>TIME</th><th>VEHICLE</th><th>OBJECT</th><th>DIST.</th><th>TTC</th><th>SPEED</th><th>VIS.</th><th>RISK</th><th>ZONE</th><th /></tr></thead><tbody>{filtered.map(event => <tr key={event.id} onClick={() => setSelected(event)}><td className="mono strong">{event.id}</td><td className="mono">{formatTime(event.timestamp)}</td><td>{event.vehicle}</td><td>{event.object}</td><td className="mono">{event.distance}m</td><td className="mono">{event.ttc ? `${event.ttc.toFixed(1)}s` : "—"}</td><td className="mono">{event.speed} km/h</td><td className="mono">{event.visibility}%</td><td><RiskPill level={event.riskScore >= 75 ? "CRITICAL" : event.riskScore >= 50 ? "HIGH" : "MEDIUM"} score={event.riskScore} /></td><td>{event.zone}</td><td><ChevronRight size={15} /></td></tr>)}</tbody></table></div></div>{selected && <div className="drawer-backdrop" onClick={() => setSelected(null)}><div className="event-drawer" onClick={event => event.stopPropagation()}><div className="drawer-head"><div><div className="eyebrow">EVENT DETAIL / {selected.id}</div><h2>{selected.eventType}</h2></div><button className="icon-button" onClick={() => setSelected(null)}><X size={16} /></button></div><div className="drawer-score"><span>RISK SCORE</span><b>{selected.riskScore}<small>/100</small></b><RiskPill level={selected.riskScore >= 75 ? "CRITICAL" : selected.riskScore >= 50 ? "HIGH" : "MEDIUM"} /></div><div className="drawer-facts"><div><span>Timestamp</span><b>{new Date(selected.timestamp).toLocaleString()}</b></div><div><span>Vehicle</span><b>{selected.vehicle}</b></div><div><span>Object</span><b>{selected.object}</b></div><div><span>Distance / TTC</span><b>{selected.distance}m / {selected.ttc ? `${selected.ttc.toFixed(1)}s` : "—"}</b></div><div><span>Environment</span><b>{selected.visibility}% visibility</b></div><div><span>Operating zone</span><b>{selected.zone}</b></div></div><div className="drawer-detail"><ShieldCheck size={17} /><p>{selected.detail}</p></div></div></div>}</div>;
}

function VehiclesPage({ data }: { data: Snapshot }) {
  const [selectedVehicle, setSelectedVehicle] = useState(data.vehicles[0]?.id ?? "");
  const vehicle = data.vehicles.find(item => item.id === selectedVehicle) ?? data.vehicles[0];
  return <div className="page-stack"><div className="page-heading"><div><div className="eyebrow">FLEET CONTROL / TELEMETRY</div><h1>Vehicle management</h1><p>Fleet status, dynamic safety zones, operational risk, and session score.</p></div><div className="heading-actions"><StatusChip label={`${data.vehicles.filter(vehicle => vehicle.status === "ACTIVE").length} ACTIVE`} /></div></div><div className="vehicles-layout"><div className="panel"><SectionTitle eyebrow="REGISTERED FLEET" title="Vehicles" /><div className="vehicle-list">{data.vehicles.map(item => <button key={item.id} className={`vehicle-row ${selectedVehicle === item.id ? "selected" : ""}`} onClick={() => setSelectedVehicle(item.id)}><span className="vehicle-row-icon"><Truck size={18} /></span><span className="vehicle-row-copy"><b>{item.name}</b><small>{item.type} · {item.zone}</small></span><span className="vehicle-row-speed"><b>{item.speed}</b><small>km/h</small></span><RiskPill level={item.risk} /></button>)}</div></div><div className="panel vehicle-detail"><SectionTitle eyebrow="VEHICLE PROFILE" title={vehicle?.name ?? "—"} action={<StatusChip label={vehicle?.status ?? "—"} />} /><div className="vehicle-profile-head"><div className="vehicle-large-icon"><Truck size={34} /></div><div><span>{vehicle?.type}</span><b>{vehicle?.zone}</b><small><Navigation size={12} /> {vehicle?.direction} heading</small></div></div><div className="vehicle-metrics"><div><span>Speed</span><b>{vehicle?.speed} <small>km/h</small></b></div><div><span>Risk</span><b>{vehicle?.risk}</b></div><div><span>Safety score</span><b>{vehicle?.safetyScore}<small>/100</small></b></div><div><span>Safety zone</span><b>{vehicle?.zoneSize}<small>m forward</small></b></div></div><div className="vehicle-section"><div className="eyebrow">RISK HISTORY / LAST 6 WINDOWS</div><RiskSparkline trend={data.riskTrend} /></div><div className="vehicle-section"><div className="eyebrow">OPERATOR NOTES</div><p className="muted-paragraph">Vehicle is integrated with thermal camera, RGB camera, radar, GPS, and telemetry feeds. Poor-visibility operation automatically expands the forward safety bubble.</p></div></div></div></div>;
}

function AnalyticsPage({ data }: { data: Snapshot }) {
  const maxRisk = Math.max(...data.riskTrend.map(item => item.risk));
  return <div className="page-stack"><div className="page-heading"><div><div className="eyebrow">HISTORICAL SAFETY / SESSION ANALYTICS</div><h1>Operational analytics</h1><p>Safety intelligence across detections, warnings, near misses, and environment.</p></div><div className="heading-actions"><button className="filter-button"><RefreshCw size={14} /> Last 24 hours</button></div></div><div className="kpi-grid analytics-kpis"><KpiCard label="TOTAL DETECTIONS" value={data.analytics.totalDetections.toLocaleString()} detail="All fused sensor frames" icon={Crosshair} /><KpiCard label="TOTAL WARNINGS" value={data.analytics.totalWarnings} detail="Deduplicated alerts" icon={Bell} /><KpiCard label="CRITICAL EVENTS" value={data.analytics.criticalEvents} detail="Risk score ≥ 75" icon={AlertOctagon} tone="risk" /><KpiCard label="NEAR MISSES" value={data.analytics.nearMisses} detail="Collision avoided" icon={ShieldCheck} /></div><div className="analytics-grid"><div className="panel span-7"><SectionTitle eyebrow="RISK OVER TIME" title="Risk / visibility correlation" action={<div className="chart-legend"><span><i className="line-swatch risk" /> Risk</span><span><i className="line-swatch visibility" /> Visibility</span></div>} /><div className="bar-chart"><div className="y-axis"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div className="bars">{data.riskTrend.map(item => <div className="bar-group" key={item.label}><div className="bar risk-bar" style={{ height: `${item.risk}%` }} title={`Risk ${item.risk}`} /><div className="bar visibility-bar" style={{ height: `${item.visibility}%` }} title={`Visibility ${item.visibility}%`} /><small>{item.label}</small></div>)}</div></div></div><div className="panel span-5"><SectionTitle eyebrow="EVENT DISTRIBUTION" title="Near misses by zone" /><div className="zone-bars">{data.heatmap.map(zone => <div key={zone.zone} className="zone-bar-row"><div><span>{zone.zone}</span><b>{zone.events}</b></div><i><em style={{ width: `${(zone.events / Math.max(...data.heatmap.map(item => item.events))) * 100}%` }} /></i></div>)}</div><div className="analytic-callout"><span>AVERAGE VISIBILITY</span><b>{data.analytics.averageVisibility}%</b><small>Dust conditions present in 38% of session</small></div></div><div className="panel span-4"><SectionTitle eyebrow="ENVIRONMENT" title="Context intelligence" /><div className="environment-list"><div><Thermometer size={16} /><span>Temperature</span><b>{data.environment.temperature}°C</b></div><div><Droplets size={16} /><span>Humidity</span><b>{data.environment.humidity}%</b></div><div><Wind size={16} /><span>Wind</span><b>{data.environment.wind} km/h</b></div><div><CloudFog size={16} /><span>Dust status</span><b>{data.environment.status}</b></div></div></div><div className="panel span-4"><SectionTitle eyebrow="FLEET PERFORMANCE" title="Average metrics" /><div className="metric-list"><div><span>Average TTC</span><b>{data.analytics.averageTtc}s</b></div><div><span>Average vehicle speed</span><b>{data.analytics.averageSpeed} km/h</b></div><div><span>Emergency braking</span><b>{data.analytics.emergencyBraking}</b></div><div><span>Blind-zone events</span><b>{data.analytics.blindZoneEvents}</b></div><div><span>Speed violations</span><b>{data.analytics.speedViolations}</b></div></div></div><div className="panel span-4"><SectionTitle eyebrow="SAFETY SCORE" title="Session health" /><div className="score-block"><div className="score-block-number">{data.analytics.safetyScore}<small>/100</small></div><div className="score-block-track"><i style={{ width: `${data.analytics.safetyScore}%` }} /></div><p>Calculated from average risk, near misses, speed violations, emergency braking, blind-zone events, and poor-visibility operation.</p></div></div></div></div>;
}

function SettingsPage({ data, onControl }: { data: Snapshot; onControl: (action: "start" | "pause" | "reset" | "step") => void }) {
  return <div className="page-stack"><div className="page-heading"><div><div className="eyebrow">SYSTEM CONFIGURATION / PROTOTYPE</div><h1>Settings & integrations</h1><p>Operational controls and integration readiness for future hardware and external services.</p></div></div><div className="settings-grid"><div className="panel"><SectionTitle eyebrow="DEMO CONTROL" title="Simulation mode" /><div className="setting-row"><div><b>Scenario engine</b><span>{data.simulation.description}</span></div><div className="simulation-control-buttons"><button className="filter-button" onClick={() => onControl(data.simulation.running ? "pause" : "start")}>{data.simulation.running ? <Pause size={14} /> : <Play size={14} />}{data.simulation.running ? "Pause" : "Start"}</button><button className="filter-button" onClick={() => onControl("step")}><ArrowUpRight size={14} /> Step</button><button className="filter-button" onClick={() => onControl("reset")}><RefreshCw size={14} /> Reset</button></div></div><div className="setting-row"><div><b>Update interval</b><span>Backend snapshot poll for browser clients</span></div><strong className="mono">1000 ms</strong></div><div className="setting-row"><div><b>Alert deduplication</b><span>Escalate only when risk state changes</span></div><StatusChip label="ENABLED" /></div></div><div className="panel"><SectionTitle eyebrow="SENSOR FUSION" title="Integration status" /><div className="integration-list">{data.meta.sensorFusion.map(sensor => <div key={sensor}><span className="integration-icon"><Check size={14} /></span><div><b>{sensor}</b><span>{sensor === "THERMAL CAMERA" ? "Simulated infrared feed — YOLO-ready" : "Ready for prototype input"}</span></div><StatusChip label={sensor === "THERMAL CAMERA" ? "SIMULATED" : "READY"} /></div>)}</div></div><div className="panel"><SectionTitle eyebrow="EXTERNAL CONTEXT" title="Fallback policy" /><div className="fallback-note"><ShieldCheck size={18} /><p>Weather and environment data are contextual only. If Open-Meteo, OpenWeather, Mapbox, or a detection model is unavailable, the local simulation continues with deterministic fallback data. Thermal camera feed is simulated — no actual IR hardware is connected. No API keys are hard-coded in the frontend.</p></div><div className="env-list-row"><span><Database size={14} /> SQLite / MySQL migration-ready schema</span><span><Radio size={14} /> tRPC live telemetry API</span><span><CloudFog size={14} /> Local visibility estimator</span></div></div><div className="panel"><SectionTitle eyebrow="AI ARCHITECTURE" title="Detection pipeline" /><div className="setting-row"><div><b>AI Model</b><span>Architecture ready for YOLO-based real-time object detection</span></div><strong className="mono">YOLO + TRACKING</strong></div><div className="setting-row"><div><b>Mode</b><span>Currently running deterministic simulation engine</span></div><StatusChip label="SIMULATION" /></div><div className="setting-row"><div><b>Detection provider</b><span>SimulationDetectionProvider → future YOLODetectionProvider</span></div><StatusChip label="READY" /></div></div></div></div>;
}

function useSafetySnapshot() {
  return trpc.safety.snapshot.useQuery(undefined, {
    refetchInterval: 1000,
    staleTime: 500,
    retry: 1,
    retryDelay: 1000,
  });
}

type Snapshot = NonNullable<ReturnType<typeof useSafetySnapshot>["data"]>;

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [localFallback, setLocalFallback] = useState<Snapshot | null>(null);

  const query = useSafetySnapshot();
  const controlMutation = trpc.safety.control.useMutation();
  const ackMutation = trpc.safety.acknowledge.useMutation();
  const utils = trpc.useUtils();

  // If backend tRPC API is unreachable (e.g. on pure static hosting), seamlessly run client simulation
  useEffect(() => {
    if (query.isError || (!query.data && !query.isLoading)) {
      setLocalFallback(clientSimulation.snapshot() as Snapshot);
      const timer = setInterval(() => {
        setLocalFallback(clientSimulation.snapshot() as Snapshot);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [query.isError, query.data, query.isLoading]);

  // Safety timeout: if loading takes longer than 2.5s, immediately unlock with client simulation
  useEffect(() => {
    if (!query.data && !localFallback) {
      const timeout = setTimeout(() => {
        setLocalFallback(clientSimulation.snapshot() as Snapshot);
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [query.data, localFallback]);

  const data = (query.data ?? localFallback) as Snapshot | undefined;

  const onControl = (action: "start" | "pause" | "reset" | "step") => {
    if (query.data) {
      controlMutation.mutate({ action }, { onSuccess: result => utils.safety.snapshot.setData(undefined, result) });
    } else {
      const res = clientSimulation.control(action as SimulationAction);
      setLocalFallback(res as Snapshot);
    }
  };

  const onAcknowledge = (alertId: string) => {
    if (query.data) {
      ackMutation.mutate({ alertId }, { onSuccess: () => utils.safety.snapshot.invalidate() });
    } else {
      clientSimulation.acknowledge(alertId);
      setLocalFallback(clientSimulation.snapshot() as Snapshot);
    }
  };

  if (!data) return <div className="loading-screen"><div className="loading-mark"><ShieldCheck size={26} /></div><span>INITIALIZING SAFETY INTELLIGENCE</span><i /></div>;

  const page = view === "dashboard" ? <Dashboard data={data} setView={setView} onAcknowledge={onAcknowledge} /> : view === "live" ? <LivePage data={data} /> : view === "risk" ? <RiskPage data={data} onAcknowledge={onAcknowledge} /> : view === "map" ? <MapPage data={data} /> : view === "near-misses" ? <NearMissPage data={data} /> : view === "vehicles" ? <VehiclesPage data={data} /> : view === "analytics" ? <AnalyticsPage data={data} /> : <SettingsPage data={data} onControl={onControl} />;

  return <div className="app-shell"><aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}><div className="brand"><div className="brand-mark"><ShieldCheck size={19} /></div><div><b>MINING SAFETY AI</b><span>CONTROL SYSTEM / 01</span></div><button className="mobile-close" onClick={() => setMobileNav(false)}><X size={16} /></button></div><div className="sidebar-status"><span className="live-dot" /> SYSTEM OPERATIONAL <span>v0.9.4</span></div><nav>{navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setMobileNav(false); }}><Icon size={17} /><span>{item.label}</span>{item.id === "risk" && data.highestRisk?.risk === "CRITICAL" && <i className="nav-alert" />}</button>; })}</nav><div className="sidebar-footer"><div className="sidebar-footer-line"><span>CONNECTED SENSORS</span><b>{data.meta.sensorFusion.length}/6</b></div><div className="sensor-mini-list">{data.meta.sensorFusion.slice(0, 5).map(sensor => <span key={sensor}><i />{sensor}</span>)}</div><div className="sidebar-user"><div className="avatar">OC</div><div><b>Operator Console</b><span>North sector / shift A</span></div></div></div></aside><main className="main-content"><header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={18} /></button><div className="breadcrumb"><span>MINING SAFETY AI</span><ChevronRight size={13} /><b>{navItems.find(item => item.id === view)?.label.toUpperCase()}</b></div><div className="topbar-right"><span className="topbar-chip"><Thermometer size={13} /> THERMAL CAM <i /></span><span className="topbar-chip"><Database size={13} /> API <i /></span><button className="icon-button" onClick={() => onControl(data.simulation.running ? "pause" : "start")} aria-label={data.simulation.running ? "Pause simulation" : "Start simulation"}>{data.simulation.running ? <Pause size={15} /> : <Play size={15} />}</button><button className="operator-button"><span className="avatar small">OC</span><span>OPERATOR</span></button></div></header><div className="content-wrap">{page}</div></main></div>;
}
