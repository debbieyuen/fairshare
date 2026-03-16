async function createSponsorship(e) {
    e.preventDefault();
    if (!selectedGroup) return;

    const message = document.getElementById('sponsorMessage').value.trim() || null;

    const { data, error } = await db
        .from('sponsorships')
        .insert({
            group_id: selectedGroup.id,
            sponsor_id: currentUser.id,
            message: message
        })
        .select('token')
        .single();

    if (error) { showToast(error.message, 'error'); return; }

    // Log the sponsorship offer event
    const sponsorSummary = `${esc(currentProfile.display_name)} offered sponsorship to ${esc(message || 'a new candidate')}`;
    await db.rpc('log_group_event', {
        p_group_id: selectedGroup.id,
        p_event_type: 'sponsorship_offered',
        p_summary: sponsorSummary,
        p_metadata: { message: message }
    });

    // Build the invite URL
    const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${data.token}`;

    // Replace the form with the generated link and QR code
    document.getElementById('sponsorFormArea').innerHTML = `
        <p style="margin-bottom:1rem;color:var(--dark-gray);">
            Share this invite link with the person you'd like to sponsor.
            It will expire in 7 days.
        </p>
        <div class="form-group">
            <label>Invite Link</label>
            <div style="display:flex;gap:0.5rem;">
                <input type="text" id="inviteLinkField" value="${esc(inviteUrl)}" readonly
                    style="flex:1;background:var(--light-gray);cursor:text;">
                <button type="button" class="btn btn-primary" onclick="copyInviteLink()">Copy</button>
            </div>
        </div>
        <div id="qrCode" style="display:flex;justify-content:center;margin:1rem 0;"></div>
        <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Done</button>
        </div>
    `;

    // Render QR code for the invite URL
    const qr = qrcode(0, 'M');
    qr.addData(inviteUrl);
    qr.make();
    document.getElementById('qrCode').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4 });
}

function copyInviteLink() {
    const field = document.getElementById('inviteLinkField');
    field.select();
    navigator.clipboard.writeText(field.value).then(() => {
        showToast('Invite link copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback for older browsers
        document.execCommand('copy');
        showToast('Invite link copied!', 'success');
    });
}
