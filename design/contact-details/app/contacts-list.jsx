// Contacts list page — mimics the original Union UI
function ContactsList({ onSelect }) {
  const [q, setQ] = React.useState('');
  const filter = q.toLowerCase();
  const list = CONTACTS.filter(c => c.name.toLowerCase().includes(filter));
  return (
    <div style={{ background: '#F2F4F7', minHeight: '100%', paddingBottom: 20 }}>
      {/* search */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 12px 8px' }}>
        <div style={{
          flex: 1, background: '#fff', borderRadius: 10, padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}>
          <Icon.Search size={16} />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search name, email, or phone"
            style={{
              border: 'none', outline: 'none', flex: 1, fontSize: 15,
              fontFamily: 'Inter, system-ui', background: 'transparent',
              color: '#1A2433',
            }}
          />
        </div>
        <button style={{
          background: '#fff', border: 'none', borderRadius: 10, padding: '0 12px',
          fontFamily: 'Inter, system-ui', fontSize: 14, color: '#1A2433', cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}>Custom ▾</button>
      </div>
      {/* contact rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 12px' }}>
        {list.map(c => (
          <button key={c.id} onClick={() => onSelect(c)} style={{
            background: '#fff', border: 'none', borderRadius: 10,
            padding: '12px 12px', display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)', cursor: 'pointer',
            textAlign: 'left', width: '100%',
          }}>
            <Avatar id={c.avatar} size={44} name={c.name} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: 'Inter, system-ui', fontSize: 16, fontWeight: 600,
                color: '#1A2433', letterSpacing: -0.2,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {c.name}
                {c.recent && <Icon.Phone size={12} color="#8792A0" />}
              </div>
              {c.relation && (
                <div style={{
                  fontFamily: 'Inter, system-ui', fontSize: 13, color: '#8792A0',
                  marginTop: 2,
                }}>{c.relation}</div>
              )}
            </div>
            <div style={{
              fontFamily: 'Inter, system-ui', fontSize: 13, color: '#8792A0',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {c.lastSeen}
              <Icon.ChevronRight size={14} color="#B8C0CB" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

window.ContactsList = ContactsList;
