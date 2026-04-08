const DecorativeCircles = () => (
  <svg
    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 pointer-events-none z-0"
    width="400"
    height="400"
    viewBox="0 0 400 400"
    fill="none"
  >
    {[160, 130, 100, 70, 40].map((r, i) => (
      <circle key={i} cx="200" cy="200" r={r} stroke="white" strokeWidth="1.5" opacity="0.2" />
    ))}
  </svg>
);

export default DecorativeCircles;
