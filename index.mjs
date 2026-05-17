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
const DEFAULT_VAULT_URL = 'https://vault-api.compute.dev.ddcdragon.com';
const DEFAULT_MARKETPLACE_URL = 'https://agent-marketplace.compute.dev.ddcdragon.com';
const DEFAULT_S3_GATEWAY_AUTH_INFO_URL = 'https://ddc-s3-gateway.compute.dev.ddcdragon.com/auth/info';
const DEFAULT_SCOPE = 'default';
const DEFAULT_AGENT_ALIAS = 'productivity-agent';
const DEFAULT_CUBBY_ALIAS = 'productivity_store';

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

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
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
const VAULT_URL = firstNonEmpty(process.env.INPUT_VAULT_URL, process.env.VAULT_URL, process.env.CEF_VAULT_URL, DEFAULT_VAULT_URL);
const VAULT_GAR_URL = firstNonEmpty(
  process.env.INPUT_VAULT_GAR_URL,
  process.env.INPUT_GAR_URL,
  process.env.VAULT_GAR_URL,
  process.env.GAR_URL,
  process.env.CEF_GAR_URL,
  DEFAULT_GAR_URL,
);
const MARKETPLACE_URL = firstNonEmpty(
  process.env.INPUT_MARKETPLACE_URL,
  process.env.MARKETPLACE_URL,
  process.env.CEF_MARKETPLACE_URL,
  DEFAULT_MARKETPLACE_URL,
);
const S3_GATEWAY_AUTH_INFO_URL = firstNonEmpty(
  process.env.INPUT_S3_GATEWAY_AUTH_INFO_URL,
  process.env.S3_GATEWAY_AUTH_INFO_URL,
  process.env.CEF_S3_GATEWAY_AUTH_INFO_URL,
  DEFAULT_S3_GATEWAY_AUTH_INFO_URL,
);
const scope = firstNonEmpty(process.env.INPUT_SCOPE, process.env.SCOPE, process.env.CEF_SCOPE, process.env.CEF_VAULT_SCOPE, DEFAULT_SCOPE);
const vaultAgentId = firstNonEmpty(
  process.env.INPUT_VAULT_AGENT_ID,
  process.env.AGENT_ID,
  process.env.CEF_AGENT_ID,
  process.env.CEF_VAULT_AGENT_ID,
);
const vaultAgentAlias = firstNonEmpty(
  process.env.INPUT_VAULT_AGENT_ALIAS,
  process.env.AGENT_ALIAS,
  process.env.CEF_AGENT_ALIAS,
  process.env.CEF_VAULT_AGENT_ALIAS,
  DEFAULT_AGENT_ALIAS,
);
const vaultCubbyAlias = firstNonEmpty(
  process.env.INPUT_VAULT_CUBBY_ALIAS,
  process.env.CUBBY_ALIAS,
  process.env.CEF_CUBBY_ALIAS,
  process.env.CEF_VAULT_CUBBY_ALIAS,
  DEFAULT_CUBBY_ALIAS,
);
const walletKeystorePath = firstNonEmpty(process.env.WALLET_KEYSTORE_PATH, process.env.CEF_VAULT_WALLET_KEYSTORE_PATH);
const walletKeystoreB64 = firstNonEmpty(
  process.env.INPUT_WALLET_KEYSTORE_B64,
  process.env.WALLET_KEYSTORE_B64,
  process.env.CEF_VAULT_WALLET_KEYSTORE_B64,
);
const walletKeystoreJson = firstNonEmpty(
  process.env.INPUT_WALLET_KEYSTORE_JSON,
  process.env.WALLET_KEYSTORE_JSON,
  process.env.CEF_VAULT_WALLET_KEYSTORE_JSON,
);
const walletKeystorePassword = firstNonEmpty(
  process.env.INPUT_WALLET_KEYSTORE_PASSWORD,
  process.env.WALLET_KEYSTORE_PASSWORD,
  process.env.CEF_VAULT_WALLET_KEYSTORE_PASSWORD,
);
const walletMnemonic = firstNonEmpty(
  process.env.INPUT_WALLET_MNEMONIC,
  process.env.WALLET_MNEMONIC,
  process.env.CEF_VAULT_WALLET_MNEMONIC,
);
const walletSeedHex = firstNonEmpty(
  process.env.INPUT_WALLET_SEED_HEX,
  process.env.WALLET_SEED_HEX,
  process.env.CEF_VAULT_WALLET_SEED_HEX,
);

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

  if (!payload.timestamp && !hasNativeGitHubTimestamp(payload)) {
    payload.timestamp = new Date().toISOString();
  }
  if (geminiApiKey) {
    payload.gemini_api_key = geminiApiKey;
  }
  return payload;
}

function hasNativeGitHubTimestamp(payload) {
  return Boolean(
    payload.pull_request?.updated_at
    || payload.pull_request?.created_at
    || payload.review?.submitted_at
    || payload.head_commit?.timestamp
    || payload.repository?.updated_at,
  );
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
    case 'vault':
    case 'legacy':
      return false;
    default:
      throw new Error(`Unsupported SENDER_MODE '${senderMode}'. Use auto, central, vault, or legacy.`);
  }
}

function hasVaultWalletConfig() {
  return (
    (present(walletKeystorePath) && present(walletKeystorePassword))
    || (present(walletKeystoreB64) && present(walletKeystorePassword))
    || (present(walletKeystoreJson) && present(walletKeystorePassword))
    || present(walletMnemonic)
    || present(walletSeedHex)
  );
}

function hasExplicitVaultConfig() {
  return [
    process.env.INPUT_VAULT_URL,
    process.env.VAULT_URL,
    process.env.CEF_VAULT_URL,
    process.env.INPUT_VAULT_AGENT_ID,
    process.env.AGENT_ID,
    process.env.CEF_AGENT_ID,
    process.env.CEF_VAULT_AGENT_ID,
    process.env.INPUT_VAULT_AGENT_ALIAS,
    process.env.AGENT_ALIAS,
    process.env.CEF_AGENT_ALIAS,
    process.env.CEF_VAULT_AGENT_ALIAS,
    process.env.INPUT_VAULT_CUBBY_ALIAS,
    process.env.CUBBY_ALIAS,
    process.env.CEF_CUBBY_ALIAS,
    process.env.CEF_VAULT_CUBBY_ALIAS,
  ].some(present);
}

function shouldUseVaultSender() {
  switch (senderMode) {
    case 'auto':
      return !centralSenderUrl
        && eventType === 'GITHUB_ACTION_PR_EVENT'
        && hasVaultWalletConfig()
        && hasExplicitVaultConfig();
    case 'vault':
      return true;
    case 'central':
    case 'legacy':
      return false;
    default:
      return false;
  }
}

function resolveWalletConfig() {
  if (present(walletKeystorePath) && present(walletKeystorePassword)) {
    return { type: 'keystore-path', path: walletKeystorePath, password: walletKeystorePassword };
  }

  if (present(walletKeystoreB64) && present(walletKeystorePassword)) {
    return {
      type: 'keystore-json',
      json: Buffer.from(walletKeystoreB64, 'base64').toString('utf8'),
      password: walletKeystorePassword,
    };
  }

  if (present(walletKeystoreJson) && present(walletKeystorePassword)) {
    return { type: 'keystore-json', json: walletKeystoreJson, password: walletKeystorePassword };
  }

  if (present(walletMnemonic)) return { type: 'mnemonic', mnemonic: walletMnemonic };
  if (present(walletSeedHex)) return { type: 'seed', seedHex: walletSeedHex };

  throw new Error(
    [
      'Missing Vault wallet configuration.',
      'Set one of:',
      '- WALLET_KEYSTORE_PATH + WALLET_KEYSTORE_PASSWORD',
      '- CEF_VAULT_WALLET_KEYSTORE_B64 + CEF_VAULT_WALLET_KEYSTORE_PASSWORD',
      '- CEF_VAULT_WALLET_KEYSTORE_JSON + CEF_VAULT_WALLET_KEYSTORE_PASSWORD',
      '- CEF_VAULT_WALLET_MNEMONIC',
      '- CEF_VAULT_WALLET_SEED_HEX',
    ].join('\n'),
  );
}

async function createVaultWallet() {
  const { CereWallet, KeypairWallet } = await import('@cef-ai/vault-sdk');
  const walletConfig = resolveWalletConfig();

  if (walletConfig.type === 'keystore-path') {
    return CereWallet.fromKeystore(
      JSON.parse(readFileSync(walletConfig.path, 'utf8')),
      walletConfig.password,
    );
  }

  if (walletConfig.type === 'keystore-json') {
    return CereWallet.fromKeystore(JSON.parse(walletConfig.json), walletConfig.password);
  }

  if (walletConfig.type === 'mnemonic') {
    return CereWallet.fromMnemonic(walletConfig.mnemonic);
  }

  return KeypairWallet.fromSeed(Buffer.from(walletConfig.seedHex.replace(/^0x/, ''), 'hex'));
}

function connectionManifest(connection) {
  return connection?.manifest || connection?.agent?.manifest || {};
}

function hasCubbyAlias(connection, cubbyAlias) {
  if (Array.isArray(connection?.cubbyAliases) && connection.cubbyAliases.includes(cubbyAlias)) {
    return true;
  }

  const manifest = connectionManifest(connection);
  return Array.isArray(manifest.cubbies)
    && manifest.cubbies.some((cubby) => cubby?.alias === cubbyAlias);
}

function matchesAlias(connection, agentAlias) {
  const manifest = connectionManifest(connection);
  return (
    connection?.agentId === agentAlias
    || connection?.alias === agentAlias
    || manifest?.alias === agentAlias
    || manifest?.agentId === agentAlias
  );
}

function resolveVaultTarget(connections = []) {
  if (present(vaultAgentId)) return vaultAgentId;

  const exactAlias = connections.find((connection) => matchesAlias(connection, vaultAgentAlias));
  if (exactAlias?.agentId) return exactAlias.agentId;

  const cubbyMatch = connections.find((connection) => hasCubbyAlias(connection, vaultCubbyAlias));
  if (cubbyMatch?.agentId) return cubbyMatch.agentId;

  const known = connections
    .map((connection) => connection?.agentId)
    .filter(Boolean)
    .join(', ');
  throw new Error(
    `Could not find an active AgentConnection for alias "${vaultAgentAlias}" or cubby "${vaultCubbyAlias}".`
      + (known ? ` Connected agents: ${known}` : ' No connected agents found.'),
  );
}

function normalizePublishResult(result = {}) {
  const accepted = Array.isArray(result.accepted) ? result.accepted : [];
  const rejected = Array.isArray(result.rejected) ? result.rejected : [];
  return {
    acceptedEventIds: accepted
      .map((item) => (typeof item === 'string' ? item : item?.eventId))
      .filter(Boolean),
    rejected,
  };
}

function githubTokenFromEnvOrPayload(payload) {
  return firstNonEmpty(
    payload.github_token,
    process.env.INPUT_GITHUB_TOKEN,
    process.env.GITHUB_TOKEN,
    process.env.CEF_GITHUB_TOKEN,
  );
}

function buildVaultPayload(payload) {
  const repo = payload.repo || process.env.GITHUB_REPOSITORY || payload.repository?.full_name;
  const branch = payload.branch
    || payload.pull_request?.head?.ref
    || process.env.GITHUB_REF_NAME
    || process.env.GITHUB_REF?.replace(/^refs\/heads\//, '')
    || 'unknown';
  const prNumber = payload.pr_number ?? payload.number ?? payload.pull_request?.number ?? null;

  const vaultPayload = {
    ...payload,
    event_type: payload.event_type || process.env.GITHUB_EVENT_NAME || eventType,
    repo,
    branch,
    pr_number: prNumber,
    head_sha: payload.head_sha || payload.after || payload.pull_request?.head?.sha || null,
    delivery_id: payload.delivery_id
      || (process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
        : `local-${Date.now()}`),
  };

  const githubToken = githubTokenFromEnvOrPayload(payload);
  if (githubToken) vaultPayload.github_token = githubToken;
  if (!vaultPayload.notion_api_key) {
    vaultPayload.notion_api_key = firstNonEmpty(process.env.NOTION_API_KEY, process.env.CEF_NOTION_API_KEY) || null;
  }
  if (!vaultPayload.gemini_api_key) {
    vaultPayload.gemini_api_key = firstNonEmpty(process.env.GEMINI_API_KEY, process.env.CEF_GEMINI_API_KEY) || null;
  }

  return vaultPayload;
}

function buildVaultContext(payload) {
  const repo = payload.repo || process.env.GITHUB_REPOSITORY || 'unknown';
  const branch = payload.branch || process.env.GITHUB_REF_NAME || 'unknown';
  return `github:${repo}:${payload.pr_number ? `pr-${payload.pr_number}` : branch}`;
}

async function sendToVault(payload) {
  const { VaultSDK } = await import('@cef-ai/vault-sdk');
  const wallet = await createVaultWallet();
  const sdk = new VaultSDK({
    endpoint: VAULT_URL,
    garEndpoint: VAULT_GAR_URL,
    marketplaceEndpoint: MARKETPLACE_URL,
    s3GatewayAuthInfoUrl: S3_GATEWAY_AUTH_INFO_URL,
    wallet,
  });

  const vault = await sdk.vault.ensure({ onboard: false });
  const connections = await vault.agents.list();
  const target = resolveVaultTarget(connections);
  const vaultPayload = buildVaultPayload(payload);

  const result = await vault.scope(scope).publish({
    type: 'github_event',
    role: 'source',
    target,
    context: buildVaultContext(vaultPayload),
    payload: vaultPayload,
  });
  const normalized = normalizePublishResult(result);

  if (normalized.rejected.length > 0) {
    throw new Error(`Vault rejected event: ${JSON.stringify(normalized.rejected)}`);
  }

  console.log(`  Published github_event to ${target}`);
  console.log(`  Scope: ${scope}`);
  console.log(`  Accepted events: ${normalized.acceptedEventIds.join(', ') || '(accepted)'}`);
}

async function sendToCentralSender(payload) {
  if (!Number.isFinite(centralSenderTimeoutSeconds) || centralSenderTimeoutSeconds <= 0) {
    throw new Error('CENTRAL_SENDER_TIMEOUT_SECONDS must be a positive integer');
  }

  const githubToken = githubTokenFromEnvOrPayload(payload);
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
console.log(`  Vault URL:        ${VAULT_URL}`);
console.log(`  Vault Scope:      ${scope}`);
console.log(`  Vault Agent:      ${vaultAgentId || vaultAgentAlias}`);

if (!BASE_URL) throw new Error('Missing BASE_URL');
if (!eventType) throw new Error('Missing EVENT_TYPE');
if (!Number.isFinite(agreementTtlSeconds) || agreementTtlSeconds <= 0) {
  throw new Error('AGREEMENT_TTL_SECONDS must be a positive integer');
}

const payload = parsePayload(eventPayload);
const useCentralSender = shouldUseCentralSender();
const useVaultSender = shouldUseVaultSender();

if (useCentralSender) {
  console.log('\n=== Sending to CEF Central Sender ===');
  await sendToCentralSender(payload);
  console.log('\nDone. Event sent to CEF central sender.');
  process.exit(0);
}

if (useVaultSender) {
  console.log('\n=== Publishing to CEF Vault ===');
  await sendToVault(payload);
  console.log('\nDone. Event published to CEF Vault.');
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
