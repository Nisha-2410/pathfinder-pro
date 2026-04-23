import { describe, expect, it } from "vitest";

import { getRoute } from "@/backend/routes/navigation";

describe("navigation graph", () => {
  it("routes from Main Entrance to Lab through the main corridor instead of Reception", () => {
    const result = getRoute({
      source: "N1",
      destination: "N10",
      mode: "fastest",
    });

    expect(result.path).toEqual(["N1", "N5", "N6", "N10"]);
    expect(result.instructions).not.toContain("Head toward Reception (30 m)");
  });

  it("adds explicit floor transition steps for multi-floor routes", () => {
    const result = getRoute({
      source: "N2",
      destination: "N13",
      mode: "fastest",
    });

    expect(result.instructions).toContain("Take lift to floor 2");
    expect(result.instructions).toContain("Now on Floor 2");
    expect(result.steps.some((step) => step.floor === 2 && step.kind === "transition")).toBe(true);
  });

  it("supports a least-crowded recommendation mode", () => {
    const result = getRoute({
      source: "N2",
      destination: "N7",
      mode: "least_crowded",
    });

    expect(result.path).toEqual(["N2", "N3", "N6", "N7"]);
  });
});
