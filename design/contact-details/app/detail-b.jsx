// Variation B — Memory Journal: warm, photo-album feel with serif accents
function DetailB({ contact, onBack }) {
  const [vouched, setVouched] = React.useState(false);
  const [notify, setNotify] = React.useState(contact.notifyIfNearby);
  const [shareLoc, setShareLoc] = React.useState(contact.shareLocation);
  const [showConfetti, setShowConfetti] = React.useState(false);
  const [heroIdx, setHeroIdx] = React.useState(0);
  const [trustOpen, setTrustOpen] = React.useState(true);

  function doVouch() {
    setVouched(true);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1600);
  }

  const hero = contact.selfies[heroIdx];

  return (
    <div style={{ background: '#FBF6EE', minHeight: '100%', paddingBottom: 120, position: 'relative' }}>
      {/* Hero photo */}
      <div style={{ position: 'relative', height: 340, overflow: 'hidden' }}>
        <img src={`app/img/selfie-${hero.id}.png`} style={{
          width: '100%', height: '100%', objectFit: 'cover',
          transition: 'opacity 0.3s ease',
        }}/>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, transparent 25%, transparent 55%, rgba(0,0,0,0.7) 100%)',
        }}/>
        {/* back */}
        <button onClick={onBack} style={{
          position: 'absolute', top: 12, left: 12,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {/* hero meta */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '16px 20px', color: '#fff',
        }}>
          <div style={{
            fontFamily: 'Fraunces, Georgia, serif', fontSize: 32, fontWeight: 600,
            letterSpacing: -0.6, lineHeight: 1.1,
          }}>{contact.name}</div>
          <div style={{
            fontFamily: 'Inter, system-ui', fontSize: 13,
            marginTop: 6, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon.Sparkle size={12} color={UNION_GOLD} />
            Known {contact.relation} · Met {contact.metOn}
          </div>
        </div>
        {/* selfie thumb strip */}
        <div style={{
          position: 'absolute', right: 12, top: 60, display: 'flex',
          flexDirection: 'column', gap: 6,
        }}>
          {contact.selfies.map((s, i) => (
            <button key={s.id} onClick={() => setHeroIdx(i)} style={{
              width: 36, height: 36, borderRadius: 8, overflow: 'hidden',
              border: heroIdx === i ? '2px solid #fff' : '2px solid transparent',
              padding: 0, cursor: 'pointer',
              boxShadow: heroIdx === i ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
            }}>
              <img src={`app/img/selfie-${s.id}.png`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      </div>

      {/* Info card with notch */}
      <div style={{
        background: '#fff', margin: '-24px 12px 12px', borderRadius: 20,
        padding: '18px', boxShadow: '0 4px 18px rgba(0,0,0,0.08)',
        position: 'relative',
      }}>
        <div style={{
          fontFamily: 'Fraunces, Georgia, serif', fontSize: 18, fontStyle: 'italic',
          color: '#8B6F47', letterSpacing: -0.2,
        }}>"We met on {contact.metOn}"</div>
        <div style={{
          fontFamily: 'Inter, system-ui', fontSize: 12, color: '#8792A0', marginTop: 6,
        }}>Tap to edit memory</div>

        {/* actions as chips */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <ChipButton icon={<Icon.Shield size={14} color={vouched ? '#fff' : '#1A2433'} />}
            label={vouched ? 'Vouched' : 'Vouch'} filled={vouched} onClick={doVouch} />
          <ChipButton icon={<Icon.Share size={14} />} label="Share" />
          <ChipButton icon={<Icon.Phone size={14} />} label="Call" />
          <ChipButton icon={<Icon.Message size={14} />} label="Message" />
        </div>
      </div>

      {/* Memory count strip */}
      <div style={{
        display: 'flex', gap: 8, margin: '0 12px 12px',
      }}>
        <StatChip big={contact.selfies.length} label="selfies" />
        <StatChip big="18" label="years" />
        <StatChip big={contact.trust.sharedContacts} label="shared" />
        <StatChip big={contact.trust.vouchedBy.length} label="vouches" />
      </div>

      {/* Selfies gallery */}
      <div style={{ margin: '0 12px 12px' }}>
        <SectionHeader label="The album" count={contact.selfies.length} />
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
        }}>
          {contact.selfies.map(s => (
            <div key={s.id} style={{
              aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden',
              background: '#eee', position: 'relative',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <img src={`app/img/selfie-${s.id}.png`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '14px 8px 6px',
                background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.7))',
              }}>
                <div style={{ fontFamily: 'Inter, system-ui', fontSize: 9, color: '#fff', fontWeight: 600 }}>
                  {s.date}
                </div>
              </div>
            </div>
          ))}
          <button style={{
            aspectRatio: '1/1', borderRadius: 12,
            border: '2px dashed #C7B795', background: 'rgba(255,255,255,0.6)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 4, cursor: 'pointer',
            color: '#8B6F47', fontFamily: 'Inter, system-ui', fontSize: 11, fontWeight: 500,
          }}>
            <Icon.Camera size={20} color="#8B6F47" />
            Add
          </button>
        </div>
      </div>

      {/* Trust card — warm */}
      <div style={{ margin: '0 12px 12px' }}>
        <SectionHeader label="Trust" />
        <button onClick={() => setTrustOpen(!trustOpen)} style={{
          width: '100%', background: '#fff', borderRadius: 16, border: 'none',
          padding: 16, cursor: 'pointer', textAlign: 'left',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* mini ring */}
            <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
              <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="26" cy="26" r="22" stroke="#F2E8D8" strokeWidth="5" fill="none"/>
                <circle cx="26" cy="26" r="22" stroke={UNION_GOLD} strokeWidth="5" fill="none"
                  strokeLinecap="round"
                  strokeDasharray={2*Math.PI*22}
                  strokeDashoffset={2*Math.PI*22 - (contact.trust.score/100)*2*Math.PI*22}
                />
              </svg>
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Fraunces, Georgia, serif', fontSize: 18, fontWeight: 700, color: '#1A2433',
              }}>{contact.trust.score}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Inter, system-ui', fontSize: 15, fontWeight: 600, color: '#1A2433' }}>
                Strongly connected
              </div>
              <div style={{ fontFamily: 'Inter, system-ui', fontSize: 12, color: '#8792A0', marginTop: 2 }}>
                {contact.trust.sharedContacts} shared · {contact.trust.sharedGroups} groups · {contact.trust.vouchedBy.length} vouches
              </div>
            </div>
            <div style={{ transform: trustOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <Icon.ChevronDown size={18} color="#8792A0" />
            </div>
          </div>
          {trustOpen && (
            <div style={{
              marginTop: 12, paddingTop: 12, borderTop: '1px solid #F2E8D8',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <TrustLine label="Vouched by" value={`${contact.trust.vouchedBy.length} people`} />
              <TrustLine label="Shared contacts" value={`${contact.trust.sharedContacts}`} />
              <TrustLine label="Shared groups" value={`${contact.trust.sharedGroups}`} />
              <TrustLine label="Mutual attestations" value={`${contact.trust.mutualAttestations}`} />
            </div>
          )}
        </button>
      </div>

      {/* Toggles */}
      <div style={{
        background: '#fff', margin: '0 12px 12px', borderRadius: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden',
      }}>
        <ToggleRow icon={<Icon.Near size={18} color={notify ? UNION_BLUE : '#8792A0'} />}
          label="Notify if nearby" sub="Get a ping when Capri is within 500m"
          value={notify} onChange={setNotify} />
        <div style={{ height: 1, background: '#F2E8D8', marginLeft: 52 }} />
        <ToggleRow icon={<Icon.Location size={18} color={shareLoc ? UNION_BLUE : '#8792A0'} />}
          label="Share My Location" sub="Capri can see you on the map"
          value={shareLoc} onChange={setShareLoc} />
      </div>

      {/* History (timeline) */}
      <div style={{ margin: '0 12px 12px' }}>
        <SectionHeader label="Moments" />
        <div style={{
          background: '#fff', borderRadius: 16, padding: '14px 16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <HistoryTimeline history={contact.history} serif />
        </div>
      </div>

      {showConfetti && <Confetti />}
    </div>
  );
}

function ChipButton({ icon, label, filled, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: filled ? '#1A2433' : '#F5EEE1',
      border: filled ? 'none' : '1px solid #EADFC9',
      borderRadius: 100, padding: '8px 14px',
      display: 'flex', alignItems: 'center', gap: 6,
      cursor: 'pointer',
      fontFamily: 'Inter, system-ui', fontSize: 13, fontWeight: 500,
      color: filled ? '#fff' : '#1A2433',
    }}>
      {icon} {label}
    </button>
  );
}

function StatChip({ big, label }) {
  return (
    <div style={{
      flex: 1, background: '#fff', borderRadius: 12, padding: '10px 8px',
      textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22, fontWeight: 700, color: '#1A2433', letterSpacing: -0.5, lineHeight: 1 }}>{big}</div>
      <div style={{ fontFamily: 'Inter, system-ui', fontSize: 10, color: '#8B6F47', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function SectionHeader({ label, count }) {
  return (
    <div style={{
      padding: '6px 4px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    }}>
      <div style={{
        fontFamily: 'Fraunces, Georgia, serif', fontSize: 18, fontWeight: 600,
        color: '#1A2433', letterSpacing: -0.3,
      }}>{label}{count != null && <span style={{ color: '#8B6F47', fontWeight: 400 }}> · {count}</span>}</div>
    </div>
  );
}

function TrustLine({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontFamily: 'Inter, system-ui', fontSize: 13, color: '#5E6B7A' }}>{label}</div>
      <div style={{ fontFamily: 'Inter, system-ui', fontSize: 13, fontWeight: 600, color: '#1A2433' }}>{value}</div>
    </div>
  );
}

function HistoryTimeline({ history, serif }) {
  const dotColor = { nearby: UNION_BLUE, selfie: UNION_GOLD, vouch: '#5CA68A', group: '#A7729F' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {history.map((h, i) => (
        <div key={h.id} style={{ display: 'flex', gap: 12, paddingBottom: 12, position: 'relative' }}>
          <div style={{ position: 'relative', width: 10, flexShrink: 0 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: dotColor[h.kind], marginTop: 5,
              boxShadow: `0 0 0 3px ${dotColor[h.kind]}33`,
            }}/>
            {i < history.length - 1 && (
              <div style={{ position: 'absolute', left: 4.5, top: 18, bottom: -4, width: 1, background: '#EADFC9' }}/>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: serif ? 'Fraunces, Georgia, serif' : 'Inter, system-ui',
              fontSize: 14, fontWeight: serif ? 500 : 500, color: '#1A2433',
            }}>{h.text}</div>
            <div style={{ fontFamily: 'Inter, system-ui', fontSize: 11, color: '#8792A0', marginTop: 2 }}>
              {h.when}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

window.DetailB = DetailB;
window.ChipButton = ChipButton;
window.StatChip = StatChip;
window.SectionHeader = SectionHeader;
window.HistoryTimeline = HistoryTimeline;
