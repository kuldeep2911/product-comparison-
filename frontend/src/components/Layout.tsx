import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import DecorativeCircles from "./DecorativeCircles";

const Layout = ({ children, fullHeight = false }: { children: ReactNode; fullHeight?: boolean }) => (
  <div className="flex h-screen" style={{ background: "linear-gradient(180deg, var(--gradient-from), var(--gradient-to))" }}>
    <Sidebar />
    <div className="main-content ml-[250px] flex-1 relative overflow-hidden">
      <DecorativeCircles />
      <div className={`relative z-10 ${fullHeight ? "h-full" : "flex items-center justify-center min-h-screen px-8"}`}>
        {children}
      </div>
    </div>
  </div>
);

export default Layout;
