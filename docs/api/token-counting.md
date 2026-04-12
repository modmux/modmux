# Token Counting API

Reference for `POST /v1/messages/count_tokens`, which estimates token usage
before you send a request.

## Endpoint

```http
POST /v1/messages/count_tokens
```

## Request Format

| Field      | Type   | Description                                                |
| ---------- | ------ | ---------------------------------------------------------- |
| `model`    | string | **Required.** Model identifier for token counting          |
| `messages` | array  | **Required.** Array of message objects to count tokens for |

### Message Format

Messages follow the same format as the `/v1/messages` endpoint:

```json
{
  "role": "user|assistant",
  "content": "string or array of content blocks"
}
```

#### Content Block Types

**Text Content:**

```json
{
  "type": "text",
  "text": "Your message text here"
}
```

**Tool Use Content:**

```json
{
  "type": "tool_use",
  "id": "tool_call_id",
  "name": "function_name",
  "input": { "param": "value" }
}
```

**Tool Result Content:**

```json
{
  "type": "tool_result",
  "tool_use_id": "tool_call_id",
  "content": "Result text",
  "is_error": false
}
```

## Request Examples

### Simple Text Messages

````json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    {
      "role": "user",
      "content": "Write a Python function to calculate the factorial of a number"
    },
    {
      "role": "assistant",
      "content": "Here's a Python function to calculate factorial:\\n\\n```python\\ndef factorial(n):\\n    if n <= 1:\\n        return 1\\n    return n * factorial(n - 1)\\n```"
    }
  ]
}
````

### Messages with Structured Content

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Can you help me debug this code?"
        }
      ]
    },
    {
      "role": "assistant",
      "content": [
        {
          "type": "text",
          "text": "I'll help you debug. Let me analyze the code."
        },
        {
          "type": "tool_use",
          "id": "tool_abc123",
          "name": "analyze_code",
          "input": {
            "language": "python",
            "code": "def example(): pass"
          }
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "tool_result",
          "tool_use_id": "tool_abc123",
          "content": "Analysis complete: No issues found"
        }
      ]
    }
  ]
}
```

## Response Format

The response follows the same structure as a standard message response but
represents token counts rather than actual content:

```json
{
  "id": "msg_count_abc123def456",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": ""
    }
  ],
  "model": "claude-3-5-sonnet-20241022",
  "stop_reason": null,
  "stop_sequence": null,
  "usage": {
    "input_tokens": 45,
    "output_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation_input_tokens": 0
  }
}
```

### Response Fields

| Field           | Type   | Description                             |
| --------------- | ------ | --------------------------------------- |
| `id`            | string | Unique identifier for the count request |
| `type`          | string | Always "message"                        |
| `role`          | string | Always "assistant"                      |
| `content`       | array  | Empty content array                     |
| `model`         | string | The model used for counting             |
| `stop_reason`   | null   | Always null for token counting          |
| `stop_sequence` | null   | Always null for token counting          |
| `usage`         | object | **The important part** - token counts   |

### Usage Object

| Field                         | Type   | Description                                       |
| ----------------------------- | ------ | ------------------------------------------------- |
| `input_tokens`                | number | **Key field:** Total tokens in the input messages |
| `output_tokens`               | number | Always 0 for token counting                       |
| `cache_read_input_tokens`     | number | Tokens read from cache (if supported)             |
| `cache_creation_input_tokens` | number | Tokens written to cache (if supported)            |

## Use Cases

### 1. Cost Estimation

Calculate costs before making expensive API calls:

```bash
# Count tokens for a large context
curl -X POST http://localhost:11435/v1/messages/count_tokens \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
      {
        "role": "user",
        "content": "Very long prompt with lots of context..."
      }
    ]
  }'

# Response: {"usage": {"input_tokens": 1250, ...}}
# Now you know the request will use ~1250 input tokens
```

### 2. Context Window Management

Ensure requests fit within model limits:

```python
import requests

def check_token_count(messages, model="claude-3-5-sonnet-20241022"):
    response = requests.post(
        "http://localhost:11435/v1/messages/count_tokens",
        json={
            "model": model,
            "messages": messages
        }
    )
    return response.json()["usage"]["input_tokens"]

# Check if conversation fits in context window
messages = [...]  # Your conversation
token_count = check_token_count(messages)

if token_count > 200000:  # Claude's context limit
    print("Warning: Context too large, consider trimming")
else:
    print(f"Safe to send: {token_count} tokens")
```

### 3. Request Optimization

Compare different prompt approaches:

```bash
# Option A: Verbose prompt
curl -X POST http://localhost:11435/v1/messages/count_tokens \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
      {
        "role": "user",
        "content": "I would like you to please help me by writing a comprehensive Python function that can efficiently calculate the factorial of any given positive integer number, including proper error handling for edge cases and negative numbers, with clear documentation and comments explaining each step of the process."
      }
    ]
  }'

# Option B: Concise prompt
curl -X POST http://localhost:11435/v1/messages/count_tokens \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
      {
        "role": "user",
        "content": "Write a Python factorial function with error handling."
      }
    ]
  }'

# Compare token counts to optimize for cost
```

### 4. Batch Processing

Plan batch operations efficiently:

```python
import requests

def plan_batch_requests(conversations, max_tokens_per_batch=10000):
    batches = []
    current_batch = []
    current_tokens = 0

    for conv in conversations:
        token_count = check_token_count(conv["messages"])

        if current_tokens + token_count > max_tokens_per_batch:
            # Start new batch
            batches.append(current_batch)
            current_batch = [conv]
            current_tokens = token_count
        else:
            current_batch.append(conv)
            current_tokens += token_count

    if current_batch:
        batches.append(current_batch)

    return batches

# Plan efficient batching
conversations = [...]  # Your conversations
batches = plan_batch_requests(conversations)
print(f"Organized into {len(batches)} batches")
```

## Model Support

Token counting supports the same models as the main API:

| Model                        | Token Counting Support |
| ---------------------------- | ---------------------- |
| `claude-3-5-sonnet-20241022` | ✅ Supported           |
| `claude-3-5-haiku-20241022`  | ✅ Supported           |
| `claude-3-opus-20240229`     | ✅ Supported           |
| GitHub Copilot models        | ✅ Supported           |

Token counts are calculated using the same tokenizer as the target model for
accuracy.

## Error Responses

### Missing Model

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "model is required",
    "param": "model"
  }
}
```

### Missing Messages

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "messages is required",
    "param": "messages"
  }
}
```

### Invalid JSON

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "Invalid JSON body",
    "param": null
  }
}
```

### Service Error

```json
{
  "type": "error",
  "error": {
    "type": "service_error",
    "message": "Copilot unavailable",
    "param": null
  }
}
```

## Performance Characteristics

- **Speed:** Token counting is much faster than full API calls
- **Cost:** Token counting requests don't consume API quotas
- **Accuracy:** Uses the same tokenizer as the target model
- **Caching:** Results can be cached for identical input

## Integration Examples

### Python with Requests

```python
import requests

def count_tokens(messages, model="claude-3-5-sonnet-20241022"):
    """Count tokens for a conversation."""
    response = requests.post(
        "http://localhost:11435/v1/messages/count_tokens",
        json={
            "model": model,
            "messages": messages
        }
    )

    if response.status_code == 200:
        return response.json()["usage"]["input_tokens"]
    else:
        raise Exception(f"Token counting failed: {response.text}")

# Usage
messages = [
    {"role": "user", "content": "Hello, how are you?"},
    {"role": "assistant", "content": "I'm doing well, thank you!"}
]

token_count = count_tokens(messages)
print(f"Conversation uses {token_count} tokens")
```

### Node.js Example

```javascript
async function countTokens(messages, model = "claude-3-5-sonnet-20241022") {
  const response = await fetch(
    "http://localhost:11435/v1/messages/count_tokens",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Token counting failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.usage.input_tokens;
}

// Usage
const messages = [
  { role: "user", content: "Write a function to sort an array" },
  { role: "assistant", content: "Here's a sorting function..." },
];

const tokenCount = await countTokens(messages);
console.log(`Conversation uses ${tokenCount} tokens`);
```

## Best Practices

1. **Cache Results:** Token counts for identical messages are deterministic
2. **Batch Counting:** Count multiple conversations in parallel for efficiency
3. **Model Consistency:** Use the same model for counting and actual requests
4. **Monitor Trends:** Track token usage patterns over time
5. **Optimize Prompts:** Use counting to find the most efficient prompts

## Next Steps

- [Anthropic Proxy API](./anthropic-proxy.md) - Send actual requests after
  counting
- [Usage Metrics API](./usage-metrics.md) - Monitor token usage over time
- [OpenAI Proxy API](./openai-proxy.md) - Alternative API format
