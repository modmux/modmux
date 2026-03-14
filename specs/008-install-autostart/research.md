# Research: Global Install & Daemon Autostart

**Feature**: 008-install-autostart  
**Date**: 2026-03-10

---

## 1. Deno 2.x Global Install Command

**Decision**: Use `deno install --global -A -n coco src/cli/main.ts` (with `--force` for updates).

**Exact command:**
```bash
deno install --global --allow-all -n coco --force src/cli/main.ts
```

**Rationale:**
- In Deno 2.x, `deno install` has two modes: local (package cache) and global (`--global` / `-g` flag)
- `--global` is required to install a script as an executable in `~/.deno/bin/`
- `-n coco` sets the binary name
- `--force` silently overwrites an existing installation (needed for re-install/update)
- `--allow-all` / `-A` grants all permissions to the installed script

**Deno task to add to `deno.json`:**
```json
"install": "deno install --global --allow-all -n coco --force src/cli/main.ts"
```

**Alternatives considered:**
- `deno compile` — produces a standalone binary but is slower and doesn't stay linked to source
- `--root /usr/local` — requires sudo; rejected (FR-007)

---

## 2. .mise.toml Install Task

**Decision**: Add `.mise.toml` at the repository root with a `[tasks.install]` entry wrapping `deno install`.

**Exact format:**
```toml
[tasks.install]
description = "Install coco globally via deno"
run = "deno install --global --allow-all -n coco --force src/cli/main.ts"
```

**Developer invocation**: `mise run install`

**Rationale:**
- mise task format is TOML with `[tasks.<name>]` sections containing `run` (shell command) and optional `description`
- Wrapping `deno install` means mise users get identical behaviour to `deno task install`
- No mise plugin or version management required — just a convenience task

**Alternatives considered:**
- Full mise tool backend (deno backend) — more complex; requires mise plugin setup
- README-only documentation — insufficient; FR-002 requires a runnable command

---

## 3. macOS LaunchAgent

**Decision**: Write a plist to `~/Library/LaunchAgents/com.coco.plist` and load via `launchctl bootstrap`.

**Plist format:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.coco</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/username/.deno/bin/coco</string>
    <string>--daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/Users/username/.coco/coco.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/username/.coco/coco.log</string>
</dict>
</plist>
```

**Load command** (macOS 11+, no sudo):
```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.coco.plist
```

**Unload command:**
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.coco.plist
```

**Idempotency**: `bootstrap` returns an error if already loaded; `bootout` first (ignore error), then `bootstrap`.

**Rationale:**
- `launchctl load` is deprecated since macOS 11; `bootstrap gui/$UID` is the modern equivalent
- User-level (`gui/$UID`) requires no sudo
- `RunAtLoad: true` starts it immediately on bootstrap AND on future logins
- `KeepAlive: false` matches existing daemon PID model (daemon manages its own lifecycle)

---

## 4. Linux systemd User Unit

**Decision**: Write a `.service` file to `~/.config/systemd/user/coco.service` and enable with `systemctl --user enable --now`.

**Unit file format:**
```ini
[Unit]
Description=Coco Local AI Gateway
After=network.target

[Service]
Type=simple
ExecStart=/home/username/.deno/bin/coco --daemon
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

**Enable + start command** (no sudo):
```bash
systemctl --user daemon-reload
systemctl --user enable --now coco.service
```

**Disable + stop command:**
```bash
systemctl --user disable --now coco.service
```

**Rationale:**
- `systemctl --user` operates on user-level services, no root required
- `enable --now` registers for future logins AND starts immediately (FR-008)
- `Restart=on-failure` provides resilience without overriding coco's own PID model
- `daemon-reload` required after writing/modifying unit file

---

## 5. Binary Path Resolution

**Decision**: Reuse the existing `findBinary("coco")` from `src/lib/process.ts`.

**Behaviour:**
- Scans `$PATH` directories plus common install locations (`~/.local/bin`, `~/.deno/bin`, etc.)
- Returns the first match as an absolute path
- Returns `null` if not found

**Usage in `install-service`:**
```typescript
const cocoPath = await findBinary("coco");
if (!cocoPath) {
  console.error("coco is not installed globally. Run: deno task install");
  Deno.exit(1);
}
```

**Rationale:**
- Already exists in codebase; cross-platform; handles common non-PATH install dirs
- `Deno.execPath()` returns the Deno runtime path, not the coco binary — not usable
- `which coco` via shell is simpler but Windows-incompatible

---

## 6. Unsupported Platform Message

**Decision**: Detect platform with `Deno.build.os`. Show calm "coming soon" message for Windows and non-systemd Linux.

```typescript
if (Deno.build.os === "windows") {
  console.log("Autostart service support for Windows is coming soon.");
  console.log("For now, run 'coco start' manually after each login.");
  Deno.exit(0);
}
```

For Linux without systemd: check whether `systemctl` is available; if not, show the same message.
