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
            love: 'Love recorded'
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
        const love = data.love_count || 0;
        const trust = data.trust_count || 0;
        const msg = formatAttestationMessage(love, trust);
        showModal('heartDialog');
        document.getElementById('modalBody').innerHTML = `
            <h3 style="margin-bottom:1rem;">❤️ Love &amp; Trust</h3>
            <p style="font-size:1.05rem;line-height:1.6;">${esc(msg)}</p>`;
        heartDialogTimer = setTimeout(() => {
            const overlay = document.getElementById('modalOverlay');
            if (overlay && !overlay.classList.contains('hidden')) closeModal();
        }, 5000);
    } catch (e) {
        console.error('Heart dialog error:', e);
        showToast('Could not load attestations', 'error');
    }
}

function formatAttestationMessage(love, trust) {
    if (love === 0 && trust === 0) return 'No attestations yet.';

    const lovePart = formatSingleAttestation(love, 'loved');
    const trustPart = formatSingleAttestation(trust, 'trusted');

    if (lovePart && trustPart) {
        if (love < 10 && trust < 10) {
            return 'You are loved and trusted by others.';
        }
        return lovePart + ', and ' + trustPart.replace('You are ', '').replace(/\.$/, '') + '.';
    }
    return lovePart || trustPart;
}

function formatSingleAttestation(count, verb) {
    if (count === 0) return '';
    if (count < 10) return `You are ${verb} by others.`;
    const rounded = Math.floor(count / 10) * 10;
    return `You are ${verb} by more than ${rounded} people.`;
}
