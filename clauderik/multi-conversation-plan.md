# Multi-Conversation Support for Gift Genie

## Context

Currently Gift Genie has a single global `messageHistory` array on the server. Every request shares the same conversation. We need to support multiple independent conversations — each identified by a UUID — so users can start new chats, switch between them, and continue existing ones (like Claude/ChatGPT).

## Step 1: Create `src/server/storage.ts`

Define a `Conversation` type and `Storage` interface:

```typescript
interface Conversation {
  id: string;
  messages: Anthropic.MessageParam[];
  createdAt: number;
  title: string; // auto-generated from first user message
}

interface Storage {
  createConversation(): Conversation;
  getConversation(conversationId: string): Conversation | null;
  getConversations(): Conversation[];
  addMessageToConversation(conversationId: string, message: Anthropic.MessageParam): Conversation | null;
}
```

**Error handling**: Return `null` for not-found cases. The route handlers will check and return 404.

Then implement `InMemoryStorage implements Storage`:
- Uses `Record<string, Conversation>` internally
- Uses `crypto.randomUUID()` for IDs (same pattern as Tic Tac Toe project)
- `addMessageToConversation` also enforces the MAX_MESSAGES (100) cap
- `title` auto-set from first user message (first 50 chars)

## Step 2: Install Vitest and write unit tests

**File**: `src/server/storage.test.ts`

Install: `npm install -D vitest`
Add script: `"test": "vitest"` to package.json

Tests to cover:
- `createConversation` returns a conversation with a UUID and empty messages
- `getConversation` returns the correct conversation
- `getConversation` returns `null` for unknown ID
- `getConversations` returns all conversations
- `addMessageToConversation` appends messages correctly
- `addMessageToConversation` returns `null` for unknown ID
- `addMessageToConversation` caps history at MAX_MESSAGES
- Title auto-generated from first user message

## Step 3: Update `src/server/main.ts`

Replace global `messageHistory` with an `InMemoryStorage` instance. Update routes:

- **`POST /conversations`** — Creates a new conversation, returns `{ id, title, createdAt }`
- **`GET /conversations`** — Returns list of all conversations (id, title, createdAt — no messages)
- **`POST /conversations/:id/chat`** — Same as current `/chat` but scoped to a conversation ID. Validates conversation exists (404 if not). Streams response as before.
- **`POST /conversations/:id/reset`** — Resets a specific conversation
- **Keep `/chat` working temporarily** for backwards compatibility during development (optional, can remove)

The system prompt stays the same. The streaming logic stays the same. The only change is where messages are read from and written to (storage instead of global array).

## Step 4: Install shadcn Drawer component

```
npx shadcn@latest add drawer
```

Also install shadcn `separator` for visual dividers in the sidebar.

## Step 5: Update `src/client/App.tsx`

Add state for multi-conversation management:

```typescript
const [conversationId, setConversationId] = useState<string | null>(null);
const [conversationList, setConversationList] = useState<{id: string, title: string}[]>([]);
const [drawerOpen, setDrawerOpen] = useState(false);
```

New functions:
- `fetchConversations()` — GET `/conversations`, updates list
- `createNewConversation()` — POST `/conversations`, sets active ID, clears local conversation
- `selectConversation(id)` — Sets active ID, fetches that conversation's messages
- Update `streamResponse` to POST to `/conversations/${conversationId}/chat`
- Update `resetConversation` to POST to `/conversations/${conversationId}/reset`

UI additions:
- **Menu button** in the header (hamburger or similar) to open the Drawer
- **Drawer sidebar** with:
  - "New Conversation" button at the top
  - List of existing conversations (title + date), clickable to switch
  - Active conversation highlighted
- **Auto-create**: If no `conversationId` is set when the user sends their first message, auto-create a conversation first

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/server/storage.ts` | **CREATE** — Storage interface + InMemoryStorage class |
| `src/server/storage.test.ts` | **CREATE** — Unit tests for InMemoryStorage |
| `src/server/main.ts` | **MODIFY** — Replace global history with storage, add new routes |
| `src/client/App.tsx` | **MODIFY** — Add conversation management, drawer sidebar |
| `package.json` | **MODIFY** — Add vitest, add test script |

## Implementation Order

1. `storage.ts` — Define interface and class
2. `storage.test.ts` + vitest setup — Write and run tests
3. `main.ts` — Wire up new routes with storage
4. Install drawer component
5. `App.tsx` — Add multi-conversation UI

## Verification

1. **Unit tests**: `npm test` — all storage tests pass
2. **API test**: `curl -X POST http://localhost:3000/conversations` returns a new conversation
3. **API test**: `curl http://localhost:3000/conversations` returns the list
4. **E2E**: Open the app, create a conversation, send a message, create another, switch between them
5. **Streaming**: Verify streaming still works within a conversation
6. **Edge cases**: Sending to a non-existent conversation returns 404
