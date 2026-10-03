import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictDialog } from "./ConflictDialog";
import { useTabsStore } from "../stores/tabs";

describe("ConflictDialog", () => {
  beforeEach(() => useTabsStore.setState({ conflict: null, tabs: [], activeRel: null, pendingCloseRel: null }));

  it("无 conflict 时渲染 null", () => {
    const { container } = render(<ConflictDialog />);
    expect(container).toBeEmptyDOMElement();
  });

  it("modified：三个动作各自调用 store action", async () => {
    const spy = vi.spyOn(useTabsStore.getState(), "reloadConflict").mockResolvedValue(undefined);
    useTabsStore.setState({ conflict: { rel: "a.md", reason: "modified" } });
    render(<ConflictDialog />);
    expect(screen.getByText("文件已在编辑器外被修改")).toBeInTheDocument();
    await userEvent.click(screen.getByText("从磁盘重新加载"));
    expect(spy).toHaveBeenCalled();
  });

  it("deleted：显示删除文案并有关闭标签路径", async () => {
    useTabsStore.setState({
      conflict: { rel: "a.md", reason: "deleted" },
      tabs: [{ rel: "a.md", name: "a", content: "x", savedContent: "x", mtimeMillis: 1, encoding: "UTF-8", overrideExternal: false }],
      activeRel: "a.md",
    });
    render(<ConflictDialog />);
    expect(screen.getByText("文件已在外部被删除")).toBeInTheDocument();
    await userEvent.click(screen.getByText("关闭标签"));
    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(useTabsStore.getState().conflict).toBeNull();
  });
});
