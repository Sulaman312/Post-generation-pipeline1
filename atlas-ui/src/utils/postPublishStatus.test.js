import {
  formatPostDateTime,
  overallStatusLabel,
  platformCellDisplay,
  platformStatusLabel,
  summarizePostPublish,
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

  it("marks published runs from published_results", () => {
    const summary = summarizePostPublish({
      run_id: "2026-06-20_00-11-44",
      topic: "Test post",
      status: "published",
      platforms: ["facebook"],
      published_results: [
        {
          platform: "facebook",
          status: "published",
          published_at: "2026-07-07T17:19:02.369822",
        },
      ],
      statuses: { publish: "done", review_checklist: "done" },
    });
    expect(summary.overallStatus).toBe("published");
    expect(summary.platforms[0].status).toBe("published");
  });

  it("marks review-complete runs as ready when publish is pending", () => {
    const summary = summarizePostPublish({
      run_id: "2026-07-10_23-29-34",
      topic: "Shower partition",
      status: "draft",
      platforms: ["instagram", "linkedin", "facebook"],
      published_results: [],
      statuses: { publish: "pending", review_checklist: "done" },
    });
    expect(summary.overallStatus).toBe("ready");
    expect(summary.platforms.every((p) => p.status === "ready")).toBe(true);
  });
});
