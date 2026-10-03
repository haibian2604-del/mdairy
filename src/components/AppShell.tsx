import type { ReactNode } from "react";

export function AppShell({ sidebar, main, right, statusBar }: {
  sidebar: ReactNode; main: ReactNode; right?: ReactNode; statusBar: ReactNode;
}) {
  const hasSidebar = sidebar != null;
  return (
    <div className={`app-shell ${hasSidebar ? "" : "no-vault"} ${right != null ? "has-right" : ""}`}>
      {hasSidebar && <aside className="sidebar">{sidebar}</aside>}
      <main className="main-area">{main}</main>
      {right != null && <aside className="right-panel">{right}</aside>}
      <footer className="status-bar">{statusBar}</footer>
    </div>
  );
}
