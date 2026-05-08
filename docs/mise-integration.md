# Mise Integration

[Mise](https://mise.jdx.dev/) is a polyglot tool manager. Use it to install
modmux globally and keep it updated.

## Install

```bash
mise use -g github:modmux/modmux@latest
```

Mise downloads the latest release binary for your platform and puts it in your
PATH. No Deno or manual download required.

To pin to a specific version:

```bash
mise use -g github:modmux/modmux@0.6.0
```

## Update

```bash
mise upgrade modmux
```

If modmux is running when you upgrade, the old process continues with the old
binary until restarted. Run `modmux restart` after upgrading to use the new
version.

## Auto-restart on update

To restart modmux automatically after every `mise upgrade`, add a postinstall
hook to `~/.config/mise/config.toml`:

```toml
[hooks]
postinstall = '''
if [ "$MISE_TOOL_NAME" = "modmux" ] && modmux status >/dev/null 2>&1; then
  echo "Restarting modmux after update..."
  modmux restart
fi
'''
```

This hook runs after any tool install or upgrade. The `MISE_TOOL_NAME` check
limits the restart to modmux updates only.

## Self-contained upgrade

To upgrade without using Mise, use the built-in upgrade command:

```bash
modmux upgrade
```

This fetches the latest release from GitHub, replaces the running binary, and
restarts the service if it was running. Works regardless of how modmux was
installed.

## Service management tasks

If you work inside the modmux project directory, Mise tasks wrap the common
service commands:

```bash
mise run start     # modmux start
mise run stop      # modmux stop
mise run restart   # modmux restart
mise run status    # modmux status
mise run dev       # run from source (deno task dev)
```

Run `mise tasks` to see all available tasks.
