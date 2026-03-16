## Contracts

### cli

### Interface

#### Entry Point

```
deno run -A src/cli/main.ts [OPTIONS]
```

#### Options

| Flag        | Alias | Type    | Default | Description             |
| ----------- | ----- | ------- | ------- | ----------------------- |
| `--help`    | `-h`  | boolean | false   | Show help message       |
| `--version` | `-v`  | boolean | false   | Show version            |
| `--reauth`  |       | boolean | false   | Force re-authentication |

#### Exit Codes

| Code | Meaning                        |
| ---- | ------------------------------ |
| 0    | Success - Claude Code launched |
| 1    | Authentication failed          |
| 2    | Network error                  |
| 3    | Invalid configuration          |

#### Output Format

First-time authentication:

```
To authenticate, visit: https://github.com/login/device
Enter code: XXXX-XXXX
```

Success:

```
Authenticated successfully.
```

Error:

```
Authentication failed: <message>
```
