# Troubleshooting Guide

This guide provides solutions for common Modmux issues, organized by setup phase
and problem type. Use the diagnostic commands to identify your issue, then
follow the appropriate solution.

## Quick Diagnostics

Start with these commands to understand your current state:

```bash
# Check overall status
modmux status

# Detailed system scan
modmux doctor

# Check recent errors
modmux doctor | tail -10
```

---

## Installation Issues

### Command Not Found: `modmux`

**Symptoms:**

```
bash: modmux: command not found
```

**Solutions:**

1. **From Source Installation Missing from PATH**
   ```bash
   # Check if install directory is in PATH
   echo $PATH | grep ~/.local/bin

   # If missing, add to shell profile (.bashrc, .zshrc, etc.)
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
   source ~/.bashrc
   ```

2. **Deno Installation Issues**
   ```bash
   # Check Deno is installed
   deno --version

   # Reinstall if needed
   curl -fsSL https://deno.land/install.sh | sh
   echo 'export PATH="$HOME/.deno/bin:$PATH"' >> ~/.bashrc
   source ~/.bashrc

   # Reinstall Modmux
   git clone https://github.com/modmux/modmux.git && cd modmux
   deno task install
   ```

3. **Binary Installation**
   ```bash
   # Check if binary is executable
   ls -la $(which modmux)

   # Make executable if needed
   chmod +x $(which modmux)

   # Or move to a directory in PATH
   sudo mv modmux /usr/local/bin/
   ```

### Permission Denied on macOS

**Symptoms:**

```
"modmux" cannot be opened because the developer cannot be verified
```

**Solution:**

```bash
# Remove quarantine attribute
xattr -d com.apple.quarantine $(which modmux)

# Or allow in System Preferences
sudo spctl --add $(which modmux)
sudo spctl --enable --label "Modmux"
```

### Installation Verification Failed

**Symptoms:**

```bash
modmux --version
# No output or error
```

**Solutions:**

1. **Check Installation Location**
   ```bash
   which modmux
   ls -la $(which modmux)
   ```

2. **Try Alternative Installation**
   ```bash
   # If from source failed, try binary
   curl -L https://github.com/modmux/modmux/releases/latest/download/modmux-$(uname -s)-$(uname -m) -o modmux
   chmod +x modmux
   sudo mv modmux /usr/local/bin/
   ```

3. **Manual Binary Installation**
   ```bash
   # Download latest release
   curl -L https://github.com/modmux/modmux/releases/latest/download/modmux-$(uname -s)-$(uname -m) -o modmux
   chmod +x modmux
   sudo mv modmux /usr/local/bin/
   ```

---

## Authentication Issues

### GitHub Copilot Subscription Not Found

**Symptoms:**

```
Authentication failed: GitHub Copilot subscription required
```

**Solutions:**

1. **Verify Subscription Status**
   - Visit [github.com/settings/copilot](https://github.com/settings/copilot)
   - Ensure subscription is active and not expired
   - Check if organization policy allows Copilot use

2. **Check Correct GitHub Account**
   ```bash
   # Clear stored authentication
   rm ~/.modmux/token.json

   # Re-authenticate with correct account
   modmux start
   # Follow device flow with account that has Copilot access
   ```

3. **Organization Settings**
   - If using GitHub Enterprise, check with admin
   - Verify Copilot is enabled for your organization
   - Ensure you're not blocked by organization policy

### Device Flow Authentication Failed

**Symptoms:**

```
Error: Authentication failed: device flow timeout
```

**Solutions:**

1. **Network/Firewall Issues**
   ```bash
   # Test GitHub connectivity
   curl -I https://github.com
   curl -I https://api.github.com

   # If behind proxy, configure
   export HTTPS_PROXY=https://proxy.company.com:8080
   modmux start
   ```

2. **Browser Issues**
   ```bash
   # Try incognito/private mode
   # Clear GitHub cookies
   # Try different browser

   # Manual device flow
   modmux start
   # Copy the URL and code exactly
   # Paste in fresh browser session
   ```

3. **Timeout Too Quick**
   ```bash
   # Start fresh authentication
   modmux stop
   rm ~/.modmux/token.json
   modmux start
   # Complete device flow within 15 minutes
   ```

### Token Expired or Invalid

**Symptoms:**

```
Authentication: invalid (expired)
```

**Solution:**

```bash
# Re-authenticate
modmux stop
rm ~/.modmux/token.json
modmux start
```

---

## Service Issues

### Port Already in Use

**Symptoms:**

```
Error: Address already in use (port 11435)
```

**Solutions:**

1. **Find Conflicting Process**
   ```bash
   # macOS/Linux
   lsof -i :11435

   # Windows
   netstat -ano | findstr :11435
   ```

2. **Stop Conflicting Service**
   ```bash
   # If it's another Modmux instance
   modmux stop

   # If it's another service (e.g., Ollama)
   sudo killall ollama  # or relevant service name
   ```

3. **Use Different Port**
   ```bash
   # Edit config file
   nano ~/.modmux/config.json

   # Change port
   {
     "port": 11435,
     // ... other settings
   }

   # Restart service
   modmux restart
   ```

### Service Won't Start

**Symptoms:**

```
Service: not running
```

**Diagnostic Steps:**

```bash
# Check authentication
modmux status

# Look for errors
modmux doctor

# Check log file
cat ~/.modmux/modmux.log | tail -20
```

**Solutions:**

1. **Authentication Issues**
   ```bash
   # Re-authenticate first
   modmux start
   # This will trigger auth if needed
   ```

2. **Permission Issues**
   ```bash
   # Check config directory permissions
   ls -la ~/.modmux/
   chmod 755 ~/.modmux/
   chmod 644 ~/.modmux/config.json
   ```

3. **Port Conflicts**
   ```bash
   # Try different port
   modmux stop
   # Edit ~/.modmux/config.json to change port
   modmux start
   ```

### Service Starts But Dies Immediately

**Symptoms:**

```
Service: not running (was recently started)
```

**Diagnostic:**

```bash
# Check recent logs
modmux doctor
tail -50 ~/.modmux/modmux.log
```

**Common Solutions:**

1. **Configuration File Corrupted**
   ```bash
   # Backup and reset config
   cp ~/.modmux/config.json ~/.modmux/config.json.backup
   rm ~/.modmux/config.json
   modmux start  # Will recreate default config
   ```

2. **Dependencies Missing**
   ```bash
   # Check system dependencies
   deno --version  # Should work if using Deno install
   ```

---

## Agent Configuration Issues

### Agent Not Detected

**Symptoms:**

```bash
modmux doctor
# Shows: agent-name    not-installed
```

**Solutions:**

1. **Claude Code Not Found**
   ```bash
   # Check installation
   which claude

   # If not found, install from:
   # https://claude.ai/download

   # Verify VS Code extension
   code --list-extensions | grep anthropic
   ```

2. **Cline Not Found**
   ```bash
   # Check installation
   which cline

   # Install if missing - refer to Cline documentation
   # https://github.com/saoudrizwan/claude-dev

   # Verify VS Code extension
   code --list-extensions | grep saoudrizwan.claude-dev
   ```

3. **Codex Not Found**
   ```bash
   # Check installation path
   which codex
   ls -la ~/.codex/

   # Install from appropriate source
   ```

### Configuration Failed

**Symptoms:**

```
Error configuring claude-code: Could not write config file
```

**Solutions:**

1. **Permission Issues**
   ```bash
   # Check config directory permissions
   ls -la ~/.claude/
   chmod 755 ~/.claude/
   chmod 644 ~/.claude/settings.json
   ```

2. **Config File Locked**
   ```bash
   # Check if agent is running and accessing config
   ps aux | grep claude

   # Close agent, then reconfigure
   modmux unconfigure claude-code
   modmux configure claude-code
   ```

3. **Malformed Existing Config**
   ```bash
   # Backup and reset agent config
   cp ~/.claude/settings.json ~/.claude/settings.json.backup
   modmux unconfigure claude-code
   modmux configure claude-code
   ```

### Agent Shows Misconfigured

**Symptoms:**

```bash
modmux doctor
# Shows: claude-code     installed    misconfigured !
```

**Solutions:**

1. **Config File Modified**
   ```bash
   # Check current config
   cat ~/.claude/settings.json

   # Look for ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN
   # Should point to http://localhost:11435

   # Reconfigure if wrong
   modmux unconfigure claude-code
   modmux configure claude-code
   ```

2. **Service Not Running**
   ```bash
   # Ensure Modmux is running first
   modmux status
   modmux start  # if not running

   # Then reconfigure agent
   modmux configure claude-code
   ```

### Configuration Validation Failed

**Symptoms:**

```
claude-code configured, but validation failed: proxy may not be running.
```

**Solutions:**

1. **Service Not Running**
   ```bash
   # Start service first
   modmux start

   # Then configure agent
   modmux configure claude-code
   ```

2. **Network Issues**
   ```bash
   # Test local connection
   curl http://localhost:11435/health

   # Should return: {"status": "ok"}
   ```

---

## API Request Issues

### Connection Refused

**Symptoms:**

```
curl: (7) Failed to connect to localhost port 11435: Connection refused
```

**Solutions:**

1. **Service Not Running**
   ```bash
   modmux status
   modmux start  # if not running
   ```

2. **Wrong Port**
   ```bash
   # Check actual port
   modmux status

   # Use correct port in requests
   curl http://localhost:ACTUAL_PORT/health
   ```

### Authentication Errors in API Responses

**Symptoms:**

```json
{
  "error": {
    "message": "GitHub Copilot authentication required",
    "type": "api_error"
  }
}
```

**Solutions:**

1. **Token Expired**
   ```bash
   modmux status  # Check auth status

   # Re-authenticate if expired
   modmux stop
   rm ~/.modmux/token.json
   modmux start
   ```

2. **Service Restart Needed**
   ```bash
   modmux restart
   ```

### Invalid Model Errors

**Symptoms:**

```json
{
  "error": {
    "message": "Model not found: gpt-5",
    "type": "invalid_request_error"
  }
}
```

**Solutions:**

1. **Check Available Models**
   ```bash
   modmux models
   ```

2. **Use Valid Model Names**
   ```bash
   # Valid models (examples)
   curl -X POST http://localhost:11435/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model": "gpt-4o", "messages": [...], "max_tokens": 100}'
   ```

### Rate Limiting

**Symptoms:**

```json
{
  "error": {
    "message": "Rate limit exceeded",
    "type": "api_error"
  }
}
```

**Solutions:**

1. **Wait and Retry**
   ```bash
   # GitHub Copilot has rate limits
   # Wait 1 minute and try again
   ```

2. **Check Usage Patterns**
   ```bash
   # Monitor request frequency
   curl http://localhost:11435/v1/usage
   ```

---

## Agent Integration Issues

### Claude Code Not Connecting

**Symptoms:**

- Claude Code shows "Failed to connect to API"
- No responses in VS Code extension

**Solutions:**

1. **Check Configuration**
   ```bash
   cat ~/.claude/settings.json
   # Should contain:
   # "ANTHROPIC_BASE_URL": "http://localhost:11435"
   # "ANTHROPIC_AUTH_TOKEN": "not-needed"
   ```

2. **Restart VS Code**
   ```bash
   # Close VS Code completely
   # Restart and try Claude Code again
   ```

3. **Reconfigure Agent**
   ```bash
   modmux unconfigure claude-code
   modmux configure claude-code
   ```

### Cline Connection Issues

**Symptoms:**

- Cline shows connection errors
- Requests timeout

**Solutions:**

1. **Check Configuration Files**
   ```bash
   cat ~/.cline/data/globalState.json
   cat ~/.cline/data/secrets.json
   # Should point to localhost:11435 with OpenAI format
   ```

2. **Restart Cline**
   ```bash
   # Restart VS Code or Cline extension
   ```

### Codex Integration Problems

**Symptoms:**

- Codex cannot connect to AI service

**Solutions:**

1. **Check TOML Configuration**
   ```bash
   cat ~/.codex/config.toml
   # Should have custom provider pointing to localhost
   ```

2. **Verify Codex Version**
   ```bash
   codex --version
   # Ensure compatible version
   ```

---

## Performance Issues

### Slow Response Times

**Symptoms:**

- API calls take >10 seconds
- Agent interactions are sluggish

**Diagnostic:**

```bash
# Check usage metrics
curl http://localhost:11435/v1/usage
# Look at averageDuration values
```

**Solutions:**

1. **GitHub Copilot Service Issues**
   ```bash
   # Test direct GitHub API
   curl -H "Authorization: Bearer $(cat ~/.modmux/token.json | jq -r .accessToken)" \
     https://api.github.com/copilot_internal/
   ```

2. **Network Latency**
   ```bash
   # Test network to GitHub
   ping api.github.com
   traceroute api.github.com
   ```

3. **Local System Load**
   ```bash
   # Check system resources
   top
   htop  # if available
   ```

### High Memory Usage

**Symptoms:**

- Modmux process using excessive RAM

**Diagnostic:**

```bash
# Check Modmux processes
ps aux | grep modmux
```

**Solutions:**

1. **Restart Service**
   ```bash
   modmux restart
   ```

2. **Check Configuration**
   ```bash
   # Look for streaming configuration issues
   cat ~/.modmux/config.json
   ```

---

## Log Analysis

### Finding Log Files

```bash
# Main log location
cat ~/.modmux/modmux.log

# Recent errors only
modmux doctor | grep "Last 5 errors" -A 10

# Live log monitoring
tail -f ~/.modmux/modmux.log
```

### Common Log Error Patterns

1. **Authentication Errors**
   ```
   {"level":"error","message":"GitHub authentication failed","timestamp":"..."}
   ```
   Solution: Re-authenticate with `modmux start`

2. **Port Binding Errors**
   ```
   {"level":"error","message":"Address already in use","port":11435}
   ```
   Solution: Change port or stop conflicting service

3. **GitHub API Errors**
   ```
   {"level":"error","message":"GitHub API rate limit exceeded"}
   ```
   Solution: Wait and retry

### Enabling Debug Logging

```bash
# Set debug environment variable
export MODMUX_DEBUG=1
modmux restart

# Check for more detailed logs
tail -f ~/.modmux/modmux.log
```

---

## Advanced Troubleshooting

### Complete Reset

If all else fails, completely reset Modmux:

```bash
# Stop service
modmux stop

# Backup configuration
cp -r ~/.modmux ~/.modmux.backup

# Remove all Modmux data
rm -rf ~/.modmux

# Unconfigure agents (optional)
modmux unconfigure claude-code
modmux unconfigure cline
modmux unconfigure codex

# Start fresh
modmux start
```

### System Service Issues

If using `install-service`:

```bash
# Check service status
# macOS
launchctl list | grep modmux

# Linux (systemd)
systemctl --user status modmux

# Windows
sc query modmux

# Reinstall service
modmux uninstall-service
modmux install-service
```

### Network Debugging

```bash
# Check what's listening on the port
netstat -tulpn | grep 11435  # Linux
lsof -i :11435  # macOS
netstat -ano | findstr :11435  # Windows

# Test local connectivity
curl -v http://localhost:11435/health
curl -v http://127.0.0.1:11435/health
```

---

## Getting Help

If this guide doesn't solve your issue:

1. **Check GitHub Issues**:
   [github.com/modmux/modmux/issues](https://github.com/modmux/modmux/issues)
2. **Create Detailed Bug Report** with:
   - Output of `modmux status`
   - Output of `modmux doctor`
   - Recent log entries (`tail -50 ~/.modmux/modmux.log`)
   - Steps to reproduce
   - Operating system and version
3. **Include Configuration** (redact sensitive info):
   - `~/.modmux/config.json`
   - Agent config files (if relevant)

### Useful Information for Bug Reports

```bash
# System information
uname -a
modmux --version

# Service state
modmux status
modmux doctor

# Network state
lsof -i :11435  # macOS/Linux
netstat -ano | findstr :11435  # Windows

# Recent logs
tail -50 ~/.modmux/modmux.log

# Configuration (redact tokens)
cat ~/.modmux/config.json
```

Remember to **never share authentication tokens** or sensitive information in
bug reports!
