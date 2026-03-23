async function sendAttestation(contactId, type) {
    if (!currentUser) return;
    try {
        const { data, error } = await db.rpc('create_attestation', {
            p_to_user_id: contactId,
            p_attestation_type: type
        });
        if (error) throw error;
        const messageMap = {
            profile_picture_accurate: 'Profile picture accuracy recorded',
            respect: 'Respect recorded',
            trust: 'Trust recorded',
            love: 'Love recorded',
            help: 'Help recorded'
        };
        showToast(messageMap[type] || 'Attestation recorded', 'info');
    } catch (e) {
        console.error('Attestation error:', e);
        showToast(e.message || 'Could not send attestation', 'error');
    }
}

let heartDialogTimer = null;
async function openHeartDialog() {
    if (!currentUser) return;
    try {
        const { data, error } = await db.rpc('get_my_attestation_counts');
        if (error) throw error;

        const love        = data.love_count            || 0;
        const trust       = data.trust_count           || 0;
        const respect     = data.respect_count         || 0;
        const help        = data.help_count            || 0;
        const pic         = data.profile_picture_count || 0;
        const sponsDirect = data.sponsored_direct      || 0;
        const sponsMore   = data.sponsored_indirect    || 0;

        const lines = [];

        if (sponsDirect > 0) {
            const personWord = sponsDirect === 1 ? 'person' : 'people';
            let line = `You have sponsored ${sponsDirect} ${personWord}`;
            if (sponsMore > 0) line += `, who have sponsored ${sponsMore} more`;
            lines.push(line + '.');
        }

        const picLine    = formatHeartStatLine(pic,     'people have validated your profile picture');
        const helpLine   = formatHeartStatLine(help,    'others will help you');
        const respLine   = formatHeartStatLine(respect, 'others respect you');
        const trustLine  = formatHeartStatLine(trust,   'others trust you');
        const loveLine   = formatHeartStatLine(love,    'others love you');

        if (picLine)   lines.push(picLine);
        if (helpLine)  lines.push(helpLine);
        if (respLine)  lines.push(respLine);
        if (trustLine) lines.push(trustLine);
        if (loveLine)  lines.push(loveLine);

        if (lines.length === 0) lines.push('No attestations yet.');

        const html = lines.map(l => `<p style="margin:0.35rem 0;">${esc(l)}</p>`).join('');
        showModal('heartDialog');
        document.getElementById('modalBody').innerHTML = `
            <h3 style="margin-bottom:1rem;">❤️ Love &amp; Trust</h3>
            <div style="font-size:1.05rem;line-height:1.6;">${html}</div>`;
        heartDialogTimer = setTimeout(() => {
            const overlay = document.getElementById('modalOverlay');
            if (overlay && !overlay.classList.contains('hidden')) closeModal();
        }, 5000);
    } catch (e) {
        console.error('Heart dialog error:', e);
        showToast('Could not load attestations', 'error');
    }
}

// Returns a display line for a vouch count.
// When count < 10 the number is omitted for privacy.
// phrase is written as it appears after "More than N" — e.g. "others love you"
function formatHeartStatLine(count, phrase) {
    if (count <= 0) return null;
    if (count < 10) return phrase.charAt(0).toUpperCase() + phrase.slice(1) + '.';
    const rounded = Math.floor(count / 10) * 10;
    return `More than ${rounded} ${phrase}.`;
}
