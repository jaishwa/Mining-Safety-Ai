import {
  calculateRiskScore,
  clamp,
  dynamicSafetyZone,
  estimateWorkerIntent,
  safetyScore,
  visibilityBand,
  type RiskLevel,
} from "../../../server/safety-engine";

export type SimulationAction = "start" | "pause" | "reset" | "step";

type Vehicle = {
  id: string;
  name: string;
  type: string;
  status: "ACTIVE" | "IDLE";
  speed: number;
  direction: string;
  zone: string;
  safetyScore: number;
  x: number;
  y: number;
  risk: RiskLevel;
  zoneSize: number;
  blindZoneEvents: number;
};

type SafetyObject = {
  id: string;
  label: string;
  kind: "PERSON" | "VEHICLE" | "OBSTACLE";
  x: number;
  y: number;
  distance: number;
  confidence: number;
  relativeSpeed: number;
  direction: string;
  intent: string;
  risk: RiskLevel;
  riskScore: number;
  ttc: number | null;
  zoneViolation: boolean;
  blindZone: boolean;
  sensorStatus: string;
};

const round = (n: number) => Math.round(n * 10) / 10;
const now = () => Date.now();

export class ClientSimulationEngine {
  private phase = 4;
  private running = true;
  private cycle = 1;
  private nearMissRecorded = false;
  private previousRisk: RiskLevel = "MEDIUM";
  private eventSequence = 104;

  private vehicleState: Vehicle[] = [
    { id: "truck-001", name: "TRUCK-001", type: "CAT 797F HAUL TRUCK", status: "ACTIVE", speed: 28.4, direction: "NORTH", zone: "NORTH HAUL ROAD", safetyScore: 91, x: 48, y: 72, risk: "MEDIUM", zoneSize: 28.5, blindZoneEvents: 1 },
    { id: "truck-002", name: "TRUCK-002", type: "KOMATSU 930E", status: "ACTIVE", speed: 21.0, direction: "EAST", zone: "EAST RAMP", safetyScore: 96, x: 74, y: 46, risk: "LOW", zoneSize: 22.0, blindZoneEvents: 0 },
    { id: "loader-001", name: "LOADER-001", type: "CAT 994K LOADER", status: "ACTIVE", speed: 9.8, direction: "SOUTH", zone: "CRUSHER YARD", safetyScore: 88, x: 67, y: 68, risk: "LOW", zoneSize: 18.0, blindZoneEvents: 2 },
  ];

  private alerts = [
    { id: "ALT-091", title: "WORKER APPROACHING HAUL PATH", level: "CRITICAL" as RiskLevel, timestamp: now() - 14_000, message: "PERSON #07 moving toward haul line. TTC 2.4s. Dynamic bubble expanded by dust margin.", acknowledged: false },
    { id: "ALT-090", title: "POOR VISIBILITY MARGIN APPLIED", level: "HIGH" as RiskLevel, timestamp: now() - 48_000, message: "Visibility dropped to 39%. Forward safety bubble auto-expanded to 36.8m.", acknowledged: true },
    { id: "ALT-089", title: "BLIND SPOT PROXIMITY ALERT", level: "MEDIUM" as RiskLevel, timestamp: now() - 180_000, message: "Stationary obstacle detected in rear blind-zone of LOADER-001.", acknowledged: true },
  ];

  private events = [
    { id: "NM-0104", timestamp: now() - 14_000, eventType: "NEAR MISS", vehicle: "TRUCK-001", object: "PERSON #07", distance: 18.4, ttc: 2.3, speed: 28.4, visibility: 38, riskScore: 88, zone: "NORTH HAUL ROAD", detail: "Worker path intersection predicted during dust plume. Auto-retard advisory triggered." },
    { id: "NM-0103", timestamp: now() - 92_000, eventType: "BLIND SPOT PROXIMITY", vehicle: "LOADER-001", object: "LIGHT VEHICLE", distance: 12.1, ttc: 4.8, speed: 11.2, visibility: 61, riskScore: 64, zone: "CRUSHER YARD", detail: "Light service vehicle lingered in rear quadrant." },
    { id: "NM-0102", timestamp: now() - 340_000, eventType: "SPEED VIOLATION", vehicle: "TRUCK-002", object: "RAMP EDGE", distance: 24.0, ttc: null, speed: 34.1, visibility: 79, riskScore: 52, zone: "EAST RAMP", detail: "Vehicle speed exceeded poor-surface recommended threshold." },
  ];

  private currentObjects: SafetyObject[] = [];

  constructor() {
    this.ensureState();
  }

  private advance(force = false) {
    if (!this.running && !force) return;

    this.phase = (this.phase + 1) % 28;
    if (this.phase === 0) {
      this.phase = 1;
      this.cycle += 1;
      this.nearMissRecorded = false;
    }

    const visibility = clamp(85 - this.phase * 2.35, 27, 85);
    const speed = clamp(29.4 - (this.phase > 14 ? (this.phase - 14) * 1.8 : 0), 12.2, 29.4);
    const distance = clamp(44 - this.phase * 1.45, 12.4, 44);
    const relativeSpeed = speed > 16 ? 4.9 : 1.8;
    const ttc = distance / relativeSpeed;
    const zone = dynamicSafetyZone(speed, visibility, "CAT 797F HAUL TRUCK");
    const intent = estimateWorkerIntent(relativeSpeed, 1.2, distance, zone.forward, this.phase > 14);
    const blindZone = distance < 18 && this.phase % 6 === 0;
    const sensorDisagreement = visibility < 45 && this.phase % 4 === 0;
    const confidence = sensorDisagreement ? 0.62 : visibility < 45 ? 0.74 : 0.94;

    const risk = calculateRiskScore({
      distance,
      vehicleSpeed: speed,
      relativeSpeed,
      ttc,
      visibility,
      confidence,
      zoneViolation: distance < zone.forward,
      intent,
      blindZone,
      sensorDisagreement,
    });

    this.vehicleState[0] = {
      ...this.vehicleState[0],
      speed: round(speed),
      risk: risk.level,
      zoneSize: round(zone.forward),
      safetyScore: clamp(94 - Math.round(risk.score * 0.28), 65, 98),
      blindZoneEvents: this.vehicleState[0].blindZoneEvents + (blindZone ? 1 : 0),
    };

    if (risk.level === "CRITICAL" && this.previousRisk !== "CRITICAL") {
      this.alerts.unshift({
        id: `ALT-${String(100 + this.phase).padStart(3, "0")}`,
        title: "CRITICAL COLLISION INTERSECTION PREDICTED",
        level: "CRITICAL",
        timestamp: now(),
        message: `PERSON #07 TTC ${round(ttc)}s at ${round(distance)}m. Visibility ${round(visibility)}%. Operator advisory: initiate braking.`,
        acknowledged: false,
      });
      this.alerts = this.alerts.slice(0, 10);
    }
    this.previousRisk = risk.level;

    if (this.phase >= 16 && !this.nearMissRecorded) {
      this.nearMissRecorded = true;
      this.eventSequence += 1;
      this.events.unshift({
        id: `NM-${String(this.eventSequence).padStart(4, "0")}`,
        timestamp: now(),
        eventType: "NEAR MISS",
        vehicle: "TRUCK-001",
        object: "PERSON #07",
        distance: round(distance),
        ttc,
        speed: round(speed),
        visibility: round(visibility),
        riskScore: risk.score,
        zone: "NORTH HAUL ROAD",
        detail: "Worker entered dynamic safety bubble; predictive brake response avoided collision.",
      });
      this.events = this.events.slice(0, 18);
    }

    this.currentObjects = this.buildObjects({ visibility, speed, distance, relativeSpeed, zone, intent, ttc, risk, confidence, blindZone, sensorDisagreement });
  }

  private buildObjects(input: {
    visibility: number;
    speed: number;
    distance: number;
    relativeSpeed: number;
    zone: ReturnType<typeof dynamicSafetyZone>;
    intent: string;
    ttc: number | null;
    risk: ReturnType<typeof calculateRiskScore>;
    confidence: number;
    blindZone: boolean;
    sensorDisagreement: boolean;
  }): SafetyObject[] {
    return [
      { id: "person-07", label: "PERSON #07", kind: "PERSON", x: 54 + Math.sin(this.phase / 3) * 2, y: 31 + Math.min(this.phase, 20) * 1.1, distance: round(input.distance), confidence: Math.round(input.confidence * 100) / 100, relativeSpeed: round(input.relativeSpeed), direction: input.relativeSpeed > 0 ? "TOWARD VEHICLE" : "AWAY FROM VEHICLE", intent: input.intent, risk: input.risk.level, riskScore: input.risk.score, ttc: input.ttc, zoneViolation: input.distance < input.zone.forward, blindZone: input.blindZone, sensorStatus: input.sensorDisagreement ? "SENSOR DISAGREEMENT" : "FUSED: CAMERA + RADAR" },
      { id: "truck-02", label: "TRUCK #02", kind: "VEHICLE", x: 67, y: 23, distance: 42.8, confidence: 0.91, relativeSpeed: -2.4, direction: "NORTHBOUND", intent: "MOVING AWAY", risk: "LOW", riskScore: 16, ttc: null, zoneViolation: false, blindZone: false, sensorStatus: "FUSED: CAMERA + GPS" },
      { id: "obstacle-01", label: "OBSTACLE #01", kind: "OBSTACLE", x: 31, y: 56, distance: 18.4, confidence: input.visibility < 45 ? 0.58 : 0.88, relativeSpeed: 0, direction: "STATIONARY", intent: "STATIONARY", risk: input.visibility < 45 ? "MEDIUM" : "LOW", riskScore: input.visibility < 45 ? 39 : 18, ttc: null, zoneViolation: false, blindZone: false, sensorStatus: input.visibility < 45 ? "UNCERTAIN OBJECT" : "CAMERA + LIDAR" },
    ];
  }

  private ensureState() {
    this.advance();
    if (!this.currentObjects.length) this.advance(true);
  }

  reset() {
    this.phase = 4;
    this.cycle += 1;
    this.running = true;
    this.nearMissRecorded = false;
    this.previousRisk = "MEDIUM";
    this.currentObjects = [];
    this.ensureState();
    return this.snapshot();
  }

  control(action: SimulationAction) {
    if (action === "start") this.running = true;
    if (action === "pause") this.running = false;
    if (action === "reset") return this.reset();
    if (action === "step") this.advance(true);
    return this.snapshot();
  }

  acknowledge(alertId: string) {
    const alert = this.alerts.find(item => item.id === alertId);
    if (!alert) return { success: false, alertId };
    alert.acknowledged = true;
    return { success: true, alertId };
  }

  snapshot() {
    this.ensureState();
    const primary = this.currentObjects[0];
    const visibility = clamp(85 - this.phase * 2.35, 27, 85);
    const environment = { visibility: round(visibility), band: visibilityBand(visibility), temperature: 31, humidity: 44, weather: "DUST PLUME", wind: 19, dust: visibility < 70, status: visibility < 70 ? "POOR VISIBILITY" : "STABLE" };
    const avgRisk = round(this.currentObjects.reduce((sum, item) => sum + item.riskScore, 0) / this.currentObjects.length);
    const nearMisses = this.events.filter(event => event.eventType === "NEAR MISS").length;
    const score = safetyScore({ averageRisk: avgRisk, nearMisses, speedViolations: this.phase > 12 ? 2 : 1, emergencyBraking: this.phase > 15 ? 2 : 1, blindZoneEvents: this.vehicleState[0].blindZoneEvents, poorVisibilityMinutes: visibility < 60 ? 8 : 2 });
    const riskTrend = Array.from({ length: 18 }, (_, index) => {
      const simulatedPhase = Math.max(1, this.phase - 17 + index);
      const simulatedVisibility = clamp(85 - simulatedPhase * 2.35, 27, 85);
      const simulatedScore = clamp(15 + simulatedPhase * 4.4 + (simulatedPhase > 15 ? 10 : 0), 8, 96);
      return { label: `${index + 1}`, risk: Math.round(simulatedScore), visibility: Math.round(simulatedVisibility) };
    });

    return {
      system: { status: "OPERATIONAL", mode: this.running ? "SIMULATION" : "PAUSED", lastUpdate: now(), camera: "THERMAL / CAM-04 / NORTH HAUL ROAD", api: "CONNECTED", tick: this.phase, cycle: this.cycle },
      simulation: { running: this.running, phase: this.phase, cycle: this.cycle, description: "Truck / worker path-intersection scenario" },
      environment,
      vehicles: this.vehicleState,
      objects: this.currentObjects,
      highestRisk: primary,
      alerts: this.alerts,
      events: this.events,
      analytics: { totalDetections: 1842 + this.phase * 7, totalWarnings: 49 + this.events.length, criticalEvents: this.events.filter(event => event.riskScore >= 75).length + (primary.risk === "CRITICAL" ? 1 : 0), nearMisses, averageTtc: 3.2, averageVisibility: 64, averageSpeed: 26.8, safetyScore: score, emergencyBraking: 12, speedViolations: 7, blindZoneEvents: 9 },
      riskTrend,
      heatmap: [
        { zone: "NORTH HAUL ROAD", x: 49, y: 35, intensity: 92, events: 18 },
        { zone: "EAST RAMP", x: 76, y: 50, intensity: 68, events: 11 },
        { zone: "CRUSHER YARD", x: 69, y: 70, intensity: 45, events: 8 },
        { zone: "WEST CUT", x: 25, y: 67, intensity: 31, events: 4 },
      ],
      meta: { formula: "TTC = distance / relative speed. Risk fuses TTC, velocity, visibility, confidence, intent, and safety-zone violation.", sensorFusion: ["CAMERA", "THERMAL CAMERA", "RADAR", "LIDAR", "GPS", "TELEMETRY"] },
    };
  }
}

export const clientSimulation = new ClientSimulationEngine();