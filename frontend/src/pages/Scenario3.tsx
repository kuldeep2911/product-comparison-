import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import {
  startSession, sendMessage, getCategories, getHistory,
  type ChatMessageResponse, type RecommendedProduct, type CategoryInfo, type ComparisonTable,
} from "@/lib/api";

type MessageRole = "ai" | "user";

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  type?: "text" | "catalog" | "cards" | "action-buttons" | "comparison-table" | "error" | "loading";
  categories?: CategoryInfo[];
  cards?: RecommendedProduct[];
  actionButtons?: { label: string; action: string; row?: number }[];
  tableData?: ComparisonTable;
}

const NAVY = "#1a2744";
const NAVY_HOVER = "#2a3a5c";

let msgId = 0;
const nextId = () => `s3-msg-${++msgId}`;

const Scenario3 = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [inputActive, setInputActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [currentProducts, setCurrentProducts] = useState<RecommendedProduct[]>([]);

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
          const cats = await getCategories();
          setCategories(cats);

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
      addMessages([{ id: nextId(), role: "user", content: "Comparing products in the same category" }]);
      await delay(600);

      try {
        const session = await startSession("category_compare");
        setSessionId(session.session_id);
        const cats = await getCategories();
        setCategories(cats);
        addMessages([
          { id: nextId(), role: "ai", content: "Please select a category to explore, or type what you're looking for." },
          { id: nextId(), role: "ai", content: "", type: "catalog", categories: cats },
        ]);
      } catch {
        addMessages([{ id: nextId(), role: "ai", content: "What category of products would you like to compare?" }]);
        setInputActive(true);
      }
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
      setCurrentProducts(response.recommendations);
      newMessages.push({
        id: nextId(), role: "ai", content: "",
        type: "cards", cards: response.recommendations.slice(0, 5),
      });

      const buttons: { label: string; action: string; row?: number }[] = [
        { label: "Compare these products", action: "compare", row: 1 },
        { label: "Refine search", action: "refine", row: 1 },
        { label: "Start over", action: "new", row: 2 },
      ];
      newMessages.push({ id: nextId(), role: "ai", content: "", type: "action-buttons", actionButtons: buttons });
    }

    if (response.comparison_table) {
      newMessages.push({
        id: nextId(), role: "ai", content: "",
        type: "comparison-table", tableData: response.comparison_table,
      });
      newMessages.push({
        id: nextId(), role: "ai", content: "", type: "action-buttons",
        actionButtons: [
          { label: "Ask a question about these", action: "follow-up" },
          { label: "Start over", action: "new" },
        ],
      });
    }

    return newMessages;
  };

  const handleCategorySelect = async (cat: CategoryInfo) => {
    if (!sessionId) return;
    setSelectedCategory(cat.name);
    addMessages([{ id: nextId(), role: "user", content: cat.name }]);
    setLoading(true);
    addMessages([{ id: nextId(), role: "ai", content: "", type: "loading" }]);

    try {
      const response = await sendMessage(sessionId, `Show me products in the ${cat.name} category`);
      setMessages(prev => prev.filter(m => m.type !== "loading"));
      const responseMessages = processApiResponse(response);
      addMessages(responseMessages);
    } catch {
      setMessages(prev => prev.filter(m => m.type !== "loading"));
      addMessages([{ id: nextId(), role: "ai", content: "Sorry, I couldn't load products for that category.", type: "error" }]);
    }
    setLoading(false);
    setInputActive(true);
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
      addMessages([{ id: nextId(), role: "ai", content: "Sorry, I encountered an error. Please try again.", type: "error" }]);
    }

    setLoading(false);
    setInputActive(true);
  };

  const handleActionButton = async (action: string) => {
    if (!sessionId) return;

    if (action === "compare") {
      addMessages([{ id: nextId(), role: "user", content: "Compare these products" }]);
      setLoading(true);
      addMessages([{ id: nextId(), role: "ai", content: "", type: "loading" }]);

      try {
        const productNames = currentProducts.slice(0, 5).map(p => `${p.name}`).join(" vs ");
        const response = await sendMessage(sessionId, `Compare ${productNames}`);
        setMessages(prev => prev.filter(m => m.type !== "loading"));
        const responseMessages = processApiResponse(response);
        addMessages(responseMessages);
      } catch {
        setMessages(prev => prev.filter(m => m.type !== "loading"));
      }
      setLoading(false);
      setInputActive(true);
    } else if (action === "refine") {
      addMessages([{ id: nextId(), role: "user", content: "Refine search" }]);
      await delay(300);
      addMessages([{ id: nextId(), role: "ai", content: "What would you like to change? You can specify a budget, use case (gaming, camera, battery), or specific features." }]);
      setInputActive(true);
    } else if (action === "follow-up") {
      addMessages([{ id: nextId(), role: "user", content: "I have a question" }]);
      await delay(300);
      addMessages([{ id: nextId(), role: "ai", content: "Go ahead! Ask about any specific spec or feature of the compared products." }]);
      setInputActive(true);
    } else if (action === "new") {
      try {
        const session = await startSession("category_compare");
        setSessionId(session.session_id);
        setSelectedCategory(null);
        setCurrentProducts([]);
      } catch { }
      addMessages([{ id: nextId(), role: "user", content: "Start over" }]);
      await delay(300);
      if (categories.length > 0) {
        addMessages([
          { id: nextId(), role: "ai", content: "Sure! Select a category or describe what you're looking for." },
          { id: nextId(), role: "ai", content: "", type: "catalog", categories },
        ]);
      } else {
        addMessages([{ id: nextId(), role: "ai", content: "What category of products would you like to explore?" }]);
        setInputActive(true);
      }
    }
  };

  const renderMessage = (msg: ChatMessage) => {
    if (msg.type === "loading") {
      return (
        <div key={msg.id} className="chat-element flex justify-start">
          <div className="bg-white rounded-2xl px-5 py-3 shadow-sm flex items-center gap-2" style={{ color: NAVY }}>
            <Loader2 className="animate-spin" size={16} />
            <span className="text-sm">Searching products...</span>
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

    if (msg.type === "catalog" && msg.categories) {
      return (
        <div key={msg.id} className="chat-element flex flex-col gap-3">
          <div className="bg-white rounded-xl p-4 w-full shadow-sm">
            <div className="flex flex-wrap gap-2">
              {msg.categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat)}
                  className={`p-2 px-4 rounded-lg text-sm font-medium transition-colors border-2 ${selectedCategory === cat.name
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-transparent hover:bg-blue-50 text-gray-700"
                    }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === "cards" && msg.cards) {
      return (
        <div key={msg.id} className="chat-element flex gap-3 flex-wrap">
          {msg.cards.map((card, i) => (
            <div key={card.id} className="bg-white rounded-xl w-full sm:w-[180px] overflow-hidden shadow-sm">
              <div className="h-8 flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: NAVY }}>
                #{i + 1}
              </div>
              <div className="p-3">
                <p className="font-semibold text-sm mb-1" style={{ color: NAVY }}>{card.brand} {card.name}</p>
                <p className="text-xs text-gray-500">
                  {card.score > 0 ? `Score: ${card.score.toFixed(2)}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (msg.type === "comparison-table" && msg.tableData) {
      const { products, sections } = msg.tableData;
      const allFields = sections.flatMap(s => s.fields);
      const displayFields = allFields.slice(0, 12);

      return (
        <div key={msg.id} className="chat-element w-full overflow-x-auto">
          <div className="bg-white rounded-xl overflow-hidden shadow-sm min-w-[400px]">
            <div className="grid" style={{ gridTemplateColumns: `160px repeat(${products.length}, 1fr)` }}>
              <div className="px-3 py-3" style={{ backgroundColor: NAVY }} />
              {products.map((p) => (
                <div key={p.id} className="px-3 py-3 text-center" style={{ backgroundColor: NAVY }}>
                  <span className="text-white text-xs font-semibold">{p.brand} {p.name}</span>
                </div>
              ))}
            </div>
            {displayFields.map((field, rowIdx) => (
              <div
                key={`${field.name}-${rowIdx}`}
                className="grid"
                style={{
                  gridTemplateColumns: `160px repeat(${products.length}, 1fr)`,
                  backgroundColor: rowIdx % 2 === 0 ? "white" : "#F0F4FF",
                }}
              >
                <div className="px-3 py-2.5 text-xs font-semibold" style={{ color: NAVY }}>
                  {field.display_name}
                </div>
                {products.map((p) => (
                  <div key={p.id} className="px-3 py-2.5 text-xs text-center text-gray-600">
                    {field.values[p.id] || "—"}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (msg.type === "action-buttons") {
      const row1 = msg.actionButtons?.filter(b => b.row === 1 || !b.row) || [];
      const row2 = msg.actionButtons?.filter(b => b.row === 2) || [];

      return (
        <div key={msg.id} className="chat-element flex flex-col gap-2">
          {row1.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {row1.map((btn) => (
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
          )}
          {row2.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {row2.map((btn) => (
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
          )}
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
              placeholder={inputActive ? "Type your message..." : loading ? "Processing..." : "Select an option above"}
              disabled={!inputActive || loading}
              className={`flex-1 rounded-full px-5 py-3 text-sm outline-none border-none shadow-sm transition-colors ${inputActive && !loading ? "bg-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              style={{ color: inputActive ? NAVY : undefined }}
            />
            <button
              onClick={handleSend}
              disabled={!inputActive || !inputValue.trim() || loading}
              className={`rounded-full p-3 transition-colors ${inputActive && inputValue.trim() && !loading ? "text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"
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

export default Scenario3;
