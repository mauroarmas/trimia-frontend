import { useCallback, useEffect, useState } from 'react';
import ConversationControls from './ConversationControls';
import { salesProspectAction } from '../api';

export default function SalesConversationModal({ token, me, prospect, onClose }) {
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setConversation(await salesProspectAction(token,prospect.id,'conversation')); setError(''); }
    catch (err) { setError(err.message); }
  },[token,prospect.id]);
  useEffect(() => { refresh(); },[refresh]);
  return <div className="modal-overlay"><div className="modal-content" style={{maxWidth:800,maxHeight:'90vh',overflowY:'auto'}}>
    <div style={{display:'flex',justifyContent:'space-between'}}><h3>Conversación con {prospect.name}</h3><button onClick={onClose}>Cerrar</button></div>
    <p className="hint">Los mensajes quedan en el hilo de TrimIA. Cerrá o liberá el control cuando termines de atenderlo.</p>
    {error && <p className="error">{error}</p>}
    {conversation ? <>
      <div className="messages-list">{conversation.messages.map(message => <p key={message.id}><strong>{message.role === 'USER' ? prospect.name : 'Atención'}:</strong> {message.content}</p>)}</div>
      <ConversationControls token={token} me={me} conversation={conversation} onRefresh={refresh} hideNotes actions={{
        takeover: () => salesProspectAction(token,prospect.id,'takeover'),
        release: () => salesProspectAction(token,prospect.id,'release'),
        reply: (_token,_id,message) => salesProspectAction(token,prospect.id,'reply',message),
      }} />
      <button className="secondary" onClick={refresh}>Actualizar conversación</button>
    </> : !error && <p>Cargando conversación...</p>}
  </div></div>;
}
