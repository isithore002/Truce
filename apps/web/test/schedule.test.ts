import { describe, expect, it } from "vitest";
import { canScheduleDue, healthText, untilText } from "../src/schedule";

describe("healthText", () => {
  it("explains every reason in plain words and always calls OK a snapshot", () => {
    expect(healthText("NONE")).toMatch(/snapshot, not a lock/);
    expect(healthText(undefined)).toMatch(/snapshot, not a lock/);
    expect(healthText("LOW_BALANCE")).toMatch(/below the invoice amount/);
    expect(healthText("AUTH_CANCELLED")).toMatch(/cancelled or already used/);
    expect(healthText("BLOCKED")).toMatch(/blocked/);
    expect(healthText("WINDOW_ENDED")).toMatch(/window ended/);
    expect(healthText("SOMETHING_NEW")).toContain("SOMETHING_NEW");
  });
});

describe("canScheduleDue", () => {
  it("needs a due date in the future", () => {
    expect(canScheduleDue("0", 100)).toBe(false);
    expect(canScheduleDue("100", 100)).toBe(false);
    expect(canScheduleDue("101", 100)).toBe(true);
    expect(canScheduleDue(5000n, 100)).toBe(true);
  });
});

describe("untilText", () => {
  it("rounds to a readable unit", () => {
    expect(untilText(100, 100)).toBe("now");
    expect(untilText(50, 100)).toBe("now");
    expect(untilText(101, 100)).toBe("in 1 second");
    expect(untilText(160, 100)).toBe("in 60 seconds");
    expect(untilText(100 + 300, 100)).toBe("in 5 minutes");
    expect(untilText(100 + 7200, 100)).toBe("in 2 hours");
    expect(untilText(100 + 3 * 86_400, 100)).toBe("in 3 days");
  });
});
