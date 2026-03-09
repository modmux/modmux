// Session ID discovery for the --resume hint displayed after Claude exits.
//
// ~/.claude/projects/ layout (as of Claude CLI ~1.x):
//   ~/.claude/projects/<encoded-path>/<uuid>.jsonl
//
// Encoding: the project's absolute path with every "/" replaced by "-"
//   e.g. /Users/myty/dev/github/myty/claudio
//     →  -Users-myty-dev-github-myty-claudio
//
// The UUID stem of the most-recently-modified .jsonl file across all
// project directories is the session ID accepted by `claude --resume <id>`.

/**
 * Scans ~/.claude/projects/ for the most recently modified session file and
 * returns its UUID, or null if no sessions are found or an error occurs.
 */
export async function getLatestSessionId(): Promise<string | null> {
  try {
    const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
    if (!home) return null;

    const projectsDir = `${home}/.claude/projects`;

    let latestMtime = 0;
    let latestUuid: string | null = null;

    for await (const projectEntry of Deno.readDir(projectsDir)) {
      if (!projectEntry.isDirectory) continue;
      const projectPath = `${projectsDir}/${projectEntry.name}`;

      try {
        for await (const sessionEntry of Deno.readDir(projectPath)) {
          if (!sessionEntry.name.endsWith(".jsonl")) continue;
          const filePath = `${projectPath}/${sessionEntry.name}`;
          try {
            const stat = await Deno.stat(filePath);
            const mtime = stat.mtime?.getTime() ?? 0;
            if (mtime > latestMtime) {
              latestMtime = mtime;
              latestUuid = sessionEntry.name.slice(0, -".jsonl".length);
            }
          } catch {
            // Skip files we cannot stat
          }
        }
      } catch {
        // Skip project directories we cannot read
      }
    }

    return latestUuid;
  } catch {
    return null;
  }
}
