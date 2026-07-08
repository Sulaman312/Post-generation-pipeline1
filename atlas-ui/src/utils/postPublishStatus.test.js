import {
  formatPostDateTime,
  overallStatusLabel,
  platformCellDisplay,
  platformStatusLabel,
} from "./postPublishStatus";

describe("postPublishStatus helpers", () => {
  it("formats valid ISO timestamps", () => {
    const label = formatPostDateTime("2026-07-07T10:00:00.000Z");
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });

  it("returns null for invalid timestamps", () => {
    expect(formatPostDateTime("not-a-date")).toBeNull();
  });

  it("maps overall status labels", () => {
    expect(overallStatusLabel("scheduled")).toBe("Scheduled");
    expect(overallStatusLabel("unknown")).toBe("Draft");
  });

  it("describes published platform cells", () => {
    const cell = platformCellDisplay({
      status: "published",
      time: "2026-07-07T10:00:00.000Z",
    });
    expect(cell.label).toBe("Published");
    expect(cell.status).toBe("published");
  });

  it("maps platform result statuses", () => {
    expect(platformStatusLabel("failed")).toBe("Failed");
  });
});
