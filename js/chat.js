const CHAT_PAGE_SIZE = 25;

async function renderChatTab() {
    if (!selectedGroup) return;
    const content = document.getElementById('tabContent');

    content.innerHTML = `
        <div class="chat-container" id="chatContainer">
            <div class="chat-load-more" id="chatLoadMore" style="display:none;">
                <button class="btn btn-secondary btn-small" onclick="loadOlderMessages()">Load older messages…</button>
            </div>
            <div class="chat-messages" id="chatMessages">
                <p style="color:var(--dark-gray);text-align:center;padding:2rem 0;">Loading…</p>
            </div>
            <div class="chat-input-bar">
                <input type="text" id="chatInput" placeholder="Type a message…" maxlength="2000"
                       onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMessage();}">
                <button class="btn-icon chat-map-btn" onclick="openMapPicker()" title="Share location" type="button">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </button>
                <button class="btn btn-primary" onclick="sendChatMessage()">Send</button>
            </div>
        </div>
    `;

    // Size the chat container to fill remaining viewport
    sizeChatContainer();

    // Build profile cache from current members
    await buildProfileCache();

    // Load initial messages
    const msgsEl = document.getElementById('chatMessages');
    msgsEl.innerHTML = '';
    await loadChatMessages();
}

function sizeChatContainer() {
    const el = document.getElementById('chatContainer');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Fill from the top of the container to the bottom of the viewport, with a small margin
    const available = window.innerHeight - rect.top - 16;
    el.style.height = Math.max(available, 300) + 'px';
}

// Resize chat on window resize
window.addEventListener('resize', () => {
    if (activeTab === 'chat') sizeChatContainer();
});

async function buildProfileCache() {
    if (!selectedGroup) return;
    const { data } = await db
        .from('members')
        .select('user_id, profiles(display_name, profile_image_url)')
        .eq('group_id', selectedGroup.id);
    if (data) {
        data.forEach(m => {
            if (m.profiles) {
                profileCache[m.user_id] = {
                    name: m.profiles.display_name,
                    avatar: m.profiles.profile_image_url || null
                };
            }
        });
    }
    // Always include current user
    if (currentProfile && currentUser) {
        profileCache[currentUser.id] = {
            name: currentProfile.display_name,
            avatar: currentProfile.profile_image_url || null
        };
    }
}

async function getDisplayName(userId) {
    if (profileCache[userId]) return profileCache[userId].name;
    // Fetch on demand for former members
    const { data } = await db.from('profiles').select('display_name, profile_image_url').eq('id', userId).single();
    if (data) {
        profileCache[userId] = { name: data.display_name, avatar: data.profile_image_url || null };
        return data.display_name;
    }
    return 'Unknown';
}

function getAvatarUrl(userId) {
    return profileCache[userId]?.avatar || null;
}

async function loadChatMessages(before) {
    if (!selectedGroup) return;
    let query = db
        .from('chat_messages')
        .select('*')
        .eq('group_id', selectedGroup.id)
        .order('created_at', { ascending: false })
        .limit(CHAT_PAGE_SIZE);

    if (before) {
        query = query.lt('created_at', before);
    }

    const { data, error } = await query;
    if (error) { console.error('loadChatMessages error:', error); return; }

    const msgsEl = document.getElementById('chatMessages');
    const loadMoreEl = document.getElementById('chatLoadMore');
    if (!msgsEl) return;

    // Messages come newest-first; reverse so oldest is at top
    const messages = (data || []).reverse();

    if (messages.length > 0) {
        // Remember scroll position to restore after prepending
        const prevScrollHeight = msgsEl.scrollHeight;

        const fragment = document.createDocumentFragment();
        for (const msg of messages) {
            fragment.appendChild(await createMessageElement(msg));
        }

        if (before) {
            // Prepending older messages — insert at top
            msgsEl.insertBefore(fragment, msgsEl.firstChild);
            // Restore scroll position so the view doesn't jump
            msgsEl.scrollTop = msgsEl.scrollHeight - prevScrollHeight;
        } else {
            // Initial load — append and scroll to bottom
            msgsEl.appendChild(fragment);
            msgsEl.scrollTop = msgsEl.scrollHeight;
        }
    } else if (!before) {
        // No messages at all
        msgsEl.innerHTML = '<p style="color:var(--dark-gray);text-align:center;padding:2rem 0;">No messages yet. Start the conversation!</p>';
    }

    // Show/hide "Load older" button
    if (loadMoreEl) {
        loadMoreEl.style.display = (data && data.length === CHAT_PAGE_SIZE) ? 'block' : 'none';
        // Store the oldest message timestamp for next page
        if (messages.length > 0) {
            loadMoreEl.dataset.before = messages[0].created_at;
        }
    }
}

async function loadOlderMessages() {
    const loadMoreEl = document.getElementById('chatLoadMore');
    if (!loadMoreEl || !loadMoreEl.dataset.before) return;
    await loadChatMessages(loadMoreEl.dataset.before);
}

async function createMessageElement(msg) {
    const isMine = msg.user_id === currentUser?.id;
    const div = document.createElement('div');
    div.classList.add('chat-msg');
    if (isMine) div.classList.add('chat-msg-mine');
    div.dataset.msgId = msg.id;

    const name = await getDisplayName(msg.user_id);
    const avatar = getAvatarUrl(msg.user_id);
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = new Date(msg.created_at);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const timeStr = isToday ? time : date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;

    const loc = parseLocationBody(msg.body);
    const bubbleContent = loc ? '<div class="chat-location-wrap"></div>' : esc(msg.body);

    if (isMine) {
        div.innerHTML = `<div class="chat-bubble">${bubbleContent}</div><div class="chat-msg-time">${timeStr}</div>`;
    } else {
        const avatarHtml = avatar
            ? `<img class="chat-avatar" src="${esc(avatar)}" alt="">`
            : `<div class="chat-avatar chat-avatar-placeholder">${esc(name.charAt(0).toUpperCase())}</div>`;
        div.innerHTML = `
            <div class="chat-msg-sender">${esc(name)}</div>
            <div class="chat-msg-row">
                ${avatarHtml}
                <div>
                    <div class="chat-bubble">${bubbleContent}</div>
                    <div class="chat-msg-time">${timeStr}</div>
                </div>
            </div>`;
    }

    if (loc) {
        const wrap = div.querySelector('.chat-location-wrap');
        if (wrap) renderLocationPreview(wrap, loc.lat, loc.lng, loc.radius);
    }

    return div;
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    if (!input || !selectedGroup) return;
    const body = input.value.trim();
    if (!body) return;

    input.disabled = true;
    const { data: msg, error } = await db.from('chat_messages').insert({
        group_id: selectedGroup.id,
        user_id: currentUser.id,
        body: body
    }).select().single();
    input.disabled = false;

    if (error) {
        showToast('Failed to send message: ' + error.message, 'error');
    } else {
        input.value = '';
        input.focus();
        // Immediately show the sent message in the UI
        if (msg) appendChatMessage(msg);
    }
}

function appendChatMessage(msg) {
    const msgsEl = document.getElementById('chatMessages');
    if (!msgsEl) return;

    // Skip if this message is already rendered (avoids duplicates from Realtime + direct append)
    if (msgsEl.querySelector(`[data-msg-id="${msg.id}"]`)) return;

    // Remove "no messages" placeholder if present
    const placeholder = msgsEl.querySelector('p');
    if (placeholder && placeholder.textContent.includes('No messages')) {
        placeholder.remove();
    }

    // Check if we're near the bottom before appending
    const atBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 60;

    createMessageElement(msg).then(el => {
        msgsEl.appendChild(el);
        // Auto-scroll if user was at (or near) the bottom
        if (atBottom) {
            msgsEl.scrollTop = msgsEl.scrollHeight;
        }
    });
}
