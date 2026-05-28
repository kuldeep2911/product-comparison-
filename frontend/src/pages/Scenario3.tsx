import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowUp, Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import {
  startSession, sendMessage, getCategories, getHistory, compareProducts,
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

const NAVY = "#2D3748";
const NAVY_HOVER = "#B87333";

let msgId = 0;
const nextId = () => `s3-msg-${++msgId}`;

const formatFeatureLabel = (key: string) =>
  key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const getFeatureRows = (details?: Record<string, unknown>) => {
  if (!details) return [];

  return Object.entries(details)
    .map(([key, raw]) => {
      const detail = raw as { weighted_score?: number; value?: number; display_value?: string };
      const score = typeof detail?.weighted_score === "number" ? detail.weighted_score : 0;
      const value = detail?.display_value ?? detail?.value;
      return {
        key,
        label: formatFeatureLabel(key),
        score,
        value: value !== undefined ? String(value) : `${Math.round(score * 100)}%`,
      };
    })
    .filter((row) => row.score > 0 || row.value)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
};

const Scenario3 = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [inputActive, setInputActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [currentProducts, setCurrentProducts] = useState<RecommendedProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);

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
      setMessages([]);
      setSessionId(null);
      setSelectedCategory(null);
      setCurrentProducts([]);
      setSelectedProductIds([]);
      setInputValue("");
      setInputActive(false);

      const urlParams = new URLSearchParams(location.search);
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
  }, [location.search]);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const processApiResponse = (response: ChatMessageResponse) => {
    const newMessages: ChatMessage[] = [];

    if (response.content) {
      newMessages.push({ id: nextId(), role: "ai", content: response.content });
    }

    if (response.recommendations && response.recommendations.length > 0) {
      setCurrentProducts(response.recommendations);
      setSelectedProductIds([]);
      newMessages.push({
        id: nextId(), role: "ai", content: "",
        type: "cards", cards: response.recommendations.slice(0, 20),
      });

      const buttons: { label: string; action: string; row?: number }[] = [
        { label: "Compare selected", action: "compare", row: 1 },
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

  const toggleProductSelection = (productId: number) => {
    setSelectedProductIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, productId];
    });
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
      if (selectedProductIds.length < 2) {
        addMessages([{
          id: nextId(),
          role: "ai",
          content: "Select at least 2 products to compare. You can compare up to 4 at once.",
          type: "error",
        }]);
        return;
      }

      const selectedProducts = currentProducts.filter((product) => selectedProductIds.includes(product.id));
      addMessages([{
        id: nextId(),
        role: "user",
        content: `Compare ${selectedProducts.map((product) => `${product.brand} ${product.name}`).join(" vs ")}`,
      }]);
      setLoading(true);
      addMessages([{ id: nextId(), role: "ai", content: "", type: "loading" }]);

      try {
        const comparison = await compareProducts(selectedProductIds);
        setMessages(prev => prev.filter(m => m.type !== "loading"));
        addMessages([
          { id: nextId(), role: "ai", content: "", type: "comparison-table", tableData: comparison },
          {
            id: nextId(), role: "ai", content: "", type: "action-buttons",
            actionButtons: [
              { label: "Ask a question about these", action: "follow-up" },
              { label: "Start over", action: "new" },
            ],
          },
        ]);
      } catch {
        setMessages(prev => prev.filter(m => m.type !== "loading"));
        addMessages([{ id: nextId(), role: "ai", content: "Sorry, I couldn't build the comparison table. Please try again.", type: "error" }]);
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
        setSelectedProductIds([]);
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
          <div className="ai-bubble flex items-center gap-2" style={{ color: NAVY }}>
            <Loader2 className="animate-spin" size={16} />
            <span className="text-sm">Searching products...</span>
          </div>
        </div>
      );
    }

    if (msg.type === "error") {
      return (
        <div key={msg.id} className="chat-element flex justify-start">
          <div className="ai-bubble" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>
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
                      ? "border-[#B87333] bg-[#F3E0D0] text-[#8A501C]"
                      : "border-transparent hover:bg-[#FAF5F0] text-gray-700"
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
        <div key={msg.id} className="chat-element w-full">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: NAVY }}>
            <span className="rounded-full bg-white px-3 py-1.5 font-semibold shadow-sm">
              Selected {selectedProductIds.length}/4
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {msg.cards.map((card, i) => (
            <div key={card.id} className="bg-[#FAF5F0] rounded-xl overflow-hidden shadow-sm border border-[#E6D5C9] transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-pointer">
              <div className="h-8 flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: NAVY }}>
                #{i + 1}
              </div>
              <div className="p-3 space-y-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedProductIds.includes(card.id)}
                    disabled={!selectedProductIds.includes(card.id) && selectedProductIds.length >= 4}
                    onChange={() => toggleProductSelection(card.id)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 accent-[#1a2744]"
                    aria-label={`Select ${card.brand} ${card.name}`}
                  />
                  <span className="font-semibold text-sm leading-snug" style={{ color: NAVY }}>
                    {card.brand} {card.name}
                  </span>
                </label>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-normal text-gray-400">Overall Score</p>
                  <p className="text-sm font-bold" style={{ color: NAVY }}>
                    {card.score > 0 ? card.score.toFixed(2) : "0.00"}
                  </p>
                </div>
                {getFeatureRows(card.details).length > 0 && (
                  <div className="border-t border-gray-100 pt-2 space-y-1.5">
                    {getFeatureRows(card.details).map((feature) => (
                      <div key={feature.key} className="flex justify-between gap-2 text-[11px]">
                        <span className="text-gray-500">{feature.label}</span>
                        <span className="font-semibold" style={{ color: NAVY }}>{feature.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>
      );
    }

    if (msg.type === "comparison-table" && msg.tableData) {
      const { products, sections } = msg.tableData;
      
      const allFields: { section: string; name: string; displayName: string; values: Record<number, string | null> }[] = [];
      for (const section of sections) {
        for (const field of section.fields) {
          allFields.push({
            section: section.name,
            name: field.name,
            displayName: field.display_name,
            values: field.values,
          });
        }
      }

      const displayFields = allFields.slice(0, 12);

      // Helper: determine which product has the better spec value
      const lowerIsBetterKeywords = [
        "price", "weight", "thickness", "nm", "power", "draw", "dischar"
      ];
      const getBetterIndex = (fieldName: string, vals: Record<number, string | null>): number | null => {
        const productValues = products.map(p => vals[p.id]);
        if (productValues.every(v => !v || v === "—")) return null;
        const nums = productValues.map(v => {
          if (!v) return null;
          const match = v.replace(/,/g, "").match(/[\d]+(?:\.\d+)?/);
          return match ? parseFloat(match[0]) : null;
        });
        const validNums = nums.filter(n => n !== null);
        if (validNums.length < 2) return null;
        if (new Set(validNums).size === 1) return null;
        const lower = fieldName.toLowerCase();
        const isLowerBetter = lowerIsBetterKeywords.some(k => lower.includes(k));
        let bestIdx: number | null = null;
        let bestVal: number | null = null;
        for (let i = 0; i < products.length; i++) {
          const n = nums[i];
          if (n === null) continue;
          if (bestVal === null) { bestIdx = i; bestVal = n; continue; }
          if (isLowerBetter ? n < bestVal : n > bestVal) { bestIdx = i; bestVal = n; }
        }
        return bestIdx;
      };

      // Group fields by section for the new UI layout
      const groupedFields: { section: string; fields: typeof displayFields }[] = [];
      for (const field of displayFields) {
        let group = groupedFields.find((g) => g.section === field.section);
        if (!group) {
          group = { section: field.section, fields: [] };
          groupedFields.push(group);
        }
        group.fields.push(field);
      }

      return (
        <div key={msg.id} className="chat-element w-full max-w-full">
          <div className="w-full overflow-x-auto" style={{
            WebkitOverflowScrolling: "touch",
            paddingBottom: "4px",
          }}>
          <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200" style={{ minWidth: Math.max(560, 220 + products.length * 150) + "px" }}>
            <table className="w-full border-collapse text-xs text-left">
              <thead>
                <tr>
                  <th className="px-3 py-3 w-[100px]" style={{ backgroundColor: NAVY }}></th>
                  <th className="px-3 py-3 w-[120px]" style={{ backgroundColor: NAVY }}></th>
                  {products.map((p) => (
                    <th key={p.id} className="px-3 py-3 text-center text-white" style={{ backgroundColor: NAVY }}>
                      {p.brand} {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedFields.map((group) => (
                  <React.Fragment key={group.section}>
                    {group.fields.map((field, fIdx) => (
                      <tr 
                        key={`${field.section}-${field.name}`}
                        style={{ backgroundColor: fIdx % 2 === 0 ? "white" : "#F8FAFC", animationDelay: `${fIdx * 40}ms` }}
                        className="border-b border-gray-200 last:border-b-0 opacity-0 animate-fade-in-up"
                      >
                        {fIdx === 0 && (
                          <td 
                            rowSpan={group.fields.length}
                            className="px-3 py-2.5 font-bold uppercase align-top border-r border-gray-200"
                            style={{ color: "#D11A2A" }}
                          >
                            {group.section}
                          </td>
                        )}
                        <td className="px-3 py-2.5 font-semibold align-top border-r border-gray-200" style={{ color: NAVY }}>
                          {field.displayName}
                        </td>
                        {products.map((p, pIdx) => {
                          const winnerIdx = getBetterIndex(field.displayName, field.values);
                          const isWinner = winnerIdx === pIdx;
                          return (
                            <td
                              key={p.id}
                              className="px-3 py-2.5 text-center align-top border-r border-gray-200 last:border-r-0"
                              style={{
                                backgroundColor: isWinner ? "#F3E0D0" : undefined,
                                color: isWinner ? "#8A501C" : "#4B5563",
                                fontWeight: isWinner ? 600 : undefined,
                              }}
                            >
                              {field.values[p.id] || "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
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
                  disabled={btn.action === "compare" && selectedProductIds.length < 2}
                  className={`rounded-full px-5 py-2.5 text-sm font-medium text-white transition-colors ${
                    btn.action === "compare" && selectedProductIds.length < 2 ? "cursor-not-allowed opacity-50" : ""
                  }`}
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
          <div className="ai-bubble" style={{ color: NAVY }}>
            <p className="text-sm whitespace-pre-line">{msg.content}</p>
          </div>
        </div>
      );
    }

    return (
      <div key={msg.id} className="chat-element flex justify-end">
        <div className="user-bubble">
          <p className="text-sm">{msg.content}</p>
        </div>
      </div>
    );
  };

  return (
    <Layout fullHeight>
      <div className="flex flex-col w-full relative" style={{ height: "100%" }}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-6 pb-28">
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
