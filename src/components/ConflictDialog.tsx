import { Modal } from "./Modal";
import { useTabsStore } from "../stores/tabs";

export function ConflictDialog() {
  const conflict = useTabsStore((s) => s.conflict);
  const reloadConflict = useTabsStore((s) => s.reloadConflict);
  const keepConflict = useTabsStore((s) => s.keepConflict);
  const dismissConflict = useTabsStore((s) => s.dismissConflict);
  const close = useTabsStore((s) => s.close);
  if (!conflict) return null;

  return (
    <Modal label={conflict.reason === "modified" ? "文件已被外部修改" : "文件已被外部删除"} onClose={dismissConflict}>
      <h1>{conflict.reason === "modified" ? "文件已在编辑器外被修改" : "文件已在外部被删除"}</h1>
      <p className="modal-desc">
        {conflict.reason === "modified"
          ? "磁盘上的版本与编辑器中的版本不一致，请选择如何处理。"
          : "该文件在磁盘上已不存在，编辑器中仍有未保存的修改。"}
      </p>
      <div className="modal-actions">
        {conflict.reason === "modified" ? (
          <>
            <button className="btn-primary" onClick={() => void reloadConflict()}>从磁盘重新加载</button>
            <button className="btn" onClick={keepConflict}>保留我的版本</button>
            <button className="btn" onClick={dismissConflict}>取消</button>
          </>
        ) : (
          <>
            <button className="btn-primary" onClick={keepConflict}>在编辑器中保留（保存时重建）</button>
            <button className="btn" onClick={() => { close(conflict.rel); dismissConflict(); }}>关闭标签</button>
            <button className="btn" onClick={dismissConflict}>取消</button>
          </>
        )}
      </div>
    </Modal>
  );
}
