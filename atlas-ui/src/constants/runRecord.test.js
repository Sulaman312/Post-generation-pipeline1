import {
  defaultRunRecordFields,
  hasPendingSchedule,
  isPlatformPublished,
  runRecordFromRun,
  unpublishedSelectedPlatforms,
} from "./runRecord";

describe("runRecordFromRun", () => {
  it("returns defaults for empty input", () => {
    expect(runRecordFromRun(null)).toEqual(defaultRunRecordFields());
  });

  it("filters unknown platforms", () => {
    const record = runRecordFromRun({
      platforms: ["instagram", "twitter"],
      status: "draft",
    });
    expect(record.platforms).toEqual(["instagram"]);
  });
});

describe("hasPendingSchedule", () => {
  it("is false when no schedule is set", () => {
    const record = defaultRunRecordFields();
    expect(hasPendingSchedule(record)).toBe(false);
  });

  it("is true when a selected platform has a future schedule", () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const record = runRecordFromRun({
      platforms: ["instagram"],
      platform_schedules: { instagram: future },
      status: "scheduled",
    });
    expect(hasPendingSchedule(record)).toBe(true);
  });
});

describe("unpublishedSelectedPlatforms", () => {
  it("excludes published platforms", () => {
    const record = runRecordFromRun({
      platforms: ["instagram", "linkedin"],
      published_results: [
        { platform: "instagram", status: "published" },
      ],
    });
    expect(unpublishedSelectedPlatforms(record)).toEqual(["linkedin"]);
    expect(isPlatformPublished(record, "instagram")).toBe(true);
  });
});
