---
name: AI Chatbot Build Steps
overview: "Build an AI chatbot from scratch: start with a raw curl call to the Anthropic API, wrap it in a shell script, scaffold a Vite+Express app, integrate the Anthropic SDK, then build a chat endpoint with conversation history and a basic UI."
todos:
  - id: step1-curl
    content: Export API key and make a raw curl request to the Anthropic Messages API with claude-haiku-4-5-20251001
    status: pending
  - id: step2-shell-script
    content: Create curl-claude.sh shell script that accepts a prompt as a positional parameter ($1)
    status: pending
  - id: step3-scaffold
    content: Scaffold a new Vite+Express app using bun create vite-express and install dependencies
    status: pending
  - id: step4-dotenv
    content: Add .env to .gitignore, install dotenv, create .env file with API key, configure dotenv in server
    status: pending
  - id: step5-fetch
    content: Update /hello endpoint to call Claude Messages API using Node's built-in fetch
    status: pending
  - id: step6-sdk
    content: Install @anthropic-ai/sdk and refactor /hello to use the SDK instead of raw fetch
    status: pending
  - id: step7-chat-endpoint
    content: Create POST /chat endpoint with server-side message history array, sending full history to Claude each turn
    status: pending
  - id: step8-ui
    content: Build chat UI with textarea, send button, and conversation display div
    status: pending
  - id: step9-reset
    content: Add POST /reset endpoint to clear message history and a reset button in the UI
    status: pending
isProject: false
---

# AI Chatbot -- Sequenced Build Steps

## Step 1: Make a raw curl request to the Anthropic Messages API

Export your API key as an environment variable:

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

Then call the Messages API using curl. The `-d` flag implicitly makes it a POST request and passes the JSON body. Use `claude-haiku-4-5-20251001` instead of Opus 4.6 to save cost:

```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello, Claude"}
    ]
  }'
```

Key takeaway: The `-d` param implicitly turns the request into a POST and lets you pass the request body.

---

## Step 2: Write a shell script that accepts a prompt as a positional parameter

Create a file called `curl-claude.sh` that takes the user's prompt as `$1` (the first positional parameter) and passes it into the curl command:

```bash
#!/bin/bash
# USAGE: sh curl-claude.sh "your prompt here"

prompt=$1

curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "'"$prompt"'"}
    ]
  }'
```

Run it with:

```bash
sh curl-claude.sh "hey Claude how's it going?"
```

Reference: [positional parameters tutorial](https://hbctraining.github.io/Training-modules/Accelerate_with_automation/lessons/positional_params.html) -- `$1` is the first argument passed to the script.

---

## Step 3: Scaffold a Vite + Express app using bun

Run the scaffolding command:

```bash
bun create vite-express
```

Follow the prompts (pick a project name, choose React + TypeScript or similar). Then `cd` into the new project directory and install dependencies:

```bash
cd <project-name>
bun install
```

The generated app will have:

- `src/server/main.ts` (or `.js`) -- the Express server with a default `/hello` endpoint
- `src/client/` -- the Vite frontend
- `ViteExpress.listen(app, 3000, ...)` wiring it all together

---

## Step 4: Protect your API key with `.env` and dotenv

**4a.** Add `.env` to `.gitignore` immediately to prevent leaking your key:

Add this line to the project's `.gitignore`:

```
.env
```

**4b.** Install dotenv:

```bash
bun add dotenv
```

**4c.** Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=your-api-key-here
```

**4d.** Configure dotenv at the top of your server entry file (`src/server/main.ts`):

```typescript
import "dotenv/config";
```

Now `process.env.ANTHROPIC_API_KEY` is available in your server code.

---

## Step 5: Update the `/hello` endpoint to call Claude using raw `fetch`

In the server file, replace the default `/hello` handler with one that calls the Anthropic Messages API using Node's built-in `fetch`:

```typescript
app.get("/hello", async (req, res) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: "Hello, Claude" }],
    }),
  });

  const data = await response.json();
  res.json(data);
});
```

Key concept from the [Messages API docs](https://platform.claude.com/docs/en/build-with-claude/working-with-messages): the API is **stateless** -- you must pass the **entire message history** each time to maintain conversation context.

---

## Step 6: Switch to the Anthropic Node.js SDK

Raw fetch works but gets tedious. Install the official SDK:

```bash
bun add @anthropic-ai/sdk
```

Then refactor `/hello` to use the SDK:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically

app.get("/hello", async (req, res) => {
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello, Claude" }],
  });

  res.json(message);
});
```

The SDK automatically reads `ANTHROPIC_API_KEY` from the environment -- no need to pass it explicitly.

---

## Step 7: Build the `/chat` POST endpoint with conversation history

Create a server-side array to store message history, and a new `POST /chat` endpoint:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
let messageHistory: Anthropic.MessageParam[] = [];

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  // Add user message to history
  messageHistory.push({ role: "user", content: userMessage });

  // Send full history to Claude (API is stateless)
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: messageHistory,
  });

  const assistantText =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Add Claude's response to history
  messageHistory.push({ role: "assistant", content: assistantText });

  res.json({ reply: assistantText });
});
```

Make sure Express is configured to parse JSON bodies: `app.use(express.json())`.

---

## Step 8: Build the basic chat UI

In the client-side code (e.g., `src/client/App.tsx`), create:

- A `<textarea>` for the user to type messages
- A `<button>` that sends a POST to `/chat` when clicked
- A `<div>` that displays the full conversation, updated when `/chat` returns

```typescript
// Pseudocode structure
const [input, setInput] = useState("");
const [conversation, setConversation] = useState<{role: string, content: string}[]>([]);

async function sendMessage() {
  const res = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: input }),
  });
  const data = await res.json();
  setConversation(prev => [
    ...prev,
    { role: "user", content: input },
    { role: "assistant", content: data.reply }
  ]);
  setInput("");
}
```

---

## Step 9: Add a `/reset` endpoint to clear conversation history

On the server:

```typescript
app.post("/reset", (req, res) => {
  messageHistory = [];
  res.json({ status: "conversation reset" });
});
```

Add a "New Conversation" button in the UI that calls `POST /reset` and clears the displayed conversation.