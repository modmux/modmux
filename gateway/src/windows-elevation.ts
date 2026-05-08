/**
 * Windows privilege elevation detection and utilities.
 * Provides functions to check if a process is running with admin privileges
 * and to re-execute the current command with elevated privileges.
 */

/**
 * Check if the current process is running with administrator privileges on Windows.
 * On non-Windows platforms, returns false.
 *
 * Uses `net session` command which succeeds only with admin rights.
 * This is more reliable than checking environment variables which can be spoofed.
 */
export async function isElevated(): Promise<boolean> {
  if (Deno.build.os !== "windows") {
    return false;
  }

  try {
    const { success } = await new Deno.Command("cmd", {
      args: ["/c", "net session"],
      stdout: "null",
      stderr: "null",
    }).output();
    return success;
  } catch {
    return false;
  }
}

/**
 * Re-execute the current command with elevated privileges using PowerShell.
 * Uses `Start-Process -Verb RunAs` which triggers the UAC prompt.
 *
 * @param exePath - Full path to executable (Deno.execPath())
 * @param args - Arguments to pass to the executable
 * @param env - Optional environment variables to set in elevated process
 * @returns Exit code from the elevated process
 */
export async function reExecuteElevated(
  exePath: string,
  args: string[],
  env?: Record<string, string>,
): Promise<number> {
  // Set environment variable to prevent infinite recursion
  const elevatedEnv = {
    ...env,
    MODMUX_ELEVATED: "true",
  };

  const esc = (s: string) => s.replace(/'/g, "''");

  // Build argument list for Start-Process
  const argList = args.length > 0
    ? `-ArgumentList ${args.map((a) => `'${esc(a)}'`).join(", ")}`
    : "";

  // Build environment variable setup commands
  const envPrefix = Object.entries(elevatedEnv)
    .map(([key, value]) => `$env:${key}='${esc(value)}'`)
    .join("; ");

  // Construct PowerShell command to start elevated process
  const psCmd = `
    ${envPrefix}
    $proc = Start-Process -FilePath '${
    esc(exePath)
  }' ${argList} -Verb RunAs -PassThru -WindowStyle Hidden -Wait
    exit $proc.ExitCode
  `.trim();

  try {
    const { success, code } = await new Deno.Command("powershell", {
      args: ["-NonInteractive", "-Command", psCmd],
      stdin: "null",
      stdout: "inherit",
      stderr: "inherit",
    }).output();

    if (!success && code === null) {
      // User likely cancelled the UAC prompt
      throw new Error("UAC prompt was cancelled or elevation failed");
    }

    return code ?? (success ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to re-execute with elevated privileges: ${message}`,
    );
  }
}

/**
 * Check if current process should request elevation.
 * Returns true if on Windows, not already elevated, and not recursing.
 */
export function shouldRequestElevation(): boolean {
  if (Deno.build.os !== "windows") {
    return false;
  }

  // Prevent infinite recursion
  if (Deno.env.get("MODMUX_ELEVATED") === "true") {
    return false;
  }

  return true;
}
