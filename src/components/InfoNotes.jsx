import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Botón «Info» para las barras horizontales de los módulos y el modal que abre.
 * Las explicaciones de para qué sirve cada pantalla no se borran: quedan a un
 * clic, en vez de ocupar espacio fijo arriba de cada vista.
 */
export function InfoToggle({ open, onToggle }) {
  return (
    <button
      type="button"
      className={`knowledge-tab knowledge-info-toggle${open ? ' active' : ''}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="knowledge-info-icon" aria-hidden="true">i</span> Info
    </button>
  );
}

/**
 * `notes`: lista de `[título, contenido]`. Se cierra con ✕, con Escape o
 * haciendo clic fuera del cuadro.
 */
export default function InfoNotes({ notes, title = 'Cómo funciona esta sección', onClose }) {
  const cerrarRef = useRef(null);
  // Quien lo usa pasa `onClose` en línea: se guarda en una ref para que el efecto
  // corra una sola vez al abrir, y no robe el foco en cada render del padre.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previo = document.activeElement;
    cerrarRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape') onCloseRef.current?.();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Al cerrar, el foco vuelve al botón «Info» que lo abrió.
      previo?.focus?.();
    };
  }, []);

  if (!notes?.length) return null;

  return createPortal(
    <div className="modal-overlay info-modal-overlay" onClick={onClose}>
      <div
        className="info-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="info-modal-header">
          <div className="info-modal-heading">
            <span className="info-modal-icon" aria-hidden="true">i</span>
            <div>
              <span className="info-modal-kicker">Info</span>
              <h3 id="info-modal-title">{title}</h3>
            </div>
          </div>
          <button
            ref={cerrarRef}
            type="button"
            className="info-modal-close"
            aria-label="Cerrar"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="info-modal-body">
          {notes.map(([titulo, contenido]) => (
            <section key={titulo} className="info-modal-note">
              <h4>{titulo.replace(/\.$/, '')}</h4>
              <p>{contenido}</p>
            </section>
          ))}
        </div>

        <footer className="info-modal-footer">
          <button type="button" className="knowledge-primary-button" onClick={onClose}>
            Entendido
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
