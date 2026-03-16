function handleAvatarSelect(input) {
    const file = input.files?.[0];
    if (!file) return;
    uploadAvatar(file);
    input.value = ''; // reset so same file can be re-selected
}

async function uploadAvatar(file) {
    if (!selectedGroup || !currentUser) return;

    showToast('Uploading photo…', 'info');

    try {
        // Resize image client-side to max 256x256
        const resized = await resizeImage(file, 256);

        const filePath = `${currentUser.id}/${selectedGroup.id}.jpg`;

        // Upload to Supabase Storage (upsert to overwrite)
        const { error: uploadErr } = await db.storage
            .from('avatars')
            .upload(filePath, resized, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (uploadErr) {
            showToast('Upload failed: ' + uploadErr.message, 'error');
            return;
        }

        // Get the public URL
        const { data: urlData } = db.storage.from('avatars').getPublicUrl(filePath);
        // Append cache-buster so the browser loads the new image
        const publicUrl = urlData.publicUrl + '?t=' + Date.now();

        // Update the members row via SECURITY DEFINER RPC (no direct UPDATE policy on members)
        const { error: updateErr } = await db.rpc('update_avatar', {
            p_group_id: selectedGroup.id,
            p_avatar_url: publicUrl
        });

        if (updateErr) {
            showToast('Failed to save: ' + updateErr.message, 'error');
            return;
        }

        // Update current membership in memory
        const mem = myGroups.find(m => m.group_id === selectedGroup.id);
        if (mem) mem.avatar_url = publicUrl;

        // Update UI
        setGroupAvatar(publicUrl);
        setHeaderAvatar(publicUrl);

        showToast('Photo updated!', 'success');
    } catch (e) {
        console.error('Avatar upload error:', e);
        showToast('Upload failed: ' + e.message, 'error');
    }
}

function resizeImage(file, maxSize) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
            else { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas toBlob failed'));
            }, 'image/jpeg', 0.85);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
        img.src = url;
    });
}

function setGroupAvatar(url) {
    const el = document.getElementById('groupAvatarImg');
    if (!el) return;
    if (url) {
        // Replace placeholder with actual img
        const parent = el.parentElement;
        const img = document.createElement('img');
        img.className = 'group-avatar';
        img.id = 'groupAvatarImg';
        img.src = url;
        img.alt = 'Your photo';
        parent.replaceChild(img, el);
    } else {
        // Show placeholder
        if (el.tagName === 'IMG') {
            const parent = el.parentElement;
            const placeholder = document.createElement('div');
            placeholder.className = 'group-avatar-placeholder';
            placeholder.id = 'groupAvatarImg';
            placeholder.textContent = '📷';
            parent.replaceChild(placeholder, el);
        }
    }
}

function setHeaderAvatar(url) {
    const el = document.getElementById('headerAvatar');
    if (!el) return;
    if (url) {
        el.src = url;
        el.classList.remove('hidden');
    } else {
        el.src = '';
        el.classList.add('hidden');
    }
}
