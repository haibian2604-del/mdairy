import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./settings";

describe("settingsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ themeMode: "system" });
  });

  it("默认 themeMode 为 system", () => {
    expect(useSettingsStore.getState().themeMode).toBe("system");
  });

  it("cycleTheme 循环 system→light→dark→system", () => {
    const s = useSettingsStore.getState();
    s.cycleTheme();
    expect(useSettingsStore.getState().themeMode).toBe("light");
    s.cycleTheme();
    expect(useSettingsStore.getState().themeMode).toBe("dark");
    s.cycleTheme();
    expect(useSettingsStore.getState().themeMode).toBe("system");
  });

  it("persist 写入 mdairy-theme 且只存 themeMode", () => {
    useSettingsStore.getState().cycleTheme();
    const raw = localStorage.getItem("mdairy-theme");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state).toEqual({ themeMode: "light" });
    expect(parsed.version).toBe(0);
  });
});
