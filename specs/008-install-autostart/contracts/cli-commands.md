# CLI Contract: install-service & uninstall-service

**Feature**: 008-install-autostart

## install-service

### Invocation
```
coco install-service
```

### Behaviour by platform

| Platform | Behaviour |
|----------|-----------|
| macOS | Writes `~/Library/LaunchAgents/com.coco.plist`; runs `launchctl bootstrap gui/$UID <plist>`; starts daemon immediately |
| Linux (systemd) | Writes `~/.config/systemd/user/coco.service`; runs `systemctl --user daemon-reload && systemctl --user enable --now coco.service` |
| Linux (no systemd) | Prints "coming soon" message; exits 0 |
| Windows | Prints "coming soon" message; exits 0 |

### Prerequisites
- `coco` binary must be in PATH (globally installed via `deno task install`)
- If binary not found: error message + exit 1

### Idempotency
- Already registered: re-registers (bootout + bootstrap on macOS; systemctl is idempotent on Linux); exits 0

### Output (success — macOS example)
```
Coco service installed.
  Config: /Users/alice/Library/LaunchAgents/com.coco.plist
  Binary: /Users/alice/.deno/bin/coco
Coco is running on http://localhost:11434
```

### Output (coming soon)
```
Autostart service support for Windows is coming soon.
Run 'coco start' manually after each login.
```

### Exit codes
| Code | Meaning |
|------|---------|
| 0 | Success or unsupported platform (coming soon) |
| 1 | Binary not found or OS command failed |

---

## uninstall-service

### Invocation
```
coco uninstall-service
```

### Behaviour by platform

| Platform | Behaviour |
|----------|-----------|
| macOS | Runs `launchctl bootout gui/$UID`; removes plist file |
| Linux (systemd) | Runs `systemctl --user disable --now coco.service`; removes unit file |
| Linux (no systemd) / Windows | Prints "coming soon" message; exits 0 |

### Idempotency
- Not registered: prints "Coco service is not installed." and exits 0

### Output (success)
```
Coco service removed. The daemon will not start on next login.
```

### Exit codes
| Code | Meaning |
|------|---------|
| 0 | Success, not-installed (idempotent), or unsupported platform |
| 1 | OS command failed |

---

## install (deno task / mise task)

### Invocation
```bash
deno task install       # via deno.json task
mise run install        # via .mise.toml task
```

### Effect
Runs `deno install --global --allow-all -n coco --force src/cli/main.ts`

Installs `coco` binary to `~/.deno/bin/coco` (or `$DENO_INSTALL_ROOT/bin/coco`).

### Idempotency
`--force` flag silently overwrites existing installation.

### Exit codes
| Code | Meaning |
|------|---------|
| 0 | Success |
| non-zero | deno install failed (propagated directly) |
