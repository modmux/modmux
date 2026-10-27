type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Copilot can change an item's ID on every event, including its final snapshot.
 * Codex correlates streamed and completed messages by ID, so retain the first
 * ID seen at each output_index. Text and lifecycle events must not be deduped.
 */
export function normalizeResponsesStream(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const ids = new Map<number, string>();

  function normalizeEvent(event: unknown): boolean {
    if (
      !isObject(event) || typeof event.type !== "string" ||
      !event.type.startsWith("response.")
    ) return false;
    if (event.type === "response.created") ids.clear();
    let changed = false;

    function normalizeId(object: JsonObject, key: string, index: unknown) {
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
        return;
      }
      const observed = object[key];
      let canonical = ids.get(index);
      if (!canonical && typeof observed === "string" && observed.length > 0) {
        canonical = observed;
        ids.set(index, canonical);
      }
      if (canonical && observed !== canonical) {
        object[key] = canonical;
        changed = true;
      }
    }

    if (isObject(event.item)) {
      normalizeId(event.item, "id", event.output_index);
    }
    if ("item_id" in event) normalizeId(event, "item_id", event.output_index);
    if (isObject(event.response) && Array.isArray(event.response.output)) {
      event.response.output.forEach((item, index) => {
        if (isObject(item)) normalizeId(item, "id", index);
      });
    }
    return changed;
  }

  function normalizeFrame(frame: string): string {
    // Keep framing, comments, and unknown fields intact on compliant events.
    const parts = frame.split(/(\r\n|\r|\n)/);
    const dataIndices: number[] = [];
    const data: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
      if (parts[i] === "data" || parts[i].startsWith("data:")) {
        dataIndices.push(i);
        data.push(parts[i].slice(5).replace(/^ /, ""));
      }
    }
    if (dataIndices.length === 0) return frame;
    let event: unknown;
    try {
      event = JSON.parse(data.join("\n"));
    } catch {
      // Includes [DONE]; never swallow malformed or non-JSON upstream events.
      return frame;
    }
    if (!normalizeEvent(event)) return frame;
    parts[dataIndices[0]] = `data: ${JSON.stringify(event)}`;
    for (const index of dataIndices.slice(1)) {
      parts[index] = "";
      if (index + 1 < parts.length) parts[index + 1] = "";
    }
    return parts.join("");
  }

  let pending = "";
  let frame = "";
  function drain(
    controller: TransformStreamDefaultController<string>,
    eof = false,
  ) {
    // Wait for a possible LF after a trailing CR, even across byte chunks.
    const newline = /\r\n|\n|\r(?!$)/;
    let match: RegExpExecArray | null;
    while ((match = newline.exec(pending)) !== null) {
      const line = pending.slice(0, match.index);
      frame += pending.slice(0, match.index + match[0].length);
      pending = pending.slice(match.index + match[0].length);
      if (line.length === 0) {
        controller.enqueue(normalizeFrame(frame));
        frame = "";
      }
    }
    if (eof && (frame || pending)) {
      controller.enqueue(normalizeFrame(frame + pending));
    }
  }

  return body.pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream<string, string>({
      transform(chunk, controller) {
        pending += chunk;
        drain(controller);
      },
      flush(controller) {
        drain(controller, true);
      },
    }),
  ).pipeThrough(new TextEncoderStream());
}
