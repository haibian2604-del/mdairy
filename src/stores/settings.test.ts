import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./settings";

describe("settingsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ viewMode: "split" });
  });

  it("默认 split，setViewMode 生效并持久化", () => {
    expect(useSettingsStore.getState().viewMode).toBe("split");
    useSettingsStore.getState().setViewMode("preview");
    expect(useSettingsStore.getState().viewMode).toBe("preview");
    expect(JSON.parse(localStorage.getItem("mdairy-settings")!)).toMatchObject({ state: { viewMode: "preview" } });
  });

  it("cycleViewMode 按 edit→split→preview→edit 循环", () => {
    useSettingsStore.getState().setViewMode("edit");
    useSettingsStore.getState().cycleViewMode();
    expect(useSettingsStore.getState().viewMode).toBe("split");
    useSettingsStore.getState().cycleViewMode();
    expect(useSettingsStore.getState().viewMode).toBe("preview");
    useSettingsStore.getState().cycleViewMode();
    expect(useSettingsStore.getState().viewMode).toBe("edit");
  });
});
