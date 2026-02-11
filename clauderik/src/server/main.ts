import express from "express";                                                                                                                                          
import ViteExpress from "vite-express";                                                        
import Anthropic from "@anthropic-ai/sdk";                                                                                                                              
import "dotenv/config";                                                                                                                                                 
import { SqliteStorage } from "./sqliteStorage.js";                                                                                                                            

const app = express();
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically
const storage = new SqliteStorage(); // stores conversations in a SQLite database file for persistence across restarts

app.use(express.json());

// Create a new conversation — called when the user starts a fresh chat
app.post("/conversations", async (req, res) => {
  const convo = await storage.createConversation();
  // only return metadata, not the full messages array
  res.json({ id: convo.id, title: convo.title, createdAt: convo.createdAt });
});

// List all conversations — used to populate the sidebar drawer
app.get("/conversations", async (req, res) => {
  const convos = await storage.getConversations();
  // strip out messages to keep the response lightweight
  res.json(convos.map(c => ({ id: c.id, title: c.title, createdAt: c.createdAt })));
});

// Send a message within a specific conversation and stream the AI response back
app.post("/conversations/:id/chat", async (req, res) => {
  try {
    // look up the conversation by ID from the URL parameter
    const conversation = await storage.getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // validate that the user actually sent a message
    const userMessage = req.body.message;
    if (typeof userMessage !== "string" || !userMessage.trim()) {
      return res.status(400).json({ error: "Message is required and must be a non-empty string" });
    }

    // save the user's message to the conversation history
    // this also handles auto-titling and the MAX_MESSAGES cap internally
    await storage.addMessageToConversation(req.params.id, { role: "user", content: userMessage });

    // set up Server-Sent Events (SSE) so we can stream tokens back as they arrive
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // call the Claude API with the full conversation history for this chat
    const stream = client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: "You are a helpful genie, based on the slightly cheeky genie from Aladdin who always responds kindly and with understated enthusiasm. Your overall job is to get the perfect present to match the target receiver. You start by clarifying the users constraints (i.e. money) as well as the occasion. Then move onto understanding who the target person is and their likes. This includes a game of this or that to help narrow down the gift idea, an example would be a practical gift or heartfelt. You always look to lighten the cognitive load on the user so that they make micro-decisions rather than just dumping loads of text in the chatbot. You should always respond concisely, focus on the task of finding the right gift. Whenever you suggest a gift, ask the user for a rating out of 10 so that can help guide you in the right direction. You can suggest up to 3 gifts at any one time when you feel that you have sufficiently narrowed it down. Your job is to point the user to the right link to their present",
      messages: conversation.messages,
    });

    // accumulate the full response so we can save it to history when done
    let fullText = "";

    // fired every time a new chunk of text arrives from Claude
    stream.on("text", (textDelta) => {
      fullText += textDelta;
      // send each chunk to the client as an SSE event
      res.write(`data: ${JSON.stringify({ text: textDelta })}\n\n`);
    });

    // fired if something goes wrong mid-stream
    stream.on("error", (error) => {
      console.error("Stream error:", error);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: "Something went wrong, please try again" })}\n\n`);
        res.end();
      }
    });

    // fired when the full response is complete
    stream.on("message", async (message) => {
      // save the complete assistant response to the conversation history
      await storage.addMessageToConversation(req.params.id, { role: "assistant", content: fullText });

      // send token usage stats and a "done" signal to the client
      const usage = {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      };
      res.write(`data: ${JSON.stringify({ done: true, usage })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error("API Call Failed:", error);
    // only send an error response if we haven't already started streaming
    if (!res.headersSent) {
      res.status(500).json({ error: "Something went wrong, please try again" });
    }
  }
});

// Reset a specific conversation — clears all messages but keeps the conversation
app.post("/conversations/:id/reset", async (req, res) => {
  const conversation = await storage.getConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  conversation.messages = [];
  res.json({ status: "conversation reset" });
});

// start the server with Vite dev middleware for hot-reloading the frontend
ViteExpress.listen(app, 3000, () =>
  console.log("Server is listening on port 3000..."),
);