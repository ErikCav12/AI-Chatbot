import express from "express";
import ViteExpress from "vite-express";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";



const app = express();
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically
let messageHistory: Anthropic.MessageParam[] = []; // Because API is stateless, memory will be stored on the server to boost context.

app.use(express.json())

app.get("/hello", async (req, res) => {
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello, Claude" }],
  });

  res.json(message);
});

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

app.post("/reset", (req, res) => {
  messageHistory = [];
  res.json({ status: "conversation reset" });
});


ViteExpress.listen(app, 3000, () =>
  console.log("Server is listening on port 3000..."),
);
