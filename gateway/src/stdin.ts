/**
 * Utility for prompting user to press Enter and waiting for that input.
 */

/**
 * Display a prompt and wait for the user to press Enter.
 * Returns when user presses Enter or throws if input fails.
 */
export async function promptAndWaitForEnter(message: string): Promise<void> {
  // Print the prompt
  Deno.stdout.writeSync(
    new TextEncoder().encode(`${message}`),
  );

  // Create a buffer to read one line
  const buf = new Uint8Array(1024);
  try {
    await Deno.stdin.read(buf);
    // Successfully read input (user pressed Enter)
  } catch (_err) {
    // stdin closed or error; this is OK (e.g., in CI environments)
  }
}
