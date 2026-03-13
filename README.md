# CEF Send Event (GitHub Action)

A composite GitHub Action that connects to the [CEF (Cere Edge Framework)](https://cef.ai) stack via `@cere-ddc-sdk/client` and sends a single event with an arbitrary type and JSON payload. Use it from any workflow (PR, push, schedule, manual) to trigger CEF agents.

## What It Does

1. Connects to CEF using wallet, DDC URL, agent service, and workspace.
2. Sends one event: `sdk.event.create(event_type, payload)`.
3. No hardcoded event shapes—you supply `event_type` and `event_payload` (JSON string).

## Usage

### Generic: any event type and payload

```yaml
- uses: your-org/cef-github-action@v2
  with:
    wallet_uri:     ${{ secrets.CEF_WALLET_URI }}
    ddc_base_url:   ${{ secrets.CEF_DDC_BASE_URL }}
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
          agent_service:  ${{ secrets.CEF_AGENT_SERVICE }}
          workspace:      ${{ secrets.CEF_WORKSPACE }}
          stream:         "your-stream-id"
          event_type:     "GITHUB_ACTION_PR_EVENT"
          event_payload:   ${{ steps.payload.outputs.payload }}
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `wallet_uri` | Yes | — | CEF wallet URI (Ed25519 signer) |
| `ddc_base_url` | Yes | — | DDC Base URL |
| `agent_service` | Yes | — | Agent service public key |
| `workspace` | Yes | — | CEF Workspace ID |
| `stream` | No | `""` | CEF Stream ID |
| `event_type` | Yes | — | CEF event type identifier |
| `event_payload` | No | `"{}"` | JSON string for the event body |

## Secrets

In the consuming repo, **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `CEF_WALLET_URI` | Ed25519 wallet URI |
| `CEF_DDC_BASE_URL` | DDC Base URL |
| `CEF_AGENT_SERVICE` | Agent service public key |
| `CEF_WORKSPACE` | Workspace ID |

Add any other secrets your payload needs (e.g. `NOTION_API_KEY`) and inject them when building `event_payload` in a prior step.

## Payload

The action sends whatever you pass in `event_payload` (parsed as JSON). It may add:

- `delivery_id` — set from `GITHUB_RUN_ID` + timestamp if not present
- `timestamp` — set to current ISO time if not present

Your CEF agent receives the same payload shape you send (e.g. full GitHub event + `notion_api_key` when using the jq pattern above).

## Requirements

- Node.js 20 (set up by the action)
- A CEF agent service configured to handle the event type you send
