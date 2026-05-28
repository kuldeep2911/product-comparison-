const DecorativeCircles = () => (
  <div className="absolute right-0 top-0 bottom-0 pointer-events-none z-0 overflow-hidden">
    {/* Ambient glow blob top-right */}
    <div style={{
      position: "absolute",
      top: "-80px",
      right: "-80px",
      width: "420px",
      height: "420px",
      borderRadius: "50%",
      background: "radial-gradient(circle, rgba(184,115,51,0.10) 0%, transparent 70%)",
      filter: "blur(2px)",
    }} />

    {/* Ambient glow blob bottom */}
    <div style={{
      position: "absolute",
      bottom: "-60px",
      right: "120px",
      width: "300px",
      height: "300px",
      borderRadius: "50%",
      background: "radial-gradient(circle, rgba(0,212,170,0.07) 0%, transparent 70%)",
      filter: "blur(2px)",
    }} />

    {/* Subtle concentric rings */}
    <svg
      style={{ position: "absolute", right: "-60px", top: "50%", transform: "translateY(-50%)" }}
      width="380"
      height="380"
      viewBox="0 0 380 380"
      fill="none"
    >
      {[150, 120, 90, 60, 30].map((r, i) => (
        <circle
          key={i}
          cx="190"
          cy="190"
          r={r}
          stroke="var(--accent)"
          strokeWidth="1"
          opacity={0.04 + i * 0.015}
        />
      ))}
    </svg>
  </div>
);

export default DecorativeCircles;
