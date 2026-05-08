/**
 * Utility for prompting user to press Enter and waiting for that input.
 */

/**
 * Display a prompt and wait for the user to press Enter.
 * Returns immediately in non-interactive contexts (non-TTY stdin).
 * Best-effort: stdout write errors (e.g. EPIPE) and stdin errors are silently ignored.
 */
export async function promptAndWaitForEnter(message: string): Promise<void> {
  try {
    Deno.stdout.writeSync(new TextEncoder().encode(message));
  } catch {
    // stdout closed or redirected (EPIPE etc.) — prompt is best-effort
  }

  // Don't block in non-interactive contexts (CI, daemon, piped input).
  if (!Deno.stdin.isTerminal()) {
    return;
  }

  const buf = new Uint8Array(1024);
  try {
    await Deno.stdin.read(buf);
  } catch {
    // stdin closed or errored; treat as Enter pressed
  }
}
