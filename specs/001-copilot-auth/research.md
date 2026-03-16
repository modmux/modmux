## Research

### Decision: Use Copilot SDK for Authentication

**Rationale**: The Copilot SDK handles device flow authentication internally,
reducing code complexity and maintenance burden. This aligns with the Minimalism
principle.

**Alternatives considered**:

- Manual OAuth2 implementation: Rejected - adds unnecessary code, increases
  maintenance
- GitHub OAuth library: Rejected - overkill for single-purpose CLI

---

### Decision: Deno with npm Compatibility Layer

**Rationale**:

- Deno is required per project constraints
- Copilot SDK is published to npm, requires npm compatibility layer
- Deno's permissions model provides secure token handling

**Alternatives considered**:

- Pure Deno native modules: Rejected - Copilot SDK only available via npm
- Bundled JavaScript: Rejected - would require manual SDK updates

---

### Decision: File-Based Token Cache with Platform Secure Storage

**Rationale**:

- Returning users need seamless auth (SC-002: <5s)
- Platform secure storage (Keychain/Credential Manager) provides best security
- File cache as fallback when secure storage unavailable

**Implementation approach**:

- Primary: Platform secure storage API
- Fallback: Encrypted file in Deno data dir (~/.claudio/)
- Token validation on startup before use

---

### Decision: Minimal CLI Output

**Rationale**: Constitution II. Calm UX requires quiet, reassuring output.
Terminal performance requires minimal I/O.

**Implementation approach**:

- Only output: verification URL + device code (first-time auth)
- Success/failure indicators only
- No progress bars, no verbose logging
- ANSI soft blue/green colors for status messages
