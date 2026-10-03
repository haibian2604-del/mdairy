import { useTabsStore } from "../stores/tabs";

export function CloseConfirmDialog() {
  const pendingCloseRel = useTabsStore((s) => s.pendingCloseRel);
  const confirmClose = useTabsStore((s) => s.confirmClose);
  const discardClose = useTabsStore((s) => s.discardClose);
  const cancelClose = useTabsStore((s) => s.cancelClose);
  if (!pendingCloseRel) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="未保存更改">
      <div className="modal-panel">
        <h2>有未保存的更改</h2>
        <p className="modal-desc">「{useTabsStore.getState().tabs.find((t) => t.rel === pendingCloseRel)?.name ?? pendingCloseRel}」尚未保存，关闭前如何处理？</p>
        <div className="modal-actions">
          <button className="btn-primary" onClick={() => void confirmClose()}>保存并关闭</button>
          <button className="btn" onClick={discardClose}>放弃更改</button>
          <button className="btn" onClick={cancelClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
