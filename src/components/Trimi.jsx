import './Trimi.css';

/**
 * Trimi - Personaje oficial de capacitación de TrimIA.
 * Ilustración vectorial SVG 100% fiel a la guía "Estados de Capacitación":
 *
 * 4 Estados / Vestimentas oficiales:
 * 1. Bienvenida: Saco azul marino con solapas, camisa blanca, corbata azul, bolsillo con texto "TrimIA", boca alegre y brazo derecho saludando.
 * 2. Capacitación: Auriculares tipo vincha con almohadillas y micrófono curvo, anteojos redondos de marco negro, chaleco gris abotonado, tablet en mano y brazo señalando.
 * 3. Consejo: Moño azul marino, mano en la mejilla pensando, brazo señalando hacia arriba a una bombita de luz (💡) encendida con destellos.
 * 4. Felicitaciones: Ojos en arco de risa (^ ^), boca abierta con lengua, ambos brazos levantados festejando, banda presidencial celeste y blanca con medalla dorada, y confeti multicolor.
 */
export default function Trimi({
  outfit,
  mood = 'saluda',
  size = 80,
  variant, // 'full' | 'avatar'
  isSpeaking = false,
  speaking = false,
  className = '',
  style = {},
  ariaLabel = 'Trimi, asistente de capacitación',
}) {
  const numericSize = Number(size) || 80;
  const isAvatar = variant === 'avatar' || numericSize <= 34;
  const activeSpeaking = isSpeaking || speaking;

  // Determinar vestimenta
  let effectiveOutfit = outfit;
  if (!effectiveOutfit) {
    if (mood === 'festeja') effectiveOutfit = 'felicitaciones';
    else if (mood === 'piensa') effectiveOutfit = 'consejo';
    else if (mood === 'habla') effectiveOutfit = 'capacitacion';
    else effectiveOutfit = 'bienvenida';
  }

  // Dimensiones con proporción esbelta perfecta
  const width = numericSize;
  const height = isAvatar ? numericSize : Math.round((numericSize * 116) / 100);

  // ViewBox:
  // - Avatar: Encuadre cerrado en la cara y gorra
  // - Full: Vista completa con brazos, accesorios y cuerpo
  const viewBox = isAvatar ? '18 14 64 64' : '0 4 100 116';

  return (
    <div
      className={`trimi-container ${className}`.trim()}
      style={{
        width,
        height,
        minWidth: width,
        minHeight: height,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      role="img"
      aria-label={`${ariaLabel} (${effectiveOutfit})`}
    >
      <svg
        className={`trimi-svg ${isAvatar ? 'trimi-avatar' : 'trimi-floating'}`}
        viewBox={viewBox}
        width={width}
        height={height}
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ========================================================= */}
        {/* ELEMENTOS EXTERNOS (Confeti y Bombita de luz)              */}
        {/* ========================================================= */}

        {/* Confeti festivo (Felicitaciones) */}
        {!isAvatar && effectiveOutfit === 'felicitaciones' && (
          <g className="trimi-confetti">
            <rect x="8" y="16" width="3.5" height="6" rx="1" transform="rotate(25 8 16)" fill="#38BDF8" />
            <rect x="88" y="12" width="4" height="6" rx="1" transform="rotate(-35 88 12)" fill="#34D399" />
            <rect x="6" y="50" width="3.5" height="5.5" rx="1" transform="rotate(40 6 50)" fill="#FBBF24" />
            <rect x="90" y="46" width="3.5" height="6" rx="1" transform="rotate(-20 90 46)" fill="#75AADB" />
            <circle cx="16" cy="32" r="2" fill="#F472B6" />
            <circle cx="84" cy="34" r="2" fill="#34D399" />
            <circle cx="12" cy="74" r="1.8" fill="#38BDF8" />
            <circle cx="88" cy="70" r="1.8" fill="#FBBF24" />
          </g>
        )}

        {/* Bombita de ideas encendida 💡 (Consejo) */}
        {!isAvatar && effectiveOutfit === 'consejo' && (
          <g className="trimi-idea-bulb">
            <line x1="82" y1="9" x2="82" y2="4" stroke="#FBBF24" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="89" y1="13" x2="94" y2="10" stroke="#FBBF24" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="75" y1="13" x2="70" y2="10" stroke="#FBBF24" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="82" cy="18" r="7" fill="#FDE047" stroke="#EAB308" strokeWidth="1.2" />
            <path d="M80 19 Q82 15 84 19" stroke="#CA8A04" strokeWidth="1" fill="none" strokeLinecap="round" />
            <rect x="80" y="24" width="4" height="2" rx="0.5" fill="#94A3B8" />
            <rect x="80.8" y="26" width="2.4" height="1" rx="0.3" fill="#64748B" />
          </g>
        )}

        {/* ========================================================= */}
        {/* BRAZOS (Solo en vista completa)                           */}
        {/* ========================================================= */}

        {/* 1. Bienvenida: Brazo izquierdo abajo y derecho saludando arriba */}
        {!isAvatar && effectiveOutfit === 'bienvenida' && (
          <>
            {/* Brazo izquierdo (abajo en reposo) */}
            <path
              d="M 27 68 Q 20 78 18 88"
              stroke="#183B70"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="18" cy="88" r="4" fill="#2F80ED" />

            {/* Brazo derecho (arriba saludando alegre) */}
            <g className="trimi-arm-wave">
              <path
                d="M 73 68 Q 80 58 84 48"
                stroke="#183B70"
                strokeWidth="7"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx="84" cy="48" r="4.2" fill="#2F80ED" />
            </g>
          </>
        )}

        {/* 2. Capacitación: Brazo derecho señalando a la izquierda, izquierdo con tablet */}
        {!isAvatar && effectiveOutfit === 'capacitacion' && (
          <>
            {/* Brazo derecho señalando (👉) */}
            <path
              d="M 27 68 Q 18 64 12 62"
              stroke="#2F80ED"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="12" cy="62" r="3.8" fill="#2F80ED" />

            {/* Brazo izquierdo sosteniendo tablet */}
            <path
              d="M 73 68 Q 78 76 80 84"
              stroke="#2F80ED"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
            />
            {/* Tablet digital */}
            <rect x="74" y="68" width="18" height="24" rx="2.5" fill="#1E293B" stroke="#94A3B8" strokeWidth="0.8" />
            <rect x="76" y="70.5" width="14" height="19" rx="1.5" fill="#93C5FD" />
            <line x1="78.5" y1="74" x2="87.5" y2="74" stroke="#2563EB" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="78.5" y1="78" x2="85" y2="78" stroke="#2563EB" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="75" cy="80" r="3" fill="#2F80ED" />
          </>
        )}

        {/* 3. Consejo: Brazo a la mejilla pensando y brazo señalando al foco */}
        {!isAvatar && effectiveOutfit === 'consejo' && (
          <>
            {/* Mano a la mejilla */}
            <path
              d="M 27 68 Q 21 78 28 80 Q 34 80 36 68"
              stroke="#2F80ED"
              strokeWidth="6.5"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="36" cy="66" r="3.8" fill="#2F80ED" />

            {/* Brazo señalando hacia el foco 💡 */}
            <path
              d="M 73 68 Q 79 50 81 32"
              stroke="#2F80ED"
              strokeWidth="6.5"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="81" cy="30" r="3.8" fill="#2F80ED" />
          </>
        )}

        {/* 4. Felicitaciones: Ambos brazos levantados al aire festejando */}
        {!isAvatar && effectiveOutfit === 'felicitaciones' && (
          <>
            <path
              d="M 27 66 Q 18 52 14 36"
              stroke="#2F80ED"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="14" cy="34" r="4.2" fill="#2F80ED" />

            <path
              d="M 73 66 Q 82 52 86 36"
              stroke="#2F80ED"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="86" cy="34" r="4.2" fill="#2F80ED" />
          </>
        )}

        {/* ========================================================= */}
        {/* CUERPO CÁPSULA (Celeste brillante, proporciones esbeltas)   */}
        {/* ========================================================= */}

        {/* Vincha de auriculares (detrás de la gorra en Capacitación) */}
        {effectiveOutfit === 'capacitacion' && (
          <path
            d="M 24 38 C 23 4, 77 4, 76 38"
            stroke="#1E293B"
            strokeWidth={isAvatar ? 5 : 4}
            fill="none"
          />
        )}

        {/* Cápsula celeste centrada: x=27 a x=73 (ancho 46, rx 23, alto 74) */}
        <rect x="27" y="22" width="46" height="74" rx="23" fill="#2F80ED" />

        {/* Reflejo / Brillo celeste suave en la parte superior izquierda de la cabeza */}
        <ellipse cx="34" cy="34" rx="2.5" ry="6" fill="#8CBCE0" opacity="0.65" transform="rotate(-10 34 34)" />

        {/* Tapa / Gorra superior azul marino: x=18 a x=82 (ancho 64, rx 7, alto 14) */}
        <rect x="18" y="16" width="64" height="14" rx="7" fill="#164E94" />

        {/* ========================================================= */}
        {/* VESTIMENTA SEGÚN ESTADO                                   */}
        {/* ========================================================= */}

        {/* 1. Traje y corbata de Bienvenida */}
        {effectiveOutfit === 'bienvenida' && (
          <g className="trimi-outfit-bienvenida">
            {/* Saco azul marino ajustado al contorno inferior de la cápsula */}
            <path
              d="M 27 60 C 27 60 28 88 36 94 C 41 96.5 59 96.5 64 94 C 72 88 73 60 73 60 Z"
              fill="#183B70"
            />
            {/* Cuello de camisa blanca en V */}
            <polygon points="41,60 50,73 59,60" fill="#FFFFFF" />
            {/* Corbata azul */}
            <polygon points="48.5,63 51.5,63 52.8,76 50,81 47.2,76" fill="#102B52" />
            {/* Solapas del saco */}
            <path d="M 31 60 L 41 71 L 37 73 L 28 62 Z" fill="#122E56" />
            <path d="M 69 60 L 59 71 L 63 73 L 72 62 Z" fill="#122E56" />
            {/* Bolsillo con texto "TrimIA" */}
            {!isAvatar && (
              <>
                <rect x="56" y="78" width="12" height="1.4" rx="0.7" fill="#FFFFFF" fillOpacity="0.85" />
                <text x="62" y="76" fill="#FFFFFF" fontSize="3.3" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                  TrimIA
                </text>
              </>
            )}
          </g>
        )}

        {/* 2. Chaleco gris de Capacitación */}
        {effectiveOutfit === 'capacitacion' && (
          <g className="trimi-outfit-capacitacion">
            {/* Camisa blanca cuello V */}
            <polygon points="40,58 50,72 60,58" fill="#FFFFFF" />
            {/* Chaleco gris pizarra */}
            <path
              d="M 27 60 L 37 60 L 50 72 L 63 60 L 73 60 L 73 86 C 73 92 68 95 62 96 L 50 92 L 38 96 C 32 95 27 92 27 86 Z"
              fill="#475569"
            />
            {!isAvatar && (
              <>
                <circle cx="50" cy="78" r="1.2" fill="#1E293B" />
                <circle cx="50" cy="84" r="1.2" fill="#1E293B" />
              </>
            )}
          </g>
        )}

        {/* 3. Moño de Consejo */}
        {effectiveOutfit === 'consejo' && (
          <g className="trimi-outfit-consejo">
            <polygon points="42,59 50,62.5 42,66" fill="#183B70" />
            <polygon points="58,59 50,62.5 58,66" fill="#183B70" />
            <circle cx="50,62.5" r="2.2" fill="#10284D" />
          </g>
        )}

        {/* 4. Banda Presidencial de Felicitaciones */}
        {effectiveOutfit === 'felicitaciones' && (
          <g className="trimi-outfit-felicitaciones">
            <path d="M 30 62 L 66 89 L 63 93 L 27 66 Z" fill="#75AADB" />
            <path d="M 32 64.5 L 68 91.5 L 65 95.5 L 29 68.5 Z" fill="#FFFFFF" />
            <path d="M 34 67 L 70 94 L 67 98 L 31 71 Z" fill="#75AADB" />
            <circle cx="66" cy="94" r="4.2" fill="#F59E0B" stroke="#D97706" strokeWidth="0.8" />
            <circle cx="66" cy="94" r="1.8" fill="#FDE68A" />
            <rect x="64.8" y="97.5" width="2.8" height="4" rx="0.5" fill="#75AADB" />
          </g>
        )}

        {/* ========================================================= */}
        {/* CARA: OJOS GRANDES BLANCOS, MEJILLAS, BOCA Y ACCESORIOS   */}
        {/* ========================================================= */}

        {/* Ojos de Felicitaciones (Arcos sonrientes ^ ^) */}
        {effectiveOutfit === 'felicitaciones' ? (
          <g className="trimi-eyes-happy">
            <path d="M 35 47 Q 41 39 47 47" stroke="#0F274A" strokeWidth="2.8" fill="none" strokeLinecap="round" />
            <path d="M 53 47 Q 59 39 65 47" stroke="#0F274A" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          </g>
        ) : (
          /* Ojos grandes, expresivos y circulares */
          <g>
            {/* Ojo izquierdo */}
            <g className="trimi-eye-open">
              <ellipse cx="40" cy="45" rx="6.5" ry="7" fill="#FFFFFF" />
              <circle
                cx={effectiveOutfit === 'consejo' ? 39 : 40}
                cy={effectiveOutfit === 'consejo' ? 44 : 45}
                r="3.2"
                fill="#0F274A"
              />
              <circle
                cx={effectiveOutfit === 'consejo' ? 38 : 39}
                cy={effectiveOutfit === 'consejo' ? 43 : 44}
                r="1.1"
                fill="#FFFFFF"
              />
            </g>

            {/* Ojo derecho */}
            <g className="trimi-eye-open-right">
              <ellipse cx="60" cy="45" rx="6.5" ry="7" fill="#FFFFFF" />
              <circle
                cx={effectiveOutfit === 'consejo' ? 59 : 60}
                cy={effectiveOutfit === 'consejo' ? 44 : 45}
                r="3.2"
                fill="#0F274A"
              />
              <circle
                cx={effectiveOutfit === 'consejo' ? 58 : 59}
                cy={effectiveOutfit === 'consejo' ? 43 : 44}
                r="1.1"
                fill="#FFFFFF"
              />
            </g>
          </g>
        )}

        {/* Anteojos redondos (Capacitación) */}
        {effectiveOutfit === 'capacitacion' && (
          <g className="trimi-glasses">
            <circle cx="40" cy="45" r="8.8" stroke="#1E293B" strokeWidth={isAvatar ? 2.2 : 1.8} fill="none" />
            <circle cx="60" cy="45" r="8.8" stroke="#1E293B" strokeWidth={isAvatar ? 2.2 : 1.8} fill="none" />
            <line x1="48.8" y1="45" x2="51.2" y2="45" stroke="#1E293B" strokeWidth={isAvatar ? 2.2 : 1.8} />
          </g>
        )}

        {/* Auriculares / Orejeras (Capacitación - frente) */}
        {effectiveOutfit === 'capacitacion' && (
          <g className="trimi-headset">
            <rect x="20" y="32" width="6.5" height="15" rx="3" fill="#1E293B" />
            <rect x="73.5" y="32" width="6.5" height="15" rx="3" fill="#1E293B" />
            {/* Micrófono hacia la boca */}
            <path
              d="M 75 42 Q 70 56 60 56"
              stroke="#1E293B"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="58.5" cy="56" r="2.4" fill="#1E293B" />
          </g>
        )}

        {/* Mejillas sonrosadas */}
        <circle cx="33" cy="53" r="3.2" fill="#F87171" fillOpacity="0.75" />
        <circle cx="67" cy="53" r="3.2" fill="#F87171" fillOpacity="0.75" />

        {/* Boca */}
        {activeSpeaking ? (
          <g>
            <path className="trimi-mouth-speaking-open" d="M 45 54 Q 50 63 55 54 Z" fill="#0F274A" />
            <path
              className="trimi-mouth-speaking-smile"
              d="M 45 54 Q 50 60 55 54"
              stroke="#0F274A"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        ) : effectiveOutfit === 'bienvenida' ? (
          /* Sonrisa abierta alegre en forma de media luna con lengua */
          <g>
            <path d="M 44 53 Q 50 63 56 53 Z" fill="#0F274A" />
            <path d="M 46 57 Q 50 63 54 57 Z" fill="#F87171" />
          </g>
        ) : effectiveOutfit === 'felicitaciones' ? (
          /* Gran boca abierta de risa con lengua */
          <g>
            <path d="M 43 53 Q 50 65 57 53 Z" fill="#0F274A" />
            <path d="M 45 58 Q 50 65 55 58 Z" fill="#F87171" />
          </g>
        ) : (
          /* Sonrisa agradable en arco */
          <path
            d="M 45 54 Q 50 60 55 54"
            stroke="#0F274A"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
        )}
      </svg>
    </div>
  );
}
