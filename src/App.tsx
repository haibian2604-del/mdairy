import { AppShell } from "./components/AppShell";

export default function App() {
  return (
    <AppShell hasSidebar={false} sidebar={null} main={
      <div className="empty-state">
        <p>打开一个文件夹，开始笔记</p>
      </div>
    } statusBar={<span />} />
  );
}
