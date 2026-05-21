import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";

const buttons = [
  {
    label: "Comparison of specific products",
    path: "/scenario1",
    icon: "⚖️",
    desc: "Compare two or more devices side by side",
  },
  {
    label: "Getting Purchase advice",
    path: "/scenario2",
    icon: "💡",
    desc: "Tell me your needs, I'll find the perfect fit",
  },
  {
    label: "Comparing products in the same category",
    path: "/scenario3",
    icon: "📊",
    desc: "Browse and rank products within a category",
  },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <Layout>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        maxWidth: "600px",
        animation: "fadeSlideUp 500ms cubic-bezier(0.22,1,0.36,1) both",
      }}>
        {/* Greeting */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: "var(--bg-glass)",
          backdropFilter: "blur(12px)",
          border: "1px solid var(--border-glass)",
          borderRadius: "999px",
          padding: "6px 16px",
          marginBottom: "24px",
          fontSize: "0.8125rem",
          color: "var(--text-secondary)",
          fontFamily: "DM Sans, sans-serif",
        }}>
          <span style={{
            width: "7px", height: "7px", borderRadius: "50%",
            background: "var(--accent-2)", display: "inline-block",
            animation: "pulse-glow 2s infinite",
          }} />
          AI-Powered Product Intelligence
        </div>

        <h1 style={{
          fontFamily: "Syne, sans-serif",
          fontWeight: 800,
          fontSize: "clamp(2rem, 5vw, 3.2rem)",
          lineHeight: 1.1,
          color: "var(--text-primary)",
          marginBottom: "16px",
          letterSpacing: "-0.03em",
        }}>
          Hi, I'm{" "}
          <span style={{
            background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            Assistme
          </span>
          !
        </h1>

        <p style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: "1rem",
          color: "var(--text-secondary)",
          marginBottom: "40px",
          lineHeight: 1.6,
          maxWidth: "420px",
        }}>
          Your intelligent product comparison assistant. What would you like to explore today?
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
          {buttons.map((b, i) => (
            <button
              key={b.path}
              onClick={() => navigate(b.path)}
              className="glass"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                padding: "16px 22px",
                borderRadius: "16px",
                cursor: "pointer",
                textAlign: "left",
                border: "1px solid var(--border-glass)",
                background: "var(--bg-glass)",
                width: "100%",
                transition: "all 0.25s cubic-bezier(0.22,1,0.36,1)",
                animation: `fadeSlideUp 400ms cubic-bezier(0.22,1,0.36,1) ${100 + i * 80}ms both`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "var(--shadow-card), 0 8px 32px rgba(59,107,255,0.15)";
                e.currentTarget.style.borderColor = "rgba(59,107,255,0.30)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "var(--shadow-card)";
                e.currentTarget.style.borderColor = "var(--border-glass)";
              }}
            >
              <span style={{
                fontSize: "1.5rem",
                width: "44px",
                height: "44px",
                background: "linear-gradient(135deg, rgba(59,107,255,0.15), rgba(0,212,170,0.10))",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                {b.icon}
              </span>
              <div>
                <div style={{
                  fontFamily: "Syne, sans-serif",
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  color: "var(--text-primary)",
                  marginBottom: "2px",
                }}>
                  {b.label}
                </div>
                <div style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                }}>
                  {b.desc}
                </div>
              </div>
              <span style={{
                marginLeft: "auto",
                color: "var(--accent)",
                opacity: 0.6,
                fontSize: "1.1rem",
                flexShrink: 0,
              }}>→</span>
            </button>
          ))}
        </div>

        {/* Supported Data Info Banner */}
        <div style={{
          marginTop: "32px",
          padding: "12px 16px",
          background: "rgba(59, 107, 255, 0.05)",
          border: "1px solid rgba(59, 107, 255, 0.1)",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          textAlign: "left",
          width: "100%",
          animation: "fadeSlideUp 400ms cubic-bezier(0.22,1,0.36,1) 400ms both",
        }}>
          <span style={{ fontSize: "1.1rem", opacity: 0.8 }}>ℹ️</span>
          <p style={{
            margin: 0,
            fontFamily: "DM Sans, sans-serif",
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}>
            <strong>Currently Supported:</strong> We currently have data for mobiles, tablets, and watches from <strong>Apple, Samsung, Xiaomi, and Oppo</strong> only.
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Index;
