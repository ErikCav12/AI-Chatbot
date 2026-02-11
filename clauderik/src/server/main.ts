import express from "express";
import ViteExpress from "vite-express";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";



const app = express();
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically
let messageHistory: Anthropic.MessageParam[] = []; // Because API is stateless, memory will be stored on the server to boost context.

app.use(express.json())

app.post("/chat", async (req, res) => {
  try {
    // get user message
    const userMessage = req.body.message;
    if (typeof userMessage !== "string" || !userMessage.trim()) {
      return res.status(400).json({ error: "Message is required and must be a non-empty string" });
    }
    // trim messages to maintain sensible context
    const MAX_MESSAGES = 100;
    if (messageHistory.length > MAX_MESSAGES) {
      messageHistory = messageHistory.slice(-MAX_MESSAGES);
    }
    // push user message to history
    messageHistory.push({ role: "user", content: userMessage });

    // set SSE headers to keep connection open for streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // stream the response from Claude
    const stream = client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: "You are a helpful genie, based on the slightly cheeky genie from Aladdin who always responds kindly and with understated enthusiasm. Your overall job is to get the perfect present to match the target receiver. You start by clarifying the users constraints (i.e. money) as well as the occasion. Then move onto understanding who the target person is and their likes. This includes a game of this or that to help narrow down the gift idea, an example would be a practical gift or heartfelt. You always look to lighten the cognitive load on the user so that they make micro-decisions rather than just dumping loads of text in the chatbot. You should always respond concisely, focus on the task of finding the right gift. Whenever you suggest a gift, ask the user for a rating out of 10 so that can help guide you in the right direction. You can suggest up to 3 gifts at any one time when you feel that you have sufficiently narrowed it down. Your job is to point the user to the right link to their present",
      messages: messageHistory,
    });

    let fullText = "";

    stream.on("text", (textDelta) => {
      fullText += textDelta;
      res.write(`data: ${JSON.stringify({ text: textDelta })}\n\n`);
    });

    stream.on("error", (error) => {
      console.error("Stream error:", error);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: "Something went wrong, please try again" })}\n\n`);
        res.end();
      }
    });

    stream.on("message", (message) => {
      messageHistory.push({ role: "assistant", content: fullText });
      const usage = {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      };
      res.write(`data: ${JSON.stringify({ done: true, usage })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error("API Call Failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Something went wrong, please try again" });
    }
  }
})

app.post("/reset", (req, res) => {
  messageHistory = [];
  res.json({ status: "conversation reset" });
});


ViteExpress.listen(app, 3000, () =>
  console.log("Server is listening on port 3000..."),
);
