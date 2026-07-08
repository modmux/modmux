# Troubleshooting

Start here when Modmux is installed but not behaving as expected.

## Quick diagnostics

These commands answer most first questions:

```bash
modmux status
modmux doctor
tail -20 ~/.modmux/modmux.log
```

## `modmux` command not found

Your install location is probably not in `PATH`.

```bash
which modmux
echo "$PATH"
```

If you installed from source, make sure the install directory is on your shell
path. If needed, reinstall:

```bash
git clone https://github.com/modmux/modmux.git && cd modmux
deno task install
```

## Authentication failed

Check that the GitHub account you used has Copilot access, then run:

```bash
modmux stop
modmux start
```

If the device flow still fails:

- verify your Copilot subscription at `github.com/settings/copilot`
- try the login in a fresh browser session
- check network or proxy restrictions

## Service is not running

Start with:

```bash
modmux status
modmux start
modmux doctor
```

If port `11435` is busy, Modmux scans upward for another available port. Use the
port shown by `modmux status`.

To inspect a local port conflict on macOS or Linux:

```bash
lsof -i :11435
```

## Agent configuration failed

Check detection first:

```bash
modmux doctor
```

Then re-run the agent setup:

```bash
modmux unconfigure claude-code
modmux configure claude-code
```

If the agent is still missing or misconfigured:

- confirm the agent is installed and on your system
- close the agent before rewriting its config
- make sure Modmux is running before configuring the agent

## API request failed

Confirm the local service first:

```bash
curl http://127.0.0.1:11435/health
modmux status
```

Then try a minimal request:

```bash
curl -X POST http://127.0.0.1:11435/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"test"}],"max_tokens":10}'
```

If `modmux status` shows a different port, use that port instead.

## `Usage: Not available (error)`

This usually means the GitHub quota backend is disabled, the quota backend is
unsupported in your runtime, or quota lookup failed.

Confirm `~/.modmux/config.json` includes:

```json
{
  "copilotSdk": {
    "backend": "sdk-direct"
  }
}
```

Then restart Modmux and inspect the log:

```bash
modmux stop
modmux start
tail -50 ~/.modmux/modmux.log
```

If the backend remains unavailable, inspect `~/.modmux/modmux.log` for quota
lookup failures.

## Corporate network / TLS certificate errors

On networks with TLS inspection (e.g. Zscaler, corporate VPNs with MITM
proxies), Modmux may fail with certificate errors when contacting
`api.github.com` or `api.githubcopilot.com`.

The Modmux daemon is automatically started with `DENO_TLS_CA_STORE=system`,
which makes it use the OS trust store and accept corporate CA certificates.

If the CLI itself fails before the daemon starts (e.g. during initial
`auth login`), set the variable manually:

```bash
DENO_TLS_CA_STORE=system modmux auth login
DENO_TLS_CA_STORE=system modmux start
```

For permanent convenience, export it in your shell profile:

```bash
export DENO_TLS_CA_STORE=system
```

See
[Deno's certificate store documentation](https://docs.deno.com/runtime/fundamentals/security/#certificate-stores)
for further details.

## Reset the local setup

If the state is unclear, restart from a clean local loop:

```bash
modmux stop
modmux unconfigure claude-code
modmux start
modmux configure claude-code
modmux doctor
```

## Logs

Main log file:

```bash
tail -50 ~/.modmux/modmux.log
```

If you still need more context, open an issue with:

- `modmux status`
- `modmux doctor`
- the relevant log lines
