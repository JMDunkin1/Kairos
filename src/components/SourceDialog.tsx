import { useRef, type ReactNode } from 'react'

export function SourceDialog({ title, children, label = 'Sources & calculations' }: { title: string; children: ReactNode; label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  return <>
    <button className="text-button" type="button" onClick={() => dialog.current?.showModal()}>{label}</button>
    <dialog ref={dialog} className="source-dialog" aria-label={title} onClick={event => {
      if (event.target === dialog.current) {
        const bounds = dialog.current.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current.close()
      }
    }}>
      <header><h2>{title}</h2><button autoFocus type="button" className="text-button" onClick={() => dialog.current?.close()}>Close</button></header>
      <div className="dialog-body">{children}</div>
    </dialog>
  </>
}
