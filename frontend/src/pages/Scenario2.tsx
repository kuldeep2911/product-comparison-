import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import { startSession, sendMessage, getHistory, type ChatMessageResponse, type RecommendedProduct } from "@/lib/api";

type MessageRole = "ai" | "user";

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  type?: "text" | "cards" | "action-buttons" | "error" | "loading";
  cards?: RecommendedProduct[];
  actionButtons?: { label: string; action: string }[];
}

const NAVY = "#1a2744";
const NAVY_HOVER = "#2a3a5c";

let msgId = 0;
const nextId = () => `s2-msg-${++msgId}`;

const Scenario2 = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [inputActive, setInputActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const addMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...msgs]);
  }, []);

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  useEffect(() => {
    const init = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const existingSessionId = urlParams.get('session');

      if (existingSessionId) {
        try {
          const history = await getHistory(existingSessionId);
          setSessionId(existingSessionId);
          
          let loadedMsgs: ChatMessage[] = [];
          for (const m of history.messages) {
            if (m.role === "user") {
              loadedMsgs.push({ id: nextId(), role: "user", content: m.content });
            } else {
              const mockResponse: ChatMessageResponse = {
                session_id: existingSessionId,
                role: "ai",
                content: m.content,
                recommendations: m.metadata?.recommendations as any,
                comparison_table: m.metadata?.comparison_table as any,
                product_ids: m.metadata?.product_ids as any,
              };
              loadedMsgs = [...loadedMsgs, ...processApiResponse(mockResponse)];
            }
          }
          addMessages(loadedMsgs);
          setInputActive(true);
          return;
        } catch (err) {
          console.error("Failed to load history", err);
        }
      }

      await delay(300);
      addMessages([{ id: nextId(), role: "ai", content: "Hi, I'm your assistant, Assistme!" }]);
      await delay(600);
      addMessages([{ id: nextId(), role: "user", content: "Getting Purchase advice" }]);
      await delay(600);

      try {
        const session = await startSession("purchase_advice");
        setSessionId(session.session_id);
        addMessages([{
          id: nextId(), role: "ai",
          content: "I'd be happy to help you find the perfect product! Tell me what you're looking for.\n\nFor example:\n• \"best gaming phone under 50000\"\n• \"camera phone with good battery\"\n• \"lightweight phone for everyday use\"",
        }]);
      } catch {
        addMessages([{ id: nextId(), role: "ai", content: "What would you like to buy? Describe what you're looking for." }]);
      }
      setInputActive(true);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const processApiResponse = (response: ChatMessageResponse) => {
    const newMessages: ChatMessage[] = [];

    if (response.content) {
      newMessages.push({ id: nextId(), role: "ai", content: response.content });
    }

    if (response.recommendations && response.recommendations.length > 0) {
      newMessages.push({
        id: nextId(), role: "ai", content: "",
        type: "cards",
        cards: response.recommendations,
      });

      const buttons = [
        { label: "Tell me more about #1", action: "focus-0" },
        { label: "Refine my search", action: "refine" },
        { label: "Compare top picks", action: "compare-top" },
        { label: "Start over", action: "new" },
      ];
      newMessages.push({ id: nextId(), role: "ai", content: "", type: "action-buttons", actionButtons: buttons });
    }

    return newMessages;
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !inputActive || !sessionId) return;
    const text = inputValue.trim();
    setInputValue("");
    setInputActive(false);
    setLoading(true);

    addMessages([{ id: nextId(), role: "user", content: text }]);
    addMessages([{ id: nextId(), role: "ai", content: "", type: "loading" }]);

    try {
      const response = await sendMessage(sessionId, text);
      setMessages(prev => prev.filter(m => m.type !== "loading"));
      const responseMessages = processApiResponse(response);
      addMessages(responseMessages);
    } catch {
      setMessages(prev => prev.filter(m => m.type !== "loading"));
      addMessages([{
        id: nextId(), role: "ai",
        content: "Sorry, I encountered an error. Please try again.",
        type: "error",
      }]);
    }

    setLoading(false);
    setInputActive(true);
  };

  const handleActionButton = async (action: string) => {
    if (!sessionId) return;

    if (action.startsWith("focus-")) {
      const idx = parseInt(action.split("-")[1]);
      addMessages([{ id: nextId(), role: "user", content: `Tell me more about option ${idx + 1}` }]);
      setLoading(true);
      addMessages([{ id: nextId(), role: "ai", content: "", type: "loading" }]);

      try {
        const response = await sendMessage(sessionId, `Tell me more about the #${idx + 1} recommended product. What makes it special?`);
        setMessages(prev => prev.filter(m => m.type !== "loading"));
        addMessages([{ id: nextId(), role: "ai", content: response.content }]);
      } catch {
        setMessages(prev => prev.filter(m => m.type !== "loading"));
      }
      setLoading(false);
      setInputActive(true);
    } else if (action === "refine") {
      addMessages([{ id: nextId(), role: "user", content: "I'd like to refine my search" }]);
      await delay(300);
      addMessages([{ id: nextId(), role: "ai", content: "Sure! Tell me what you'd like to change — different budget, different priorities, or specific features you need?" }]);
      setInputActive(true);
    } else if (action === "compare-top") {
      addMessages([{ id: nextId(), role: "user", content: "Compare the top recommended products" }]);
      setLoading(true);
      addMessages([{ id: nextId(), role: "ai", content: "", type: "loading" }]);

      try {
        const response = await sendMessage(sessionId, "Compare the top recommended products side by side");
        setMessages(prev => prev.filter(m => m.type !== "loading"));

        if (response.content) {
          addMessages([{ id: nextId(), role: "ai", content: response.content }]);
        }
        if (response.comparison_table) {
          // Render a simplified comparison table
          const { products, sections } = response.comparison_table;
          const allFields = sections.flatMap(s => s.fields);
          const displayFields = allFields.slice(0, 10);

          const tableRows = displayFields.map(f => {
            const vals = products.map(p => f.values[p.id] || "—").join(" | ");
            return `**${f.display_name}**: ${vals}`;
          }).join("\n");

          addMessages([{ id: nextId(), role: "ai", content: tableRows }]);
        }
      } catch {
        setMessages(prev => prev.filter(m => m.type !== "loading"));
      }
      setLoading(false);
      setInputActive(true);
    } else if (action === "new") {
      try {
        const session = await startSession("purchase_advice");
        setSessionId(session.session_id);
      } catch {}
      addMessages([{ id: nextId(), role: "user", content: "Start a new search" }]);
      await delay(300);
      addMessages([{ id: nextId(), role: "ai", content: "Sure! What are you looking for?" }]);
      setInputActive(true);
    }
  };

  const renderMessage = (msg: ChatMessage) => {
    if (msg.type === "loading") {
      return (
        <div key={msg.id} className="chat-element flex justify-start">
          <div className="bg-white rounded-2xl px-5 py-3 shadow-sm flex items-center gap-2" style={{ color: NAVY }}>
            <Loader2 className="animate-spin" size={16} />
            <span className="text-sm">Finding the best products for you...</span>
          </div>
        </div>
      );
    }

    if (msg.type === "error") {
      return (
        <div key={msg.id} className="chat-element flex justify-start">
          <div className="rounded-2xl px-5 py-3 max-w-sm shadow-sm" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>
            <p className="text-sm">{msg.content}</p>
          </div>
        </div>
      );
    }

    if (msg.type === "cards" && msg.cards) {
      return (
        <div key={msg.id} className="chat-element flex gap-3 flex-wrap">
          {msg.cards.slice(0, 5).map((card, i) => (
            <div key={card.id} className="bg-white rounded-xl w-full sm:w-[180px] overflow-hidden shadow-sm">
              <div className="h-8 flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: NAVY }}>
                #{i + 1}
              </div>
              <div className="p-3">
                <p className="font-semibold text-sm mb-1" style={{ color: NAVY }}>{card.brand} {card.name}</p>
                <p className="text-xs text-gray-500">Score: {card.score.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (msg.type === "action-buttons") {
      return (
        <div key={msg.id} className="chat-element flex flex-wrap gap-2">
          {msg.actionButtons?.map((btn) => (
            <button
              key={btn.action}
              onClick={() => handleActionButton(btn.action)}
              className="rounded-full px-5 py-2.5 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: NAVY }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = NAVY_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = NAVY)}
            >
              {btn.label}
            </button>
          ))}
        </div>
      );
    }

    if (msg.role === "ai") {
      return (
        <div key={msg.id} className="chat-element flex justify-start">
          <div className="bg-white rounded-2xl px-5 py-3 max-w-lg shadow-sm" style={{ color: NAVY }}>
            <p className="text-sm whitespace-pre-line">{msg.content}</p>
          </div>
        </div>
      );
    }

    return (
      <div key={msg.id} className="chat-element flex justify-end">
        <div className="rounded-2xl px-5 py-3 max-w-sm text-white" style={{ backgroundColor: NAVY }}>
          <p className="text-sm">{msg.content}</p>
        </div>
      </div>
    );
  };

  return (
    <Layout fullHeight>
      <div className="flex flex-col h-screen w-full relative">
        <div className="flex-1 overflow-y-auto px-4 pt-6 pb-28">
          <div className="max-w-6xl mx-auto space-y-4">
            {messages.map(renderMessage)}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 z-10 pointer-events-none">
          <div className="max-w-6xl mx-auto flex items-center gap-2 pointer-events-auto">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={inputActive ? "Describe what you're looking for..." : loading ? "Processing..." : "Select an option above"}
              disabled={!inputActive || loading}
              className={`flex-1 rounded-full px-5 py-3 text-sm outline-none border-none shadow-sm transition-colors ${
                inputActive && !loading ? "bg-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
              style={{ color: inputActive ? NAVY : undefined }}
            />
            <button
              onClick={handleSend}
              disabled={!inputActive || !inputValue.trim() || loading}
              className={`rounded-full p-3 transition-colors ${
                inputActive && inputValue.trim() && !loading ? "text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
              style={inputActive && inputValue.trim() && !loading ? { backgroundColor: NAVY } : undefined}
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <ArrowUp size={18} />}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Scenario2;
