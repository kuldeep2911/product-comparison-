import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [inputActive, setInputActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentProductIds, setCurrentProductIds] = useState<number[]>([]);
  const [currentProductNames, setCurrentProductNames] = useState<string[]>([]);
  // Replace mode: tracks which product is being swapped + the remaining ones
  const [replaceMode, setReplaceMode] = useState<{ replacing: string; remaining: string[] } | null>(null);
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
        addMessages([{ id: nextId(), role: "ai", content: "Which products would you like to compare? Enter at least 2 product names (e.g., 'compare iPhone 16 and Galaxy S25')." }]);
      } catch {
        addMessages([{ id: nextId(), role: "ai", content: "Which products would you like to compare? Enter at least 2 product names." }]);
      }
      setInputActive(true);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setCurrentProductIds([]);
        setCurrentProductNames([]);
        setReplaceMode(null);
      } catch { }
      addMessages([{ id: nextId(), role: "ai", content: "Sure! Which products would you like to compare now?" }]);
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
          <div className="bg-white rounded-2xl px-5 py-3 shadow-sm flex items-center gap-2" style={{ color: "#1a2744" }}>
            <Loader2 className="animate-spin" size={16} />
            <span className="text-sm">Thinking...</span>
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

      // Show up to 15 key fields by default unless expanded
      const isExpanded = !!expandedTables[msg.id];
      const displayFields = isExpanded ? allFields : allFields.slice(0, 15);

      return (
        <div key={msg.id} className="chat-element w-full overflow-x-auto">
          <div className="bg-white rounded-xl overflow-hidden shadow-sm min-w-[400px]">
            <div className="grid" style={{ gridTemplateColumns: `160px repeat(${products.length}, 1fr)` }}>
              <div className="px-3 py-3" style={{ backgroundColor: "#1a2744" }} />
              {products.map((p) => (
                <div key={p.id} className="px-3 py-3 text-center" style={{ backgroundColor: "#1a2744" }}>
                  <span className="text-white text-xs font-semibold">{p.brand} {p.name}</span>
                </div>
              ))}
            </div>
            {displayFields.map((field, rowIdx) => (
              <div
                key={`${field.section}-${field.name}`}
                className="grid"
                style={{
                  gridTemplateColumns: `160px repeat(${products.length}, 1fr)`,
                  backgroundColor: rowIdx % 2 === 0 ? "white" : "#F0F4FF",
                }}
              >
                <div className="px-3 py-2.5 text-xs font-semibold" style={{ color: "#1a2744" }}>
                  {field.displayName}
                </div>
                {products.map((p) => (
                  <div key={p.id} className="px-3 py-2.5 text-xs text-center text-gray-600">
                    {field.values[p.id] || "—"}
                  </div>
                ))}
              </div>
            ))}
            {allFields.length > 15 && (
              <button
                onClick={() => toggleTable(msg.id)}
                className="w-full px-3 py-3 text-xs text-center font-medium hover:bg-gray-100 transition-colors"
                style={{ color: "#1a2744", borderTop: "1px solid #E5E7EB" }}
              >
                {isExpanded ? "Show less" : `Show all ${allFields.length} specifications`}
              </button>
            )}
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
              style={{ backgroundColor: "#1a2744" }}
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
          <div className="bg-white rounded-2xl px-5 py-3 max-w-lg shadow-sm" style={{ color: "#1a2744" }}>
            <p className="text-sm whitespace-pre-line">{msg.content}</p>
          </div>
        </div>
      );
    }

    return (
      <div key={msg.id} className="chat-element flex justify-end">
        <div className="rounded-2xl px-5 py-3 max-w-sm text-white" style={{ backgroundColor: "#1a2744" }}>
          <p className="text-sm">{msg.content}</p>
        </div>
      </div>
    );
  };

  return (
    <Layout fullHeight>
      <div className="flex flex-col h-screen w-full relative">
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 pt-6 pb-28">
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
              placeholder={replaceMode ? `Type the name of the phone to replace ${replaceMode.replacing}...` : inputActive ? "Type product names to compare..." : loading ? "Processing..." : "Select an option above"}
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
              style={inputActive && inputValue.trim() && !loading ? { backgroundColor: "#1a2744" } : undefined}
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <ArrowUp size={18} />}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Scenario1;
