/**
 * Cross-platform clipboard copy functionality.
 * Uses native commands on each platform; gracefully falls back if unavailable.
 */

/**
 * Copy text to clipboard on the current platform.
 * Throws if clipboard is unavailable and no fallback is possible.
 *
 * Supports:
 * - macOS: `pbcopy` (built-in)
 * - Windows: PowerShell `Set-Clipboard` (built-in)
 * - Linux: `xclip` (preferred) or `wl-copy` (Wayland)
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (Deno.build.os === "darwin") {
    return await copyViaMacOS(text);
  }
  if (Deno.build.os === "windows") {
    return await copyViaWindows(text);
  }
  // Linux / other
  return await copyViaLinux(text);
}

/**
 * Copy to clipboard on macOS using `pbcopy`
 */
async function copyViaMacOS(text: string): Promise<void> {
  const proc = new Deno.Command("pbcopy", {
    stdin: "piped",
  }).spawn();

  const writer = proc.stdin!.getWriter();
  await writer.write(new TextEncoder().encode(text));
  await writer.close();

  const { success } = await proc.output();
  if (!success) {
    throw new Error("pbcopy command failed");
  }
}

/**
 * Copy to clipboard on Windows using PowerShell's Set-Clipboard
 */
async function copyViaWindows(text: string): Promise<void> {
  // Escape single quotes in text
  const escaped = text.replace(/'/g, "''");
  const script = `"${escaped}" | Set-Clipboard`;

  const { success, stderr } = await new Deno.Command("powershell", {
    args: ["-NonInteractive", "-Command", script],
    stderr: "piped",
  }).output();

  if (!success) {
    const errMsg = new TextDecoder().decode(stderr).trim();
    throw new Error(`PowerShell Set-Clipboard failed: ${errMsg}`);
  }
}

/**
 * Copy to clipboard on Linux using `xclip` or `wl-copy`
 * Tries xclip first (X11), then wl-copy (Wayland)
 */
async function copyViaLinux(text: string): Promise<void> {
  // Try xclip first (most common)
  try {
    return await copyViaXclip(text);
  } catch {
    // Fall back to wl-copy for Wayland
    return await copyViaWlCopy(text);
  }
}

/**
 * Copy to clipboard using xclip (X11)
 */
async function copyViaXclip(text: string): Promise<void> {
  const proc = new Deno.Command("xclip", {
    args: ["-selection", "clipboard"],
    stdin: "piped",
  }).spawn();

  const writer = proc.stdin!.getWriter();
  await writer.write(new TextEncoder().encode(text));
  await writer.close();

  const { success } = await proc.output();
  if (!success) {
    throw new Error("xclip command failed");
  }
}

/**
 * Copy to clipboard using wl-copy (Wayland)
 */
async function copyViaWlCopy(text: string): Promise<void> {
  const proc = new Deno.Command("wl-copy", {
    stdin: "piped",
  }).spawn();

  const writer = proc.stdin!.getWriter();
  await writer.write(new TextEncoder().encode(text));
  await writer.close();

  const { success } = await proc.output();
  if (!success) {
    throw new Error("wl-copy command failed");
  }
}
