import "./App.css";

import { useState } from "react";

import genieIcon from "./assets/genie.svg";
import lampIcon from "./assets/lamp.svg";

type Message = {
  role: "user" | "assistant";
  content: string;
};




function App() {

  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)

  async function sendMessage() {
    setIsLoading(true);
    try {
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
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false)
      }
    }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!input.trim()) return; // don't send empty messages
    await sendMessage();
  }

  async function resetConversation() {
    await fetch("/reset", { method: "POST"});
    setConversation([]);
    setInput("");
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="title-group">
          <img src={genieIcon} alt="Genie" className="genie-icon-img" />
          <h1>Gift Genie</h1>
        </div>
      </header>

      <main className="main-content">
        <form id="gift-form" className="gift-form" onSubmit={handleSubmit}>
          <div className="input-section">
            <div className="input-wrapper">
              <textarea
                id="user-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g., ...sh*t forgot my wife's birthday"
              ></textarea>
            </div>
          </div>

          <div className="lamp-container">
            <button
              type="submit"
              id="lamp-button"
              className="lamp-btn"
              aria-label="Rub the Lamp"
              disabled={isLoading || !input.trim()}
            >
              <span className="lamp-icon">
                <img
                  src={lampIcon}
                  alt="Magic Lamp"
                  className="lamp-icon-img"
                />
              </span>
              <span className="lamp-text">Rub the Lamp</span>
            </button>
          </div>
        </form>

        <section className="output-section">
          <div 
          id="output-container" 
          className={conversation.length === 0 ? "hidden" : "visible"}
          >
              <div id="output-content">
                {conversation.map((msg, index) => (
                  <div key={index}
                  className={`message message-${msg.role}`}
                  >
                    <strong>{msg.role === "user" ? "You" : "Gift Genie"}:</strong>
                    <p>{msg.content}</p>
              </div>
              ))}
              </div>
            </div>
          </section>
        </main>
    </div>
  )}

export default App;
