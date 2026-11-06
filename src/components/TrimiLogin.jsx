import { useEffect, useState, useMemo } from 'react';
import './TrimiLogin.css';

/**
 * TrimiLogin - Réplica vectorial 100% fiel a la mascota oficial de TrimIA
 * para la pantalla de Login (según mockup oficial media_1793924789595_fdc33efb.jpg).
 *
 * Anatomía y detalles exactos:
 * - Gorra azul marino en pastilla inclinada (-14.5°) con destellos y ondas de movimiento a la izquierda.
 * - Cabeza y cuerpo con forma cónica suave (más angosta arriba, más ancha abajo) y reflejo celeste en la parte superior izquierda.
 * - Ojos grandes y redondos con pupilas oscuras y destellos blancos de brillo.
 * - Mejillas ovaladas inclinadas color salmón/coral.
 * - Boca sonriente con lengua rosada visible.
 * - Traje azul marino con cuello en V blanco y corbata roja con nudo.
 * - Mano izquierda: apoyada en el borde de la tarjeta con el pulgar hacia arriba (thumbs up).
 * - Brazo derecho: levantado saludando alegremente con 3 destellos y ondas de saludo.
 *
 * Interacciones:
 * 1. Entrada fluida con rebote elástico (peekaboo) y globo: "¡Qué bueno verte de nuevo!".
 * 2. Al escribir Email: Se apoya en el borde y sus pupilas siguen el cursor de escritura.
 * 3. Al enfocar Contraseña: Se tapa ambos ojos con las manos respetando la privacidad.
 * 4. Si activa "Ver contraseña": Baja una mano y espía con picardía por entre los dedos.
 */
export default function TrimiLogin({
  focusedField = null, // 'email' | 'password' | null
  emailValue = '',
  showPassword = false,
  onGreetingComplete,
}) {
  const [isInitialGreeting, setIsInitialGreeting] = useState(true);
  const [showGreetingBubble, setShowGreetingBubble] = useState(true);

  // Al cargar, saluda con la mano arriba durante 3.2s
  useEffect(() => {
    const greetingTimer = setTimeout(() => {
      setIsInitialGreeting(false);
      setShowGreetingBubble(false);
      if (onGreetingComplete) onGreetingComplete();
    }, 3400);

    return () => {
      clearTimeout(greetingTimer);
    };
  }, [onGreetingComplete]);

  // Si el usuario empieza a interactuar antes, ocultamos el globo
  useEffect(() => {
    if (focusedField) {
      setShowGreetingBubble(false);
    }
  }, [focusedField]);

  // Estado del personaje
  const mascotMode = useMemo(() => {
    if (focusedField === 'password') {
      return showPassword ? 'peeking' : 'covering_eyes';
    }
    if (focusedField === 'email') {
      return 'watching_email';
    }
    if (isInitialGreeting) {
      return 'greeting';
    }
    return 'idle';
  }, [focusedField, showPassword, isInitialGreeting]);

  // Cálculo de la mirada interactiva al escribir email
  const emailProgress = Math.min(Math.max((emailValue.length || 0) / 30, 0), 1);
  const pupilOffsetX = (emailProgress - 0.5) * 5.2;

  const isCovering = mascotMode === 'covering_eyes';
  const isPeeking = mascotMode === 'peeking';
  const isWatchingEmail = mascotMode === 'watching_email';
  const isGreeting = mascotMode === 'greeting';

  return (
    <div className={`trimi-login-scene mode-${mascotMode}`}>
      {/* Globo flotante de bienvenida */}
      {showGreetingBubble && (
        <div className="trimi-login-bubble" role="status" aria-live="polite">
          <span>¡Qué bueno verte de nuevo! 👋</span>
          <div className="trimi-login-bubble-arrow" />
        </div>
      )}

      <svg
        className="trimi-login-svg"
        viewBox="0 0 205 146"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <filter id="trimi-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#0F172A" floodOpacity="0.22" />
          </filter>
        </defs>

        {/* ========================================================= */}
        {/* ONDAS DE MOVIMIENTO A LA IZQUIERDA DE LA GORRA             */}
        {/* ========================================================= */}
        {isGreeting && (
          <g className="trimi-cap-waves">
            <path
              d="M 38 42 C 34 37 34 31 38 26"
              stroke="#4C89C0"
              strokeWidth="2.4"
              strokeLinecap="round"
              fill="none"
              className="trimi-wave-arc arc-1"
            />
            <path
              d="M 46 45 C 41 39 41 31 46 25"
              stroke="#4C89C0"
              strokeWidth="2.4"
              strokeLinecap="round"
              fill="none"
              className="trimi-wave-arc arc-2"
            />
          </g>
        )}

        {/* ========================================================= */}
        {/* CUERPO PRINCIPAL (Cápsula cónica con leve inclinación)    */}
        {/* ========================================================= */}
        <g className={`trimi-body-group ${isWatchingEmail ? 'leaning' : ''}`}>
          {/* Cuerpo azul fiel al diseño: más esbelto arriba, ensancha hacia los hombros */}
          <path
            d="M 73 45 C 69 70 69 94 62 120 L 155 120 C 147 94 148 70 144 45 Z"
            fill="#4C89C0"
          />

          {/* Reflejo / Brillo celeste suave en la parte superior izquierda de la cabeza */}
          <ellipse
            cx="78"
            cy="63"
            rx="4.5"
            ry="11"
            transform="rotate(-14 78 63)"
            fill="#8CBCE0"
            opacity="0.88"
          />

          {/* Gorra oficial en pastilla (Navy #235DA6, inclinada -14.5°) */}
          <g transform="rotate(-14.5 100 36)">
            <rect
              x="46"
              y="24"
              width="108"
              height="24"
              rx="12"
              fill="#235DA6"
            />
            {/* Brillo curvo sutil sobre la gorra */}
            <path
              d="M 62 30 Q 100 27 138 30"
              stroke="#3B82C4"
              strokeWidth="2.6"
              strokeLinecap="round"
              opacity="0.65"
            />
          </g>

          {/* ========================================================= */}
          {/* OJOS GRANDES Y EXPRESIVOS CON DESTELLO DE LUZ             */}
          {/* ========================================================= */}
          <g className="trimi-eyes">
            {/* OJO IZQUIERDO */}
            <g className="trimi-eye-left">
              <ellipse cx="91" cy="78" rx="10" ry="11" fill="#FFFFFF" />
              {/* Pupila interactiva */}
              <circle
                cx={isWatchingEmail ? 91 + pupilOffsetX : 93}
                cy={isWatchingEmail ? 81 : 79}
                r={isCovering ? 0 : 5.6}
                fill="#1E293B"
                className="trimi-pupil"
              />
              {/* Destello blanco en la pupila */}
              {!isCovering && (
                <circle
                  cx={isWatchingEmail ? 89.2 + pupilOffsetX : 91.2}
                  cy={isWatchingEmail ? 79.2 : 77.2}
                  r="2"
                  fill="#FFFFFF"
                />
              )}
            </g>

            {/* OJO DERECHO */}
            <g className="trimi-eye-right">
              <ellipse cx="119" cy="74" rx="10" ry="11" fill="#FFFFFF" />
              {/* Pupila interactiva */}
              <circle
                cx={
                  isPeeking
                    ? 121
                    : isWatchingEmail
                    ? 117 + pupilOffsetX
                    : 119
                }
                cy={isPeeking ? 77 : isWatchingEmail ? 77 : 74}
                r={isCovering ? 0 : 5.6}
                fill="#1E293B"
                className="trimi-pupil"
              />
              {/* Destello blanco en la pupila */}
              {!isCovering && (
                <circle
                  cx={
                    isPeeking
                      ? 122.8
                      : isWatchingEmail
                      ? 115.2 + pupilOffsetX
                      : 117.2
                  }
                  cy={isPeeking ? 75.2 : isWatchingEmail ? 75.2 : 72.2}
                  r="2"
                  fill="#FFFFFF"
                />
              )}
            </g>
          </g>

          {/* ========================================================= */}
          {/* MEJILLAS OVALADAS INCLINADAS COLOR CORAL / SALMÓN          */}
          {/* ========================================================= */}
          <ellipse
            cx="86"
            cy="92"
            rx="7.2"
            ry="4.2"
            transform="rotate(-14.5 86 92)"
            fill="#EAA09D"
          />
          <ellipse
            cx="130"
            cy="83"
            rx="7.2"
            ry="4.2"
            transform="rotate(-14.5 130 83)"
            fill="#EAA09D"
          />

          {/* ========================================================= */}
          {/* BOCA ALEGRE CON LENGUA ROSADA                             */}
          {/* ========================================================= */}
          <g className="trimi-mouth">
            {isCovering ? (
              // Boca redondeada / tímida al taparse los ojos
              <ellipse cx="109" cy="94" rx="4.5" ry="5.5" fill="#1E293B" />
            ) : isWatchingEmail ? (
              // Sonrisa atenta concentrada mirando el campo
              <path
                d="M 101 92 Q 109 99 117 90"
                stroke="#1E293B"
                strokeWidth="2.8"
                strokeLinecap="round"
                fill="none"
              />
            ) : (
              // Boca abierta sonriente con lengua visible (exacto al diseño)
              <g>
                <path
                  d="M 100 89 Q 109 87 119 87 Q 120 102 110 103 Q 100 101 100 89 Z"
                  fill="#1E293B"
                />
                <path
                  d="M 104 97 Q 109 94 115 95 Q 112 102 108 102 Q 104 101 104 97 Z"
                  fill="#EAA09D"
                />
              </g>
            )}
          </g>

          {/* ========================================================= */}
          {/* TRAJE AZUL MARINO, CUELLO BLANCO Y CORBATA ROJA           */}
          {/* ========================================================= */}
          <g className="trimi-suit">
            {/* Base del saco */}
            <path d="M 62 118 L 155 118 L 155 143 L 62 143 Z" fill="#24416B" />

            {/* Cuello de la camisa blanca en V */}
            <polygon points="104,116 128,112 117,133" fill="#FFFFFF" />

            {/* Nudo de la corbata roja */}
            <polygon points="114,121 120,120 119,126 115,127" fill="#B91C1C" />

            {/* Cuerpo de la corbata roja */}
            <polygon points="115,127 119,126 123,142 117,144 112,143" fill="#D74E3E" />

            {/* Solapas del saco azul marino */}
            <polygon points="62,118 105,116 116,134 94,143 62,143" fill="#24416B" />
            <polygon points="155,118 126,113 118,134 135,143 155,143" fill="#1C3558" />
          </g>
        </g>

        {/* ========================================================= */}
        {/* BRAZOS Y MANOS CON INTERACTIVIDAD                         */}
        {/* ========================================================= */}

        {/* 1. BRAZO IZQUIERDO (Viewer's left) */}
        <g className={`trimi-arm-left ${isCovering || isPeeking ? 'covering' : 'resting'}`}>
          {isCovering || isPeeking ? (
            // Brazo subido tapando el ojo izquierdo
            <g className="trimi-arm-cover-left">
              <path
                d="M 68 120 Q 56 100 82 82"
                stroke="#4C89C0"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
              />
              <g filter="url(#trimi-shadow)">
                <ellipse cx="88" cy="78" rx="9" ry="8" fill="#4C89C0" />
                <circle cx="82" cy="76" r="3.2" fill="#3B82C4" />
                <circle cx="87" cy="74" r="3.2" fill="#3B82C4" />
                <circle cx="92" cy="76" r="3.2" fill="#3B82C4" />
              </g>
            </g>
          ) : (
            // Mano izquierda con pulgar arriba (thumbs up) apoyada en el borde de la tarjeta
            <g className="trimi-arm-rest-left" filter="url(#trimi-shadow)">
              <path
                d="M 64 122 Q 78 130 92 140"
                stroke="#24416B"
                strokeWidth="8.5"
                strokeLinecap="round"
                fill="none"
              />
              {/* Mano azul */}
              <ellipse cx="94" cy="142" rx="7.5" ry="6.2" fill="#4C89C0" />
              {/* Pulgar apuntando hacia arriba */}
              <path
                d="M 90 141 C 89 133 93 126 96 126 C 99 126 100 133 98 140 Z"
                fill="#4C89C0"
              />
            </g>
          )}
        </g>

        {/* 2. BRAZO DERECHO (Viewer's right) */}
        <g
          className={`trimi-arm-right ${
            isCovering
              ? 'covering'
              : isPeeking
              ? 'peeking'
              : isWatchingEmail
              ? 'resting-right'
              : 'waving'
          }`}
        >
          {isCovering ? (
            // Brazo subido tapando el ojo derecho
            <g className="trimi-arm-cover-right">
              <path
                d="M 150 120 Q 160 100 128 78"
                stroke="#4C89C0"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
              />
              <g filter="url(#trimi-shadow)">
                <ellipse cx="122" cy="74" rx="9" ry="8" fill="#4C89C0" />
                <circle cx="118" cy="72" r="3.2" fill="#3B82C4" />
                <circle cx="123" cy="70" r="3.2" fill="#3B82C4" />
                <circle cx="128" cy="72" r="3.2" fill="#3B82C4" />
              </g>
            </g>
          ) : isPeeking ? (
            // Mano bajada a medias espiando con un ojo
            <g className="trimi-arm-peek-right">
              <path
                d="M 150 120 Q 162 104 128 90"
                stroke="#4C89C0"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
              />
              <g filter="url(#trimi-shadow)">
                <ellipse cx="124" cy="88" rx="8.5" ry="7" fill="#4C89C0" />
                <circle cx="120" cy="86" r="2.8" fill="#3B82C4" />
                <circle cx="125" cy="84" r="2.8" fill="#3B82C4" />
                <circle cx="130" cy="86" r="2.8" fill="#3B82C4" />
              </g>
            </g>
          ) : isWatchingEmail ? (
            // Brazo derecho apoyado en el borde mirando el email
            <g className="trimi-arm-rest-right" filter="url(#trimi-shadow)">
              <path
                d="M 150 122 Q 142 132 130 140"
                stroke="#1C3558"
                strokeWidth="8.5"
                strokeLinecap="round"
                fill="none"
              />
              <ellipse cx="128" cy="142" rx="7.5" ry="6.2" fill="#4C89C0" />
              <ellipse cx="124" cy="143" rx="2.4" ry="3.8" fill="#3B82C4" />
              <ellipse cx="128" cy="144" rx="2.4" ry="4" fill="#3B82C4" />
              <ellipse cx="132" cy="143" rx="2.4" ry="3.8" fill="#3B82C4" />
            </g>
          ) : (
            // Brazo derecho saludando alegremente en el aire (exacto al diseño)
            <g className="trimi-arm-wave-group">
              {/* Manga del saco azul marino */}
              <path
                d="M 144 114 Q 156 102 163 87"
                stroke="#24416B"
                strokeWidth="9"
                strokeLinecap="round"
                fill="none"
              />
              {/* Mano azul saludando en forma de manopla con pulgar */}
              <g className="trimi-arm-wave-active" filter="url(#trimi-shadow)">
                <ellipse
                  cx="170"
                  cy="73"
                  rx="7.5"
                  ry="6.5"
                  transform="rotate(-15 170 73)"
                  fill="#4C89C0"
                />
                <path
                  d="M 163 74 C 160 70 160 66 163 65 C 166 64 168 67 167 72 Z"
                  fill="#4C89C0"
                />
              </g>

              {/* 3 Destellos / líneas radiales de saludo */}
              <line x1="173" y1="53" x2="177" y2="44" stroke="#235DA6" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="183" y1="62" x2="194" y2="59" stroke="#235DA6" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="183" y1="75" x2="193" y2="76" stroke="#235DA6" strokeWidth="2.4" strokeLinecap="round" />

              {/* Ondas curvas de saludo */}
              <path
                d="M 179 89 C 185 93 185 99 179 104"
                stroke="#4C89C0"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
                className="trimi-wave-arc arc-1"
              />
              <path
                d="M 186 86 C 193 91 193 102 186 108"
                stroke="#4C89C0"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
                className="trimi-wave-arc arc-2"
              />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
