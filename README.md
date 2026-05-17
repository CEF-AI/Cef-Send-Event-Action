# CEF Send Event (GitHub Action)

## What It Does

1. In central sender mode, posts GitHub tracker events to one CEF-owned HTTPS endpoint. That service owns the wallet, Vault endpoints, scope, and agent connection.
2. In legacy SDK mode, builds a secured `ClientSdk` with explicit runtime URLs.
3. In legacy SDK mode, creates or reuses a GAR agreement scoped to the workspace and stream.
4. Sends one event: `sdk.event.create(event_type, payload)`.
5. No hardcoded event shapes—you supply `event_type` and `event_payload` (JSON string).

The default `sender_mode: auto` uses central mode only when `central_sender_url` has a value and `event_type` is `GITHUB_ACTION_PR_EVENT`. All other events stay on the legacy SDK path.

Inputs take precedence, but the action also reads inherited environment variables. That lets a consuming org define organization-level secrets/variables once, then map them into the job or workflow `env`.

## Usage

### Generic: any event type and payload

```yaml
- uses: your-org/cef-github-action@v2
  with:
    wallet_uri:     ${{ secrets.CEF_WALLET_URI }}
    ddc_base_url:   ${{ secrets.CEF_DDC_BASE_URL }}
    gar_url:        ${{ secrets.CEF_GAR_URL }}
    agent_service:  ${{ secrets.CEF_AGENT_SERVICE }}
    workspace:      ${{ secrets.CEF_WORKSPACE }}
    event_type:     "MY_CUSTOM_EVENT"
    event_payload:  ${{ toJSON(github.event) }}
```

### PR events with extra data (e.g. Notion API key)

Build the payload in a step using `jq` and `GITHUB_EVENT_PATH`, then pass it to the action. Standard approach:

```yaml
jobs:
  send-pr-event:
    runs-on: ubuntu-latest
    steps:
      - id: payload
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
        run: |
          jq -s '.[0] + {notion_api_key: env.NOTION_API_KEY}' "$GITHUB_EVENT_PATH" > payload.json
          echo "payload<<EOF" >> $GITHUB_OUTPUT
          cat payload.json >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - uses: your-org/cef-github-action@v2
        with:
          wallet_uri:     ${{ secrets.CEF_WALLET_URI }}
          ddc_base_url:   ${{ secrets.CEF_DDC_BASE_URL }}
          gar_url:        ${{ secrets.CEF_GAR_URL }}
          agent_service:  ${{ secrets.CEF_AGENT_SERVICE }}
          workspace:      ${{ secrets.CEF_WORKSPACE }}
          stream:         "your-stream-id"
          event_type:     "GITHUB_ACTION_PR_EVENT"
          event_payload:   ${{ steps.payload.outputs.payload }}
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `wallet_uri` | Legacy only | — | CEF wallet URI (Ed25519 signer) |
| `ddc_base_url` | Legacy only | — | CEF orchestrator base URL |
| `gar_url` | No | `https://gar.compute.test.ddcdragon.com/` | GAR service URL |
| `event_runtime_url` | No | `https://events.compute.test.ddcdragon.com` | Event runtime URL |
| `agent_runtime_url` | No | `https://agent.compute.test.ddcdragon.com` | Agent runtime URL |
| `web_transport_url` | No | `https://agent.compute.test.ddcdragon.com:4433` | WebTransport endpoint URL |
| `sis_url` | No | `https://sis.compute.test.ddcdragon.com` | SIS service URL |
| `agent_service` | Legacy only | — | Agent service public key |
| `workspace` | Legacy only | — | CEF Workspace ID |
| `stream` | No | `""` | CEF Stream ID |
| `event_type` | Yes | — | CEF event type identifier |
| `event_payload` | No | `"{}"` | JSON string for the event body |
| `agreement_ttl_seconds` | No | `86400` | GAR agreement TTL before sending the event |
| `sender_mode` | No | `auto` | `auto`, `central`, or `legacy` |
| `central_sender_url` | No | — | HTTPS endpoint for the CEF central sender. Set the action default to enable central mode without changing caller workflows. |
| `central_sender_timeout_seconds` | No | `240` | Max wait for the central sender request |

## Organization-level env names

For org-level secrets, map these to workflow/job `env` from `secrets.*`:

| Env name | Purpose |
|----------|---------|
| `WALLET_URI` or `CEF_WALLET_URI` | Legacy SDK signer secret |
| `NOTION_API_KEY` or `CEF_NOTION_API_KEY` | Notion token included by tracker payloads |
| `GEMINI_API_KEY` or `CEF_GEMINI_API_KEY` | Gemini token included by tracker payloads |
| `GITHUB_TOKEN` or `CEF_GITHUB_TOKEN` | GitHub token for central sender validation |

For org-level variables, map these to workflow/job `env` from `vars.*`:

| Env name | Purpose |
|----------|---------|
| `CEF_DDC_BASE_URL` | Legacy SDK orchestrator URL |
| `CEF_GAR_URL` | GAR URL |
| `CEF_EVENT_RUNTIME_URL` | Event runtime URL |
| `CEF_AGENT_RUNTIME_URL` | Agent runtime URL |
| `CEF_WEB_TRANSPORT_URL` | WebTransport URL |
| `CEF_SIS_URL` | SIS URL |
| `CEF_AGENT_SERVICE` | Agent service public key |
| `CEF_WORKSPACE` | Workspace ID |
| `CEF_STREAM` | Stream ID |
| `CEF_GITHUB_TRACKER_SENDER_MODE` | `auto`, `central`, or `legacy` |
| `CEF_GITHUB_TRACKER_CENTRAL_SENDER_URL` | Central sender endpoint |
| `CEF_GITHUB_TRACKER_CENTRAL_SENDER_TIMEOUT_SECONDS` | Central sender timeout |

Example:

```yaml
env:
  CEF_WALLET_URI: ${{ secrets.CEF_WALLET_URI }}
  CEF_DDC_BASE_URL: ${{ vars.CEF_DDC_BASE_URL }}
  CEF_GAR_URL: ${{ vars.CEF_GAR_URL }}
  CEF_AGENT_SERVICE: ${{ vars.CEF_AGENT_SERVICE }}
  CEF_WORKSPACE: ${{ vars.CEF_WORKSPACE }}
  CEF_STREAM: ${{ vars.CEF_STREAM }}
```

GitHub configuration variables are available through the `vars` context, not automatically as shell environment variables, so the workflow maps them under `env`.

## Secrets

In the consuming repo, **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `CEF_WALLET_URI` | Ed25519 wallet URI |
| `CEF_DDC_BASE_URL` | CEF orchestrator base URL |
| `CEF_GAR_URL` | GAR service URL |
| `CEF_AGENT_SERVICE` | Agent service public key |
| `CEF_WORKSPACE` | Workspace ID |

Add any other secrets your payload needs (e.g. `NOTION_API_KEY`) and inject them when building `event_payload` in a prior step.

Central sender mode does not require wallet secrets in each caller repo. Put the wallet and CEF endpoint credentials in the central sender service, then release this action with `central_sender_url` defaulting to that endpoint. The action sends the caller's `github_token` as the HTTP bearer token so the central service can validate the GitHub repository/run before signing and publishing to CEF. `github_token`, `notion_api_key`, and `gemini_api_key` are removed from the JSON payload sent to the central endpoint.

## Payload

The action sends whatever you pass in `event_payload` (parsed as JSON). Before sending, it creates or reuses a GAR agreement scoped to the configured workspace and optional stream. It may add:

- `delivery_id` — set from `GITHUB_RUN_ID` + timestamp if not present
- `timestamp` — set to current ISO time if not present

Your CEF agent receives the same payload shape you send (e.g. full GitHub event + `notion_api_key` when using the jq pattern above).

## Requirements

- Node.js 20 (set up by the action)
- A CEF agent service configured to handle the event type you send
