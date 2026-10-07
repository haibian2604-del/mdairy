import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { TabBar } from "./TabBar";
import { useTabsStore } from "../stores/tabs";

describe("TabBar", () => {
  beforeEach(() =>
    useTabsStore.setState({
      tabs: [
        { rel: "a.md", name: "a", content: "", savedContent: "", mtimeMillis: 1, encoding: "UTF-8", overrideExternal: false },
        { rel: "b.md", name: "b", content: "", savedContent: "", mtimeMillis: 1, encoding: "UTF-8", overrideExternal: false },
      ],
      activeRel: "a.md",
    }),
  );

  it("Enter/Space 激活聚焦的标签（role=tab 的 div 无原生键盘激活）", async () => {
    render(<TabBar />);
    const b = screen.getByRole("tab", { name: /b/ });
    b.focus();
    await userEvent.keyboard("{Enter}");
    expect(useTabsStore.getState().activeRel).toBe("b.md");
    await userEvent.keyboard(" ");
    expect(useTabsStore.getState().activeRel).toBe("b.md");
  });
});
