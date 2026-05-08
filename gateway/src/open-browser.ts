/**
 * Cross-platform browser opening functionality.
 * Uses native commands on each platform.
 */

/**
 * Open a URL in the user's default browser.
 * Throws if browser cannot be opened.
 *
 * Supports:
 * - macOS: `open <url>`
 * - Windows: `start <url>`
 * - Linux: `xdg-open <url>`
 */
export async function openBrowser(url: string): Promise<void> {
  if (Deno.build.os === "darwin") {
    return await openBrowserMacOS(url);
  }
  if (Deno.build.os === "windows") {
    return await openBrowserWindows(url);
  }
  // Linux / other
  return await openBrowserLinux(url);
}

/**
 * Open URL on macOS using `open`
 */
async function openBrowserMacOS(url: string): Promise<void> {
  const { success, stderr } = await new Deno.Command("open", {
    args: [url],
    stderr: "piped",
  }).output();

  if (!success) {
    const errMsg = new TextDecoder().decode(stderr).trim();
    throw new Error(`open command failed: ${errMsg}`);
  }
}

/**
 * Open URL on Windows using `start`
 */
async function openBrowserWindows(url: string): Promise<void> {
  const { success, stderr } = await new Deno.Command("cmd", {
    args: ["/c", "start", url],
    stderr: "piped",
  }).output();

  if (!success) {
    const errMsg = new TextDecoder().decode(stderr).trim();
    throw new Error(`start command failed: ${errMsg}`);
  }
}

/**
 * Open URL on Linux using `xdg-open`
 */
async function openBrowserLinux(url: string): Promise<void> {
  const { success, stderr } = await new Deno.Command("xdg-open", {
    args: [url],
    stderr: "piped",
  }).output();

  if (!success) {
    const errMsg = new TextDecoder().decode(stderr).trim();
    throw new Error(`xdg-open command failed: ${errMsg}`);
  }
}
