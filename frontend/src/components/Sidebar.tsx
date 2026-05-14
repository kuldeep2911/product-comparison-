import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MessageSquare, Trash2, LogOut, User } from "lucide-react";
import { useState } from "react";
import { getSessionsList, deleteSession, type SessionInfo } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const Sidebar = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  // Always enforce light mode
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  }, []);

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
    <div className="sidebar w-[250px] min-w-[250px] h-screen fixed left-0 top-0 flex flex-col py-6 px-4 z-50 overflow-hidden">
      
      {/* Logo */}
      <div className="flex items-center mb-8 px-1">
        <span style={{
          fontFamily: "Syne, sans-serif",
          fontWeight: 800,
          fontSize: "1.1rem",
          color: "white",
          letterSpacing: "-0.02em",
        }}>
          Assist<span style={{ color: "var(--accent)" }}>me</span>
        </span>
      </div>

      {/* New chat button */}
      <button
        onClick={() => { navigate("/"); setTimeout(() => window.location.reload(), 50); }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          background: "rgba(255,255,255,0.10)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: "12px",
          padding: "10px 16px",
          color: "white",
          fontSize: "0.875rem",
          fontWeight: 500,
          cursor: "pointer",
          marginBottom: "24px",
          width: "100%",
          flexShrink: 0,
          transition: "all 0.2s ease",
          fontFamily: "DM Sans, sans-serif",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = "rgba(59,107,255,0.25)";
          e.currentTarget.style.borderColor = "rgba(59,107,255,0.5)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "rgba(255,255,255,0.10)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
        }}
      >
        <Plus size={16} />
        New chat
      </button>

      {/* Session list */}
      <div className="flex flex-col gap-1 w-full overflow-y-auto flex-1 min-h-0">
        <p style={{
          color: "rgba(255,255,255,0.35)",
          fontSize: "0.6875rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          padding: "0 8px",
          marginBottom: "6px",
          fontFamily: "Syne, sans-serif",
        }}>
          Recent Chats
        </p>

        {sessions.length === 0 && (
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.8125rem", padding: "8px", fontFamily: "DM Sans, sans-serif" }}>
            No chats yet
          </p>
        )}

        {sessions.map(s => (
          <div key={s.session_id} className="group relative flex items-center justify-between w-full" style={{
            borderRadius: "10px",
            transition: "background 0.15s ease",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <button
              onClick={() => handleSessionClick(s)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                textAlign: "left",
                width: "100%",
                padding: "9px 10px",
                color: "rgba(255,255,255,0.65)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
              }}
            >
              <MessageSquare size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
              <span style={{ fontSize: "0.8125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: "24px" }}>
                {s.title || "New Chat"}
              </span>
            </button>
            <button
              onClick={(e) => handleDeleteSession(e, s.session_id)}
              style={{
                position: "absolute",
                right: "8px",
                opacity: 0,
                padding: "5px",
                color: "rgba(255,255,255,0.40)",
                background: "none",
                border: "none",
                cursor: "pointer",
                borderRadius: "6px",
                transition: "all 0.15s ease",
              }}
              className="group-hover:!opacity-100"
              onMouseEnter={e => {
                e.currentTarget.style.color = "#ff6b6b";
                e.currentTarget.style.background = "rgba(255,107,107,0.12)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = "rgba(255,255,255,0.40)";
                e.currentTarget.style.background = "none";
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* User info + logout — pinned bottom */}
      <div style={{
        marginTop: "12px",
        paddingTop: "14px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 6px 10px" }}>
          <div style={{
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--accent), #2952d9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <User size={13} color="white" />
          </div>
          <span style={{
            fontSize: "0.8125rem",
            color: "rgba(255,255,255,0.65)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "DM Sans, sans-serif",
          }}>
            {user?.username}
          </span>
        </div>

        <button
          onClick={handleLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            width: "100%",
            padding: "9px 10px",
            borderRadius: "10px",
            color: "rgba(255,255,255,0.45)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "0.8125rem",
            transition: "all 0.15s ease",
            fontFamily: "DM Sans, sans-serif",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = "#ff6b6b";
            e.currentTarget.style.background = "rgba(255,107,107,0.10)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "rgba(255,255,255,0.45)";
            e.currentTarget.style.background = "none";
          }}
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
