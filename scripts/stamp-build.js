#!/usr/bin/env node
// Stamps the current build version into the built `www/` directory.
// Mirrors what .github/workflows/deploy.yml does for the web deploy, so that
// Capacitor iOS builds also get a real version string instead of the
// `__BUILD_VERSION__` placeholder.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WWW_DIR = path.resolve(__dirname, '..', 'www');

function gitShortSha() {
    try {
        return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch (_) {
        return 'dev';
    }
}

function gitDirty() {
    try {
        const out = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
        return out.length > 0;
    } catch (_) {
        return false;
    }
}

function formatTimestamp(d) {
    // Match deploy.yml format: "Mon DD HH:MM TZ" in America/Los_Angeles.
    const opts = {
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZoneName: 'short'
    };
    // Intl gives us pieces; assemble them in the same shape.
    const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(d);
    const get = (t) => (parts.find(p => p.type === t) || {}).value || '';
    return `${get('month')} ${get('day')} ${get('hour')}:${get('minute')} ${get('timeZoneName')}`;
}

function walk(dir, fileList = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, fileList);
        } else if (entry.isFile()) {
            fileList.push(full);
        }
    }
    return fileList;
}

function stamp() {
    if (!fs.existsSync(WWW_DIR)) {
        console.error(`stamp-build: ${WWW_DIR} does not exist; run \`npm run build\` first.`);
        process.exit(1);
    }

    const sha = gitShortSha();
    const timestamp = formatTimestamp(new Date());
    const dirtyMark = gitDirty() ? '+' : '';
    const version = `${sha}${dirtyMark} ${timestamp}`;

    console.log(`stamp-build: build version = "${version}"`);

    // Only touch text files we know contain the placeholders. Keeps things fast
    // and avoids accidentally rewriting binary assets.
    const targets = ['index.html', 'sw.js'];
    for (const rel of targets) {
        const file = path.join(WWW_DIR, rel);
        if (!fs.existsSync(file)) continue;
        const before = fs.readFileSync(file, 'utf8');
        const after = before
            .replace(/__BUILD_VERSION__/g, version)
            .replace(/__BUILD_HASH__/g, sha);
        if (after !== before) {
            fs.writeFileSync(file, after);
            console.log(`stamp-build: stamped ${rel}`);
        }
    }
}

stamp();
