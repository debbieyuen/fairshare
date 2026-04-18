// Variation A — Trust-Forward: Prominent trust ring card, compact profile, action row
function DetailA({ contact, onBack, headerColor }) {
  const [vouched, setVouched] = React.useState(false);
  const [expanded, setExpanded] = React.useState(null);
  const [notify, setNotify] = React.useState(contact.notifyIfNearby);
  const [shareLoc, setShareLoc] = React.useState(contact.shareLocation);
  const [showShare, setShowShare] = React.useState(false);
  const [showConfetti, setShowConfetti] = React.useState(false);

  function doVouch() {
    setVouched(true);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1600);
  }

  const score = contact.trust.score;
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ background: '#F2F4F7', minHeight: '100%', paddingBottom: 40, position: 'relative' }}>
      {/* back row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px 4px',
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: UNION_BLUE,
          fontFamily: 'Inter, system-ui', fontSize: 14, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke={UNION_BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Contacts
        </button>
        <button style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          display: 'flex', alignItems: 'center', gap: 4,
          color: '#8792A0', fontSize: 13, fontFamily: 'Inter, system-ui',
        }}>
          Last seen {contact.lastSeen}
        </button>
      </div>

      {/* Hero card */}
      <div style={{
        background: '#fff', margin: '6px 12px 12px', borderRadius: 16,
        padding: '20px 16px 16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar id={contact.avatar} size={68} name={contact.name} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: 'Inter, system-ui', fontSize: 22, fontWeight: 700,
              color: '#1A2433', letterSpacing: -0.4,
            }}>{contact.name}</div>
            <div style={{
              fontFamily: 'Inter, system-ui', fontSize: 13, color: '#5E6B7A',
              marginTop: 3, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Icon.Sparkle size={12} color={UNION_GOLD} />
              Known {contact.relation}
            </div>
            <div style={{
              fontFamily: 'Inter, system-ui', fontSize: 12, color: '#8792A0',
              marginTop: 2,
            }}>Met on {contact.metOn}</div>
          </div>
        </div>

        {/* Action row: icon buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <ActionButton icon={<Icon.Shield size={18} color={vouched ? '#fff' : UNION_BLUE} />}
            label={vouched ? 'Vouched' : 'Vouch'}
            primary filled={vouched} onClick={doVouch} />
          <ActionButton icon={<Icon.Share size={18} color={UNION_BLUE} />} label="Share" onClick={() => setShowShare(true)} />
          <ActionButton icon={<Icon.Phone size={18} color={UNION_BLUE} />} label="Call" />
          <ActionButton icon={<Icon.Message size={18} color={UNION_BLUE} />} label="Message" />
        </div>
      </div>

      {/* Trust card — prominent */}
      <div style={{
        background: 'linear-gradient(160deg, #2D5F7D 0%, #3B7CA0 100%)',
        margin: '0 12px 12px', borderRadius: 16,
        padding: 18, color: '#fff',
        boxShadow: '0 4px 14px rgba(59,124,160,0.28)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* subtle dots */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1.5px)',
          backgroundSize: '14px 14px',
        }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Ring */}
          <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
            <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.15)" strokeWidth="8" fill="none"/>
              <circle cx="50" cy="50" r="42" stroke={UNION_GOLD} strokeWidth="8" fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{ transition: 'stroke-dashoffset 1s ease' }}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Inter, system-ui', letterSpacing: -1 }}>{score}</div>
              <div style={{ fontSize: 10, fontFamily: 'Inter, system-ui', opacity: 0.7, letterSpacing: 1, textTransform: 'uppercase' }}>Trust</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, opacity: 0.7, fontFamily: 'Inter, system-ui', letterSpacing: 1, textTransform: 'uppercase' }}>Network</div>
            <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'Inter, system-ui', marginTop: 4 }}>
              Strongly connected
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10,
            }}>
              <TrustStat n={contact.trust.sharedContacts} label="Shared contacts" />
              <TrustStat n={contact.trust.sharedGroups} label="Shared groups" />
              <TrustStat n={contact.trust.mutualAttestations} label="Attestations" />
              <TrustStat n={contact.trust.vouchedBy.length} label="Vouches" />
            </div>
          </div>
        </div>
        {/* vouched by avatars */}
        <div style={{
          position: 'relative', marginTop: 14,
          display: 'flex', alignItems: 'center', gap: 8,
          paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)',
        }}>
          <div style={{ display: 'flex' }}>
            {['M','L','J','E','T'].map((l, i) => (
              <div key={i} style={{
                width: 26, height: 26, borderRadius: '50%',
                background: `hsl(${i * 60 + 200}, 40%, 60%)`,
                marginLeft: i ? -8 : 0,
                border: '2px solid #3B7CA0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, fontFamily: 'Inter, system-ui',
              }}>{l}</div>
            ))}
          </div>
          <div style={{ fontSize: 12, fontFamily: 'Inter, system-ui', opacity: 0.9 }}>
            Vouched by <b>Michael</b>, <b>Lou</b> and 3 others
          </div>
        </div>
      </div>

      {/* Selfies */}
      <SelfiesSection contact={contact} />

      {/* Toggles */}
      <div style={{
        background: '#fff', margin: '12px 12px 0', borderRadius: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden',
      }}>
        <ToggleRow icon={<Icon.Near size={18} color={notify ? UNION_BLUE : '#8792A0'} />}
          label="Notify if nearby" sub="Get a ping when Capri is within 500m"
          value={notify} onChange={setNotify} />
        <div style={{ height: 1, background: '#EAEDF1', marginLeft: 52 }} />
        <ToggleRow icon={<Icon.Location size={18} color={shareLoc ? UNION_BLUE : '#8792A0'} />}
          label="Share My Location" sub="Capri can see you on the map"
          value={shareLoc} onChange={setShareLoc} />
      </div>

      {/* History */}
      <HistorySection contact={contact} />

      {showShare && <ShareSheet contact={contact} onClose={() => setShowShare(false)} />}
      {showConfetti && <Confetti />}
    </div>
  );
}

function TrustStat({ n, label }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.1)', borderRadius: 8,
      padding: '6px 8px', fontFamily: 'Inter, system-ui',
    }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{n}</div>
      <div style={{ fontSize: 10, opacity: 0.8, letterSpacing: 0.3 }}>{label}</div>
    </div>
  );
}

function ActionButton({ icon, label, primary, filled, onClick }) {
  const bg = filled ? UNION_BLUE : primary ? '#EAF2F8' : '#F2F4F7';
  const fg = filled ? '#fff' : UNION_BLUE;
  return (
    <button onClick={onClick} style={{
      flex: 1, background: bg, border: 'none', borderRadius: 12,
      padding: '10px 0', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 4, cursor: 'pointer',
      transition: 'all 0.15s ease',
    }}>
      {filled ? React.cloneElement(icon, { color: '#fff' }) : icon}
      <span style={{
        fontFamily: 'Inter, system-ui', fontSize: 12, fontWeight: 600,
        color: fg, letterSpacing: -0.1,
      }}>{label}</span>
    </button>
  );
}

function ToggleRow({ icon, label, sub, value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      width: '100%', background: 'none', border: 'none', padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: value ? '#EAF2F8' : '#F2F4F7',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'Inter, system-ui', fontSize: 15, fontWeight: 500, color: '#1A2433' }}>{label}</div>
        <div style={{ fontFamily: 'Inter, system-ui', fontSize: 12, color: '#8792A0', marginTop: 1 }}>{sub}</div>
      </div>
      <Toggle value={value} />
    </button>
  );
}

function Toggle({ value }) {
  return (
    <div style={{
      width: 44, height: 26, borderRadius: 13, padding: 2,
      background: value ? UNION_BLUE : '#D7DBE0',
      display: 'flex', alignItems: 'center',
      justifyContent: value ? 'flex-end' : 'flex-start',
      transition: 'background 0.2s ease',
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        transition: 'transform 0.2s ease',
      }} />
    </div>
  );
}

function SelfiesSection({ contact }) {
  return (
    <div style={{ margin: '0 12px 12px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '2px 4px 8px',
      }}>
        <div style={{
          fontFamily: 'Inter, system-ui', fontSize: 11,
          fontWeight: 600, color: '#5E6B7A', letterSpacing: 1,
          textTransform: 'uppercase',
        }}>Selfies together · {contact.selfies.length}</div>
        <button style={{
          background: 'none', border: 'none', color: UNION_BLUE,
          fontFamily: 'Inter, system-ui', fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>See all</button>
      </div>
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
        scrollbarWidth: 'none',
      }} className="no-scrollbar">
        {contact.selfies.map((s, i) => (
          <div key={s.id} style={{
            width: 120, flexShrink: 0, borderRadius: 12, overflow: 'hidden',
            background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <img src={`app/img/selfie-${s.id}.png`} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
            <div style={{ padding: '6px 8px' }}>
              <div style={{ fontFamily: 'Inter, system-ui', fontSize: 11, fontWeight: 600, color: '#1A2433' }}>{s.date}</div>
              <div style={{ fontFamily: 'Inter, system-ui', fontSize: 10, color: '#8792A0', marginTop: 1 }}>{s.loc}</div>
            </div>
          </div>
        ))}
        {/* add button */}
        <button style={{
          width: 120, height: 164, flexShrink: 0, borderRadius: 12,
          border: '2px dashed #C7CFD9', background: 'rgba(255,255,255,0.5)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: UNION_BLUE, fontFamily: 'Inter, system-ui', fontSize: 12, fontWeight: 500,
          cursor: 'pointer', gap: 4,
        }}>
          <Icon.Camera size={22} color={UNION_BLUE} />
          Take selfie
        </button>
      </div>
    </div>
  );
}

function HistorySection({ contact }) {
  const dotColor = { nearby: UNION_BLUE, selfie: UNION_GOLD, vouch: '#5CA68A', group: '#A7729F' };
  const kindLabel = { nearby: 'Nearby', selfie: 'Selfie', vouch: 'Vouch', group: 'Group' };
  return (
    <div style={{
      background: '#fff', margin: '12px 12px 0', borderRadius: 16,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '14px 16px 12px',
    }}>
      <div style={{
        fontFamily: 'Inter, system-ui', fontSize: 11, fontWeight: 600,
        color: '#5E6B7A', letterSpacing: 1, textTransform: 'uppercase',
        marginBottom: 10,
      }}>History together</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
        {contact.history.map((h, i) => (
          <div key={h.id} style={{
            display: 'flex', gap: 12, position: 'relative',
            paddingBottom: 14,
          }}>
            {/* dot + line */}
            <div style={{ position: 'relative', width: 12, flexShrink: 0 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: dotColor[h.kind], marginTop: 4,
                boxShadow: `0 0 0 3px ${dotColor[h.kind]}33`,
              }}/>
              {i < contact.history.length - 1 && (
                <div style={{
                  position: 'absolute', left: 5, top: 18, bottom: -4, width: 1,
                  background: '#E5E8EC',
                }}/>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Inter, system-ui', fontSize: 14, fontWeight: 500, color: '#1A2433' }}>
                {h.text}
              </div>
              <div style={{ fontFamily: 'Inter, system-ui', fontSize: 12, color: '#8792A0', marginTop: 2 }}>
                {kindLabel[h.kind]} · {h.when}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button style={{
        marginTop: 2, width: '100%', background: 'none', border: 'none',
        color: UNION_BLUE, fontFamily: 'Inter, system-ui', fontSize: 13, fontWeight: 500,
        padding: '8px 0 0', cursor: 'pointer',
      }}>View all activity</button>
    </div>
  );
}

function ShareSheet({ contact, onClose }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'flex-end',
      animation: 'fadeIn 0.2s ease',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', background: '#fff',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: '20px 20px 34px',
        animation: 'slideUp 0.25s ease',
      }}>
        <div style={{
          width: 40, height: 4, borderRadius: 2, background: '#D7DBE0',
          margin: '0 auto 16px',
        }}/>
        <div style={{ fontFamily: 'Inter, system-ui', fontSize: 18, fontWeight: 700, color: '#1A2433', textAlign: 'center' }}>
          Share Capri
        </div>
        <div style={{ fontFamily: 'Inter, system-ui', fontSize: 13, color: '#5E6B7A', textAlign: 'center', marginTop: 4 }}>
          Vouch for Capri with someone in your network.
        </div>
        <div style={{
          marginTop: 16, padding: 16, borderRadius: 12, background: '#F2F4F7',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Avatar id={contact.avatar} size={44} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Inter, system-ui', fontSize: 15, fontWeight: 600, color: '#1A2433' }}>{contact.name}</div>
            <div style={{ fontFamily: 'Inter, system-ui', fontSize: 12, color: '#8792A0' }}>{contact.relation}</div>
          </div>
        </div>
        <button onClick={onClose} style={{
          marginTop: 16, width: '100%', background: UNION_BLUE, color: '#fff',
          border: 'none', borderRadius: 12, padding: '14px 0',
          fontFamily: 'Inter, system-ui', fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}>Pick from contacts</button>
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 30 }, (_, i) => i);
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 200,
      overflow: 'hidden',
    }}>
      {pieces.map(i => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const hue = [UNION_GOLD, UNION_BLUE, '#5CA68A', '#E38B7E'][i % 4];
        const rot = Math.random() * 360;
        return (
          <div key={i} style={{
            position: 'absolute', left: `${left}%`, top: '30%',
            width: 8, height: 12, background: hue,
            transform: `rotate(${rot}deg)`,
            animation: `confetti 1.4s ${delay}s ease-out forwards`,
            borderRadius: 2,
          }}/>
        );
      })}
    </div>
  );
}

window.DetailA = DetailA;
window.Toggle = Toggle;
window.SelfiesSection = SelfiesSection;
window.HistorySection = HistorySection;
window.ShareSheet = ShareSheet;
window.Confetti = Confetti;
window.ToggleRow = ToggleRow;
window.ActionButton = ActionButton;
