export type VisibilityBand = "CLEAR" | "GOOD" | "POOR" | "VERY POOR" | "CRITICAL";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type WorkerIntent = "MOVING AWAY" | "APPROACHING" | "CROSSING" | "STATIONARY" | "ENTERING DANGER ZONE";

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function visibilityBand(visibility: number): VisibilityBand {
  if (visibility >= 90) return "CLEAR";
  if (visibility >= 70) return "GOOD";
  if (visibility >= 40) return "POOR";
  if (visibility >= 20) return "VERY POOR";
  return "CRITICAL";
}

export function calculateTtc(distance: number, relativeSpeed: number): number | null {
  if (relativeSpeed <= 0 || distance <= 0) return null;
  return distance / relativeSpeed;
}

export function dynamicSafetyZone(
  speed: number,
  visibility: number,
  vehicleType: string,
  direction = "NORTH",
  operatingZone = "NORTH HAUL ROAD",
) {
  const visibilityMargin = ((100 - visibility) / 100) * 14;
  const typeMargin = vehicleType.toLowerCase().includes("truck") ? 5 : vehicleType.toLowerCase().includes("loader") ? 3 : 2;
  const zoneMargin = operatingZone.toLowerCase().includes("haul") ? 3 : 0;
  const forward = clamp(12 + speed * 0.34 + visibilityMargin + typeMargin + zoneMargin, 14, 48);
  const lateral = clamp(4 + speed * 0.11 + visibilityMargin * 0.35, 5, 15);
  const rear = clamp(7 + speed * 0.16 + visibilityMargin * 0.5, 8, 22);
  return { forward, lateral, rear, direction };
}

export function estimateWorkerIntent(
  relativeSpeed: number,
  lateralOffset: number,
  distance: number,
  safetyZoneForward: number,
  braking: boolean,
): WorkerIntent {
  if (distance < safetyZoneForward && braking) return "ENTERING DANGER ZONE";
  if (Math.abs(lateralOffset) > 2.5 && relativeSpeed > 0) return "CROSSING";
  if (relativeSpeed > 2) return "APPROACHING";
  if (relativeSpeed < -1) return "MOVING AWAY";
  return "STATIONARY";
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

export function calculateRiskScore(input: {
  distance: number;
  vehicleSpeed: number;
  relativeSpeed: number;
  ttc: number | null;
  visibility: number;
  confidence: number;
  zoneViolation: boolean;
  intent: WorkerIntent;
  blindZone?: boolean;
  sensorDisagreement?: boolean;
}) {
  const distanceRisk = input.zoneViolation ? clamp((1 - input.distance / 36) * 28, 5, 28) : clamp((1 - input.distance / 55) * 10, 0, 10);
  const ttcRisk = input.ttc === null ? 0 : clamp((8 - input.ttc) / 8 * 34, 0, 34);
  const speedRisk = clamp(input.vehicleSpeed / 50 * 12, 0, 12);
  const visibilityRisk = clamp((100 - input.visibility) / 100 * 10, 0, 10);
  const confidenceRisk = clamp((1 - input.confidence) * 12, 0, 12);
  const movementRisk = input.intent === "CROSSING" ? 10 : input.intent === "ENTERING DANGER ZONE" ? 12 : input.intent === "APPROACHING" ? 7 : 0;
  const blindZoneRisk = input.blindZone ? 8 : 0;
  const disagreementRisk = input.sensorDisagreement ? 6 : 0;
  const score = Math.round(clamp(distanceRisk + ttcRisk + speedRisk + visibilityRisk + confidenceRisk + movementRisk + blindZoneRisk + disagreementRisk, 0, 100));
  return { score, level: riskLevel(score) };
}

export function safetyScore(input: {
  averageRisk: number;
  nearMisses: number;
  speedViolations: number;
  emergencyBraking: number;
  blindZoneEvents: number;
  poorVisibilityMinutes: number;
}) {
  const penalty = input.averageRisk * 0.2 + input.nearMisses * 3 + input.speedViolations * 1.5 + input.emergencyBraking * 1.7 + input.blindZoneEvents * 1.2 + input.poorVisibilityMinutes * 0.25;
  return Math.round(clamp(100 - penalty, 0, 100));
}

export function formatTtc(ttc: number | null) {
  return ttc === null ? "—" : `${ttc.toFixed(1)} s`;
}

export function riskTone(level: RiskLevel) {
  return {
    LOW: "light",
    MEDIUM: "mid",
    HIGH: "dark",
    CRITICAL: "critical",
  }[level];
}

export const riskRank: Record<RiskLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
