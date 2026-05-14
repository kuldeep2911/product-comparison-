import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MessageSquare, Trash2, LogOut, User } from "lucide-react";
import { getSessionsList, deleteSession, type SessionInfo } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const Sidebar = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    if (user) {
      getSessionsList().then(setSessions).catch(console.error);
    }
  }, [user]);

  const handleSessionClick = (session: SessionInfo) => {
    let path = "/scenario1";
    if (session.mode === "purchase_advice") path = "/scenario2";
    if (session.mode === "category_compare") path = "/scenario3";
    navigate(`${path}?session=${session.session_id}`);
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
      if (urlParams.get("session") === sessionId) {
        navigate("/");
        setTimeout(() => window.location.reload(), 50);
      }
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/auth");
  };

  return (
    <div
      className="sidebar w-[250px] min-w-[250px] h-screen fixed left-0 top-0 flex flex-col py-8 px-4 z-50 overflow-hidden"
      style={{ backgroundColor: "#1a2744" }}
    >
      {/* Logo */}
      <div className="flex items-center justify-center mb-8">
        <span className="text-white text-xl font-bold">Assistme</span>
      </div>

      {/* New chat button */}
      <button
        onClick={() => { navigate("/"); setTimeout(() => window.location.reload(), 50); }}
        className="flex items-center justify-center gap-2 bg-white rounded-xl px-5 py-2.5 font-medium transition-colors hover:bg-gray-100 mb-8 w-full"
        style={{ color: "#1a2744", flexShrink: 0 }}
      >
        <Plus size={18} />
        New chat
      </button>

      {/* Session list */}
      <div className="flex flex-col gap-2 w-full overflow-y-auto flex-1 min-h-0">
        <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 px-2">
          Recent Chats
        </h3>
        {sessions.map(s => (
          <div
            key={s.session_id}
            className="group relative flex items-center justify-between w-full rounded-lg hover:bg-white/10 transition-colors"
          >
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

      {/* User info + Logout — pinned to bottom */}
      <div className="mt-4 pt-4 border-t border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center">
            <User size={14} className="text-blue-300" />
          </div>
          <span className="text-sm text-white/70 truncate">{user?.username}</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all text-sm"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
