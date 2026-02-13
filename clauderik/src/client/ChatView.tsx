import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router";

import ReactMarkdown from "react-markdown";

import lampIcon from "./assets/lamp.svg";
import genieIcon from "./assets/genie.svg";

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

function ChatView() {
    const { chatId } = useParams<{ chatId: string }>();
    const conversationId = chatId ?? null;
    const navigate = useNavigate();
    const { fetchConversations } = useOutletContext<{ fetchConversations: () => Promise<void> }>();
    const [isWildcard, setIsWildcard] = useState(false);

    const [input, setInput] = useState("");
    const [conversation, setConversation] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
    const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const justCreatedRef = useRef(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // auto-scroll to bottom when conversation updates
    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [conversation]);

    useEffect(() => {
      if (justCreatedRef.current) {
        justCreatedRef.current = false;
        return;
      }
      if (conversationId) {
        loadConversation(conversationId);
      } else {
        setConversation([]);
        setInput("");
        setTokenUsage(null);
      }
    }, [conversationId]);

    async function loadConversation(id: string) {
      setTokenUsage(null);
      const res = await fetch(`/conversations/${id}`);
      const data = await res.json();
      setConversation(
        data.messages.map((m: { role: "user" | "assistant"; content: string }) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : "",
        }))
      );
    }

    function cancelStream() {
      if (readerRef.current) {
        readerRef.current.cancel();
        readerRef.current = null;
      }
      setIsLoading(false);
    }

    async function retryLastMessage() {
      const lastUserMsg = [...conversation].reverse().find((m) => m.role === "user");
      if (!lastUserMsg) return;

      setConversation((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.slice(0, -1);
        }
        return prev;
      });

      setIsLoading(true);
      setConversation((prev) => [...prev, { role: "assistant", content: "" }]);
      await streamResponse(lastUserMsg.content);
    }

    async function streamResponse(message: string, overrideId?: string) {
      try {
        const chatId = overrideId || conversationId;
        const res = await fetch(`/conversations/${chatId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            temperature: isWildcard ? 1.0 : 0.7,
          }),
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

      // reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      let activeId = conversationId;
      if (!activeId) {
        const res = await fetch("/conversations", { method: "POST" });
        const data = await res.json();
        activeId = data.id;
        justCreatedRef.current = true;
        navigate(`/chat/${activeId}`, { replace: true });
      }

      setConversation((prev) => [
        ...prev,
        { role: "user", content: currentInput },
        { role: "assistant", content: "" },
      ]);

      await streamResponse(currentInput, activeId!);
      fetchConversations();
    }

    function handleSubmit(e: { preventDefault(): void }) {
      e.preventDefault();
      if (!input.trim()) return;
      sendMessage();
    }

    function toggleWildcard() {
      setIsWildcard((prev) => !prev);
    }

    // auto-resize textarea
    function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      setInput(e.target.value);
      const el = e.target;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }

    const lastMsg = conversation[conversation.length - 1];
    const isStreaming = isLoading && lastMsg?.role === "assistant" && lastMsg.content.length > 0;
    const isWaitingForFirstChunk = isLoading && lastMsg?.role === "assistant" && lastMsg.content === "";
    const hasMessages = conversation.length > 0;

    return (
      <div className="flex flex-col h-full">
        {/* Messages area */}
        {hasMessages ? (
          <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
            <div className="space-y-6">
              {conversation.map((msg, index) => {
                const isLastAssistant =
                  index === conversation.length - 1 && msg.role === "assistant";

                return (
                  <div key={index} className="flex gap-3 items-start">
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${
                      msg.role === "assistant"
                        ? ""
                        : "bg-white/10"
                    }`}>
                      {msg.role === "assistant" ? (
                        <img src={genieIcon} alt="Genie" className="w-8 h-8 drop-shadow-[0_0_4px_#d4a344]" />
                      ) : (
                        <span className="text-xs font-medium text-white/70">You</span>
                      )}
                    </div>

                    {/* Message content */}
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-medium ${
                        msg.role === "assistant"
                          ? msg.error ? "text-red-400" : "text-[#d4a344]"
                          : "text-white/50"
                      }`}>
                        {msg.role === "user" ? "You" : "Gift Genie"}
                      </span>

                      {isLastAssistant && isWaitingForFirstChunk && (
                        <div className="flex gap-1.5 mt-2 items-center">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                      )}

                      {msg.content && (
                        <div className={`prose mt-1 text-[lch(92%_0_0)] text-[15px] leading-relaxed ${
                          isLastAssistant && isStreaming ? "typing-cursor" : ""
                        }`}>
                          <ReactMarkdown components={{
                            a: ({ href, children }) => (
                              <a href={href} target="_blank" rel="noopener noreferrer">
                                {children}
                              </a>
                            )
                          }}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}

                      {msg.error && (
                        <div className="mt-2 flex items-center gap-3">
                          <span className="text-red-400 text-xs">
                            Stream interrupted
                          </span>
                          <button
                            onClick={retryLastMessage}
                            className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2 cursor-pointer"
                          >
                            Retry
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Empty state — lamp centered */
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <img
              src={lampIcon}
              alt="Magic Lamp"
              className="w-[120px] h-[120px] drop-shadow-[0_0_12px_#d4a344] opacity-80"
            />
            <p className="text-white/30 text-sm">Ask the Genie for gift ideas</p>
          </div>
        )}

        {/* Token usage */}
        {tokenUsage && (
          <p className="text-[11px] text-white/20 text-center py-1">
            {tokenUsage.input_tokens} in / {tokenUsage.output_tokens} out / {tokenUsage.total} total
          </p>
        )}

        {/* Input area — pinned to bottom */}
        <div className="pb-4 pt-2">
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus-within:border-[#d4a344]/50 transition-colors duration-300">
              {/* Wildcard dial — compact, inline */}
              <button
                type="button"
                onClick={toggleWildcard}
                className="amp-dial relative w-9 h-9 rounded-full cursor-pointer flex-shrink-0 mb-0.5"
                title={isWildcard ? "Wildcard: ON" : "Wildcard: OFF"}
              >
                <div className={`absolute inset-0 rounded-full border-[1.5px] transition-all duration-500 ${
                  isWildcard
                    ? "border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                    : "border-white/15"
                }`} />
                <div className={`absolute inset-[3px] rounded-full transition-all duration-500 ${
                  isWildcard
                    ? "bg-gradient-to-b from-red-900/80 to-red-950"
                    : "bg-gradient-to-b from-white/8 to-white/3"
                }`}>
                  <div className={`amp-dial-notch absolute w-0.5 h-2.5 left-1/2 -translate-x-1/2 rounded-full transition-all duration-500 ${
                    isWildcard
                      ? "top-[3px] bg-red-400 shadow-[0_0_4px_rgba(239,68,68,0.8)]"
                      : "bottom-[3px] bg-white/25"
                  }`} />
                </div>
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) handleSubmit(e);
                  }
                }}
                placeholder="Ask the Genie..."
                rows={1}
                className="flex-1 bg-transparent text-[15px] text-[lch(92%_0_0)] placeholder:text-white/30 resize-none outline-none max-h-[200px] py-1 leading-relaxed"
              />

              {/* Send / Stop button — lamp icon */}
              {isLoading ? (
                <button
                  type="button"
                  onClick={cancelStream}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center cursor-pointer mb-0.5"
                >
                  <img
                    src={lampIcon}
                    alt="Stop"
                    className="w-8 h-8 animate-rub-lamp"
                  />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="lamp-send flex-shrink-0 w-10 h-10 flex items-center justify-center disabled:opacity-30 disabled:cursor-default cursor-pointer mb-0.5"
                >
                  <img
                    src={lampIcon}
                    alt="Send"
                    className="w-8 h-8 drop-shadow-[0_0_4px_#d4a344] transition-all duration-300"
                  />
                </button>
              )}
            </div>

            {/* Wildcard label */}
            {isWildcard && (
              <span className="absolute -top-5 left-4 text-[10px] font-bold tracking-widest uppercase text-red-400 amp-jacked-text">
                WILDCARD
              </span>
            )}
          </form>
        </div>
      </div>
    );
  }

export default ChatView;
