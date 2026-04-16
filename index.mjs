import { TextEncoder, TextDecoder } from 'node:util';
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

const eventType = process.env.EVENT_TYPE;
const eventPayload = process.env.EVENT_PAYLOAD ?? '{}';
const agentService = process.env.AGENT_SERVICE;
const workspace = process.env.WORKSPACE;
const stream = process.env.STREAM || '';
const walletUri = process.env.WALLET_URI;
const agreementTtlSeconds = Number.parseInt(process.env.AGREEMENT_TTL_SECONDS ?? '86400', 10);

const BASE_URL = process.env.BASE_URL || process.env.DDC_BASE_URL || DEFAULT_BASE_URL;
const GAR_URL = process.env.GAR_URL || DEFAULT_GAR_URL;
const EVENT_URL = process.env.EVENT_URL || DEFAULT_EVENT_URL;
const AGENT_RUNTIME_URL = process.env.AGENT_RUNTIME_URL || DEFAULT_AGENT_RUNTIME_URL;
const WEB_TRANSPORT_URL = process.env.WEB_TRANSPORT_URL || DEFAULT_WEB_TRANSPORT_URL;
const SIS_URL = process.env.SIS_URL || DEFAULT_SIS_URL;

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
  return payload;
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

if (!BASE_URL) throw new Error('Missing BASE_URL');
if (!walletUri) throw new Error('Missing WALLET_URI');
if (!eventType) throw new Error('Missing EVENT_TYPE');
if (!Number.isFinite(agreementTtlSeconds) || agreementTtlSeconds <= 0) {
  throw new Error('AGREEMENT_TTL_SECONDS must be a positive integer');
}

const payload = parsePayload(eventPayload);

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
