import { Modal } from "./Modal";
import { useTabsStore } from "../stores/tabs";

export function CloseConfirmDialog() {
  const pendingCloseRel = useTabsStore((s) => s.pendingCloseRel);
  const confirmClose = useTabsStore((s) => s.confirmClose);
  const discardClose = useTabsStore((s) => s.discardClose);
  const cancelClose = useTabsStore((s) => s.cancelClose);
  if (!pendingCloseRel) return null;

  return (
    <Modal label="未保存更改" onClose={cancelClose}>
      <h1>有未保存的更改</h1>
      <p className="modal-desc">「{useTabsStore.getState().tabs.find((t) => t.rel === pendingCloseRel)?.name ?? pendingCloseRel}」尚未保存，关闭前如何处理？</p>
      <div className="modal-actions">
        <button className="btn-primary" onClick={() => void confirmClose()}>保存并关闭</button>
        <button className="btn" onClick={discardClose}>放弃更改</button>
        <button className="btn" onClick={cancelClose}>取消</button>
      </div>
    </Modal>
  );
}
