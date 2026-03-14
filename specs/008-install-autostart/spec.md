# Feature Specification: Global Install & Daemon Autostart

**Feature Branch**: `008-install-autostart`
**Created**: 2026-03-10
**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 — One-Command Global Install (Priority: P1)

A developer discovers Coco, clones the repository, and wants to try it immediately.
They run a single command and `coco` becomes available in their terminal globally — no manual PATH editing, no symlinks, no build steps.

**Why this priority**: Without a simple install path, the tool is only usable from the repo directory. Global availability is the baseline for any CLI tool to be usable in practice.

**Independent Test**: Clone the repo on a fresh machine. Run the install command. Open a new terminal. Type `coco --version` and receive a version string. No further configuration is needed to deliver this value.

**Acceptance Scenarios**:

1. **Given** the repo is cloned, **When** the developer runs `deno install` (or equivalent mise command), **Then** `coco` is available in their PATH in any new terminal session
2. **Given** `coco` is installed globally, **When** the developer runs `coco --version`, **Then** the correct version string is displayed
3. **Given** `coco` is already installed, **When** the install command is run again, **Then** the global binary is updated to the new version without error
4. **Given** a developer uses mise for tool management, **When** they run the mise install command from the repo, **Then** `coco` is available via mise's shim system

---

### User Story 2 — Daemon Survives System Restarts (Priority: P2)

A developer runs `coco start` and configures their agents to route through Coco. After restarting their machine, all configured agents continue working — Coco started automatically in the background without any manual intervention.

**Why this priority**: Without autostart, users must remember to run `coco start` after every reboot. This breaks the "set it and forget it" expectation of a local service and creates friction for daily use.

**Independent Test**: Run `coco install-service`. Restart the machine. Run `coco status` — service is running. Configured agents work without any manual steps.

**Acceptance Scenarios**:

1. **Given** Coco is globally installed, **When** the developer runs `coco install-service`, **Then** the daemon is registered with the OS service manager to start at login
2. **Given** the service is registered, **When** the machine restarts, **Then** the Coco daemon starts automatically and the proxy is available
3. **Given** the service is registered, **When** the developer runs `coco status`, **Then** the status reflects the running daemon
4. **Given** the service is registered, **When** the developer runs `coco uninstall-service`, **Then** the daemon is deregistered and will not start on next restart
5. **Given** the developer is on macOS, **When** they install the service, **Then** it registers as a LaunchAgent (user-level, no sudo required)
6. **Given** the developer is on Linux with systemd, **When** they install the service, **Then** it registers as a systemd user unit (no sudo required)

---

### User Story 3 — README Quickstart (Priority: P3)

A developer reads the README and can follow a 2-step quickstart: install the tool, then optionally register the service. The path to a working Coco setup is clear and requires no prior knowledge of Deno or system service managers.

**Why this priority**: Even a perfect CLI is unusable if first-time setup isn't documented. Quickstart clarity determines whether developers succeed on first attempt.

**Independent Test**: Follow only the README quickstart section on a clean machine with Deno installed. Run `coco --version` — version string is printed. Run `coco --help` — `install-service` and `uninstall-service` appear in the commands list. No service registration is required to deliver this value.

**Acceptance Scenarios**:

1. **Given** a developer reads the README, **When** they follow the quickstart, **Then** they have a running Coco instance in under 5 minutes
2. **Given** the quickstart is followed, **When** the developer runs `coco doctor`, **Then** no errors are shown

---

### Edge Cases

- What happens when the install command is run without Deno installed?
- How does `coco install-service` behave on Windows — Task Scheduler or documented as unsupported?
- What happens if the service is registered but the `coco` binary is later moved or deleted?
- What happens if `install-service` is run when the service is already registered?
- What if the system uses a non-systemd init system on Linux (e.g., OpenRC)?
- What happens when `coco uninstall-service` is run when no service is registered?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A single command from the repository root MUST install `coco` as a globally available CLI tool using Deno's native install mechanism
- **FR-002**: A single command from the repository root MUST install `coco` as a globally available CLI tool via mise for developers who use mise for tool version management — implemented as a `.mise.toml` `install` task that wraps `deno install`, invoked with `mise run install`
- **FR-003**: The installed binary MUST be named `coco`
- **FR-004**: Running the install command when `coco` is already installed MUST update the existing installation without error
- **FR-005**: `coco install-service` MUST register the Coco daemon with the native OS login service manager (LaunchAgent on macOS, systemd user unit on Linux)
- **FR-006**: `coco uninstall-service` MUST deregister the daemon from the OS service manager and prevent autostart on future reboots
- **FR-007**: Service registration MUST NOT require elevated privileges (no sudo or admin required)
- **FR-008**: After `coco install-service`, the daemon MUST start automatically when the user logs in without any manual action, AND MUST also start immediately without requiring a separate `coco start` invocation
- **FR-009**: `coco install-service` MUST be idempotent — running it when the service is already registered MUST succeed without error
- **FR-010**: `coco uninstall-service` MUST be idempotent — running it when no service is registered MUST succeed without error
- **FR-011**: On unsupported platforms for service management (Windows, and Linux without systemd), `coco install-service` MUST display a calm message indicating that autostart support for that platform is coming soon; global install via `deno install` IS supported on all platforms
- **FR-012**: The README MUST include a quickstart section covering both install methods (deno and mise) and the optional service registration step
- **FR-013**: The service unit MUST reference the absolute path to the globally installed `coco` binary (resolved at `install-service` time), so the service survives the source repository being moved or deleted

### Key Entities

- **Global Install**: The `coco` binary registered in the developer's PATH, sourced from the local repository's entry point
- **Service Registration**: An OS-level configuration file (plist on macOS / systemd unit on Linux) that instructs the OS to launch the Coco daemon at user login
- **mise configuration**: A `.mise.toml` file in the repository root containing an `install` task that wraps `deno install`, allowing `mise run install` to globally install `coco`

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with Deno installed can go from a fresh clone to `coco` available in PATH in under 60 seconds
- **SC-002**: After `coco install-service` and a machine restart, `coco status` shows the service running with zero manual steps
- **SC-003**: The quickstart in the README can be completed successfully on macOS and Linux by following it verbatim on a clean machine with Deno pre-installed
- **SC-004**: `coco install-service` and `coco uninstall-service` complete without error on macOS and Linux
- **SC-005**: All new commands (`install-service`, `uninstall-service`) appear in `coco --help`
