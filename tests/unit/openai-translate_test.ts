import { assertEquals } from "@std/assert";
import { StreamEvent } from "@modmux/providers";
import {
  anthropicStreamEventToOpenAI,
  anthropicToOpenAI,
  makeStreamState,
  openAIToAnthropic,
} from "@modmux/gateway";

// ---------------------------------------------------------------------------
// openAIToAnthropic
// ---------------------------------------------------------------------------

Deno.test("openAIToAnthropic — basic message conversion", () => {
  const req = openAIToAnthropic({
    model: "gpt-4o",
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
      { role: "user", content: "How are you?" },
    ],
  });
  assertEquals(req.model, "gpt-4o");
  assertEquals(req.messages.length, 3);
  assertEquals(req.system, undefined);
});

Deno.test("openAIToAnthropic — system message extracted to system field", () => {
  const req = openAIToAnthropic({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ],
  });
  assertEquals(req.system, "You are helpful.");
  assertEquals(req.messages.length, 1);
  assertEquals(req.messages[0].role, "user");
});

Deno.test("openAIToAnthropic — multiple system messages joined", () => {
  const req = openAIToAnthropic({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Line 1" },
      { role: "system", content: "Line 2" },
      { role: "user", content: "Hi" },
    ],
  });
  assertEquals(req.system, "Line 1\nLine 2");
  assertEquals(req.messages.length, 1);
});

Deno.test("openAIToAnthropic — max_tokens defaults to 4096 when absent", () => {
  const req = openAIToAnthropic({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hi" }],
  });
  assertEquals(req.max_tokens, 4096);
});

Deno.test("openAIToAnthropic — max_tokens passed through when provided", () => {
  const req = openAIToAnthropic({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hi" }],
    max_tokens: 512,
  });
  assertEquals(req.max_tokens, 512);
});

Deno.test("openAIToAnthropic — tools and tool_choice are mapped", () => {
  const req = openAIToAnthropic({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hi" }],
    tools: [{
      type: "function",
      function: {
        name: "apply_patch",
        description: "Apply a patch",
        parameters: {
          type: "object",
          properties: { input: { type: "string" } },
          required: ["input"],
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "apply_patch" } },
  });

  assertEquals(req.tools?.length, 1);
  assertEquals(req.tools?.[0].name, "apply_patch");
  assertEquals(req.tools?.[0].description, "Apply a patch");
  assertEquals(req.tool_choice, { type: "tool", name: "apply_patch" });
});

Deno.test("openAIToAnthropic — assistant tool_calls and role=tool map to tool blocks", () => {
  const req = openAIToAnthropic({
    model: "gpt-4o",
    messages: [
      {
        role: "assistant",
        content: "I will call a tool",
        tool_calls: [{
          id: "call_1",
          type: "function",
          function: {
            name: "apply_patch",
            arguments: '{"input":"*** Begin Patch"}',
          },
        }],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: "ok",
      },
    ],
  });

  assertEquals(Array.isArray(req.messages[0].content), true);
  const assistantBlocks = req.messages[0].content as unknown as Array<
    Record<string, unknown>
  >;
  assertEquals(assistantBlocks[0].type, "text");
  assertEquals(assistantBlocks[1].type, "tool_use");
  assertEquals(assistantBlocks[1].id, "call_1");
  assertEquals(assistantBlocks[1].name, "apply_patch");

  assertEquals(Array.isArray(req.messages[1].content), true);
  const toolResultBlocks = req.messages[1].content as unknown as Array<
    Record<string, unknown>
  >;
  assertEquals(toolResultBlocks[0].type, "tool_result");
  assertEquals(toolResultBlocks[0].tool_use_id, "call_1");
});

// ---------------------------------------------------------------------------
// anthropicToOpenAI
// ---------------------------------------------------------------------------

Deno.test("anthropicToOpenAI — basic response shape", () => {
  const resp = anthropicToOpenAI(
    {
      id: "msg_abc123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hello!" }],
      model: "gpt-4o",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    "gpt-4o",
  );
  assertEquals(resp.object, "chat.completion");
  assertEquals(resp.model, "gpt-4o");
  assertEquals(resp.choices[0].message.content, "Hello!");
  assertEquals(resp.choices[0].finish_reason, "stop");
  assertEquals(resp.usage.prompt_tokens, 10);
  assertEquals(resp.usage.completion_tokens, 5);
  assertEquals(resp.usage.total_tokens, 15);
});

Deno.test("anthropicToOpenAI — stop_reason max_tokens → finish_reason length", () => {
  const resp = anthropicToOpenAI(
    {
      id: "msg_xyz",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "..." }],
      model: "gpt-4o",
      stop_reason: "max_tokens",
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 10 },
    },
    "gpt-4o",
  );
  assertEquals(resp.choices[0].finish_reason, "length");
});

Deno.test("anthropicToOpenAI — tool_use blocks become tool_calls", () => {
  const resp = anthropicToOpenAI(
    {
      id: "msg_tool",
      type: "message",
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "call_123",
        name: "apply_patch",
        input: { input: "*** Begin Patch" },
      }],
      model: "gpt-4o",
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 3 },
    },
    "gpt-4o",
  );

  assertEquals(resp.choices[0].finish_reason, "tool_calls");
  assertEquals(resp.choices[0].message.tool_calls?.length, 1);
  assertEquals(resp.choices[0].message.tool_calls?.[0].id, "call_123");
  assertEquals(
    resp.choices[0].message.tool_calls?.[0].function.name,
    "apply_patch",
  );
});

Deno.test("anthropicToOpenAI — ignores malformed text block without string text", () => {
  const resp = anthropicToOpenAI(
    {
      id: "msg_bad_text",
      type: "message",
      role: "assistant",
      content: [
        { type: "text", text: "Hello" },
        { type: "text" } as unknown as { type: "text"; text: string },
      ],
      model: "gpt-4o",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 3, output_tokens: 1 },
    },
    "gpt-4o",
  );
  assertEquals(resp.choices[0].message.content, "Hello");
});

// ---------------------------------------------------------------------------
// anthropicStreamEventToOpenAI
// ---------------------------------------------------------------------------

Deno.test("anthropicStreamEventToOpenAI — message_start emits role chunk", () => {
  const state = makeStreamState("gpt-4o");
  const event: StreamEvent = {
    type: "message_start",
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "gpt-4o",
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  };
  const line = anthropicStreamEventToOpenAI(event, state);
  assertEquals(line !== null, true);
  const data = JSON.parse(line!.replace("data: ", "").trim());
  assertEquals(data.object, "chat.completion.chunk");
  assertEquals(data.choices[0].delta.role, "assistant");
});

Deno.test("anthropicStreamEventToOpenAI — content_block_delta emits content", () => {
  const state = makeStreamState("gpt-4o");
  const event: StreamEvent = {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Hello" },
  };
  const line = anthropicStreamEventToOpenAI(event, state);
  assertEquals(line !== null, true);
  const data = JSON.parse(line!.replace("data: ", "").trim());
  assertEquals(data.choices[0].delta.content, "Hello");
});

Deno.test("anthropicStreamEventToOpenAI — message_stop emits [DONE]", () => {
  const state = makeStreamState("gpt-4o");
  const event: StreamEvent = { type: "message_stop" };
  const line = anthropicStreamEventToOpenAI(event, state);
  assertEquals(line, "data: [DONE]\n\n");
});

Deno.test("anthropicStreamEventToOpenAI — tool_use start emits tool_calls delta", () => {
  const state = makeStreamState("gpt-4o");
  const event: StreamEvent = {
    type: "content_block_start",
    index: 1,
    content_block: {
      type: "tool_use",
      id: "call_123",
      name: "apply_patch",
      input: {},
    },
  };
  const line = anthropicStreamEventToOpenAI(event, state);
  assertEquals(line !== null, true);
  const data = JSON.parse(line!.replace("data: ", "").trim());
  assertEquals(data.choices[0].delta.tool_calls[0].id, "call_123");
  assertEquals(
    data.choices[0].delta.tool_calls[0].function.name,
    "apply_patch",
  );
});

Deno.test("anthropicStreamEventToOpenAI — input_json_delta emits tool argument delta", () => {
  const state = makeStreamState("gpt-4o");
  anthropicStreamEventToOpenAI(
    {
      type: "content_block_start",
      index: 1,
      content_block: {
        type: "tool_use",
        id: "call_456",
        name: "apply_patch",
        input: {},
      },
    },
    state,
  );

  const line = anthropicStreamEventToOpenAI(
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '{"input":"abc"}' },
    },
    state,
  );

  assertEquals(line !== null, true);
  const data = JSON.parse(line!.replace("data: ", "").trim());
  assertEquals(
    data.choices[0].delta.tool_calls[0].function.arguments,
    '{"input":"abc"}',
  );
});

Deno.test("anthropicStreamEventToOpenAI — content_block_start returns null", () => {
  const state = makeStreamState("gpt-4o");
  const event: StreamEvent = {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text" },
  };
  const line = anthropicStreamEventToOpenAI(event, state);
  assertEquals(line, null);
});

// ---------------------------------------------------------------------------
// Extended usage fields
// ---------------------------------------------------------------------------

Deno.test("anthropicToOpenAI — usage includes prompt_tokens_details and completion_tokens_details", () => {
  const resp = anthropicToOpenAI(
    {
      id: "msg_ext",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hi" }],
      model: "gpt-4o",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    "gpt-4o",
  );
  assertEquals(resp.usage.prompt_tokens_details?.cached_tokens, 0);
  assertEquals(resp.usage.completion_tokens_details?.reasoning_tokens, 0);
});

Deno.test("anthropicStreamEventToOpenAI — message_delta with usage emits stop + usage chunks", () => {
  const state = makeStreamState("gpt-4o");
  const event: StreamEvent = {
    type: "message_delta",
    delta: { type: "stop_reason", stop_reason: "max_tokens" },
    usage: { input_tokens: 100, output_tokens: 50 },
  };
  const result = anthropicStreamEventToOpenAI(event, state);
  assertEquals(result !== null, true);

  const parts = result!.split("\n\n").filter((p) => p.startsWith("data:"));
  assertEquals(parts.length, 2);

  const stopChunk = JSON.parse(parts[0].slice("data: ".length));
  assertEquals(stopChunk.choices[0].finish_reason, "length");

  const usageChunk = JSON.parse(parts[1].slice("data: ".length));
  assertEquals(usageChunk.choices.length, 0);
  assertEquals(usageChunk.usage.prompt_tokens, 100);
  assertEquals(usageChunk.usage.completion_tokens, 50);
  assertEquals(usageChunk.usage.total_tokens, 150);
});
