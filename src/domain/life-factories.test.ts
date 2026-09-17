import { describe, expect, it } from "vitest";
import { createLifeDocument } from "./life-storage";
import { initialPlanSteps, uniqueLifeId } from "./life-factories";

describe("transparent outcome templates", () => {
  it.each([
    ["Renew passport before Senegal", "Documents"],
    ["Prepare the trip to Kyoto", "Confirm dates and constraints"],
    ["Finish my job application", "Review the role requirements"],
    ["Prepare for the dentist appointment", "Gather questions and records"],
    ["Return the damaged headphones", "Check requirements and options"],
    ["Move house before winter", "Choose the next move milestone"],
    ["Deliver the quarterly report", "Define the audience and outcome"],
    ["Organize the studio", "Define the next action"],
  ])("uses an editable deterministic template for %s", (title, firstStep) => {
    expect(initialPlanSteps(title)[0]?.title).toBe(firstStep);
  });

  it("keeps long generated entity identities distinct and stable", () => {
    const document = createLifeDocument("2026-09-03");
    const prefix = "plan-renew-my-passport-before-senegal";
    const titles = ["Documents", "Passport photos", "Book appointment"];
    const ids = titles.map((title) => uniqueLifeId(document, "step", `${prefix}-${title}`));
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(titles.map((title) => uniqueLifeId(document, "step", `${prefix}-${title}`)));
  });
});
