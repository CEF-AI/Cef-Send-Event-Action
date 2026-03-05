import fs from 'node:fs';
import { createRequire } from 'node:module';
import { TextEncoder, TextDecoder } from 'util';
import '@fails-components/webtransport';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const require = createRequire(import.meta.url);

// ---- Environment ----

const eventPath    = process.env.GITHUB_EVENT_PATH;
const repo         = process.env.GITHUB_REPOSITORY;
const notionPageId = process.env.NOTION_PAGE_ID || '';
const notionApiKey = process.env.NOTION_API_KEY || '';
const githubToken  = process.env.GITHUB_TOKEN || '';
const eventType    = process.env.EVENT_TYPE || 'GITHUB_ACTION_PR_EVENT';

const ddcBaseUrl   = process.env.DDC_BASE_URL;
const agentService = process.env.AGENT_SERVICE;
const workspace    = process.env.WORKSPACE;
const stream       = process.env.STREAM || '';
const walletUri    = process.env.WALLET_URI;

console.log('=== PR-to-CEF Script Starting ===');
console.log(`  Repo:            ${repo}`);
console.log(`  DDC Base URL:    ${ddcBaseUrl}`);
console.log(`  Agent Service:   ${agentService}`);
console.log(`  Workspace:       ${workspace}`);
console.log(`  Stream:          ${stream || '(none)'}`);
console.log(`  Event Type:      ${eventType}`);
console.log(`  Notion Page ID:  ${notionPageId || '(none)'}`);
console.log(`  Notion API Key:  ${notionApiKey ? '***set***' : '(missing!)'}`);
console.log(`  Wallet URI:      ${walletUri ? '***set***' : '(missing!)'}`);
console.log(`  GitHub Token:    ${githubToken ? '***set***' : '(missing!)'}`);

if (!eventPath)    throw new Error('Missing GITHUB_EVENT_PATH');
if (!repo)         throw new Error('Missing GITHUB_REPOSITORY');
if (!ddcBaseUrl)   throw new Error('Missing DDC_BASE_URL');
if (!agentService) throw new Error('Missing AGENT_SERVICE');
if (!workspace)    throw new Error('Missing WORKSPACE');
if (!walletUri)    throw new Error('Missing WALLET_URI');

// ---- Read GitHub event ----

const ghEvent = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
const pr = ghEvent.pull_request;

if (!pr) {
  console.log('No pull_request in event payload. Exiting.');
  process.exit(0);
}

console.log(`\n=== PR Event ===`);
console.log(`  Action:    ${ghEvent.action}`);
console.log(`  PR #${pr.number}: ${pr.title}`);
console.log(`  Author:    ${pr.user?.login}`);
console.log(`  Merged:    ${!!pr.merged}`);
console.log(`  URL:       ${pr.html_url}`);

// ---- Initialize DDC ClientSdk ----

console.log(`\n=== Initializing DDC ClientSdk ===`);

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

// ---- Build and send payload ----

const payload = {
  event_type: eventType,
  action: ghEvent.action,
  merged: !!pr.merged,
  pr_number: pr.number,
  pr_title: pr.title,
  pr_url: pr.html_url,
  pr_body: pr.body || '',
  repo,
  author: pr.user?.login || null,
  merged_by: pr.merged_by?.login || null,
  merged_at: pr.merged_at || null,
  base_branch: pr.base?.ref || null,
  timestamp: new Date().toISOString(),
  notion_page_id: notionPageId || null,
  notion_api_key: notionApiKey || null,
  delivery_id: `${repo}#${pr.number}#${Date.now()}`,
  github_token: githubToken || null,
};

console.log(`\n=== Sending to CEF ===`);
console.log(`  Event:       ${eventType}`);
console.log(`  PR:          #${pr.number} (${ghEvent.action})`);
console.log(`  Delivery ID: ${payload.delivery_id}`);

try {
  const result = await sdk.event.create(eventType, payload);

  if (result?.error) {
    console.error(`\n=== CEF Event Rejected ===`);
    console.error(`  Code:    ${result.error.code}`);
    console.error(`  Message: ${result.error.message}`);
    process.exit(1);
  }

  console.log(`\n=== Success ===`);
  console.log(`  Result: ${JSON.stringify(result, null, 2)}`);
} catch (err) {
  console.error(`\n=== CEF Event Failed ===`);
  console.error(`  Error: ${err.message}`);
  if (err.stack) console.error(`  Stack: ${err.stack}`);
  throw err;
}

console.log(`\nDone. PR #${pr.number} (${ghEvent.action}) sent to CEF.`);
