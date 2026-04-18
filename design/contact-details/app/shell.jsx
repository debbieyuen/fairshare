// Union app shell components — header, tab bar, avatar
const UNION_BLUE = '#3B7CA0';
const UNION_BLUE_DARK = '#2D5F7D';
const UNION_GOLD = '#E3AD4F';

function Avatar({ id, size = 42, name, ring = false, ringColor = '#fff' }) {
  const src = id ? `app/img/avatar-${id}.png` : null;
  const style = {
    width: size, height: size, borderRadius: '50%',
    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#D7DBE0', color: '#8792A0', overflow: 'hidden',
    boxShadow: ring ? `0 0 0 3px ${ringColor}, 0 0 0 5px rgba(0,0,0,0.08)` : undefined,
    fontFamily: 'Inter, system-ui', fontWeight: 600,
  };
  if (src) return <img src={src} style={style} alt={name} />;
  return (
    <div style={style}>
      <Icon.Person size={size * 0.62} color="#9AA6B0" />
    </div>
  );
}

function UnionHeader({ onAvatarTap, onHeartTap, title = 'Philip Rosedale', dark = false, color }) {
  const bg = color || (dark ? '#0f1a23' : UNION_BLUE);
  return (
    <div style={{
      background: bg, padding: '56px 16px 14px', display: 'flex',
      alignItems: 'center', gap: 12, position: 'relative', zIndex: 2,
    }}>
      <button onClick={onAvatarTap} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        borderRadius: '50%',
      }}>
        <Avatar id="philip" size={44} name="Philip" />
      </button>
      <div style={{
        flex: 1, textAlign: 'center', color: '#fff',
        fontFamily: 'Inter, system-ui', fontSize: 17, fontWeight: 600,
        letterSpacing: -0.2,
      }}>{title}</div>
      <button onClick={onHeartTap} style={{
        width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon.Heart size={20} color="#e74c3c" />
      </button>
    </div>
  );
}

function UnionTabBar({ tab, onChange, onHandshake }) {
  const tabStyle = (active) => ({
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 4, padding: '10px 0 6px', background: 'none', border: 'none',
    cursor: 'pointer', color: active ? UNION_BLUE : '#8792A0',
    fontFamily: 'Inter, system-ui', fontSize: 12, fontWeight: 500,
  });
  return (
    <div style={{
      position: 'relative',
      background: '#fff', borderTop: '1px solid #E5E8EC',
      paddingBottom: 20,
      display: 'flex', alignItems: 'stretch',
      boxShadow: '0 -2px 10px rgba(0,0,0,0.04)',
    }}>
      <button onClick={() => onChange('contacts')} style={tabStyle(tab === 'contacts')}>
        <Icon.Person size={20} color={tab === 'contacts' ? UNION_BLUE : '#8792A0'} />
        <span>Contacts</span>
      </button>
      <button onClick={() => onChange('groups')} style={tabStyle(tab === 'groups')}>
        <Icon.Group size={22} color={tab === 'groups' ? UNION_BLUE : '#8792A0'} />
        <span>Groups</span>
      </button>
      {/* handshake FAB */}
      <button onClick={onHandshake} style={{
        position: 'absolute', left: '50%', top: -26, transform: 'translateX(-50%)',
        width: 64, height: 64, borderRadius: '50%',
        background: UNION_BLUE_DARK, border: '4px solid #fff', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}>
        <span style={{ fontSize: 32 }}>🤝</span>
      </button>
    </div>
  );
}

window.Avatar = Avatar;
window.UnionHeader = UnionHeader;
window.UnionTabBar = UnionTabBar;
window.UNION_BLUE = UNION_BLUE;
window.UNION_BLUE_DARK = UNION_BLUE_DARK;
window.UNION_GOLD = UNION_GOLD;
