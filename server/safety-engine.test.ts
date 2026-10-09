import { describe, expect, it } from "vitest";
import { calculateRiskScore, calculateTtc, dynamicSafetyZone, estimateWorkerIntent, visibilityBand } from "./safety-engine";
import { simulationEngine } from "./simulation";

describe("safety engine", () => {
  it("maps visibility to the required operational bands", () => {
    expect(visibilityBand(95)).toBe("CLEAR");
    expect(visibilityBand(72)).toBe("GOOD");
    expect(visibilityBand(45)).toBe("POOR");
    expect(visibilityBand(25)).toBe("VERY POOR");
    expect(visibilityBand(10)).toBe("CRITICAL");
  });

  it("handles TTC when there is no closing speed", () => {
    expect(calculateTtc(10, 2)).toBe(5);
    expect(calculateTtc(10, 0)).toBeNull();
    expect(calculateTtc(10, -2)).toBeNull();
  });

  it("expands the forward bubble for speed and poor visibility", () => {
    const clearSlow = dynamicSafetyZone(10, 95, "HAUL TRUCK");
    const poorFast = dynamicSafetyZone(38, 30, "HAUL TRUCK");
    expect(poorFast.forward).toBeGreaterThan(clearSlow.forward);
    expect(poorFast.lateral).toBeGreaterThan(clearSlow.lateral);
  });

  it("predicts worker crossing intent and raises risk inside the zone", () => {
    const intent = estimateWorkerIntent(6, 4, 8, 24, false);
    expect(intent).toBe("CROSSING");
    const risk = calculateRiskScore({ distance: 8, vehicleSpeed: 38, relativeSpeed: 12, ttc: 0.67, visibility: 31, confidence: 0.62, zoneViolation: true, intent, blindZone: false, sensorDisagreement: true });
    expect(risk.level).toBe("CRITICAL");
    expect(risk.score).toBeGreaterThanOrEqual(75);
  });
});

describe("simulation scenario", () => {
  it("progresses to a recorded near miss after predictive braking", () => {
    simulationEngine.control("reset");
    let snapshot = simulationEngine.snapshot();
    for (let i = 0; i < 24; i += 1) snapshot = simulationEngine.control("step");
    expect(snapshot.events.some(event => event.eventType === "NEAR MISS" && event.object === "PERSON #07")).toBe(true);
    expect(snapshot.highestRisk).toBeDefined();
    expect(snapshot.meta.sensorFusion).toContain("RADAR");
  });
});
