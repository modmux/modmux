# Quickstart: Global Install & Daemon Autostart

## Requirements

- [Deno](https://deno.com) installed (`curl -fsSL https://deno.land/install.sh | sh`)
- Repository cloned: `git clone https://github.com/myty/coco && cd coco`

---

## Step 1: Install `coco` globally

**With Deno:**
```bash
deno task install
```

**With mise:**
```bash
mise run install
```

After installation, `coco` is available in any terminal session:
```bash
coco --version
# Coco v0.2.0
```

> **Note**: Ensure `~/.deno/bin` is in your `PATH`. The Deno installer adds this automatically.

---

## Step 2: Authenticate with GitHub Copilot

```bash
coco start
```

On first run, you will be prompted to authenticate via GitHub's device flow.
Follow the link shown in the terminal.

---

## Step 3 (Optional): Register as a login service

To have Coco start automatically after every login:

```bash
coco install-service
```

This registers the daemon with your OS service manager and starts it immediately.

To remove the service:
```bash
coco uninstall-service
```

> **macOS**: Uses LaunchAgent (`~/Library/LaunchAgents/com.coco.plist`)  
> **Linux**: Uses systemd user unit (`~/.config/systemd/user/coco.service`)  
> **Windows**: Service autostart coming soon — run `coco start` manually.

---

## Verify

```bash
coco status
# Status: Running on http://localhost:11434
# Copilot: Authenticated ✓

coco doctor
# claude-code    installed     not configured
# cline          detected      not configured
# ...
```

---

## Configure an agent

```bash
coco configure claude-code
# claude-code configured.
```

Or use the interactive TUI:
```bash
coco
```
