function startSponsorMeet() {
    if (!selectedGroup) return;

    const overlay = document.getElementById('modalOverlay');
    const body = document.getElementById('modalBody');
    overlay.classList.remove('hidden');

    body.innerHTML = `
        <h3>Sponsor a New Member</h3>
        <form id="sponsorNameForm">
            <div class="form-group">
                <label>Describe the person you'd like to sponsor</label>
                <textarea id="sponsorMessage" rows="2" placeholder="e.g. Jane Smith, my colleague"></textarea>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Next</button>
            </div>
        </form>
    `;

    document.getElementById('sponsorNameForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const message = document.getElementById('sponsorMessage').value.trim() || null;
        closeModal({ refreshContactList: false });
        openMeetScreen({
            groupId: selectedGroup.id,
            groupName: selectedGroup.name,
            message: message
        });
    });
}
