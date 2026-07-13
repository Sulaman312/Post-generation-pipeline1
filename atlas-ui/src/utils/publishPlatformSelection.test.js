import {
  allPublishablePlatformsSelected,
  deriveSyncSchedules,
  platformsEqual,
  platformsFromRecord,
  readStoredPlatformSelection,
  selectionInitKey,
  writeStoredPlatformSelection,
  clearStoredPlatformSelection,
} from "./publishPlatformSelection";

describe("publishPlatformSelection", () => {
  const connected = ["facebook", "instagram", "linkedin"];
  const publishedByPlatform = {};

  it("detects when all publishable platforms are selected", () => {
    expect(
      allPublishablePlatformsSelected(connected, publishedByPlatform, [
        "facebook",
        "instagram",
        "linkedin",
      ])
    ).toBe(true);
    expect(
      allPublishablePlatformsSelected(connected, publishedByPlatform, ["instagram"])
    ).toBe(false);
  });

  it("derives sync checkbox from all-selected state", () => {
    expect(deriveSyncSchedules(true, false)).toBe(true);
    expect(deriveSyncSchedules(false, false)).toBe(false);
    expect(deriveSyncSchedules(true, true)).toBe(false);
  });

  it("filters record platforms to connected keys", () => {
    expect(
      platformsFromRecord(["linkedin", "instagram", "twitter"], ["instagram", "linkedin"])
    ).toEqual(["instagram", "linkedin"]);
  });

  it("compares platform lists regardless of order", () => {
    expect(platformsEqual(["linkedin", "instagram"], ["instagram", "linkedin"])).toBe(true);
    expect(platformsEqual(["linkedin"], ["instagram", "linkedin"])).toBe(false);
  });

  it("builds stable init keys regardless of connected order", () => {
    expect(
      selectionInitKey("run-1", ["linkedin", "facebook", "instagram"])
    ).toBe(selectionInitKey("run-1", ["facebook", "instagram", "linkedin"]));
  });

  it("stores and reads platform selection in sessionStorage", () => {
    clearStoredPlatformSelection("client-a", "run-1");
    expect(readStoredPlatformSelection("client-a", "run-1")).toBeNull();
    writeStoredPlatformSelection("client-a", "run-1", ["linkedin", "instagram"]);
    expect(readStoredPlatformSelection("client-a", "run-1")).toEqual([
      "instagram",
      "linkedin",
    ]);
    clearStoredPlatformSelection("client-a", "run-1");
  });
});
