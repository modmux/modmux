# Getting Started with Modmux

This guide walks you through setting up Modmux from installation to first
successful API call. Follow each step and use the verification checkpoints to
ensure everything is working correctly.

## Prerequisites

Before starting, ensure you have:

- **GitHub Copilot Subscription** - Individual, Business, or Enterprise plan
- **GitHub Account** - The same account used for your Copilot subscription
- **Terminal Access** - Command line interface (Terminal, PowerShell, or Command
  Prompt)

## Step 1: Installation

Choose your preferred installation method:

### Option A: From Source (Recommended)

```bash
git clone https://github.com/modmux/modmux.git && cd modmux
deno task install
```

### Option B: Manual Binary

1. Download the latest release from
   [GitHub](https://github.com/modmux/modmux/releases)
2. Extract and move the binary to your PATH
3. Make it executable (macOS/Linux): `chmod +x modmux`

### Verification Checkpoint ✓

Test that Modmux is installed correctly:

```bash
modmux --version
```

**Expected output:**

```
Modmux v0.2.0
```

If this fails, check that the binary is in your PATH and try the alternative
installation methods.

## Step 2: Authentication

Modmux needs to authenticate with GitHub Copilot to proxy requests.

### Start the Authentication Flow

```bash
modmux start
```

**What happens:**

1. Modmux checks if you're already authenticated
2. If not, it starts the GitHub OAuth device flow
3. You'll see a message like this:

```
Please visit: https://github.com/login/device
Enter code: ABCD-EFGH
Waiting for authentication...
```

### Complete Authentication

1. **Open the URL** in your browser: `https://github.com/login/device`
2. **Enter the code** shown in your terminal
3. **Authorize the application** when prompted by GitHub
4. **Return to terminal** - it should show:

```
Authentication successful!
Modmux is running on http://localhost:11435
```

### Verification Checkpoint ✓

Check that authentication worked:

```bash
modmux status
```

**Expected output:**

```
Service:       running (PID 12345) on port 11435
Authentication: valid (expires in 29 days)
Agents:        none configured
```

If authentication failed, you'll see an error. Common issues:

- **No GitHub Copilot subscription** - Verify your subscription at
  github.com/settings/copilot
- **Network issues** - Check firewall/proxy settings
- **Wrong GitHub account** - Ensure you're using the account with Copilot access

## Step 3: Configure an Agent

Modmux supports three agents out of the box. Configure at least one to start
using the service.

### Detect Available Agents

```bash
modmux doctor
```

**Example output:**

```
Modmux Doctor
──────────────────────────────────────────────
claude-code     installed    not configured
cline           installed    not configured
codex           not-installed
──────────────────────────────────────────────
Log: /Users/username/.modmux/modmux.log
Last 5 errors: (none)
```

### Configure an Agent

Choose an installed agent and configure it:

```bash
modmux configure claude-code
```

**Expected output:**

```
claude-code configured.
```

For other agents:

```bash
modmux configure cline    # For Cline
modmux configure codex    # For Codex
```

### Verification Checkpoint ✓

Verify the agent is configured:

```bash
modmux doctor
```

**Expected output:**

```
claude-code     installed    configured ✓
```

If configuration failed:

- Check the agent is properly installed
- Ensure Modmux service is running (`modmux status`)
- Check logs for errors (`modmux doctor` shows recent errors)

## Step 4: Test the Connection

Now test that everything is working with a simple API call.

### Option A: Using cURL (Direct API Test)

```bash
curl -X POST http://localhost:11435/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": "Say hello"
      }
    ],
    "max_tokens": 50
  }'
```

**Expected output:**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 8,
    "completion_tokens": 9,
    "total_tokens": 17
  }
}
```

### Option B: Using Your Configured Agent

If you configured Claude Code, test it by:

1. **Open VS Code** or your editor
2. **Trigger Claude Code** (usually Cmd/Ctrl+Shift+P → "Claude: New Chat")
3. **Send a test message** like "Hello, are you working?"
4. **Verify response** comes through successfully

### Verification Checkpoint ✓

Check usage metrics to confirm requests are flowing:

```bash
curl http://localhost:11435/v1/usage
```

**Expected output:**

```json
{
  "endpoints": {
    "/v1/chat/completions": {
      "requests": 1,
      "totalDuration": 1250.5,
      "averageDuration": 1250.5,
      "statusCodes": {
        "200": 1
      }
    }
  },
  "agents": {
    "claude-code": {
      "requests": 1,
      "totalDuration": 1250.5,
      "averageDuration": 1250.5,
      "statusCodes": {
        "200": 1
      }
    }
  },
  "overall": {
    "requests": 1,
    "totalDuration": 1250.5,
    "averageDuration": 1250.5,
    "statusCodes": {
      "200": 1
    }
  }
}
```

If you see request counts and successful status codes (200), everything is
working!

## Step 5: Explore Available Models

Check what models are available through your Copilot subscription:

```bash
modmux models
```

**Example output:**

```
Available models (via GitHub Copilot):

  gpt-4o
  gpt-4o-mini
  o1-preview
  claude-3-5-sonnet-20241022
  claude-3-5-haiku-20241022

Run 'modmux configure <agent>' to route an agent through Modmux.
```

### Test Different Models

```bash
# Test with GPT-4o Mini (faster, cheaper)
curl -X POST http://localhost:11435/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Write a Python hello world"}],
    "max_tokens": 100
  }'

# Test with Claude alias (for Anthropic-compatible agents)
curl -X POST http://localhost:11435/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Explain Python variables"}],
    "max_tokens": 150
  }'
```

## Optional: Interactive TUI

Modmux includes a text-based user interface for easy agent management:

```bash
modmux
```

**TUI Controls:**

- **↑/↓** - Navigate between agents
- **Space** - Toggle agent configuration
- **Enter** - Apply changes
- **Ctrl+C** - Exit

Use this to quickly enable/disable agents without remembering command syntax.

## Common Next Steps

### 1. Configure Additional Agents

```bash
# Configure all your installed agents
modmux configure cline
modmux configure codex
modmux doctor  # Verify all configurations
```

### 2. Set Up Auto-Start (Optional)

To start Modmux automatically on login:

```bash
# Install as a system service
modmux install-service

# Verify it's running
modmux status
```

### 3. Monitor Usage

Keep an eye on your API usage:

```bash
# Check current usage
curl http://localhost:11435/v1/usage

# Monitor status
modmux status

# Check for errors
modmux doctor
```

### 4. Explore Advanced Features

- **[API Documentation](./api/README.md)** - Complete endpoint reference
- **[Advanced Configuration](./advanced-configuration.md)** - Custom settings
  and environment variables
- **[Troubleshooting Guide](./troubleshooting.md)** - Solutions for common
  issues

## Troubleshooting Quick Fixes

### Service Won't Start

```bash
# Check if already running
modmux status

# Stop and restart
modmux stop
modmux start

# Check for port conflicts
lsof -i :11435  # macOS/Linux
netstat -an | findstr 11435  # Windows
```

### Authentication Issues

```bash
# Re-authenticate
modmux stop
rm ~/.modmux/token.json  # Clear stored token
modmux start  # Will trigger new auth flow
```

### Agent Configuration Failed

```bash
# Reset agent configuration
modmux unconfigure claude-code
modmux configure claude-code

# Check agent is properly installed
which claude  # Should show path to binary
```

### API Requests Fail

```bash
# Verify service is running
curl http://localhost:11435/health
# Expected: {"status": "ok"}

# Check authentication
modmux status
# Should show "Authentication: valid"

# Test with simple request
curl -X POST http://localhost:11435/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "test"}], "max_tokens": 10}'
```

## Success! 🎉

You now have Modmux running and configured! Your AI agents can communicate with
GitHub Copilot through the proxy service.

### What You've Accomplished

✅ **Installed Modmux** and verified it's working ✅ **Authenticated** with
GitHub Copilot ✅ **Configured at least one agent** to use the proxy ✅ **Tested
the API** with successful requests ✅ **Verified usage tracking** is working

### Next Steps

- **Integrate with your workflow** - Use your configured agents normally
- **Monitor usage** - Keep an eye on the `/v1/usage` endpoint
- **Explore the API** - Check out the [full API documentation](./api/README.md)
- **Customize configuration** - See
  [Advanced Configuration](./advanced-configuration.md)

Need help? Check the [Troubleshooting Guide](./troubleshooting.md) or report
issues on GitHub.
