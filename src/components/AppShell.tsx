import type { ReactNode } from "react";

export function AppShell({ sidebar, main, statusBar }: {
  sidebar: ReactNode; main: ReactNode; statusBar: ReactNode;
}) {
  // sidebar 为 null（未开 vault 或侧栏收起）→ 编辑区独占整行
  const hasSidebar = sidebar != null;
  return (
    <div className={`app-shell ${hasSidebar ? "" : "no-sidebar"}`}>
      {hasSidebar && <aside className="sidebar">{sidebar}</aside>}
      <main className="main-area">{main}</main>
      <footer className="status-bar">{statusBar}</footer>
    </div>
  );
}
