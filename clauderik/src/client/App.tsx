import "./App.css";

import { useState } from "react";

import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

import genieIcon from "./assets/genie.svg";
import lampIcon from "./assets/lamp.svg";

type Message = {
  role: "user" | "assistant";
  content: string;
};

function App() {
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function sendMessage() {
    setIsLoading(true);
    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });
      const data = await res.json();
      setConversation((prev) => [
        ...prev,
        { role: "user", content: input },
        { role: "assistant", content: data.reply },
      ]);
      setInput("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!input.trim()) return;
    await sendMessage();
  }

  async function resetConversation() {
    await fetch("/reset", { method: "POST" });
    setConversation([]);
    setInput("");
  }

  return (
    <div className="mx-auto max-w-[800px] min-h-screen flex flex-col px-6 py-6">
      {/* Header */}
      <header className="text-center animate-fade-in-down">
        <div className="flex items-center justify-center gap-4">
          <img
            src={genieIcon}
            alt="Genie"
            className="w-[60px] h-[60px] drop-shadow-[0_0_8px_#d4a344]"
          />
          <h1 className="text-[clamp(2rem,5vw,2.5rem)] font-extrabold tracking-tight">
            Gift Genie
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <form onSubmit={handleSubmit} className="mb-2">
          {/* Textarea input */}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            placeholder="e.g., ...sh*t forgot my wife's birthday"
            className="w-full bg-transparent border-0 border-b-2 border-white/20 rounded-none min-h-[calc(1.5em*3+1.2rem)] text-lg text-[lch(92%_0_0)] placeholder:text-white/40 resize-none focus:border-b-[#d4a344] focus-visible:ring-0 transition-colors duration-300"
          />

          {/* Lamp button */}
          <div className="flex flex-col items-center my-8">
            <Button
              type="submit"
              variant="ghost"
              disabled={isLoading || !input.trim()}
              className="lamp-hover flex flex-col items-center gap-4 h-auto p-4 hover:bg-transparent disabled:opacity-100 cursor-pointer disabled:cursor-default"
            >
              <img
                src={lampIcon}
                alt="Magic Lamp"
                className={`w-[156px] h-[156px] drop-shadow-[0_0_8px_#d4a344] transition-all duration-400 ${
                  isLoading ? "animate-rub-lamp" : ""
                }`}
              />
              <span className="text-[lch(70%_8_285)] text-2xl font-semibold opacity-90">
                Rub the Lamp
              </span>
            </Button>
          </div>
        </form>

        {/* Conversation output */}
        {conversation.length > 0 && (
          <section className="pb-4">
            <div className="max-h-[60vh] overflow-y-auto">
              <div className="space-y-4 pb-4">
                {[...conversation].reverse().map((msg, index) => (
                  <Card
                    key={index}
                    className={`border-0 ${
                      msg.role === "user"
                        ? "bg-white/5"
                        : "bg-[#d4a344]/10"
                    }`}
                  >
                    <CardContent className="p-4">
                      <strong className={msg.role === "assistant" ? "text-[#d4a344]" : ""}>
                        {msg.role === "user" ? "You" : "Gift Genie"}:
                      </strong>
                      <div className="prose mt-1 text-[lch(92%_0_0)]">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
