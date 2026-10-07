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

  it("setThemeMode 三态可设", () => {
    const s = useSettingsStore.getState();
    s.setThemeMode("light");
    expect(useSettingsStore.getState().themeMode).toBe("light");
    s.setThemeMode("dark");
    expect(useSettingsStore.getState().themeMode).toBe("dark");
    s.setThemeMode("system");
    expect(useSettingsStore.getState().themeMode).toBe("system");
  });

  it("persist 写入 mdairy-theme 且只存 themeMode", () => {
    useSettingsStore.getState().setThemeMode("light");
    const raw = localStorage.getItem("mdairy-theme");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state).toEqual({ themeMode: "light" });
    expect(parsed.version).toBe(0);
  });
});
