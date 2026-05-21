#!/usr/bin/env node
// Print Supabase CLI commands to configure FCM secrets for send-push-apns.
// Reads a Firebase service-account JSON file (never commit this file).

const fs = require('fs');
const path = require('path');

const jsonPath = process.argv[2];
if (!jsonPath) {
    console.error('Usage: node scripts/setup-fcm-secrets.js path/to/firebase-service-account.json');
    console.error('');
    console.error('Get the JSON from Firebase Console -> Project settings -> Service accounts');
    console.error('-> Generate new private key.');
    process.exit(1);
}

const abs = path.resolve(jsonPath);
if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
}

let data;
try {
    data = JSON.parse(fs.readFileSync(abs, 'utf8'));
} catch (e) {
    console.error('Invalid JSON:', e.message);
    process.exit(1);
}

const { project_id, client_email, private_key } = data;
if (!project_id || !client_email || !private_key) {
    console.error('JSON missing project_id, client_email, or private_key');
    process.exit(1);
}

const escapedKey = private_key.replace(/\n/g, '\\n');

console.log('# Run from repo root with Supabase CLI linked to your project:\n');
console.log(`supabase secrets set FCM_PROJECT_ID=${project_id}`);
console.log(`supabase secrets set FCM_CLIENT_EMAIL=${client_email}`);
console.log(`supabase secrets set FCM_PRIVATE_KEY="${escapedKey}"`);
console.log('');
console.log('# Redeploy the edge function after setting secrets:');
console.log('supabase functions deploy send-push-apns');
console.log('');
console.log('# Verify vault secret apns_edge_fn_url points to the deployed function URL');
console.log('# (Supabase Dashboard -> Project Settings -> Vault, or SQL Editor).');
