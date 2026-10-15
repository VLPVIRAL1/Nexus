import { describe, expect, it } from "vitest";
import { findWorkbenchTopics, topicHref, workbenchTopicForIssue, workbenchTopics } from "@/domain/preparer-workbench";

describe("preparer workbench topic catalog", () => {
  it("maps every persisted return surface into the workbench", () => {
    const paths = new Set(workbenchTopics.map(({ path }) => path.split(/[?#]/)[0]));
    for (const path of ["", "taxpayer-profile", "return-profile", "intake", "sources", "source-entry", "source-records", "imports", "mapping", "activities", "credits", "advanced", "review", "overrides", "calculation/summary", "outputs"]) expect(paths.has(path)).toBe(true);
  });

  it("searches common language and official form numbers", () => {
    expect(findWorkbenchTopics("daycare")[0]?.id).toBe("dependent-care");
    expect(findWorkbenchTopics("8962")[0]?.id).toBe("ptc");
    expect(findWorkbenchTopics("Schedule F").some(({ id }) => id === "schedule-f")).toBe(true);
  });

  it("routes diagnostics to an actionable topic and constructs stable links", () => {
    const topic = workbenchTopicForIssue({ code: "PTC_RECONCILIATION_REQUIRED", fieldPath: "premiumTaxCredit.policies", message: "Form 8962 is incomplete" });
    expect(topic.id).toBe("ptc");
    expect(topicHref("/clients/abc/years/2025", topic)).toBe("/clients/abc/years/2025/advanced?section=premiumTaxCredit");
    expect(topicHref("/clients/abc/years/2025", workbenchTopics[0])).toBe("/clients/abc/years/2025?topic=overview");
  });
});
