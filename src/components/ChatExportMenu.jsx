import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { downloadMarkdownFile } from '../chatExport';

/**
 * Botón discreto de 3 puntos (⋮) para la esquina superior derecha de los chats,
 * con menú contextual para exportar la conversación como archivo Markdown (.md).
 */
export default function ChatExportMenu({
  filename = 'chat',
  getMarkdown,
  disabled = false,
  variant = 'default',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const updateCoords = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rightOffset = Math.max(8, window.innerWidth - rect.right);
    const topOffset = Math.min(window.innerHeight - 60, rect.bottom + 6);
    setCoords({ top: topOffset, right: rightOffset });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updateCoords();

    function handlePointerDown(e) {
      if (
        triggerRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function handleViewportChange() {
      setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, updateCoords]);

  function handleToggle(e) {
    e.stopPropagation();
    if (!open) updateCoords();
    setOpen((prev) => !prev);
  }

  function handleExportClick(e) {
    e.stopPropagation();
    if (disabled || typeof getMarkdown !== 'function') return;
    const md = getMarkdown();
    if (md) {
      downloadMarkdownFile(filename, md);
    }
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`chat-more-btn ${
          variant === 'inverse' ? 'is-inverse' : ''
        } ${open ? 'is-open' : ''} ${className}`.trim()}
        onClick={handleToggle}
        aria-label="Más opciones del chat"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Opciones del chat"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="chat-more-menu"
            role="menu"
            style={{ top: coords.top, right: coords.right }}
          >
            <button
              type="button"
              role="menuitem"
              className="chat-more-item"
              disabled={disabled}
              onClick={handleExportClick}
              title={
                disabled
                  ? 'Todavía no hay mensajes para exportar'
                  : 'Descargar conversación en formato Markdown (.md)'
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Exportar chat (.md)</span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
