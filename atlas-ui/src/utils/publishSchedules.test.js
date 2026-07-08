import { schedulesAreSynced } from "./publishSchedules";

describe("schedulesAreSynced", () => {
  it("returns true when no platforms selected", () => {
    expect(schedulesAreSynced({}, [])).toBe(true);
  });

  it("returns true when no schedules set", () => {
    expect(schedulesAreSynced({}, ["instagram", "linkedin"])).toBe(true);
  });

  it("returns true when all platforms share the same time", () => {
    const iso = "2026-08-01T12:00:00+00:00";
    expect(
      schedulesAreSynced(
        { instagram: iso, linkedin: iso },
        ["instagram", "linkedin"]
      )
    ).toBe(true);
  });

  it("returns false when only some platforms are scheduled", () => {
    expect(
      schedulesAreSynced(
        { instagram: "2026-08-01T12:00:00+00:00" },
        ["instagram", "linkedin"]
      )
    ).toBe(false);
  });

  it("returns false when platforms have different times", () => {
    expect(
      schedulesAreSynced(
        {
          instagram: "2026-08-01T12:00:00+00:00",
          linkedin: "2026-08-01T14:00:00+00:00",
        },
        ["instagram", "linkedin"]
      )
    ).toBe(false);
  });
});
