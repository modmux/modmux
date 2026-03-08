# Data Model: Copilot Authentication

## Entities

### AuthToken

Represents the OAuth token received from GitHub Copilot.

| Field        | Type   | Description                  |
| ------------ | ------ | ---------------------------- |
| accessToken  | string | The OAuth access token       |
| expiresAt    | number | Unix timestamp of expiration |
| refreshToken | string | Optional refresh token       |
| createdAt    | number | Unix timestamp of creation   |

**Validation**:

- accessToken: Required, non-empty string
- expiresAt: Required, must be future timestamp

### DeviceFlowState

Represents the current state of device flow authentication.

| Field           | Type   | Description                      |
| --------------- | ------ | -------------------------------- |
| deviceCode      | string | GitHub device code               |
| userCode        | string | User verification code           |
| verificationUri | string | URL for user to visit            |
| expiresAt       | number | Unix timestamp when flow expires |
| interval        | number | Polling interval in seconds      |

---

## Storage

### Token Storage Location

- **Primary**: Platform secure storage
  - macOS: Keychain
  - Windows: Credential Manager
  - Linux: Secret Service API (libsecret)
- **Fallback**: Encrypted file at `~/.claudio/tokens.json`

### Token Format (file storage)

```json
{
  "copilot": {
    "accessToken": "encrypted_string",
    "expiresAt": 1234567890,
    "createdAt": 1234567890
  }
}
```

---

## State Transitions

### Authentication Flow States

```
IDLE → INITIATED → POLLING → AUTHENTICATED
                      ↓
                   FAILED
```

| From      | To            | Trigger                              |
| --------- | ------------- | ------------------------------------ |
| IDLE      | INITIATED     | User runs Claudio, no valid token    |
| INITIATED | POLLING       | Device code received from GitHub     |
| POLLING   | AUTHENTICATED | User completes GitHub authorization  |
| POLLING   | FAILED        | Timeout, error, or user cancellation |
