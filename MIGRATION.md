# Migration Guide: Coco -> Modmux

This project has been renamed from **Coco** to **Modmux**.

Modmux is the canonical project name, command name, package name, and
configuration namespace.

## What Changed

- Project and repository identity moved to Modmux.
- Canonical CLI command is now `modmux`.
- Canonical config/state directory is now `~/.modmux`.
- Canonical environment variables now use `MODMUX_`.
- npm and JSR package distributions have been discontinued.
- Installation is now via repository source or direct binary download.

## Before/After Mapping

| Area             | Before                 | After                    |
| ---------------- | ---------------------- | ------------------------ |
| Repository       | `github.com/myty/coco` | `github.com/modmux/modmux` |
| CLI command      | `coco`                 | `modmux`                 |
| Installation     | `jsr:@myty/coco`       | From source or binary    |
| Installation     | `@myty/coco`           | From source or binary    |
| Config directory | `~/.coco`              | `~/.modmux`              |
| PID file         | `~/.coco/coco.pid`     | `~/.modmux/modmux.pid`   |
| Log file         | `~/.coco/coco.log`     | `~/.modmux/modmux.log`   |
| Env prefix       | `COCO_*`               | `MODMUX_*`               |

## Upgrade Steps

1. Install from source:

```bash
git clone https://github.com/modmux/modmux.git && cd modmux
deno task install
```

Or download a binary from [GitHub Releases](https://github.com/modmux/modmux/releases).

2. Update scripts and automation from `coco` to `modmux`.

3. Update environment variables from `COCO_*` to `MODMUX_*`.

4. Move any direct path references from `~/.coco` to `~/.modmux`.

## Compatibility Behavior

- Running `coco` no longer works; use `modmux` instead.
- `COCO_*` variables are no longer supported; use `MODMUX_*` variables instead.
- Existing data under `~/.coco` is not automatically migrated; manual migration
  may be required.

---

# Migration Guide: Ardo -> Coco

This repository has been renamed from **Ardo** back to **Coco**.

Coco is now the canonical project name, command name, package name, and
configuration namespace.

## What Changed

- Project and repository identity moved back to Coco and myty.
- Canonical CLI command is now `coco`.
- Canonical config/state directory is now `~/.coco`.
- Canonical environment variables now use `COCO_`.
- npm package `@myty/coco` is now canonical.
- Package manager distributions (npm/JSR) were discontinued in favor of source
  installation and direct binaries.

## Before/After Mapping

| Area             | Before                     | After                        |
| ---------------- | -------------------------- | ---------------------------- |
| Repository       | `github.com/ardo-org/ardo` | `github.com/modmux/modmux`     |
| CLI command      | `ardo`                     | `modmux`                     |
| Installation     | `jsr:@ardo-org/ardo`       | From source or binary        |
| Installation     | `@myty/ardo`               | From source or binary        |
| Config directory | `~/.ardo`                  | `~/.modmux`                  |
| PID file         | `~/.ardo/ardo.pid`         | `~/.modmux/modmux.pid`       |
| Log file         | `~/.ardo/ardo.log`         | `~/.modmux/modmux.log`       |
| Env prefix       | `ARDO_*`                   | `MODMUX_*`                   |

## Upgrade Steps

1. Install from source:

```bash
git clone https://github.com/modmux/modmux.git && cd modmux
deno task install
```

Or download a binary from [GitHub Releases](https://github.com/modmux/modmux/releases).

2. Update scripts and automation from `ardo` to `modmux`.

3. Update environment variables from `ARDO_*` to `MODMUX_*`.

4. Move any direct path references from `~/.ardo` to `~/.modmux`.

## Compatibility Behavior

- Running `ardo` no longer works; use `modmux` instead.
- `ARDO_*` variables are no longer supported; use `MODMUX_*` variables instead.
- Existing data under `~/.ardo` is not automatically migrated; manual migration
  may be required.
