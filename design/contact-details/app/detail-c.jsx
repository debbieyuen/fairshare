// Variation C — Sticky Action Compact: dense info, sticky Vouch/Share/Call/Message bar
function DetailC({ contact, onBack }) {
  const [vouched, setVouched] = React.useState(false);
  const [notify, setNotify] = React.useState(contact.notifyIfNearby);
  const [shareLoc, setShareLoc] = React.useState(contact.shareLocation);
  const [openSection, setOpenSection] = React.useState('trust');
  const [showConfetti, setShowConfetti] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(null);

  function doVouch() {
    setVouched(true);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1600);
  }

  return (
    <div style={{ background: '#F2F4F7', minHeight: '100%', paddingBottom: 100, position: 'relative' }}>
      {/* back */}
      <div style={{ padding: '10px 12px 0' }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: UNION_BLUE,
          fontFamily: 'Inter, system-ui', fontSize: 14, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke={UNION_BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Contacts
        </button>
      </div>

      {/* Compact profile strip */}
      <div style={{
        background: '#fff', margin: '10px 12px', borderRadius: 14,
        padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Avatar id={contact.avatar} size={56} name={contact.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'Inter, system-ui', fontSize: 18, fontWeight: 700,
            color: '#1A2433', letterSpacing: -0.3,
          }}>{contact.name}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            <MiniChip label={contact.relation} icon={<Icon.Sparkle size={10} color={UNION_GOLD} />} />
            <MiniChip label={`Last seen ${contact.lastSeen}`} />
          </div>
        </div>
        <button style={{
          width: 36, height: 36, borderRadius: 10, background: '#F2F4F7',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon.Pencil size={14} color={UNION_BLUE} />
        </button>
      </div>

      {/* Dense collapsible sections */}
      <CollapseCard
        title="Trust"
        badge={`${contact.trust.score}`}
        badgeColor={UNION_GOLD}
        open={openSection === 'trust'}
        onToggle={() => setOpenSection(openSection === 'trust' ? null : 'trust')}
      >
        <TrustBars contact={contact} />
      </CollapseCard>

      <CollapseCard
        title="Selfies together"
        badge={`${contact.selfies.length}`}
        open={openSection === 'selfies'}
        onToggle={() => setOpenSection(openSection === 'selfies' ? null : 'selfies')}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {contact.selfies.map(s => (
            <button key={s.id} onClick={() => setLightbox(s)} style={{
              aspectRatio: '1/1', borderRadius: 8, overflow: 'hidden',
              background: '#eee', border: 'none', cursor: 'pointer', padding: 0,
            }}>
              <img src={`app/img/selfie-${s.id}.png`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
          <button style={{
            aspectRatio: '1/1', borderRadius: 8,
            border: '2px dashed #C7CFD9', background: 'rgba(0,0,0,0.02)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <Icon.Camera size={18} color={UNION_BLUE} />
          </button>
        </div>
      </CollapseCard>

      <CollapseCard
        title="Preferences"
        open={openSection === 'prefs'}
        onToggle={() => setOpenSection(openSection === 'prefs' ? null : 'prefs')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <CompactToggle label="Notify if nearby" value={notify} onChange={setNotify} />
          <CompactToggle label="Share My Location" value={shareLoc} onChange={setShareLoc} />
        </div>
      </CollapseCard>

      <CollapseCard
        title="History"
        badge={`${contact.history.length}`}
        open={openSection === 'history'}
        onToggle={() => setOpenSection(openSection === 'history' ? null : 'history')}
      >
        <HistoryTimeline history={contact.history} />
      </CollapseCard>

      <CollapseCard
        title="Notes"
        open={openSection === 'notes'}
        onToggle={() => setOpenSection(openSection === 'notes' ? null : 'notes')}
      >
        <textarea placeholder="Add a private note about Capri…"
          defaultValue="Philip's daughter. Lindens family. Loves horseback riding — ask about the ranch next time."
          style={{
            width: '100%', minHeight: 80, border: 'none', outline: 'none',
            resize: 'none', fontFamily: 'Inter, system-ui', fontSize: 13,
            color: '#1A2433', background: '#F8F9FB', borderRadius: 8,
            padding: 10, boxSizing: 'border-box',
          }}
        />
      </CollapseCard>

      {/* Sticky action bar */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        borderTop: '1px solid #E5E8EC',
        padding: '10px 12px 14px',
        display: 'flex', gap: 8,
      }}>
        <StickyAction icon={<Icon.Shield size={16} color={vouched ? '#fff' : UNION_BLUE} />}
          label={vouched ? 'Vouched' : 'Vouch'} filled={vouched} primary onClick={doVouch} />
        <StickyAction icon={<Icon.Share size={16} color={UNION_BLUE} />} label="Share" />
        <StickyAction icon={<Icon.Phone size={16} color={UNION_BLUE} />} label="Call" />
        <StickyAction icon={<Icon.Message size={16} color={UNION_BLUE} />} label="Message" />
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ width: '100%', maxWidth: 360 }}>
            <img src={`app/img/selfie-${lightbox.id}.png`} style={{ width: '100%', borderRadius: 12 }}/>
            <div style={{ color: '#fff', marginTop: 10, fontFamily: 'Inter, system-ui', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{lightbox.date}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{lightbox.loc}</div>
            </div>
          </div>
        </div>
      )}
      {showConfetti && <Confetti />}
    </div>
  );
}

function MiniChip({ label, icon }) {
  return (
    <div style={{
      background: '#F2F4F7', borderRadius: 100, padding: '3px 8px',
      fontFamily: 'Inter, system-ui', fontSize: 11, color: '#5E6B7A',
      display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500,
    }}>
      {icon}{label}
    </div>
  );
}

function CollapseCard({ title, badge, badgeColor, open, onToggle, children }) {
  return (
    <div style={{
      background: '#fff', margin: '0 12px 8px', borderRadius: 14,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden',
    }}>
      <button onClick={onToggle} style={{
        width: '100%', background: 'none', border: 'none', padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
      }}>
        <div style={{
          fontFamily: 'Inter, system-ui', fontSize: 14, fontWeight: 600, color: '#1A2433',
          flex: 1, textAlign: 'left',
        }}>{title}</div>
        {badge != null && (
          <div style={{
            background: badgeColor || '#EAF2F8',
            color: badgeColor ? '#fff' : UNION_BLUE,
            fontFamily: 'Inter, system-ui', fontSize: 11, fontWeight: 700,
            borderRadius: 100, padding: '2px 8px', minWidth: 20, textAlign: 'center',
          }}>{badge}</div>
        )}
        <div style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <Icon.ChevronDown size={16} color="#8792A0" />
        </div>
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px' }}>{children}</div>
      )}
    </div>
  );
}

function TrustBars({ contact }) {
  const items = [
    { label: 'Shared contacts', n: contact.trust.sharedContacts, max: 15, color: UNION_BLUE },
    { label: 'Shared groups', n: contact.trust.sharedGroups, max: 10, color: '#5CA68A' },
    { label: 'Mutual attestations', n: contact.trust.mutualAttestations, max: 10, color: '#A7729F' },
    { label: 'Vouches', n: contact.trust.vouchedBy.length, max: 10, color: UNION_GOLD },
  ];
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
        padding: '10px 12px', background: '#F8F9FB', borderRadius: 10,
      }}>
        <div style={{ position: 'relative', width: 54, height: 54 }}>
          <svg width="54" height="54" viewBox="0 0 54 54" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="27" cy="27" r="23" stroke="#E5E8EC" strokeWidth="5" fill="none"/>
            <circle cx="27" cy="27" r="23" stroke={UNION_GOLD} strokeWidth="5" fill="none"
              strokeLinecap="round"
              strokeDasharray={2*Math.PI*23}
              strokeDashoffset={2*Math.PI*23 - (contact.trust.score/100)*2*Math.PI*23}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Inter, system-ui', fontSize: 16, fontWeight: 700, color: '#1A2433',
          }}>{contact.trust.score}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Inter, system-ui', fontSize: 13, fontWeight: 600, color: '#1A2433' }}>
            Strongly connected
          </div>
          <div style={{ fontFamily: 'Inter, system-ui', fontSize: 11, color: '#8792A0', marginTop: 2 }}>
            Verified through multiple signals
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(it => (
          <div key={it.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontFamily: 'Inter, system-ui', fontSize: 12, color: '#5E6B7A' }}>{it.label}</div>
              <div style={{ fontFamily: 'Inter, system-ui', fontSize: 12, fontWeight: 600, color: '#1A2433' }}>{it.n}</div>
            </div>
            <div style={{ height: 6, background: '#F2F4F7', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${(it.n / it.max) * 100}%`, background: it.color,
                borderRadius: 3, transition: 'width 0.5s ease',
              }}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompactToggle({ label, value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
    }}>
      <div style={{ flex: 1, fontFamily: 'Inter, system-ui', fontSize: 13, color: '#1A2433' }}>{label}</div>
      <Toggle value={value} />
    </button>
  );
}

function StickyAction({ icon, label, filled, primary, onClick }) {
  const bg = filled ? UNION_BLUE : '#F2F4F7';
  const fg = filled ? '#fff' : UNION_BLUE;
  return (
    <button onClick={onClick} style={{
      flex: 1, background: bg, border: 'none', borderRadius: 12,
      padding: '8px 0', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 2, cursor: 'pointer',
    }}>
      {filled ? React.cloneElement(icon, { color: '#fff' }) : icon}
      <span style={{
        fontFamily: 'Inter, system-ui', fontSize: 11, fontWeight: 600,
        color: fg,
      }}>{label}</span>
    </button>
  );
}

window.DetailC = DetailC;
window.MiniChip = MiniChip;
window.CollapseCard = CollapseCard;
window.TrustBars = TrustBars;
