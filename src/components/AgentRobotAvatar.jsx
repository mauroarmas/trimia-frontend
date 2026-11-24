import { AGENT_BOT_THEMES } from '../agentBotThemes';

export default function AgentRobotAvatar({
  agentType,
  label,
  size = 'card',
  paused = false,
}) {
  const theme = AGENT_BOT_THEMES[agentType] || AGENT_BOT_THEMES.SALES;
  const isModal = size === 'lg';
  const isSmall = size === 'sm';
  const pxWidth = isSmall ? 40 : isModal ? 50 : 96;
  const pxHeight = isSmall ? 40 : isModal ? 50 : 98;
  const animate = !isModal && !paused;

  const svg = (
    <svg
      className={`sup-bot-svg${isModal ? ' is-lg' : ''}${isSmall ? ' is-sm' : ''}${paused ? ' is-paused' : ''}`}
      viewBox="0 0 96 98"
      width={pxWidth}
      height={pxHeight}
      role={isModal ? undefined : 'img'}
      aria-label={isModal ? undefined : label}
      aria-hidden={isModal ? 'true' : undefined}
      style={
        isModal || isSmall
          ? { '--agent-c': theme.c, '--agent-soft': theme.soft, '--agent-ink': theme.ink, '--agent-d': '0s' }
          : undefined
      }
    >
      {!isModal && !isSmall && (
        <ellipse
          className="sup-bot-shadow"
          cx="48"
          cy="94"
          rx="18"
          ry="3"
          fill="#0f172a"
          opacity=".14"
        />
      )}
      <g className={animate ? 'sup-bot-float' : undefined}>
        <line
          x1="48"
          y1="11"
          x2="48"
          y2="21"
          stroke="var(--agent-c)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle
          className={animate ? 'sup-bot-ant' : undefined}
          cx="48"
          cy="8"
          r="4.5"
          fill={paused ? '#94a3b8' : 'var(--agent-c)'}
        />
        <rect x="12" y="34" width="7" height="14" rx="3.5" fill="var(--agent-c)" />
        <rect x="77" y="34" width="7" height="14" rx="3.5" fill="var(--agent-c)" />
        <rect
          x="20"
          y="20"
          width="56"
          height="44"
          rx="16"
          fill="var(--agent-soft)"
          stroke="var(--agent-c)"
          strokeWidth="3"
        />
        <rect x="28" y="29" width="40" height="26" rx="11" fill="#0f172a" />
        <g className={animate ? 'sup-bot-eyes' : undefined}>
          <ellipse cx="40" cy="41" rx="4.5" ry="5.5" fill="#ffffff" />
          <ellipse cx="56" cy="41" rx="4.5" ry="5.5" fill="#ffffff" />
        </g>
        <path
          d={paused ? 'M42 51 h12' : 'M42 50 q6 4 12 0'}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          opacity=".85"
        />
        <rect x="30" y="67" width="36" height="22" rx="10" fill="var(--agent-c)" />
        <path
          d={theme.chestPath}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          className={animate ? 'sup-bot-arm' : undefined}
          x="64"
          y="70"
          width="16"
          height="7"
          rx="3.5"
          fill="var(--agent-c)"
        />
      </g>
    </svg>
  );

  if (isModal) {
    return <span className="sup-agent-modal-avatar">{svg}</span>;
  }

  return svg;
}
