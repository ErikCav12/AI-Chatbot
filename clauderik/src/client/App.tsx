import "./App.css";

import { useState, useRef, useEffect } from "react";

import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

import genieIcon from "./assets/genie.svg";
import lampIcon from "./assets/lamp.svg";

type Message = {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
};

type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  total: number;
};

function App() {
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // auto-scroll to top when conversation updates (newest is first due to reverse)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [conversation]);

  function cancelStream() {
    if (readerRef.current) {
      readerRef.current.cancel();
      readerRef.current = null;
    }
    setIsLoading(false);
  }

  async function retryLastMessage() {
    // find the last user message to retry
    const lastUserMsg = [...conversation].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    // remove the failed assistant message
    setConversation((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return prev.slice(0, -1);
      }
      return prev;
    });

    // resend
    setIsLoading(true);
    setConversation((prev) => [...prev, { role: "assistant", content: "" }]);
    await streamResponse(lastUserMsg.content);
  }

  async function streamResponse(message: string) {
    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }

      const reader = res.body!.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const payload = trimmed.slice(6);

          try {
            const parsed = JSON.parse(payload);
            if (parsed.done && parsed.usage) {
              setTokenUsage({
                input_tokens: parsed.usage.input_tokens,
                output_tokens: parsed.usage.output_tokens,
                total: parsed.usage.input_tokens + parsed.usage.output_tokens,
              });
              continue;
            }
            if (parsed.error) {
              // mark the assistant message as errored
              setConversation((prev) => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...lastMsg,
                    error: true,
                    content: lastMsg.content || "Something went wrong.",
                  };
                }
                return updated;
              });
              continue;
            }
            if (parsed.text) {
              setConversation((prev) => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...lastMsg,
                    content: lastMsg.content + parsed.text,
                  };
                }
                return updated;
              });
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      // mark partial response as errored, or remove empty placeholder
      setConversation((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          if (last.content === "") {
            return prev.slice(0, -1);
          }
          return [
            ...prev.slice(0, -1),
            { ...last, error: true },
          ];
        }
        return prev;
      });
    } finally {
      readerRef.current = null;
      setIsLoading(false);
    }
  }

  async function sendMessage() {
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    setConversation((prev) => [
      ...prev,
      { role: "user", content: currentInput },
      { role: "assistant", content: "" },
    ]);

    await streamResponse(currentInput);
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
    setTokenUsage(null);
  }

  // check if the last message is a streaming assistant message
  const lastMsg = conversation[conversation.length - 1];
  const isStreaming = isLoading && lastMsg?.role === "assistant" && lastMsg.content.length > 0;
  const isWaitingForFirstChunk = isLoading && lastMsg?.role === "assistant" && lastMsg.content === "";

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
        {/* Token usage display */}
        {tokenUsage && (
          <p className="text-xs text-white/30 mt-2">
            Tokens: {tokenUsage.input_tokens} in / {tokenUsage.output_tokens} out / {tokenUsage.total} total
          </p>
        )}
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

          {/* Lamp button / Stop button */}
          <div className="flex flex-col items-center my-8">
            {isLoading ? (
              <Button
                type="button"
                variant="ghost"
                onClick={cancelStream}
                className="flex flex-col items-center gap-4 h-auto p-4 hover:bg-transparent cursor-pointer"
              >
                <img
                  src={lampIcon}
                  alt="Magic Lamp"
                  className="w-[156px] h-[156px] drop-shadow-[0_0_8px_#d4a344] animate-rub-lamp"
                />
                <span className="text-red-400 text-2xl font-semibold">
                  Stop
                </span>
              </Button>
            ) : (
              <Button
                type="submit"
                variant="ghost"
                disabled={!input.trim()}
                className="lamp-hover flex flex-col items-center gap-4 h-auto p-4 hover:bg-transparent disabled:opacity-100 cursor-pointer disabled:cursor-default"
              >
                <img
                  src={lampIcon}
                  alt="Magic Lamp"
                  className="w-[156px] h-[156px] drop-shadow-[0_0_8px_#d4a344] transition-all duration-400"
                />
                <span className="text-[lch(70%_8_285)] text-2xl font-semibold opacity-90">
                  Rub the Lamp
                </span>
              </Button>
            )}
          </div>
        </form>

        {/* Conversation output */}
        {conversation.length > 0 && (
          <section className="pb-4">
            <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto">
              <div className="space-y-4 pb-4">
                {[...conversation].reverse().map((msg, index) => {
                  const isLastAssistant =
                    index === 0 && msg.role === "assistant";

                  return (
                    <Card
                      key={index}
                      className={`border-0 ${
                        msg.role === "user"
                          ? "bg-white/5"
                          : msg.error
                            ? "bg-red-500/10 border border-red-500/30"
                            : "bg-[#d4a344]/10"
                      }`}
                    >
                      <CardContent className="p-4">
                        <strong
                          className={
                            msg.role === "assistant"
                              ? msg.error
                                ? "text-red-400"
                                : "text-[#d4a344]"
                              : ""
                          }
                        >
                          {msg.role === "user" ? "You" : "Gift Genie"}:
                        </strong>

                        {/* Typing indicator - waiting for first chunk */}
                        {isLastAssistant && isWaitingForFirstChunk && (
                          <div className="flex gap-1.5 mt-2 items-center">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>
                        )}

                        {/* Message content with optional typing cursor */}
                        {msg.content && (
                          <div
                            className={`prose mt-1 text-[lch(92%_0_0)] ${
                              isLastAssistant && isStreaming
                                ? "typing-cursor"
                                : ""
                            }`}
                          >
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        )}

                        {/* Error state with retry button */}
                        {msg.error && (
                          <div className="mt-2 flex items-center gap-3">
                            <span className="text-red-400 text-sm">
                              Stream interrupted
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={retryLastMessage}
                              className="text-xs border-red-400/50 text-red-400 hover:bg-red-400/10"
                            >
                              Retry
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
