import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import { startSession, sendMessage, getHistory, type ChatMessageResponse, type RecommendedProduct, type ComparisonTable } from "@/lib/api";

type MessageRole = "ai" | "user";

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  type?: "text" | "cards" | "action-buttons" | "error" | "loading" | "comparison-table";
  cards?: RecommendedProduct[];
  actionButtons?: { label: string; action: string }[];
  tableData?: ComparisonTable;
  productIds?: number[];
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
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const addMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...msgs]);
  }, []);

  const toggleTable = (msgId: string) => {
    setExpandedTables(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

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

    // Comparison table (from "compare top picks")
    if (response.comparison_table) {
      newMessages.push({
        id: nextId(), role: "ai", content: "",
        type: "comparison-table",
        tableData: response.comparison_table,
        productIds: response.product_ids,
      });
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
        const responseMessages = processApiResponse(response);
        addMessages(responseMessages);
      } catch {
        setMessages(prev => prev.filter(m => m.type !== "loading"));
        addMessages([{
          id: nextId(), role: "ai",
          content: "Sorry, I couldn't build the comparison table. Please try again.",
          type: "error",
        }]);
      }
      setLoading(false);
      setInputActive(true);
    } else if (action === "new") {
      try {
        const session = await startSession("purchase_advice");
        setSessionId(session.session_id);
      } catch { }
      addMessages([{ id: nextId(), role: "user", content: "Start a new search" }]);
      await delay(300);
      addMessages([{ id: nextId(), role: "ai", content: "Sure! What are you looking for?" }]);
      setInputActive(true);
    }
  };

  /* ── Comparison table renderer (reused from Scenario1 logic) ── */
  const renderComparisonTable = (msg: ChatMessage) => {
    if (!msg.tableData) return null;
    const { products, sections } = msg.tableData;

    const allFields: { section: string; name: string; displayName: string; values: Record<number, string | null> }[] = [];
    for (const section of sections) {
      for (const field of section.fields) {
        allFields.push({
          section: section.name,
          displayName: field.display_name,
          name: field.name,
          values: field.values,
        });
      }
    }

    const importantKeywords = [
      "ram", "memory", "processor", "cpu", "chipset", "battery",
      "display", "screen", "resolution", "camera", "storage",
      "rom", "os", "operating system", "android", "ios",
      "charging", "refresh rate", "network", "5g", "price",
    ];
    const isImportant = (displayName: string) => {
      const lower = displayName.toLowerCase();
      return importantKeywords.some((kw) => lower.includes(kw));
    };
    const importantFields = allFields.filter((f) => isImportant(f.displayName));
    const defaultFields = importantFields.length > 0 ? importantFields : allFields.slice(0, 8);

    const isExpanded = !!expandedTables[msg.id];
    const displayFields = isExpanded ? allFields : defaultFields;

    const lowerIsBetterKeywords = ["price", "weight", "thickness"];
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
      <div key={msg.id} className="chat-element w-full overflow-x-auto">
        <div className="bg-white rounded-xl overflow-hidden shadow-sm min-w-[600px] border border-gray-200">
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
                      style={{ backgroundColor: fIdx % 2 === 0 ? "white" : "#F8FAFC" }}
                      className="border-b border-gray-200 last:border-b-0"
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
                              backgroundColor: isWinner ? "#dcfce7" : undefined,
                              color: isWinner ? "#166534" : "#4B5563",
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

          {allFields.length > defaultFields.length && (
            <button
              onClick={() => toggleTable(msg.id)}
              className="w-full px-3 py-3 text-xs text-center font-medium hover:bg-gray-50 transition-colors"
              style={{ color: NAVY, borderTop: "1px solid #E5E7EB" }}
            >
              {isExpanded
                ? "▲ Show important features only"
                : `▼ Show all ${allFields.length} features`}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderMessage = (msg: ChatMessage) => {
    if (msg.type === "loading") {
      return (
        <div key={msg.id} className="chat-element flex justify-start">
          <div className="ai-bubble flex items-center gap-2" style={{ color: NAVY }}>
            <Loader2 className="animate-spin" size={16} />
            <span className="text-sm">Finding the best products for you...</span>
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

    if (msg.type === "comparison-table" && msg.tableData) {
      return renderComparisonTable(msg);
    }

    if (msg.type === "cards" && msg.cards) {
      return (
        <div key={msg.id} className="chat-element w-full">
          {/* Top 10 card grid */}
          <div className="flex gap-3 flex-wrap">
            {msg.cards.slice(0, 10).map((card, i) => (
              <div key={card.id} className="bg-white rounded-xl w-full sm:w-[170px] overflow-hidden shadow-sm border border-gray-100">
                <div className="h-8 flex items-center justify-center text-white text-xs font-bold" style={{
                  backgroundColor: i < 3 ? NAVY : "#4B5563"
                }}>
                  #{i + 1}
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm mb-1" style={{ color: NAVY }}>{card.brand} {card.name}</p>
                  <p className="text-xs text-gray-500">Score: {card.score.toFixed(2)}</p>
                  {/* Score breakdown if details exist */}
                  {card.details && Object.keys(card.details).length > 0 && (
                    <div className="mt-2 border-t border-gray-100 pt-2 space-y-0.5">
                      {Object.entries(card.details).slice(0, 4).map(([key, detail]: [string, any]) => (
                        <div key={key} className="flex justify-between text-[10px]">
                          <span className="text-gray-400 capitalize">{key.replace(/_/g, " ")}</span>
                          <span className="font-medium" style={{ color: NAVY }}>{detail?.display_value ?? detail?.weighted_score?.toFixed(3) ?? "—"}</span>
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

export default Scenario2;
