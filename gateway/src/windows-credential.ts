// Windows Credential Manager access via FFI (primary) and PowerShell P/Invoke (fallback).
// FFI calls advapi32.dll directly; PowerShell uses inline C# P/Invoke.
// Both work in non-interactive contexts (daemon startup) unlike PSCredential cmdlets.
//
// CREDENTIALW struct layout (x64):
// https://learn.microsoft.com/windows/win32/api/wincred/ns-wincred-credentialw
// Offset  Field              Size  Type
//  0      Flags              4     DWORD
//  4      Type               4     DWORD
//  8      TargetName         8     LPWSTR
// 16      Comment            8     LPWSTR
// 24      LastWritten        8     FILETIME
// 32      CredentialBlobSize 4     DWORD
// 36      (padding)          4
// 40      CredentialBlob     8     LPBYTE
// 48      Persist            4     DWORD
// 52      AttributeCount     4     DWORD
// 56      Attributes         8     PCREDENTIAL_ATTRIBUTEW
// 64      TargetAlias        8     LPWSTR
// 72      UserName           8     LPWSTR
// 80      (total)

const CRED_TYPE_GENERIC = 1;
const CRED_PERSIST_LOCAL_MACHINE = 2;
const CRED_MAX_BLOB_SIZE = 5 * 512;
const ERROR_NOT_FOUND = 1168;

// ──────────────────────────────────────────────────────────────────────────────
// FFI
// ──────────────────────────────────────────────────────────────────────────────

// DLL handles are opened per-call and closed immediately after to avoid
// resource leaks in long-running processes and test environments.

const ADV_SYMBOLS = {
  CredWriteW: { parameters: ["pointer", "u32"] as const, result: "i32" as const },
  CredReadW: { parameters: ["pointer", "u32", "u32", "pointer"] as const, result: "i32" as const },
  CredDeleteW: { parameters: ["pointer", "u32", "u32"] as const, result: "i32" as const },
  CredFree: { parameters: ["pointer"] as const, result: "void" as const },
};

const K32_SYMBOLS = {
  GetLastError: { parameters: [] as const, result: "u32" as const },
};

function toWide(s: string): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer((s.length + 1) * 2);
  const view = new Uint16Array(ab);
  for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i);
  view[s.length] = 0;
  return new Uint8Array(ab);
}

function fromWideBlob(ptr: NonNullable<Deno.PointerValue>, byteLen: number): string {
  const pv = new Deno.UnsafePointerView(ptr);
  const chars: number[] = [];
  for (let i = 0; i < byteLen; i += 2) {
    const c = pv.getUint16(i);
    if (c === 0) break;
    chars.push(c);
  }
  return String.fromCharCode(...chars);
}

function ffiWrite(target: string, username: string, password: string): void {
  const k32 = Deno.dlopen("kernel32.dll", K32_SYMBOLS);
  const adv = Deno.dlopen("advapi32.dll", ADV_SYMBOLS);
  try {
    const tgt = toWide(target);
    const usr = toWide(username);
    const pwd = toWide(password);

    if (pwd.byteLength > CRED_MAX_BLOB_SIZE) {
      throw new Error(`Credential blob too large: ${pwd.byteLength} bytes`);
    }

    const credAb = new ArrayBuffer(80);
    const credBuf = new Uint8Array(credAb);
    const dv = new DataView(credAb);
    const tgtPtr = Deno.UnsafePointer.of(tgt)!;
    const usrPtr = Deno.UnsafePointer.of(usr)!;
    const pwdPtr = Deno.UnsafePointer.of(pwd)!;

    dv.setUint32(0, 0, true);
    dv.setUint32(4, CRED_TYPE_GENERIC, true);
    dv.setBigUint64(8, BigInt(Deno.UnsafePointer.value(tgtPtr)), true);
    dv.setBigUint64(16, 0n, true);
    dv.setBigUint64(24, 0n, true);
    dv.setUint32(32, pwd.byteLength, true);
    dv.setBigUint64(40, BigInt(Deno.UnsafePointer.value(pwdPtr)), true);
    dv.setUint32(48, CRED_PERSIST_LOCAL_MACHINE, true);
    dv.setUint32(52, 0, true);
    dv.setBigUint64(56, 0n, true);
    dv.setBigUint64(64, 0n, true);
    dv.setBigUint64(72, BigInt(Deno.UnsafePointer.value(usrPtr)), true);

    const ok = adv.symbols.CredWriteW(Deno.UnsafePointer.of(credBuf), 0);
    if (ok === 0) {
      const code = k32.symbols.GetLastError();
      throw new Error(`CredWriteW failed (code ${code})`);
    }
  } finally {
    adv.close();
    k32.close();
  }
}

function ffiRead(target: string): string | null {
  const k32 = Deno.dlopen("kernel32.dll", K32_SYMBOLS);
  const adv = Deno.dlopen("advapi32.dll", ADV_SYMBOLS);
  try {
    const tgt = toWide(target);
    const ptrBuf = new BigUint64Array(new ArrayBuffer(8));

    const ok = adv.symbols.CredReadW(
      Deno.UnsafePointer.of(tgt),
      CRED_TYPE_GENERIC,
      0,
      Deno.UnsafePointer.of(ptrBuf),
    );

    if (ok === 0) {
      const code = k32.symbols.GetLastError();
      if (code === ERROR_NOT_FOUND || code === 0) return null;
      throw new Error(`CredReadW failed (code ${code})`);
    }

    const credPtr = Deno.UnsafePointer.create(ptrBuf[0]);
    if (credPtr === null) return null;

    try {
      const cv = new Deno.UnsafePointerView(credPtr);
      const blobSize = cv.getUint32(32);
      const blobPtr = Deno.UnsafePointer.create(cv.getBigUint64(40));
      if (blobPtr === null || blobSize === 0) return null;
      return fromWideBlob(blobPtr, blobSize);
    } finally {
      adv.symbols.CredFree(credPtr);
    }
  } finally {
    adv.close();
    k32.close();
  }
}

function ffiDelete(target: string): void {
  const k32 = Deno.dlopen("kernel32.dll", K32_SYMBOLS);
  const adv = Deno.dlopen("advapi32.dll", ADV_SYMBOLS);
  try {
    const tgt = toWide(target);
    const ok = adv.symbols.CredDeleteW(Deno.UnsafePointer.of(tgt), CRED_TYPE_GENERIC, 0);
    if (ok === 0) {
      const code = k32.symbols.GetLastError();
      if (code !== ERROR_NOT_FOUND) {
        throw new Error(`CredDeleteW failed (code ${code})`);
      }
    }
  } finally {
    adv.close();
    k32.close();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// PowerShell P/Invoke fallback
// ──────────────────────────────────────────────────────────────────────────────

function q(s: string): string {
  return s.replace(/'/g, "''");
}

// Inline C# struct shared by read/write scripts
const CS_CREDENTIAL_STRUCT = `
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct CREDENTIAL {
    public int Flags;
    public int Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize;
    public IntPtr CredentialBlob;
    public int Persist;
    public int AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
}`.trim();

function buildWriteScript(target: string, username: string, password: string): string {
  return `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CredMan {
    ${CS_CREDENTIAL_STRUCT}
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWriteW(ref CREDENTIAL credential, int flags);
}
"@
$Cred = New-Object CredMan+CREDENTIAL
$Cred.Type = 1
$Cred.TargetName = '${q(target)}'
$Cred.UserName = '${q(username)}'
$Cred.Persist = 2
$Bytes = [System.Text.Encoding]::Unicode.GetBytes('${q(password)}')
$Cred.CredentialBlobSize = $Bytes.Length
$Cred.CredentialBlob = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($Bytes.Length)
try {
    [System.Runtime.InteropServices.Marshal]::Copy($Bytes, 0, $Cred.CredentialBlob, $Bytes.Length)
    if (-not [CredMan]::CredWriteW([ref]$Cred, 0)) { throw 'CredWriteW failed' }
} finally {
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($Cred.CredentialBlob)
}`.trim();
}

function buildReadScript(target: string): string {
  return `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CredMan {
    ${CS_CREDENTIAL_STRUCT}
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredReadW(string targetName, int type, int flags, out IntPtr credential);
    [DllImport("advapi32.dll")]
    public static extern void CredFree(IntPtr credential);
}
"@
$Ptr = [IntPtr]::Zero
if (-not [CredMan]::CredReadW('${q(target)}', 1, 0, [ref]$Ptr)) { throw 'Credential not found' }
try {
    $Cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($Ptr, [type][CredMan+CREDENTIAL])
    $Bytes = New-Object byte[] $Cred.CredentialBlobSize
    [System.Runtime.InteropServices.Marshal]::Copy($Cred.CredentialBlob, $Bytes, 0, $Cred.CredentialBlobSize)
    Write-Host ('TOKEN=' + [System.Text.Encoding]::Unicode.GetString($Bytes))
} finally {
    [CredMan]::CredFree($Ptr)
}`.trim();
}

function buildDeleteScript(target: string): string {
  return `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CredMan {
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredDeleteW(string targetName, int type, int flags);
}
"@
if (-not [CredMan]::CredDeleteW('${q(target)}', 1, 0)) { throw 'CredDeleteW failed' }`.trim();
}

async function psInvoke(script: string, capture = false): Promise<string> {
  const args = ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script];
  let lastErr: Error = new Error("PowerShell unavailable");
  for (const exe of ["pwsh", "powershell.exe"]) {
    try {
      const out = await new Deno.Command(exe, {
        args,
        stdout: capture ? "piped" : "inherit",
        stderr: capture ? "piped" : "inherit",
      }).output();
      if (out.success) {
        return capture ? new TextDecoder().decode(out.stdout) : "";
      }
      if (capture) {
        const err = new TextDecoder().decode(out.stderr).trim();
        lastErr = new Error(err || `${exe} exited with code ${out.code}`);
      } else {
        lastErr = new Error(`${exe} exited with code ${out.code}`);
      }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr;
}

async function psWrite(target: string, username: string, password: string): Promise<void> {
  await psInvoke(buildWriteScript(target, username, password));
}

async function psRead(target: string): Promise<string | null> {
  try {
    const out = await psInvoke(buildReadScript(target), true);
    for (const line of out.split(/\r?\n/)) {
      if (line.startsWith("TOKEN=")) return line.slice(6).trim() || null;
    }
    return null;
  } catch {
    return null;
  }
}

async function psDelete(target: string): Promise<void> {
  try {
    await psInvoke(buildDeleteScript(target));
  } catch {
    // not found or already deleted — treat as success
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API: FFI first, PowerShell fallback
// ──────────────────────────────────────────────────────────────────────────────

export async function winCredWrite(
  target: string,
  username: string,
  password: string,
): Promise<void> {
  try {
    ffiWrite(target, username, password);
    return;
  } catch {
    // FFI unavailable or failed — fall through to PowerShell
  }
  await psWrite(target, username, password);
}

export async function winCredRead(target: string): Promise<string | null> {
  try {
    return ffiRead(target);
  } catch {
    // FFI unavailable or failed — fall through to PowerShell
  }
  return psRead(target);
}

export async function winCredDelete(target: string): Promise<void> {
  try {
    ffiDelete(target);
    return;
  } catch {
    // FFI unavailable or failed — fall through to PowerShell
  }
  await psDelete(target);
}
