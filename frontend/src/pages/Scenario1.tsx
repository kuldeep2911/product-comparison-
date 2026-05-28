import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowUp, Loader2 } from "lucide-react";
import { startSession, sendMessage, getHistory, type ChatMessageResponse, type ComparisonTable } from "@/lib/api";

type MessageRole = "ai" | "user";

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  type?: "text" | "comparison-table" | "action-buttons" | "error" | "loading";
  tableData?: ComparisonTable;
  actionButtons?: { label: string; action: string }[];
  productIds?: number[];
}

let msgId = 0;
const nextId = () => `s1-msg-${++msgId}`;

const Scenario1 = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [inputActive, setInputActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentProductIds, setCurrentProductIds] = useState<number[]>([]);
  const [currentProductNames, setCurrentProductNames] = useState<string[]>([]);
  // Replace mode: tracks which product is being swapped + the remaining ones
  const [replaceMode, setReplaceMode] = useState<{ replacing: string; remaining: string[] } | null>(null);
  // Add mode: tracks the current ones so a new one can be added
  const [addMode, setAddMode] = useState<{ remaining: string[] } | null>(null);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const toggleTable = (id: string) => {
    setExpandedTables(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const addMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...msgs]);
  }, []);

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Initialize session
  useEffect(() => {
    const init = async () => {
      setMessages([]);
      setSessionId(null);
      setCurrentProductIds([]);
      setCurrentProductNames([]);
      setReplaceMode(null);
      setAddMode(null);
      setInputActive(false);

      const urlParams = new URLSearchParams(location.search);
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
                comparison_table: m.metadata?.comparison_table as any,
                recommendations: m.metadata?.recommendations as any,
                product_ids: m.metadata?.product_ids as any,
              };
              // Note: processApiResponse might return multiple messages per AI turn
              loadedMsgs = [...loadedMsgs, ...processApiResponse(mockResponse)];
            }
          }
          addMessages(loadedMsgs);
          setInputActive(true);
          return; // Skip new session flow
        } catch (err) {
          console.error("Failed to load history", err);
          // Fall through to normal session start if history fetch fails
        }
      }

      await delay(300);
      addMessages([{ id: nextId(), role: "ai", content: "Hi, I'm your assistant, Assistme!" }]);
      await delay(600);
      addMessages([{ id: nextId(), role: "user", content: "Comparison of specific products" }]);
      await delay(600);

      try {
        const session = await startSession("compare_specific");
        setSessionId(session.session_id);
        window.dispatchEvent(new Event("sessionCreated"));
        addMessages([{ id: nextId(), role: "ai", content: "Which products would you like to compare? Enter at least 2 product names (e.g., 'compare iPhone 16 and Galaxy S25')." }]);
      } catch {
        addMessages([{ id: nextId(), role: "ai", content: "Which products would you like to compare? Enter at least 2 product names." }]);
      }
      setInputActive(true);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const processApiResponse = (response: ChatMessageResponse) => {
    const newMessages: ChatMessage[] = [];

    // AI text response
    if (response.content) {
      newMessages.push({ id: nextId(), role: "ai", content: response.content });
    }

    // Comparison table
    if (response.comparison_table) {
      newMessages.push({
        id: nextId(), role: "ai", content: "",
        type: "comparison-table",
        tableData: response.comparison_table,
        productIds: response.product_ids,
      });

      // Action buttons
      const productNames = response.comparison_table.products.map(p => `${p.brand} ${p.name}`);
      const buttons = [
        ...productNames.map((p) => ({ label: `Replace ${p}`, action: `replace-${p}` })),
        ...(productNames.length < 4 ? [{ label: "Add another product", action: "add-product" }] : []),
        { label: "Ask a follow-up question", action: "follow-up" },
        { label: "New comparison", action: "new" },
      ];
      newMessages.push({ id: nextId(), role: "ai", content: "", type: "action-buttons", actionButtons: buttons });

      if (response.product_ids) {
        setCurrentProductIds(response.product_ids);
      }
      // Also store product names for replace-mode message construction
      setCurrentProductNames(productNames);
    }

    // Recommendations (if any)
    if (response.recommendations && response.recommendations.length > 0 && !response.comparison_table) {
      const recText = response.recommendations
        .map((r, i) => `${i + 1}. **${r.brand} ${r.name}** (Score: ${r.score.toFixed(2)})`)
        .join("\n");
      newMessages.push({ id: nextId(), role: "ai", content: recText });
    }

    return newMessages;
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !inputActive || !sessionId) return;
    const rawText = inputValue.trim();
    setInputValue("");
    setInputActive(false);
    setLoading(true);

    // If in replace mode, build a full comparison message so the backend
    // always receives 2+ product names (root fix for 'only 1 product found' bug)
    let sendText = rawText;
    let displayText = rawText;
    if (replaceMode) {
      const remaining = replaceMode.remaining;
      const allProducts = [rawText, ...remaining];
      sendText = `Compare ${allProducts.join(" and ")}`;
      displayText = rawText; // Show just the new name to the user
      setReplaceMode(null);
    } else if (addMode) {
      const remaining = addMode.remaining;
      const allProducts = [...remaining, rawText];
      sendText = `Compare ${allProducts.join(" and ")}`;
      displayText = rawText; // Show just the new name to the user
      setAddMode(null);
    }

    addMessages([{ id: nextId(), role: "user", content: displayText }]);
    addMessages([{ id: nextId(), role: "ai", content: "", type: "loading" }]);

    try {
      const response = await sendMessage(sessionId, sendText);
      // Remove loading message and add real response
      setMessages(prev => prev.filter(m => m.type !== "loading"));
      const responseMessages = processApiResponse(response);
      addMessages(responseMessages);
    } catch (err) {
      setMessages(prev => prev.filter(m => m.type !== "loading"));
      addMessages([{
        id: nextId(), role: "ai",
        content: "Sorry, I encountered an error processing your request. Please try again.",
        type: "error",
      }]);
    }

    setLoading(false);
    setInputActive(true);
  };

  const handleActionButton = async (action: string) => {
    if (action === "follow-up") {
      addMessages([{ id: nextId(), role: "user", content: "I'd like to ask a follow-up question" }]);
      await delay(300);
      addMessages([{ id: nextId(), role: "ai", content: "Go ahead! Ask about any specific spec — battery, camera, display, performance, or anything else about the compared products." }]);
      setInputActive(true);
    } else if (action === "new") {
      addMessages([{ id: nextId(), role: "user", content: "Start a new comparison" }]);
      await delay(300);
      try {
        const session = await startSession("compare_specific");
        setSessionId(session.session_id);
        window.dispatchEvent(new Event("sessionCreated"));
        setCurrentProductIds([]);
        setCurrentProductNames([]);
        setReplaceMode(null);
        setAddMode(null);
      } catch { }
      addMessages([{ id: nextId(), role: "ai", content: "Sure! Which products would you like to compare now?" }]);
      setInputActive(true);
    } else if (action === "add-product") {
      setAddMode({ remaining: currentProductNames });
      addMessages([{ id: nextId(), role: "user", content: "Add another product to compare" }]);
      await delay(300);
      addMessages([{ id: nextId(), role: "ai", content: "Which product would you like to add to this comparison? Type its name below." }]);
      setInputActive(true);
    } else if (action.startsWith("replace-")) {
      const productName = action.replace("replace-", "");
      // Remaining = all current product names except the one being replaced
      const remaining = currentProductNames.filter(n => n !== productName);
      setReplaceMode({ replacing: productName, remaining });
      addMessages([{ id: nextId(), role: "user", content: `Replace ${productName}` }]);
      await delay(300);
      addMessages([{ id: nextId(), role: "ai", content: `Which product should replace ${productName}? Just type the new product name.` }]);
      setInputActive(true);
    }
  };

  /* ── Render helpers ── */
  const renderMessage = (msg: ChatMessage) => {
    if (msg.type === "loading") {
      return (
        <div key={msg.id} className="chat-element flex justify-start">
          <div className="ai-bubble flex items-center gap-2" style={{ color: "#2D3748" }}>
            <Loader2 className="animate-spin" size={16} />
            <span className="text-sm">Thinking...</span>
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
      const { products, sections } = msg.tableData;
      // Flatten sections into a feature list for table display
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

      // Important feature keywords to show by default
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
      // Fallback: if filter yields nothing meaningful, show first 8
      const defaultFields = importantFields.length > 0 ? importantFields : allFields.slice(0, 8);

      const isExpanded = !!expandedTables[msg.id];
      const displayFields = isExpanded ? allFields : defaultFields;

      // Helper: determine which product has the better spec value
      const lowerIsBetterKeywords = [
        "price", "weight", "thickness", "nm", "power", "draw", "dischar"
      ];
      const getBetterIndex = (fieldName: string, vals: Record<number, string | null>): number | null => {
        const productValues = products.map(p => vals[p.id]);
        if (productValues.every(v => !v || v === "—")) return null;
        // Extract the first numeric value from each cell
        const nums = productValues.map(v => {
          if (!v) return null;
          const match = v.replace(/,/g, "").match(/[\d]+(?:\.\d+)?/);
          return match ? parseFloat(match[0]) : null;
        });
        // Only compare if at least two have valid numbers
        const validNums = nums.filter(n => n !== null);
        if (validNums.length < 2) return null;
        // Check if all are the same
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
                  <th className="px-3 py-3 w-[100px]" style={{ backgroundColor: "#2D3748" }}></th>
                  <th className="px-3 py-3 w-[120px]" style={{ backgroundColor: "#2D3748" }}></th>
                  {products.map((p) => (
                    <th key={p.id} className="px-3 py-3 text-center text-white" style={{ backgroundColor: "#2D3748" }}>
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
                        <td className="px-3 py-2.5 font-semibold align-top border-r border-gray-200" style={{ color: "#2D3748" }}>
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
            
            {allFields.length > defaultFields.length && (
              <button
                onClick={() => toggleTable(msg.id)}
                className="w-full px-3 py-3 text-xs text-center font-medium hover:bg-gray-50 transition-colors"
                style={{ color: "#2D3748", borderTop: "1px solid #E5E7EB" }}
              >
                {isExpanded
                  ? "▲ Show important features only"
                  : `▼ Show all ${allFields.length} features`}
              </button>
            )}
          </div>
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
              style={{ backgroundColor: "#2D3748" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2a3a5c")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#1a2744")}
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
          <div className="ai-bubble" style={{ color: "#2D3748" }}>
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
    <>
      <div className="flex flex-col w-full relative" style={{ height: "100%" }}>
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-6 pb-28">
          <div className="max-w-6xl mx-auto space-y-4">
            {messages.map(renderMessage)}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 z-10 pointer-events-none">
          <div className="max-w-6xl mx-auto flex items-center gap-2 pointer-events-auto">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={replaceMode ? `Type the name of the phone to replace ${replaceMode.replacing}...` : addMode ? "Type the name of the phone to add..." : inputActive ? "Type product names to compare..." : loading ? "Processing..." : "Select an option above"}
              disabled={!inputActive || loading}
              className={`flex-1 rounded-full px-5 py-3 text-sm outline-none border-none shadow-sm transition-colors ${inputActive && !loading ? "bg-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              style={{ color: inputActive ? "#1a2744" : undefined }}
            />
            <button
              onClick={handleSend}
              disabled={!inputActive || !inputValue.trim() || loading}
              className={`rounded-full p-3 transition-colors ${inputActive && inputValue.trim() && !loading ? "text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              style={inputActive && inputValue.trim() && !loading ? { backgroundColor: "#2D3748" } : undefined}
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <ArrowUp size={18} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Scenario1;
