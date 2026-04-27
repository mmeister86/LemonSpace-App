import { describe, expect, it } from "vitest";

import {
  buildNodeDonePatch,
  buildNodeErrorPatch,
  buildNodeExecutingPatch,
  buildNodeRetryPatch,
  mergeNodeData,
} from "@/convex/node_status_helpers";

describe("node status patch helpers", () => {
  it("builds executing, retry, done, and error patches consistently", () => {
    expect(buildNodeExecutingPatch()).toEqual({
      status: "executing",
      retryCount: 0,
      statusMessage: undefined,
    });

    expect(
      buildNodeRetryPatch({
        retryCount: 2,
        statusMessage: "Retry 2/3 - provider",
      }),
    ).toEqual({
      status: "executing",
      retryCount: 2,
      statusMessage: "Retry 2/3 - provider",
    });

    expect(buildNodeDonePatch({ retryCount: 1 })).toEqual({
      status: "done",
      retryCount: 1,
      statusMessage: undefined,
    });

    expect(
      buildNodeErrorPatch({
        retryCount: 3,
        statusMessage: "Provider: failed",
      }),
    ).toEqual({
      status: "error",
      retryCount: 3,
      statusMessage: "Provider: failed",
    });
  });

  it("centralizes data merge behavior while preserving explicit undefined cleanup", () => {
    expect(
      mergeNodeData(
        { previous: true, taskId: "task-1", keep: "value" },
        { taskId: undefined, next: 42 },
      ),
    ).toEqual({
      previous: true,
      taskId: undefined,
      keep: "value",
      next: 42,
    });
  });
});
