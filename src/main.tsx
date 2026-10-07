import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// 首帧渲染前同步落主题 token：暗色用户冷启动不闪一帧浅色。
// 解析逻辑与 App 内 effect 一致：持久化的 light/dark 直接生效，system 用 matchMedia 解析
try {
  const saved = JSON.parse(localStorage.getItem("mdairy-theme") ?? "null")?.state?.themeMode;
  document.documentElement.dataset.theme =
    saved === "light" || saved === "dark"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
} catch {
  document.documentElement.dataset.theme = "light";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
