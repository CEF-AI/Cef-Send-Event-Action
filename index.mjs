import { createRequire } from 'node:module';
import { TextEncoder, TextDecoder } from 'util';
import '@fails-components/webtransport';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const require = createRequire(import.meta.url);

// ---- Environment ----

const eventType   = process.env.EVENT_TYPE;
const eventPayload = process.env.EVENT_PAYLOAD ?? '{}';
const ddcBaseUrl   = process.env.DDC_BASE_URL;
const agentService = process.env.AGENT_SERVICE;
const workspace    = process.env.WORKSPACE;
const stream       = process.env.STREAM || '';
const walletUri    = process.env.WALLET_URI;

console.log('=== CEF Send Event ===');
console.log(`  DDC Base URL:    ${ddcBaseUrl}`);
console.log(`  Agent Service:   ${agentService}`);
console.log(`  Workspace:       ${workspace}`);
console.log(`  Stream:          ${stream || '(none)'}`);
console.log(`  Event Type:      ${eventType}`);
console.log(`  Wallet URI:      ${walletUri ? '***set***' : '(missing!)'}`);

if (!ddcBaseUrl)   throw new Error('Missing DDC_BASE_URL');
if (!agentService) throw new Error('Missing AGENT_SERVICE');
if (!workspace)    throw new Error('Missing WORKSPACE');
if (!walletUri)    throw new Error('Missing WALLET_URI');
if (!eventType)    throw new Error('Missing EVENT_TYPE');

// ---- Parse payload ----

let payload;
try {
  payload = JSON.parse(eventPayload);
} catch (err) {
  throw new Error(`Invalid EVENT_PAYLOAD JSON: ${err.message}`);
}

if (typeof payload !== 'object' || payload === null) {
  payload = {};
}

// Optional minimal metadata for dedupe/logging
const runId = process.env.GITHUB_RUN_ID;
if (runId) {
  payload.delivery_id = payload.delivery_id ?? `${runId}-${Date.now()}`;
}
payload.timestamp = payload.timestamp ?? new Date().toISOString();

// ---- Initialize DDC ClientSdk ----

console.log('\n=== Initializing DDC ClientSdk ===');

const { ClientSdk } = require('@cere-ddc-sdk/client');

const sdk = new ClientSdk({
  url: ddcBaseUrl,
  context: {
    agent_service: agentService,
    workspace,
    stream,
  },
  wallet: walletUri,
});

console.log('  ClientSdk initialized.');

// ---- Send event ----

console.log('\n=== Sending to CEF ===');
console.log(`  Event:  ${eventType}`);
console.log(`  Keys:   ${Object.keys(payload).join(', ')}`);

try {
  const result = await sdk.event.create(eventType, payload);

  if (result?.error) {
    console.error('\n=== CEF Event Rejected ===');
    console.error(`  Code:    ${result.error.code}`);
    console.error(`  Message: ${result.error.message}`);
    process.exit(1);
  }

  console.log('\n=== Success ===');
  console.log(`  Result: ${JSON.stringify(result, null, 2)}`);
} catch (err) {
  console.error('\n=== CEF Event Failed ===');
  console.error(`  Error: ${err.message}`);
  if (err.stack) console.error(`  Stack: ${err.stack}`);
  throw err;
}

console.log('\nDone. Event sent to CEF.');
