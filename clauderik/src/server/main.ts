import express from "express";                                                                                                                                          
import ViteExpress from "vite-express";                                                        
import Anthropic from "@anthropic-ai/sdk";                                                                                                                              
import "dotenv/config";                                                                                                                                                 
import { SupabaseStorage } from "./supabaseStorage.js";
import { auth } from "./auth.js";                                                                                                                                       
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";                                                                                                                         

const app = express();
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically
const storage = new SupabaseStorage(); // stores conversations in Supabase cloud PostgreSQL for persistence

const SYSTEM_PROMPT = `You are a helpful genie, based on the slightly cheeky genie from Aladdin who always responds kindly and with understated enthusiasm. Your overall
   job is to get the perfect present to match the target receiver.

  **Conversation Flow:**
  1. Start by clarifying the user's constraints (budget, occasion, deadline, location)
  2. Understand the target person and their interests. Please separate this from the this or that.
  3. Play "this or that" games to narrow down (e.g., "practical or heartfelt?", "experience or physical gift?"). At least 4 super concise this or that exchanges.
  4. Keep responses concise, help users make micro-decisions rather than overwhelming them with text
  5. When you have enough information, search for actual products.
  6. At some point the wildcard switch will be turned on, when this happens please provide a single link to an option of your choosing which is cognisant of the constraints: location and price

  **Using Search:**
  - You have access to web search to find real gift products with purchase links
  - Use the search_gift_products tool when you've narrowed down what kind of gift to look for
  - Always include the user's budget as max_budget when they've stated one
  - Present up to 3 product suggestions with:
    - Product name (as a clickable link to the purchase page)
    - Price
    - Brief description of why it's a good match
  - After presenting products, ask the user to rate each suggestion out of 10
  - If ratings are low, ask what's missing and search again with refined criteria

  **Important:**
  - Never suggest products above the user's stated budget
  - Always provide working purchase links
  - If a search returns no good results, tell the user honestly and suggest adjusting criteria
  - Your job is to point the user to the right link to their present`;

app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json());

async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).userId = session.user.id;
  next();
}

// Create a new conversation — called when the user starts a fresh chat
app.post("/conversations", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const convo = await storage.createConversation(userId);
  // only return metadata, not the full messages array
  res.json({ id: convo.id, title: convo.title, createdAt: convo.createdAt });
});

// List all conversations — used to populate the sidebar drawer
app.get("/conversations", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const convos = await storage.getConversations(userId);
  // strip out messages to keep the response lightweight
  res.json(convos.map(c => ({ id: c.id, title: c.title, createdAt: c.createdAt })));
});

// Get a single conversation with its full message history
app.get("/conversations/:id", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const conversation = await storage.getConversation(req.params.id as string, userId);
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  res.json(conversation);
});

// Send a message within a specific conversation and stream the AI response back
app.post("/conversations/:id/chat", requireAuth, async (req, res) => {
  try {
    // look up the conversation by ID from the URL parameter
    const userId = (req as any).userId;
    const conversation = await storage.getConversation(req.params.id as string, userId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // validate that the user actually sent a message
    const { message: userMessage, temperature } = req.body;
    const temp = typeof temperature === "number" ? Math.min(Math.max(temperature, 0), 1) : 0.6;
    if (typeof userMessage !== "string" || !userMessage.trim()) {
      return res.status(400).json({ error: "Message is required and must be a non-empty string" });
    }

    // save the user's message to the conversation history
    // this also handles auto-titling and the MAX_MESSAGES cap internally
    await storage.addMessageToConversation(req.params.id as string, { role: "user", content: userMessage });

    // re-fetch the conversation so we have the full history INCLUDING the message we just added
    // (the original `conversation` object was fetched before the insert)
    const updatedConversation = await storage.getConversation(req.params.id as string, userId);

    // set up Server-Sent Events (SSE) so we can stream tokens back as they arrive
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // messages array that grows if tool use requires follow-up requests
    let messages: Anthropic.MessageParam[] = updatedConversation!.messages;
    let fullText = "";
    let totalUsage = { input_tokens: 0, output_tokens: 0 };
    let continueLoop = true;
    let clientDisconnected = false;
    let activeStream: ReturnType<typeof client.messages.stream> | null = null;

    // detect client disconnect so we can abort the stream cleanly
    res.on("close", () => {
      clientDisconnected = true;
      if (activeStream) {
        activeStream.abort();
      }
    });

    while (continueLoop) {
      continueLoop = false;
      let response: Anthropic.Message;

      try {
        activeStream = client.messages.stream({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          temperature: temp,
          messages,
          tools: [
            { type: "web_search_20250305", name: "web_search", max_uses: 3 },
          ],
        });

        // stream text deltas to the client as they arrive
        activeStream.on("text", (textDelta: string) => {
          fullText += textDelta;
          if (!res.writableEnded && !clientDisconnected) {
            res.write(`data: ${JSON.stringify({ text: textDelta })}\n\n`);
          }
        });

        // await the complete message — this resolves after all events are processed
        response = await activeStream.finalMessage();
        activeStream = null;
      } catch (streamError: any) {
        activeStream = null;
        // don't log client disconnects as errors
        if (clientDisconnected) break;
        console.error("Stream error:", streamError?.message || streamError);
        console.error("Stream error status:", streamError?.status, "type:", streamError?.error?.type);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: "Something went wrong" })}\n\n`);
        }
        break;
      }

      // accumulate token usage across iterations
      totalUsage.input_tokens += response.usage.input_tokens;
      totalUsage.output_tokens += response.usage.output_tokens;

      // web search may pause mid-turn — append the full content blocks
      // (including server_tool_use / web_search_tool_result) and continue
      if (response.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant" as const, content: response.content }];
        continueLoop = true;
      }
    }

    // save whatever text we collected (even partial) to conversation history
    if (fullText) {
      try {
        await storage.addMessageToConversation(req.params.id as string, { role: "assistant", content: fullText });
      } catch (err) {
        console.error("Failed to save assistant message:", err);
      }
    }

    // always send the done signal and end the response
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ done: true, usage: totalUsage })}\n\n`);
      res.end();
    }

  } catch (error) {
    console.error("API Call Failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Something went wrong, please try again" });
    } else if (!res.writableEnded) {
      // headers already sent (SSE started) — send error via SSE and close cleanly
      res.write(`data: ${JSON.stringify({ error: "Something went wrong" })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, usage: { input_tokens: 0, output_tokens: 0 } })}\n\n`);
      res.end();
    }
  }
});

// Reset a specific conversation — clears all messages but keeps the conversation
app.post("/conversations/:id/reset", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const success = await storage.resetConversation(req.params.id as string, userId);
  if (!success) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  res.json({ status: "conversation reset" });
});

// start the server with Vite dev middleware for hot-reloading the frontend
ViteExpress.listen(app, 3000, () =>
  console.log("Server is listening on port 3000..."),
);