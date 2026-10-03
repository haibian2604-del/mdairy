import type { ReactNode } from "react";

export function AppShell({ sidebar, main, statusBar, hasSidebar }: {
  sidebar: ReactNode; main: ReactNode; statusBar: ReactNode; hasSidebar: boolean;
}) {
  return (
    <div className={`app-shell ${hasSidebar ? "" : "no-vault"}`}>
      {hasSidebar && <aside className="sidebar">{sidebar}</aside>}
      <main className="main-area">{main}</main>
      <footer className="status-bar">{statusBar}</footer>
    </div>
  );
}
