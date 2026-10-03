import type { ReactNode } from "react";

export function AppShell({ sidebar, main, statusBar }: {
  sidebar: ReactNode; main: ReactNode; statusBar: ReactNode;
}) {
  const hasSidebar = sidebar != null;
  return (
    <div className={`app-shell ${hasSidebar ? "" : "no-vault"}`}>
      {hasSidebar && <aside className="sidebar">{sidebar}</aside>}
      <main className="main-area">{main}</main>
      <footer className="status-bar">{statusBar}</footer>
    </div>
  );
}
