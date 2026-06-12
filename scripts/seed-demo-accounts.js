#!/usr/bin/env node
// Upload AI-generated demo portraits to Supabase Storage and set profile_image_url.
// Requires: SUPABASE_SERVICE_ROLE_KEY env var (never commit).
// Run after admin_seed_demo_accounts() has created the demo users.

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vdpqgmrfvlaieqpvpdcr.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'demo-accounts.json');
const PORTRAITS_DIR = path.join(ROOT, 'assets', 'demo-portraits');

if (!SERVICE_KEY) {
    console.error('Set SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard → Settings → API → service_role).');
    process.exit(1);
}

const headers = {
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
};

async function api(pathname, options = {}) {
    const res = await fetch(`${SUPABASE_URL}${pathname}`, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) },
    });
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
        throw new Error(`${options.method || 'GET'} ${pathname} → ${res.status}: ${text}`);
    }
    return body;
}

async function findDemoUserId(displayName) {
    const params = new URLSearchParams({
        select: 'id',
        is_demo_account: 'eq.true',
        display_name: `eq.${displayName}`,
    });
    const rows = await api(`/rest/v1/profiles?${params}`, {
        headers: { ...headers, Accept: 'application/json' },
    });
    return rows?.[0]?.id || null;
}

async function uploadPortrait(userId, filePath) {
    const buf = fs.readFileSync(filePath);
    const storagePath = `${userId}/profile.jpg`;
    await api(`/storage/v1/object/avatars/${storagePath}`, {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': 'image/jpeg',
            'x-upsert': 'true',
        },
        body: buf,
    });
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${storagePath}`;
    await api(`/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
            ...headers,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
        },
        body: JSON.stringify({ profile_image_url: publicUrl }),
    });
    return publicUrl;
}

async function main() {
    if (!fs.existsSync(DATA_PATH)) {
        console.error(`Missing ${DATA_PATH}`);
        process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const accounts = data.accounts || [];
    let ok = 0;
    let skip = 0;

    for (const acct of accounts) {
        const portraitPath = path.join(PORTRAITS_DIR, acct.portrait_file);
        if (!fs.existsSync(portraitPath)) {
            console.warn(`Skip ${acct.display_name}: missing ${portraitPath}`);
            skip++;
            continue;
        }

        const userId = await findDemoUserId(acct.display_name);
        if (!userId) {
            console.warn(`Skip ${acct.display_name}: demo profile not found (run admin_seed_demo_accounts first)`);
            skip++;
            continue;
        }

        const url = await uploadPortrait(userId, portraitPath);
        console.log(`OK ${acct.display_name} → ${url}`);
        ok++;
    }

    console.log(`\nDone: ${ok} uploaded, ${skip} skipped.`);
    if (ok > 0) {
        console.log('In admin panel, click Refresh trust scores, then toggle demo accounts ON.');
    }
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
