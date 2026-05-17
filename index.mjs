import { TextEncoder, TextDecoder } from 'node:util';
import { readFileSync } from 'node:fs';
import {
  AgreementAlreadyExistsError,
  ClientContext,
  ClientSdk,
  UriSigner,
} from '@cef-ai/client-sdk';

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

const DEFAULT_BASE_URL = 'https://orchestrator.compute.test.ddcdragon.com';
const DEFAULT_GAR_URL = 'https://gar.compute.test.ddcdragon.com/';
const DEFAULT_WEB_TRANSPORT_URL = 'https://agent.compute.test.ddcdragon.com:4433';
const DEFAULT_EVENT_URL = 'https://events.compute.test.ddcdragon.com';
const DEFAULT_AGENT_RUNTIME_URL = 'https://agent.compute.test.ddcdragon.com';
const DEFAULT_SIS_URL = 'https://sis.compute.test.ddcdragon.com';

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const stringValue = String(value);
    if (stringValue.trim() !== '') return stringValue;
  }

  return '';
}

function stripHexPrefix(value) {
  return value.startsWith('0x') ? value.slice(2) : value;
}

const eventType = firstNonEmpty(process.env.INPUT_EVENT_TYPE, process.env.EVENT_TYPE);
const eventPayload = firstNonEmpty(process.env.INPUT_EVENT_PAYLOAD, process.env.EVENT_PAYLOAD, '{}');
const agentService = stripHexPrefix(
  firstNonEmpty(
    process.env.INPUT_AGENT_SERVICE,
    process.env.AGENT_SERVICE,
    process.env.CEF_AGENT_SERVICE,
    '32782e0045c83a1ab2c14d88c71b919ffb6ffef9a228bebb7c73f563d611f213',
  ),
);
const workspace = firstNonEmpty(process.env.INPUT_WORKSPACE, process.env.WORKSPACE, process.env.CEF_WORKSPACE, '2221');
const stream = firstNonEmpty(process.env.INPUT_STREAM, process.env.STREAM, process.env.CEF_STREAM, 'stream-d5b026ae');
const walletUri = firstNonEmpty(process.env.INPUT_WALLET_URI, process.env.WALLET_URI, process.env.CEF_WALLET_URI);
const geminiApiKey = firstNonEmpty(
  process.env.INPUT_GEMINI_API_KEY,
  process.env.GEMINI_API_KEY,
  process.env.CEF_GEMINI_API_KEY,
);
const agreementTtlSeconds = Number.parseInt(
  firstNonEmpty(process.env.INPUT_AGREEMENT_TTL_SECONDS, process.env.AGREEMENT_TTL_SECONDS, process.env.CEF_AGREEMENT_TTL_SECONDS, '86400'),
  10,
);
const senderMode = firstNonEmpty(
  process.env.INPUT_SENDER_MODE,
  process.env.SENDER_MODE,
  process.env.CEF_GITHUB_TRACKER_SENDER_MODE,
  process.env.CEF_SENDER_MODE,
  'auto',
).toLowerCase();
const centralSenderUrl = firstNonEmpty(
  process.env.INPUT_CENTRAL_SENDER_URL,
  process.env.CENTRAL_SENDER_URL,
  process.env.CEF_GITHUB_TRACKER_CENTRAL_SENDER_URL,
  process.env.CEF_CENTRAL_SENDER_URL,
);
const centralSenderTimeoutSeconds = Number.parseInt(
  firstNonEmpty(
    process.env.INPUT_CENTRAL_SENDER_TIMEOUT_SECONDS,
    process.env.CENTRAL_SENDER_TIMEOUT_SECONDS,
    process.env.CEF_GITHUB_TRACKER_CENTRAL_SENDER_TIMEOUT_SECONDS,
    process.env.CEF_CENTRAL_SENDER_TIMEOUT_SECONDS,
    '240',
  ),
  10,
);

const BASE_URL = firstNonEmpty(process.env.INPUT_BASE_URL, process.env.BASE_URL, process.env.DDC_BASE_URL, process.env.CEF_DDC_BASE_URL, DEFAULT_BASE_URL);
const GAR_URL = firstNonEmpty(process.env.INPUT_GAR_URL, process.env.GAR_URL, process.env.CEF_GAR_URL, DEFAULT_GAR_URL);
const EVENT_URL = firstNonEmpty(process.env.INPUT_EVENT_URL, process.env.EVENT_URL, process.env.CEF_EVENT_RUNTIME_URL, DEFAULT_EVENT_URL);
const AGENT_RUNTIME_URL = firstNonEmpty(
  process.env.INPUT_AGENT_RUNTIME_URL,
  process.env.AGENT_RUNTIME_URL,
  process.env.CEF_AGENT_RUNTIME_URL,
  DEFAULT_AGENT_RUNTIME_URL,
);
const WEB_TRANSPORT_URL = firstNonEmpty(
  process.env.INPUT_WEB_TRANSPORT_URL,
  process.env.WEB_TRANSPORT_URL,
  process.env.CEF_WEB_TRANSPORT_URL,
  DEFAULT_WEB_TRANSPORT_URL,
);
const SIS_URL = firstNonEmpty(process.env.INPUT_SIS_URL, process.env.SIS_URL, process.env.CEF_SIS_URL, DEFAULT_SIS_URL);

function getSDKConfig() {
  return {
    url: BASE_URL,
    garUrl: GAR_URL,
    eventRuntimeUrl: EVENT_URL,
    agentRuntimeUrl: AGENT_RUNTIME_URL,
    webTransportUrl: WEB_TRANSPORT_URL,
    sisUrl: SIS_URL,
  };
}

async function initWallet(secret) {
  const signer = new UriSigner(secret, { type: 'ed25519' });
  if (typeof signer.isReady === 'function') {
    await signer.isReady();
  }

  return {
    get publicKey() {
      return signer.publicKey;
    },
    sign: signer.sign.bind(signer),
    signRawBytes: (bytes) => signer.sign(bytes),
  };
}

function parsePayload(rawPayload) {
  let payload;

  try {
    payload = JSON.parse(rawPayload);
  } catch (err) {
    throw new Error(`Invalid EVENT_PAYLOAD JSON: ${err.message}`);
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return {};
  }

  const runId = process.env.GITHUB_RUN_ID;
  if (runId) {
    payload.delivery_id = payload.delivery_id ?? `${runId}-${Date.now()}`;
  }

  payload.timestamp = payload.timestamp ?? new Date().toISOString();
  if (geminiApiKey) {
    payload.gemini_api_key = geminiApiKey;
  }
  return payload;
}

function sanitizeCentralPayload(payload) {
  const sanitized = { ...payload };
  delete sanitized.notion_api_key;
  delete sanitized.github_token;
  delete sanitized.gemini_api_key;
  return sanitized;
}

function readRawGitHubEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;

  try {
    return JSON.parse(readFileSync(eventPath, 'utf8'));
  } catch (err) {
    console.warn(`  Could not read GITHUB_EVENT_PATH: ${err.message}`);
    return null;
  }
}

function buildCentralRequest(payload) {
  return {
    source: 'cef-send-event-action',
    type: 'github_event',
    event_type: 'github_event',
    legacy_event_type: eventType,
    target: {
      repository: process.env.GITHUB_REPOSITORY || payload.repo || null,
      ref: process.env.GITHUB_REF || null,
      sha: process.env.GITHUB_SHA || payload.after || payload.head_sha || null,
    },
    context: {
      source: 'cef-send-event-action',
      github: {
        event_name: process.env.GITHUB_EVENT_NAME || null,
        repository: process.env.GITHUB_REPOSITORY || null,
        run_id: process.env.GITHUB_RUN_ID || null,
        run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
        workflow: process.env.GITHUB_WORKFLOW || null,
        job: process.env.GITHUB_JOB || null,
        ref: process.env.GITHUB_REF || null,
        sha: process.env.GITHUB_SHA || null,
        actor: process.env.GITHUB_ACTOR || null,
        server_url: process.env.GITHUB_SERVER_URL || 'https://github.com',
        api_url: process.env.GITHUB_API_URL || 'https://api.github.com',
      },
    },
    payload: sanitizeCentralPayload(payload),
    raw_event: readRawGitHubEvent(),
  };
}

function shouldUseCentralSender() {
  switch (senderMode) {
    case 'auto':
      return Boolean(centralSenderUrl) && eventType === 'GITHUB_ACTION_PR_EVENT';
    case 'central':
      if (!centralSenderUrl) {
        throw new Error(
          'sender_mode=central requires CENTRAL_SENDER_URL or a non-empty central_sender_url default in action.yml',
        );
      }
      return true;
    case 'legacy':
      return false;
    default:
      throw new Error(`Unsupported SENDER_MODE '${senderMode}'. Use auto, central, or legacy.`);
  }
}

async function sendToCentralSender(payload) {
  if (!Number.isFinite(centralSenderTimeoutSeconds) || centralSenderTimeoutSeconds <= 0) {
    throw new Error('CENTRAL_SENDER_TIMEOUT_SECONDS must be a positive integer');
  }

  const githubToken = firstNonEmpty(
    payload.github_token,
    process.env.INPUT_GITHUB_TOKEN,
    process.env.GITHUB_TOKEN,
    process.env.CEF_GITHUB_TOKEN,
  );
  if (!githubToken) {
    throw new Error('Central sender mode requires github_token in EVENT_PAYLOAD or GITHUB_TOKEN');
  }

  const request = buildCentralRequest(payload);
  const response = await fetch(centralSenderUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${githubToken}`,
      'x-github-event': process.env.GITHUB_EVENT_NAME || '',
      'x-github-repository': process.env.GITHUB_REPOSITORY || request.target.repository || '',
      'x-github-run-id': process.env.GITHUB_RUN_ID || '',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(centralSenderTimeoutSeconds * 1000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CEF central sender returned HTTP ${response.status}: ${body}`);
  }

  console.log(`  CEF central sender accepted GitHub event (HTTP ${response.status}).`);
}

async function ensureAgreement(client, context) {
  const scopeContext = {
    workspace_id: context.workspace,
  };

  if (context.stream) {
    scopeContext.stream_id = context.stream;
  }

  try {
    const agreementResponse = await client.agreement.create(
      context.agent_service,
      {
        metadata: {
          scopes: [
            {
              context: scopeContext,
            },
          ],
        },
      },
      agreementTtlSeconds,
    );

    console.log(`  Agreement created: ${JSON.stringify(agreementResponse)}`);
  } catch (err) {
    if (err instanceof AgreementAlreadyExistsError) {
      console.log('  Agreement already exists. Reusing active agreement.');
      return;
    }

    throw err;
  }
}

console.log('=== CEF Send Event ===');
console.log(`  Base URL:         ${BASE_URL}`);
console.log(`  GAR URL:          ${GAR_URL}`);
console.log(`  Event URL:        ${EVENT_URL}`);
console.log(`  Agent Runtime:    ${AGENT_RUNTIME_URL}`);
console.log(`  WebTransport:     ${WEB_TRANSPORT_URL}`);
console.log(`  SIS URL:          ${SIS_URL}`);
console.log(`  Agent Service:    ${agentService}`);
console.log(`  Workspace:        ${workspace}`);
console.log(`  Stream:           ${stream || '(none)'}`);
console.log(`  Event Type:       ${eventType}`);
console.log(`  Wallet URI:       ${walletUri ? '***set***' : '(missing!)'}`);
console.log(`  Sender Mode:      ${senderMode}`);
console.log(`  Central Sender:   ${centralSenderUrl ? '***set***' : '(not set)'}`);

if (!BASE_URL) throw new Error('Missing BASE_URL');
if (!eventType) throw new Error('Missing EVENT_TYPE');
if (!Number.isFinite(agreementTtlSeconds) || agreementTtlSeconds <= 0) {
  throw new Error('AGREEMENT_TTL_SECONDS must be a positive integer');
}

const payload = parsePayload(eventPayload);
const useCentralSender = shouldUseCentralSender();

if (useCentralSender) {
  console.log('\n=== Sending to CEF Central Sender ===');
  await sendToCentralSender(payload);
  console.log('\nDone. Event sent to CEF central sender.');
  process.exit(0);
}

if (!walletUri) throw new Error('Missing WALLET_URI');

console.log('\n=== Initializing CEF ClientSdk ===');

const context = new ClientContext({
  agentService,
  workspace,
  stream,
});

const sdkConfig = getSDKConfig();
const wallet = await initWallet(walletUri);

const sdk = new ClientSdk({
  ...sdkConfig,
  context,
  wallet,
});

console.log('  ClientSdk initialized.');

console.log('\n=== Creating Agreement ===');
await ensureAgreement(sdk, context);

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
