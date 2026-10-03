import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./components/EditorPane", () => ({ EditorPane: () => <div>editor-mock</div> }));
vi.mock("./api", () => ({
  api: {
    setVault: vi.fn(),
    getLastVault: vi.fn(async () => null),
    listTree: vi.fn(async () => []),
    readFile: vi.fn(),
    saveFile: vi.fn(),
  },
}));

import App from "./App";

describe("App", () => {
  it("未打开 vault 时显示空状态", async () => {
    render(<App />);
    expect(await screen.findByText("打开一个文件夹，开始笔记")).toBeInTheDocument();
  });
});
