import { buildConversationFeed } from '../conversationHelpers';

export function MessageActorAvatar({
  actorType,
  accent = '#2563eb',
  bg = '#eff6ff',
  border = '#bfdbfe',
}) {
  if (actorType === 'CLIENT') {
    return (
      <div
        className="sup-msg-avatar is-client"
        style={{ backgroundColor: bg, color: accent, borderColor: border }}
        title="Cliente"
        aria-hidden="true"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
    );
  }

  if (actorType === 'EMPLOYEE') {
    return (
      <div
        className="sup-msg-avatar is-employee"
        style={{ backgroundColor: bg, color: accent, borderColor: border }}
        title="Empleado interno"
        aria-hidden="true"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      </div>
    );
  }

  if (actorType === 'SUPERVISOR') {
    return (
      <div
        className="sup-msg-avatar is-supervisor"
        style={{ backgroundColor: bg, color: accent, borderColor: border }}
        title="Supervisor (intervención humana)"
        aria-hidden="true"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinejoin="round" />
          <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="sup-msg-avatar is-agent"
      style={{ backgroundColor: bg, color: accent, borderColor: border }}
      title="Agente de Inteligencia Artificial"
      aria-hidden="true"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="8" width="18" height="12" rx="3" />
        <path d="M12 4v4" strokeLinecap="round" />
        <circle cx="12" cy="3" r="1" fill="currentColor" />
        <circle cx="9" cy="14" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="15" cy="14" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}

export default function ConversationThread({
  conversation,
  me,
  className = '',
  emptyMessage = 'Esta conversación no tiene mensajes todavía.',
}) {
  const feedItems = buildConversationFeed(conversation, me);

  return (
    <div className={`sup-chat-thread ${className}`.trim()}>
      {feedItems.length === 0 ? (
        <p className="sup-chat-empty">{emptyMessage}</p>
      ) : (
        feedItems.map((item) => {
          if (item.kind === 'milestone') {
            return (
              <div
                key={item.id}
                className={`sup-chat-milestone is-${item.variant}`}
              >
                <span className="sup-chat-milestone-pill">
                  {item.variant === 'takeover' && '🛡️ '}
                  {item.variant === 'release' && '🤖 '}
                  {item.variant === 'escalated' && '⚠️ '}
                  {item.label} ·{' '}
                  {new Date(item.createdAt).toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            );
          }

          const { message: m, actor } = item;
          const isLeft = actor.side === 'left';

          return (
            <div
              key={item.id}
              className={`sup-chat-bubble-row ${
                isLeft ? 'is-user' : 'is-assistant'
              } actor-${actor.actorType.toLowerCase()}`}
            >
              <MessageActorAvatar
                actorType={actor.actorType}
                accent={actor.accent}
                bg={actor.bg}
                border={actor.border}
              />
              <div className="sup-chat-bubble">
                <div className="sup-chat-meta">
                  <div className="sup-chat-author-group">
                    <strong>{actor.title}</strong>
                    <span
                      className={`sup-chat-role-tag is-${actor.actorType.toLowerCase()}`}
                    >
                      {actor.badge}
                    </span>
                  </div>
                  <time className="sup-chat-time">
                    {new Date(m.createdAt).toLocaleString('es-AR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <p>{m.content}</p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

