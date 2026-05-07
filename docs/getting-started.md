# Getting Started with Modmux

Use this guide to go from install to a working local request as quickly as
possible.

## Prerequisites

- GitHub Copilot subscription
- GitHub account with Copilot access
- Terminal access

## 1. Install

### From source

```bash
git clone https://github.com/modmux/modmux.git && cd modmux
deno task install
```

### Direct binary

Download a platform build from
[GitHub Releases](https://github.com/modmux/modmux/releases).

### Via Mise

```bash
mise use -g github:modmux/modmux@latest
```

### Check the install

```bash
modmux --version
```

If this fails, the install location is probably not in your `PATH`.

## 2. Start Modmux

```bash
modmux start
```

On first run, Modmux starts the GitHub device flow. Complete the login in your
browser, then return to the terminal.

Use this to confirm the service is running:

```bash
modmux status
```

If port `11435` is already in use, Modmux scans upward for another available
port. Use the port shown by `modmux status`.

## 3. Configure an agent

Check which supported agents are installed:

```bash
modmux doctor
```

Configure one of them:

```bash
modmux configure claude-code
```

You can also configure:

```bash
modmux configure cline
modmux configure codex
```

Run `modmux doctor` again to confirm the agent is configured.

## 4. Test the local endpoint

```bash
curl -X POST http://127.0.0.1:11435/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 50
  }'
```

If `modmux status` shows a different port, use that port instead.

You can also verify health and metrics directly:

```bash
curl http://127.0.0.1:11435/health
curl http://127.0.0.1:11435/v1/usage
```

## GitHub quota usage

Real GitHub Copilot quota usage is enabled by default through
`copilotSdk.backend = "sdk-direct"`. Modmux uses `@github/copilot-sdk` directly
for quota usage and does not start a Copilot CLI sidecar.

1. To keep quota usage enabled, add this to `~/.modmux/config.json`:

```json
{
  "copilotSdk": {
    "backend": "sdk-direct",
    "autoStart": false,
    "preferredPort": 4321
  }
}
```

2. Restart Modmux and re-run:

```bash
modmux stop
modmux start
modmux status
```

If the SDK quota backend is unsupported in your runtime, usage status will show
`Not available (error)`.

To turn the feature off completely, run `modmux set copilot off` or set
`copilotSdk.backend` to `disabled`.

## Next steps

- [Troubleshooting](./troubleshooting.md) if setup fails
- [API reference](./api/README.md) for endpoint details
- `modmux models` to see available Copilot-backed models
- `modmux install-service` if you want Modmux to start with your OS login
