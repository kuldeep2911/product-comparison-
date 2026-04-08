import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";

const buttons = [
  { label: "Comparison of specific products", path: "/scenario1" },
  { label: "Getting Purchase advice", path: "/scenario2" },
  { label: "Comparing products in the same category", path: "/scenario3" },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="flex flex-col items-center text-center max-w-2xl">
        <h1 className="text-4xl md:text-5xl font-bold mb-6" style={{ color: "var(--navy)" }}>
          Hi, I'm your assistant, Assistme!
        </h1>
        <div className="bg-white rounded-full px-8 py-3 mb-8 shadow-sm">
          <span className="text-muted-foreground text-lg">What do you need help with?</span>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {buttons.map((b) => (
            <button
              key={b.path}
              onClick={() => navigate(b.path)}
              className="rounded-full px-6 py-3 text-white font-medium transition-colors hover:opacity-90"
              style={{ backgroundColor: "var(--navy)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2a3a5c")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--navy)")}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default Index;
