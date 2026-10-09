import {
  calculateRiskScore,
  calculateTtc,
  clamp,
  dynamicSafetyZone,
  estimateWorkerIntent,
  riskRank,
  safetyScore,
  visibilityBand,
  type RiskLevel,
} from "./safety-engine";

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

type SafetyEvent = {
  id: string;
  timestamp: number;
  eventType: "NEAR MISS" | "CRITICAL RISK" | "BLIND ZONE" | "UNCERTAIN OBJECT";
  vehicle: string;
  object: string;
  distance: number;
  ttc: number | null;
  speed: number;
  visibility: number;
  riskScore: number;
  zone: string;
  detail: string;
};

type Alert = {
  id: string;
  timestamp: number;
  level: RiskLevel;
  title: string;
  message: string;
  objectId: string;
  acknowledged: boolean;
};

const now = () => Date.now();
const round = (n: number, digits = 1) => Number(n.toFixed(digits));

function seedEvents(): SafetyEvent[] {
  const timestamp = now();
  return [
    { id: "NM-2408", timestamp: timestamp - 8 * 60_000, eventType: "NEAR MISS", vehicle: "TRUCK-001", object: "PERSON #04", distance: 6.8, ttc: 2.1, speed: 24, visibility: 58, riskScore: 82, zone: "EAST RAMP", detail: "Worker entered forward safety bubble; truck braked before path intersection." },
    { id: "NM-2407", timestamp: timestamp - 24 * 60_000, eventType: "BLIND ZONE", vehicle: "LOADER-002", object: "OBSTACLE #03", distance: 4.2, ttc: null, speed: 8, visibility: 76, riskScore: 68, zone: "CRUSHER YARD", detail: "Obstacle occupied rear blind zone during reversing maneuver." },
    { id: "NM-2406", timestamp: timestamp - 41 * 60_000, eventType: "NEAR MISS", vehicle: "TRUCK-001", object: "PERSON #02", distance: 9.1, ttc: 3.4, speed: 31, visibility: 65, riskScore: 77, zone: "NORTH HAUL ROAD", detail: "Worker crossed path; operator response reduced closing speed." },
    { id: "NM-2405", timestamp: timestamp - 68 * 60_000, eventType: "UNCERTAIN OBJECT", vehicle: "EXCAVATOR-003", object: "OBSTACLE #01", distance: 12.6, ttc: null, speed: 0, visibility: 34, riskScore: 54, zone: "WEST CUT", detail: "Low-confidence camera detection disagreed with radar return." },
    { id: "NM-2404", timestamp: timestamp - 95 * 60_000, eventType: "CRITICAL RISK", vehicle: "TRUCK-001", object: "PERSON #05", distance: 7.4, ttc: 2.8, speed: 36, visibility: 42, riskScore: 88, zone: "NORTH HAUL ROAD", detail: "Worker approached vehicle path under poor visibility." },
  ];
}

class SimulationEngine {
  private running = true;
  private phase = 4;
  private cycle = 12;
  private lastTick = 0;
  private previousRisk: RiskLevel = "MEDIUM";
  private nearMissRecorded = false;
  private alertSequence = 3;
  private eventSequence = 8;
  private events = seedEvents();
  private alerts: Alert[] = [
    { id: "AL-0003", timestamp: now() - 35_000, level: "HIGH", title: "SAFETY BUBBLE VIOLATION", message: "PERSON #07 is approaching the forward zone of TRUCK-001.", objectId: "person-07", acknowledged: false },
    { id: "AL-0002", timestamp: now() - 95_000, level: "MEDIUM", title: "VISIBILITY DEGRADING", message: "Dust plume detected. Safety margins expanded by 22%.", objectId: "environment", acknowledged: true },
  ];

  private vehicleState: Vehicle[] = [
    { id: "truck-001", name: "TRUCK-001", type: "HAUL TRUCK", status: "ACTIVE", speed: 38, direction: "NORTH", zone: "NORTH HAUL ROAD", safetyScore: 87, x: 46, y: 46, risk: "HIGH", zoneSize: 30, blindZoneEvents: 2 },
    { id: "loader-002", name: "LOADER-002", type: "WHEEL LOADER", status: "ACTIVE", speed: 12, direction: "EAST", zone: "CRUSHER YARD", safetyScore: 94, x: 70, y: 67, risk: "LOW", zoneSize: 18, blindZoneEvents: 1 },
    { id: "excavator-003", name: "EXCAVATOR-003", type: "EXCAVATOR", status: "IDLE", speed: 0, direction: "WEST", zone: "WEST CUT", safetyScore: 96, x: 24, y: 68, risk: "LOW", zoneSize: 14, blindZoneEvents: 0 },
  ];

  private advance(force = false) {
    const timestamp = now();
    if (!force && (!this.running || timestamp - this.lastTick < 700)) return;
    this.lastTick = timestamp;
    if (force && !this.running) this.lastTick = timestamp;

    this.phase += 1;
    if (this.phase > 27) {
      this.phase = 3;
      this.cycle += 1;
      this.nearMissRecorded = false;
    }

    const visibility = clamp(85 - this.phase * 2.35, 27, 85);
    const speed = this.phase < 15 ? 38 : clamp(38 - (this.phase - 14) * 3.8, 6, 38);
    const distance = this.phase < 15 ? 19 - this.phase * 0.85 : 6.25 + (this.phase - 15) * 1.1;
    const relativeSpeed = this.phase < 15 ? 8 + this.phase * 0.35 : -1.5;
    const zone = dynamicSafetyZone(speed, visibility, "HAUL TRUCK", "NORTH", "NORTH HAUL ROAD");
    const braking = this.phase >= 15;
    const intent = estimateWorkerIntent(relativeSpeed, 3.8, distance, zone.forward, braking);
    const ttc = calculateTtc(distance, relativeSpeed);
    const blindZone = this.phase >= 16 && this.phase <= 20;
    const confidence = visibility < 45 ? 0.62 : visibility < 60 ? 0.79 : 0.94;
    const sensorDisagreement = confidence < 0.7;
    const risk = calculateRiskScore({ distance, vehicleSpeed: speed, relativeSpeed, ttc, visibility, confidence, zoneViolation: distance < zone.forward, intent, blindZone, sensorDisagreement });

    this.vehicleState[0] = { ...this.vehicleState[0], speed: round(speed), safetyScore: clamp(92 - risk.score * 0.07, 72, 92), risk: risk.level, zoneSize: round(zone.forward), x: round(44 + Math.sin(this.phase / 5) * 4), y: round(48 - this.phase * 0.25) };
    this.vehicleState[1] = { ...this.vehicleState[1], speed: round(12 + Math.sin(this.phase / 3) * 2), risk: "LOW", zoneSize: round(dynamicSafetyZone(12, visibility, "WHEEL LOADER", "EAST", "CRUSHER YARD").forward) };

    if (riskRank[risk.level] > riskRank[this.previousRisk] || (risk.level === "CRITICAL" && this.phase % 3 === 0)) {
      this.alertSequence += 1;
      const level = risk.level;
      this.alerts.unshift({ id: `AL-${String(this.alertSequence).padStart(4, "0")}`, timestamp, level, title: level === "CRITICAL" ? "CRITICAL COLLISION RISK" : "RISK ESCALATION", message: level === "CRITICAL" ? "Worker path intersection predicted. Operator intervention required." : `Risk increased to ${level} as TTC and visibility changed.`, objectId: "person-07", acknowledged: false });
      this.alerts = this.alerts.slice(0, 12);
    }
    this.previousRisk = risk.level;

    if (!this.nearMissRecorded && this.phase >= 19 && speed < 20) {
      this.eventSequence += 1;
      this.nearMissRecorded = true;
      this.events.unshift({ id: `NM-${String(this.eventSequence).padStart(4, "0")}`, timestamp, eventType: "NEAR MISS", vehicle: "TRUCK-001", object: "PERSON #07", distance: round(distance), ttc, speed: round(speed), visibility: round(visibility), riskScore: risk.score, zone: "NORTH HAUL ROAD", detail: "Worker entered dynamic safety bubble; predictive brake response avoided collision." });
      this.events = this.events.slice(0, 18);
    }

    this.currentObjects = this.buildObjects({ visibility, speed, distance, relativeSpeed, zone, intent, ttc, risk, confidence, blindZone, sensorDisagreement });
  }

  private currentObjects: SafetyObject[] = [];

  private buildObjects(input: { visibility: number; speed: number; distance: number; relativeSpeed: number; zone: ReturnType<typeof dynamicSafetyZone>; intent: string; ttc: number | null; risk: ReturnType<typeof calculateRiskScore>; confidence: number; blindZone: boolean; sensorDisagreement: boolean; }): SafetyObject[] {
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

export const simulationEngine = new SimulationEngine();
