# Quickstart: Copilot Authentication

## Prerequisites

- Deno installed (latest stable)
- GitHub Copilot subscription
- Internet connection

## First-Time Setup

1. **Run Claudio**:
   ```bash
   deno run -A src/cli/main.ts
   ```

2. **Complete Authentication**:
   - A verification URL and device code will be displayed
   - Visit the URL and enter the code
   - Authorize the Copilot connection

3. **Verify Success**:
   - On success, Claudio proceeds to proxy startup
   - Subsequent runs use cached credentials automatically

## Command-Line Options

| Flag        | Description             |
| ----------- | ----------------------- |
| `--help`    | Show help message       |
| `--version` | Show version            |
| `--reauth`  | Force re-authentication |

## Troubleshooting

### "Authentication failed"

- Verify you have a Copilot subscription
- Run with `--reauth` to start fresh authentication

### "Token expired"

- Automatic re-authentication will be triggered
- Or run with `--reauth` to manually refresh

### "Network error"

- Check internet connection
- Check proxy settings if behind corporate firewall
