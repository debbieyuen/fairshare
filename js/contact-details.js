// =============================================================================
// Contact Details (Variation A) — full-page screen
// -----------------------------------------------------------------------------
// Activated by navigateTo('contactDetails', contactId). Renders a hero card,
// gradient trust card with score ring, selfies strip, two preference toggles,
// and a unified history timeline. Reuses existing data sources and write paths
// from contacts.js / location-sharing.js / web-of-trust.js.
//
// Vanilla JS, no build step. Lives behind #contactDetailsScreen which is a
// sibling of the other screens inside .main-content.
// =============================================================================

let cdCurrentContactId = null;
let cdConfettiTimer = null;
// Cached lists from get_contact_trust_summary so the mutuals dialog can render
// without an extra round trip. Keyed by contact id.
const cdMutualsCache = {};

function openContactDetailsScreen(contactId) {
    cdCurrentContactId = contactId || null;
    const root = document.getElementById('contactDetailsScreen');
    if (!root) return;

    if (!contactId) {
        root.innerHTML = '<div class="cd-empty">Contact not found.</div>';
        return;
    }

    const row = (contactsLoadedRows || []).find(r => r.contact?.contact_id === contactId);

    if (row) {
        renderContactDetailsScreen(root, row);
        hydrateContactDetailsScreen(contactId);
    } else {
        // Fallback: list not loaded yet (e.g. deep link, hot reload).
        // Show skeleton with what we know, then fetch + re-render.
        root.innerHTML = renderCdSkeleton({ name: 'Loading…', avatarUrl: null });
        loadAndRenderContactList()
            .then(() => {
                if (cdCurrentContactId !== contactId) return;
                const r2 = (contactsLoadedRows || []).find(x => x.contact?.contact_id === contactId);
                if (r2) {
                    renderContactDetailsScreen(root, r2);
                    hydrateContactDetailsScreen(contactId);
                } else {
                    root.innerHTML = '<div class="cd-empty">Contact not found.</div>';
                }
            })
            .catch(() => { root.innerHTML = '<div class="cd-empty">Could not load contact.</div>'; });
    }
}

// ----- Skeleton + main render ------------------------------------------------

function renderCdSkeleton(seed) {
    const initial = (seed?.name || '?').trim().charAt(0).toUpperCase();
    const avatarHtml = seed?.avatarUrl
        ? `<img class="cd-hero-avatar" src="${esc(seed.avatarUrl)}" alt="">`
        : `<div class="cd-hero-avatar cd-hero-avatar-fallback">${esc(initial)}</div>`;
    return `
        <div class="cd-back-row">
            <button class="cd-back-link" type="button" onclick="closeContactDetailsScreen()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Contacts
            </button>
            <span class="cd-last-seen">&nbsp;</span>
        </div>
        <div class="cd-card cd-hero-card">
            <div class="cd-hero-row">
                ${avatarHtml}
                <div class="cd-hero-meta">
                    <div class="cd-hero-name">${esc(seed?.name || 'Loading…')}</div>
                </div>
            </div>
        </div>
        <div class="cd-card cd-trust-card cd-skeleton">&nbsp;</div>
    `;
}

function renderContactDetailsScreen(root, row) {
    const c = row.contact || {};
    const p = row.profile || {};
    const id = c.contact_id;
    const name = p.display_name || 'Unknown';
    const avatarUrl = p.profile_image_url || null;
    const initial = name.trim().charAt(0).toUpperCase() || '?';

    const knownSince = c.first_met_at || c.created_at || null;
    const knownDuration = formatKnownDuration(knownSince);
    const metOnDisplay = formatFirstMetDisplay(c.first_met_at);
    const lastSeen = formatLastSeen(c.met_at);

    const phone = (row.shared?.shared_phone) || '';
    const email = (row.shared?.shared_email) || '';

    const notify = !!c.notify_nearby;
    const shareLoc = !!locationSharesOutbound[id];

    const avatarHtml = avatarUrl
        ? `<img class="cd-hero-avatar" src="${esc(avatarUrl)}" alt=""
                onclick="event.stopPropagation(); cdOpenAvatarLightbox('${esc(id)}', '${esc(avatarUrl)}', '${esc(name)}')">`
        : `<div class="cd-hero-avatar cd-hero-avatar-fallback"
                onclick="event.stopPropagation(); openSuggestPicture('${esc(id)}')"
                title="Suggest a profile picture">${esc(initial)}</div>`;

    const callDisabled = !phone ? 'disabled' : '';
    const messageDisabled = !phone ? 'disabled' : '';
    const callHref = phone ? `tel:${esc(phone)}` : '#';
    const messageHref = phone ? `sms:${esc(phone)}` : '#';

    root.innerHTML = `
        <div class="cd-back-row">
            <button class="cd-back-link" type="button" onclick="closeContactDetailsScreen()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Contacts
            </button>
            <span class="cd-last-seen">${lastSeen ? 'Last seen ' + esc(lastSeen) : ''}</span>
        </div>

        <div class="cd-card cd-hero-card">
            <div class="cd-hero-row">
                ${avatarHtml}
                <div class="cd-hero-meta">
                    <div class="cd-hero-name">${esc(name)}</div>
                    ${knownDuration ? `<div class="cd-hero-known"><span class="cd-sparkle" aria-hidden="true">\u2728</span>Known ${esc(knownDuration)}</div>` : ''}
                    <div class="cd-hero-met">
                        <span class="cd-met-label">Met on</span>
                        <span class="cd-met-value" id="cd-met-display">${esc(metOnDisplay)}</span>
                        <input type="date" class="cd-met-input" id="cd-met-input"
                            value="${c.first_met_at ? new Date(c.first_met_at).toISOString().slice(0, 10) : ''}"
                            onclick="try { this.showPicker(); } catch(e) {}"
                            onchange="cdSaveMetOn('${esc(id)}', this.value)"
                            onblur="commitPendingFirstMetAt('${esc(id)}')">
                    </div>
                </div>
            </div>
            <div class="cd-action-row">
                <button type="button" class="cd-action-btn cd-action-vouch" id="cd-vouch-btn"
                    onclick="cdOnVouchClick('${esc(id)}', '${esc(name)}')">
                    <span class="cd-action-icon">${cdShieldIcon()}</span>
                    <span class="cd-action-label">Vouch</span>
                </button>
                <button type="button" class="cd-action-btn" onclick="openShareWithContact('${esc(id)}', '${esc(name)}')">
                    <span class="cd-action-icon">${cdShareIcon()}</span>
                    <span class="cd-action-label">Share</span>
                </button>
                <a class="cd-action-btn cd-action-link ${callDisabled ? 'cd-action-disabled' : ''}" href="${callHref}" ${callDisabled} aria-disabled="${callDisabled ? 'true' : 'false'}">
                    <span class="cd-action-icon">${cdPhoneIcon()}</span>
                    <span class="cd-action-label">Call</span>
                </a>
                <a class="cd-action-btn cd-action-link ${messageDisabled ? 'cd-action-disabled' : ''}" href="${messageHref}" ${messageDisabled} aria-disabled="${messageDisabled ? 'true' : 'false'}">
                    <span class="cd-action-icon">${cdMessageIcon()}</span>
                    <span class="cd-action-label">Message</span>
                </a>
            </div>
        </div>

        <div id="cd-sharing-location-slot"></div>

        <div class="cd-card cd-trust-card" id="cd-trust">
            <div class="cd-trust-dots" aria-hidden="true"></div>
            <div class="cd-trust-row">
                <div class="cd-ring" id="cd-ring">
                    <svg viewBox="0 0 100 100" width="100" height="100" class="cd-ring-svg">
                        <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.15)" stroke-width="8" fill="none"/>
                        <circle id="cd-ring-fg" cx="50" cy="50" r="42"
                            stroke="var(--cd-gold)" stroke-width="8" fill="none"
                            stroke-linecap="round"
                            stroke-dasharray="${(2 * Math.PI * 42).toFixed(2)}"
                            stroke-dashoffset="${(2 * Math.PI * 42).toFixed(2)}"/>
                    </svg>
                    <div class="cd-ring-text">
                        <div class="cd-ring-score" id="cd-ring-score">--</div>
                        <div class="cd-ring-label">Trust</div>
                    </div>
                </div>
                <div class="cd-trust-meta">
                    <div class="cd-trust-overline">Network</div>
                    <div class="cd-trust-headline" id="cd-trust-headline">Loading\u2026</div>
                    <div class="cd-trust-stats">
                        <div class="cd-trust-stat"><div class="cd-trust-stat-n" id="cd-stat-shared-contacts">\u2014</div><div class="cd-trust-stat-l">Shared contacts</div></div>
                        <div class="cd-trust-stat"><div class="cd-trust-stat-n" id="cd-stat-shared-groups">\u2014</div><div class="cd-trust-stat-l">Shared groups</div></div>
                        <div class="cd-trust-stat"><div class="cd-trust-stat-n" id="cd-stat-attestations">\u2014</div><div class="cd-trust-stat-l">Attestations</div></div>
                        <div class="cd-trust-stat"><div class="cd-trust-stat-n" id="cd-stat-vouches">\u2014</div><div class="cd-trust-stat-l">Vouches</div></div>
                    </div>
                </div>
            </div>
            <button type="button" class="cd-mutuals-row" id="cd-mutuals-row" hidden
                    onclick="cdOpenMutualsDialog('${esc(id)}', '${esc(name)}')">
                <div class="cd-mutuals-text" id="cd-mutuals-text"></div>
                <span class="cd-mutuals-chevron" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </span>
            </button>
        </div>

        <div class="cd-section">
            <div class="cd-section-head">
                <div class="cd-overline" id="cd-selfies-head">Selfies together</div>
            </div>
            <div class="cd-selfies-strip" id="cd-selfies">
                <button type="button" class="cd-selfie-add" onclick="openContactSelfie('${esc(id)}')">
                    ${cdCameraIcon()}
                    <span>Take selfie</span>
                </button>
            </div>
        </div>

        <div class="cd-card cd-toggles-card">
            <button type="button" class="cd-toggle-row" id="cd-toggle-notify" onclick="cdOnToggleNotify('${esc(id)}')">
                <div class="cd-toggle-icon ${notify ? 'cd-toggle-icon-on' : ''}">${cdNearIcon()}</div>
                <div class="cd-toggle-text">
                    <div class="cd-toggle-label">Notify if nearby</div>
                    <div class="cd-toggle-sub">Get a ping when ${esc(firstName(name))} is within 1 mile</div>
                </div>
                <div class="cd-switch ${notify ? 'cd-switch-on' : ''}"><div class="cd-switch-knob"></div></div>
            </button>
            <div class="cd-toggle-divider"></div>
            <button type="button" class="cd-toggle-row" id="cd-toggle-share" onclick="cdOnToggleShareLoc('${esc(id)}')">
                <div class="cd-toggle-icon ${shareLoc ? 'cd-toggle-icon-on' : ''}">${cdLocationIcon()}</div>
                <div class="cd-toggle-text">
                    <div class="cd-toggle-label">Share My Location</div>
                    <div class="cd-toggle-sub">${esc(firstName(name))} can see you on the map</div>
                </div>
                <div class="cd-switch ${shareLoc ? 'cd-switch-on' : ''}"><div class="cd-switch-knob"></div></div>
            </button>
        </div>

        <div class="cd-card cd-history-card" id="cd-history-card">
            <div class="cd-overline">History together</div>
            <div class="cd-history-list" id="cd-history-list">
                <div class="cd-history-loading">Loading\u2026</div>
            </div>
        </div>
    `;
}

// ----- Hydration -------------------------------------------------------------

async function hydrateContactDetailsScreen(contactId) {
    if (!contactId) return;

    // Sharing-location pane (only rendered if they share with us).
    cdRenderSharingLocationPane(contactId);

    // Selfies — reuse the existing loader/cache.
    loadContactSelfies(contactId).then((selfies) => {
        if (cdCurrentContactId !== contactId) return;
        cdRenderSelfies(contactId, selfies || []);
    }).catch(() => {});

    // Trust summary.
    db.rpc('get_contact_trust_summary', { p_contact_id: contactId })
        .then(({ data, error }) => {
            if (cdCurrentContactId !== contactId) return;
            if (error) { console.error('get_contact_trust_summary error:', error); return; }
            cdRenderTrust(data || {});
        });

    // History.
    db.rpc('get_contact_history', { p_contact_id: contactId, p_limit: 6 })
        .then(({ data, error }) => {
            if (cdCurrentContactId !== contactId) return;
            if (error) { console.error('get_contact_history error:', error); cdRenderHistory([]); return; }
            cdRenderHistory(Array.isArray(data) ? data : []);
        });
}

// Refresh the selfies strip (and history timeline) on the Contact Details
// screen if it's currently open for this contact. Safe no-op otherwise.
// Called from the contacts.selfie_url realtime UPDATE handler (recipient side)
// and from captureContactSelfie() right after a successful upload (uploader
// side) so the carousel doesn't go stale until the user re-enters the screen.
function cdRefreshSelfiesIfOpen(contactId) {
    if (!contactId || cdCurrentContactId !== contactId) return;
    if (typeof loadContactSelfies === 'function') {
        loadContactSelfies(contactId)
            .then((selfies) => {
                if (cdCurrentContactId !== contactId) return;
                cdRenderSelfies(contactId, selfies || []);
            })
            .catch(() => {});
    }
    // Also refresh the history timeline so the new selfie event shows up.
    if (typeof db !== 'undefined' && db && typeof db.rpc === 'function') {
        db.rpc('get_contact_history', { p_contact_id: contactId, p_limit: 6 })
            .then(({ data, error }) => {
                if (error || cdCurrentContactId !== contactId) return;
                cdRenderHistory(Array.isArray(data) ? data : []);
            });
    }
}

function cdRenderSelfies(contactId, selfies) {
    const strip = document.getElementById('cd-selfies');
    const head = document.getElementById('cd-selfies-head');
    if (!strip) return;
    if (head) head.textContent = selfies.length
        ? `Selfies together \u00B7 ${selfies.length}`
        : 'Selfies together';

    const tilesHtml = selfies.map(s => {
        const dateStr = formatSelfieDate(s.captured_at);
        const locStr = s.location_label || '';
        return `
            <div class="cd-selfie-tile"
                 data-lightbox-url="${esc(s.selfie_url)}"
                 ${dateStr ? `data-lightbox-date="${esc(dateStr)}"` : ''}
                 ${locStr ? `data-lightbox-location="${esc(locStr)}"` : ''}
                 onclick="openLightbox('${esc(s.selfie_url)}', '${esc(dateStr)}', '${esc(locStr)}')">
                <img src="${esc(s.selfie_url)}" alt="Selfie" loading="lazy">
                <div class="cd-selfie-meta">
                    ${dateStr ? `<div class="cd-selfie-date">${esc(dateStr)}</div>` : ''}
                    ${locStr ? `<div class="cd-selfie-loc">${esc(locStr)}</div>` : ''}
                </div>
            </div>`;
    }).join('');
    const addHtml = `
        <button type="button" class="cd-selfie-add" onclick="openContactSelfie('${esc(contactId)}')">
            ${cdCameraIcon()}
            <span>Take selfie</span>
        </button>`;
    strip.innerHTML = tilesHtml + addHtml;
}

function cdRenderTrust(t) {
    const score = Math.max(0, Math.min(100, Number(t.score) || 0));
    const headline = cdTrustHeadline(score);
    setText('cd-ring-score', String(score));
    setText('cd-trust-headline', headline);
    setText('cd-stat-shared-contacts', String(Number(t.shared_contacts) || 0));
    setText('cd-stat-shared-groups',   String(Number(t.shared_groups)   || 0));
    setText('cd-stat-attestations',    String(Number(t.attestations)    || 0));
    setText('cd-stat-vouches',         String(Number(t.vouchers_total)  || 0));

    const ringFg = document.getElementById('cd-ring-fg');
    if (ringFg) {
        const circumference = 2 * Math.PI * 42;
        const offset = circumference - (score / 100) * circumference;
        // Defer one frame so the CSS transition runs (initial is full circumference).
        requestAnimationFrame(() => {
            ringFg.style.transition = 'stroke-dashoffset 1s ease';
            ringFg.style.strokeDashoffset = offset.toFixed(2);
        });
    }

    // Vouch button: flip to "Vouched" if the caller has any prior attestation.
    if (t.have_i_vouched) cdSetVouchedState(true);

    cdRenderMutualsRow(t);
}

// ----- Mutuals (shared contacts + shared groups) -----------------------------

// Render the small two-line summary that lives at the bottom of the trust
// card, beneath the vouchers underline. Tapping it opens the full dialog.
function cdRenderMutualsRow(t) {
    const row = document.getElementById('cd-mutuals-row');
    const txt = document.getElementById('cd-mutuals-text');
    if (!row || !txt) return;

    const contacts = Array.isArray(t.shared_contacts_list) ? t.shared_contacts_list : [];
    const groups   = Array.isArray(t.shared_groups_list)   ? t.shared_groups_list   : [];
    const contactsTotal = Number(t.shared_contacts) || contacts.length;
    const groupsTotal   = Number(t.shared_groups)   || groups.length;

    // Cache for the dialog (keyed by current contact id).
    if (cdCurrentContactId) {
        cdMutualsCache[cdCurrentContactId] = {
            contacts,
            groups,
            contactsTotal,
            groupsTotal,
        };
    }

    if (contactsTotal === 0 && groupsTotal === 0) {
        row.hidden = true;
        return;
    }

    const lines = [];
    if (contactsTotal > 0) {
        lines.push(cdNamesLine('Both know', contacts.map(c => c.display_name), contactsTotal));
    }
    if (groupsTotal > 0) {
        lines.push(cdNamesLine('Both in',   groups.map(g => g.name),           groupsTotal));
    }
    txt.innerHTML = lines.join('<br>');
    row.hidden = false;
}

// Build a single line like: "Both know <b>Alice</b>, <b>Bob</b> and 3 others"
// Falls back to a count-only label if the names list is empty (e.g. the
// caller hit the 50-row cap and the first batch happens to be missing).
function cdNamesLine(prefix, names, total) {
    const cleaned = (names || []).map(n => (n || '').trim()).filter(Boolean);
    if (cleaned.length === 0) {
        return `${esc(prefix)} ${total} ${total === 1 ? 'other' : 'others'}`;
    }
    if (total === 1)         return `${esc(prefix)} <b>${esc(cleaned[0])}</b>`;
    if (total === 2 && cleaned.length >= 2) {
        return `${esc(prefix)} <b>${esc(cleaned[0])}</b> and <b>${esc(cleaned[1])}</b>`;
    }
    const showInline = Math.min(2, cleaned.length);
    const head = cleaned.slice(0, showInline).map(n => `<b>${esc(n)}</b>`).join(', ');
    const remaining = total - showInline;
    if (remaining <= 0) return `${esc(prefix)} ${head}`;
    return `${esc(prefix)} ${head} and ${remaining} ${remaining === 1 ? 'other' : 'others'}`;
}

function cdTrustHeadline(score) {
    if (score >= 85) return 'Strongly connected';
    if (score >= 65) return 'Well connected';
    if (score >= 40) return 'Getting connected';
    return 'New connection';
}

function cdRenderHistory(events) {
    const list = document.getElementById('cd-history-list');
    if (!list) return;
    if (!events.length) {
        list.innerHTML = '<div class="cd-history-empty">No shared events yet.</div>';
        return;
    }
    const kindLabel = { nearby: 'Nearby', selfie: 'Selfie', vouch: 'Vouch', group: 'Group' };
    list.innerHTML = events.map((h, i) => {
        const dotClass = `cd-history-dot cd-history-dot-${esc(h.kind)}`;
        const isLast = i === events.length - 1;
        return `
            <div class="cd-history-item">
                <div class="cd-history-stem">
                    <div class="${dotClass}"></div>
                    ${isLast ? '' : '<div class="cd-history-line"></div>'}
                </div>
                <div class="cd-history-content">
                    <div class="cd-history-text">${esc(h.text)}</div>
                    <div class="cd-history-when">${esc(kindLabel[h.kind] || 'Event')} \u00B7 ${esc(formatLastSeen(h.occurred_at))}</div>
                </div>
            </div>`;
    }).join('');
}

// Open the modal listing every mutual contact and shared group. Tapping a
// row navigates straight into that contact's details or that group's screen.
function cdOpenMutualsDialog(contactId, name) {
    const data = cdMutualsCache[contactId];
    const overlay = document.getElementById('modalOverlay');
    const body    = document.getElementById('modalBody');
    if (!data || !overlay || !body) return;

    const { contacts, groups, contactsTotal, groupsTotal } = data;

    const contactsHtml = (contacts || []).map(c => {
        const init = (c.display_name || '?').trim().charAt(0).toUpperCase();
        const avatar = c.profile_image_url
            ? `<img class="cd-mutuals-item-avatar" src="${esc(c.profile_image_url)}" alt="">`
            : `<div class="cd-mutuals-item-avatar cd-mutuals-item-avatar-fallback">${esc(init)}</div>`;
        return `
            <button type="button" class="cd-mutuals-item"
                    onclick="cdJumpToContact('${esc(c.id)}')">
                ${avatar}
                <span class="cd-mutuals-item-name">${esc(c.display_name || 'Unknown')}</span>
                <span class="cd-mutuals-item-chevron" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </span>
            </button>`;
    }).join('');

    const groupsHtml = (groups || []).map(g => {
        const init = (g.name || '?').trim().charAt(0).toUpperCase();
        const tile = g.logo_url
            ? `<img class="cd-mutuals-item-avatar cd-mutuals-item-avatar-square" src="${esc(g.logo_url)}" alt="">`
            : `<div class="cd-mutuals-item-avatar cd-mutuals-item-avatar-square cd-mutuals-item-avatar-fallback">${esc(init)}</div>`;
        return `
            <button type="button" class="cd-mutuals-item"
                    onclick="cdJumpToGroup('${esc(g.id)}')">
                ${tile}
                <span class="cd-mutuals-item-name">${esc(g.name || 'Group')}</span>
                <span class="cd-mutuals-item-chevron" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </span>
            </button>`;
    }).join('');

    const sections = [];
    if (contactsTotal > 0) {
        const cap = (contacts || []).length;
        const heading = (cap < contactsTotal)
            ? `Mutual contacts (${cap} of ${contactsTotal})`
            : `Mutual contacts (${contactsTotal})`;
        sections.push(`
            <div class="cd-mutuals-section">
                <div class="cd-mutuals-section-head">${esc(heading)}</div>
                <div class="cd-mutuals-list">${contactsHtml || '<div class="cd-mutuals-empty">None to show.</div>'}</div>
            </div>`);
    }
    if (groupsTotal > 0) {
        const cap = (groups || []).length;
        const heading = (cap < groupsTotal)
            ? `Shared groups (${cap} of ${groupsTotal})`
            : `Shared groups (${groupsTotal})`;
        sections.push(`
            <div class="cd-mutuals-section">
                <div class="cd-mutuals-section-head">${esc(heading)}</div>
                <div class="cd-mutuals-list">${groupsHtml || '<div class="cd-mutuals-empty">None to show.</div>'}</div>
            </div>`);
    }

    body.innerHTML = `
        <h3>You and ${esc(name || 'this contact')}</h3>
        <div class="cd-mutuals-dialog">
            ${sections.join('') || '<div class="cd-mutuals-empty">No mutuals yet.</div>'}
        </div>
        <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Close</button>
        </div>
    `;
    overlay.classList.remove('hidden');
}

function cdJumpToContact(contactId) {
    if (!contactId) return;
    closeModal({ refreshContactList: false });
    navigateTo('contactDetails', contactId);
}

function cdJumpToGroup(groupId) {
    if (!groupId) return;
    closeModal({ refreshContactList: false });
    navigateTo('groups');
    if (typeof selectGroupById === 'function') selectGroupById(groupId);
}

// ----- Vouch (delegates to existing 5-choice modal) --------------------------

function cdOnVouchClick(contactId, name) {
    openVouchWithContact(contactId, name);
}

function cdSetVouchedState(vouched) {
    const btn = document.getElementById('cd-vouch-btn');
    if (!btn) return;
    btn.classList.toggle('cd-action-filled', !!vouched);
    const label = btn.querySelector('.cd-action-label');
    if (label) label.textContent = vouched ? 'Vouched' : 'Vouch';
}

function cdOnAttested(contactId) {
    if (cdCurrentContactId !== contactId) return;
    cdSetVouchedState(true);
    cdFireConfetti();
    cdHaptic();
    // Bump stats: refetch trust summary in the background.
    db.rpc('get_contact_trust_summary', { p_contact_id: contactId })
        .then(({ data }) => {
            if (cdCurrentContactId !== contactId || !data) return;
            cdRenderTrust(data);
        }).catch(() => {});
}

window.addEventListener('union:attested', (e) => {
    if (e?.detail?.contactId) cdOnAttested(e.detail.contactId);
});

// ----- Toggles ---------------------------------------------------------------

async function cdOnToggleNotify(contactId) {
    const row = (contactsLoadedRows || []).find(r => r.contact?.contact_id === contactId);
    const next = !(row?.contact?.notify_nearby);
    cdSetSwitch('cd-toggle-notify', next);
    if (row?.contact) row.contact.notify_nearby = next;
    try {
        await toggleNotifyNearby(contactId, next);
    } catch (e) {
        cdSetSwitch('cd-toggle-notify', !next);
        if (row?.contact) row.contact.notify_nearby = !next;
    }
}

function cdOnToggleShareLoc(contactId) {
    const isOn = !!locationSharesOutbound[contactId];
    cdSetSwitch('cd-toggle-share', !isOn);
    // Defer to existing handler — it pops the duration modal when turning ON
    // (and silently stops when turning OFF). On modal cancel we'll reset.
    toggleShareLocation(contactId, !isOn);
}

function cdSetSwitch(rowId, on) {
    const rowEl = document.getElementById(rowId);
    if (!rowEl) return;
    const sw = rowEl.querySelector('.cd-switch');
    const ic = rowEl.querySelector('.cd-toggle-icon');
    if (sw) sw.classList.toggle('cd-switch-on', !!on);
    if (ic) ic.classList.toggle('cd-toggle-icon-on', !!on);
}

// Re-sync our location toggle when share state changes elsewhere
// (duration-modal confirm, expiration timer, realtime push, etc.).
window.addEventListener('union:locationShareChanged', () => {
    if (!cdCurrentContactId) return;
    cdSetSwitch('cd-toggle-share', !!locationSharesOutbound[cdCurrentContactId]);
    // Inbound shares may also have changed → refresh the sharing-location pane.
    cdRenderSharingLocationPane(cdCurrentContactId);
});

// The contact-locations cache refreshed (positions arrived from the server).
window.addEventListener('union:contactLocationsLoaded', () => {
    if (!cdCurrentContactId) return;
    cdRenderSharingLocationPane(cdCurrentContactId);
});

// ----- Sharing-location pane (only when they share with us) ------------------

function cdRenderSharingLocationPane(contactId) {
    const slot = document.getElementById('cd-sharing-location-slot');
    if (!slot) return;
    const isInbound = !!locationSharesInbound[contactId];
    if (!isInbound) { slot.innerHTML = ''; return; }

    const row  = (contactsLoadedRows || []).find(r => r.contact?.contact_id === contactId);
    const name = row?.profile?.display_name || 'Contact';
    const loc  = contactLocationsCache[contactId];

    const locKey = loc ? cdLocationKey(loc) : '';
    const updatedText = loc?.updated_at ? 'Updated ' + formatLastSeen(loc.updated_at) : 'Waiting for location\u2026';
    const headlinePlaceholder = loc ? 'Locating\u2026' : 'No location yet';

    slot.innerHTML = `
        <button type="button" class="cd-card cd-sharing-loc-card"
                onclick="cdOpenSharingLocation('${esc(contactId)}', '${esc(name)}')"
                ${loc ? '' : 'disabled aria-disabled="true"'}>
            <div class="cd-sharing-loc-tile" aria-hidden="true">${cdMapTileSvg()}</div>
            <div class="cd-sharing-loc-body">
                <div class="cd-sharing-loc-overline">
                    <span class="cd-sharing-loc-dot"></span>
                    Sharing location
                </div>
                <div class="cd-sharing-loc-headline" id="cd-sharing-loc-headline" data-loc-key="${esc(locKey)}">${esc(headlinePlaceholder)}</div>
                <div class="cd-sharing-loc-updated" id="cd-sharing-loc-updated">${esc(updatedText)}</div>
            </div>
            ${loc ? `<span class="cd-sharing-loc-view">
                View
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </span>` : ''}
        </button>
    `;

    if (loc) cdHydrateSharingLocationPane(contactId, loc);
}

async function cdHydrateSharingLocationPane(contactId, loc) {
    const locKey = cdLocationKey(loc);
    // Distance from me — best effort.
    let miles = null;
    try {
        const myPos = await getGPSLocation();
        if (myPos && cdCurrentContactId === contactId) {
            miles = haversineDistance(myPos.lat, myPos.lng, loc.lat, loc.lng);
        }
    } catch (_) { /* non-critical */ }

    // Reverse-geocode the contact's location into a place label.
    let label = '';
    try {
        label = await reverseGeocode(loc.lat, loc.lng);
    } catch (_) { /* non-critical */ }

    if (cdCurrentContactId !== contactId) return;
    const headlineEl = document.getElementById('cd-sharing-loc-headline');
    if (!headlineEl) return;
    if (headlineEl.dataset.locKey !== locKey) return;

    const distanceText = miles != null ? cdFormatDistanceShort(miles) : '';
    const parts = [distanceText, label].filter(Boolean);
    headlineEl.textContent = parts.length ? parts.join(' \u00B7 ') : 'Location available';
}

function cdLocationKey(loc) {
    if (!loc) return '';
    return [loc.lat, loc.lng, loc.updated_at || ''].join('|');
}

function cdFormatDistanceShort(miles) {
    if (miles < 0.1) return 'Right here';
    if (miles < 1)   return miles.toFixed(1) + ' mi away';
    if (miles < 10)  return miles.toFixed(1) + ' mi away';
    return Math.round(miles) + ' mi away';
}

function cdOpenSharingLocation(contactId, name) {
    if (!contactLocationsCache[contactId]) return;
    openContactLocationFullscreen(contactId, name);
}

function cdMapTileSvg() {
    // Stylised square map illustration with a pin — matches the design tile.
    return '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">'
        + '<rect width="64" height="64" rx="12" fill="#DCE6ED"/>'
        + '<g stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" opacity="0.9">'
        +   '<path d="M0 22 H64"/>'
        +   '<path d="M0 42 H64"/>'
        +   '<path d="M22 0 V64"/>'
        +   '<path d="M44 0 V64"/>'
        + '</g>'
        + '<circle cx="32" cy="32" r="8" fill="#3B7CA0"/>'
        + '<circle cx="32" cy="32" r="3" fill="#DCE6ED"/>'
        + '</svg>';
}

// ----- Met-on date save ------------------------------------------------------

function cdSaveMetOn(contactId, value) {
    saveFirstMetAt(contactId, value);
    const display = document.getElementById('cd-met-display');
    if (display) {
        const iso = value ? new Date(value + 'T12:00:00').toISOString() : null;
        display.textContent = formatFirstMetDisplay(iso);
    }
}

// ----- Confetti + haptics ----------------------------------------------------

function cdFireConfetti() {
    const root = document.getElementById('contactDetailsScreen');
    if (!root) return;
    const layer = document.createElement('div');
    layer.className = 'cd-confetti-layer';
    const colors = ['#E3AD4F', '#3B7CA0', '#5CA68A', '#E38B7E'];
    let html = '';
    for (let i = 0; i < 30; i++) {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const rot = Math.random() * 360;
        const color = colors[i % colors.length];
        html += `<div class="cd-confetti-piece" style="left:${left}%;background:${color};transform:rotate(${rot}deg);animation-delay:${delay.toFixed(2)}s;"></div>`;
    }
    layer.innerHTML = html;
    root.appendChild(layer);
    if (cdConfettiTimer) clearTimeout(cdConfettiTimer);
    cdConfettiTimer = setTimeout(() => {
        try { layer.remove(); } catch (_) {}
        cdConfettiTimer = null;
    }, 1700);
}

function cdHaptic() {
    if (!IS_NATIVE) return;
    try {
        const Haptics = window.Capacitor?.Plugins?.Haptics;
        if (!Haptics) return;
        // ImpactStyle.Medium — accept either string or object form.
        if (typeof Haptics.impact === 'function') {
            Haptics.impact({ style: 'MEDIUM' }).catch(() => {});
        }
    } catch (_) { /* haptics are best-effort */ }
}

// ----- Close / back ----------------------------------------------------------

function closeContactDetailsScreen() {
    cdCurrentContactId = null;
    if (cdConfettiTimer) { clearTimeout(cdConfettiTimer); cdConfettiTimer = null; }
    navigateTo('contacts');
}

// ----- Helpers ---------------------------------------------------------------

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function firstName(s) {
    if (!s) return 'them';
    return String(s).trim().split(/\s+/)[0];
}

// Patch the hero avatar on the Contact Details screen when the contact's
// profile picture changes. No-ops unless the details screen is currently
// showing this contact. Uses cacheBust (e.g. notification timestamp) to defeat
// HTTP caching when the storage URL stays the same across replacements.
function cdUpdateHeroAvatar(contactId, avatarUrl, cacheBust) {
    if (!contactId) return;
    if (typeof cdCurrentContactId === 'undefined' || cdCurrentContactId !== contactId) return;
    const heroEl = document.querySelector('#contactDetailsScreen .cd-hero-avatar');
    if (!heroEl) return;

    const row = (typeof contactsLoadedRows !== 'undefined' ? contactsLoadedRows : [])
        .find(r => r.contact?.contact_id === contactId);
    const name = row?.profile?.display_name || 'Unknown';
    const displayUrl = avatarUrl ? withImageCacheBust(avatarUrl, cacheBust) : null;

    if (displayUrl) {
        const onclickAttr = `event.stopPropagation(); cdOpenAvatarLightbox('${esc(contactId)}', '${esc(displayUrl)}', '${esc(name)}')`;
        if (heroEl.tagName === 'IMG') {
            heroEl.src = displayUrl;
            heroEl.setAttribute('onclick', onclickAttr);
        } else {
            const img = document.createElement('img');
            img.className = 'cd-hero-avatar';
            img.src = displayUrl;
            img.alt = '';
            img.setAttribute('onclick', onclickAttr);
            heroEl.replaceWith(img);
        }
    } else {
        const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
        const placeholder = document.createElement('div');
        placeholder.className = 'cd-hero-avatar cd-hero-avatar-fallback';
        placeholder.textContent = initial;
        placeholder.title = 'Suggest a profile picture';
        placeholder.setAttribute('onclick', `event.stopPropagation(); openSuggestPicture('${esc(contactId)}')`);
        heroEl.replaceWith(placeholder);
    }
}

// Open the lightbox on a contact's avatar with a "Suggest a new picture"
// action button, restoring the feature that lived on the old inline-expanded
// contact card.
function cdOpenAvatarLightbox(contactId, avatarUrl, _name) {
    openLightbox(avatarUrl, '', '', [
        {
            label: 'Suggest a new picture',
            variant: 'primary',
            onClick: () => {
                closeLightbox();
                openSuggestPicture(contactId);
            }
        }
    ]);
}

// Inline SVG icon helpers (kept local to avoid adding a global icon system).
function cdShieldIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
        + '<path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        + '</svg>';
}
function cdShareIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
        + '<path d="M16 6l-4-4-4 4M12 2v13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        + '</svg>';
}
function cdPhoneIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        + '</svg>';
}
function cdMessageIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        + '</svg>';
}
function cdCameraIcon() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="2"/>'
        + '</svg>';
}
function cdNearIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<circle cx="12" cy="12" r="2" fill="currentColor"/>'
        + '<circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="2" opacity="0.5"/>'
        + '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25"/>'
        + '</svg>';
}
function cdLocationIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2"/>'
        + '</svg>';
}
