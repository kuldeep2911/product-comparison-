import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { getSessionsList, deleteSession, type SessionInfo } from "@/lib/api";

const Sidebar = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    getSessionsList().then(setSessions).catch(console.error);
  }, []);

  const handleSessionClick = (session: SessionInfo) => {
    // Navigate based on mode
    let path = "/scenario1";
    if (session.mode === "purchase_advice") path = "/scenario2";
    if (session.mode === "category_compare") path = "/scenario3";
    
    navigate(`${path}?session=${session.session_id}`);
    
    // Quick hack to force reload if already on the same path
    if (window.location.pathname === path) {
      setTimeout(() => window.location.reload(), 50);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));
      
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('session') === sessionId) {
        navigate("/");
        setTimeout(() => window.location.reload(), 50);
      }
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  return (
    <div
      className="sidebar w-[250px] min-w-[250px] h-screen fixed left-0 top-0 flex flex-col py-8 px-4 z-50 overflow-y-auto"
      style={{ backgroundColor: "#1a2744" }}
    >
      <div className="flex items-center justify-center mb-8">
        <span className="text-white text-xl font-bold">Assistme</span>
      </div>
      
      <button
        onClick={() => {
          navigate("/");
          setTimeout(() => window.location.reload(), 50);
        }}
        className="flex items-center justify-center gap-2 bg-white rounded-xl px-5 py-2.5 font-medium transition-colors hover:bg-gray-100 mb-8 w-full"
        style={{ color: "#1a2744", flexShrink: 0 }}
      >
        <Plus size={18} />
        New chat
      </button>

      <div className="flex flex-col gap-2 w-full overflow-y-auto">
        <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 px-2">Recent Chats</h3>
        {sessions.map(s => (
          <div key={s.session_id} className="group relative flex items-center justify-between w-full rounded-lg hover:bg-white/10 transition-colors">
            <button
              onClick={() => handleSessionClick(s)}
              className="flex items-center gap-3 text-left w-full px-3 py-2.5 text-gray-300"
            >
              <MessageSquare size={16} className="shrink-0" />
              <span className="text-sm truncate pr-6">{s.title || "New Chat"}</span>
            </button>
            <button
              onClick={(e) => handleDeleteSession(e, s.session_id)}
              className="absolute right-2 opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-400 hover:bg-white/10 rounded-md transition-all"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
