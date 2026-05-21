import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import DecorativeCircles from "./DecorativeCircles";

const Layout = ({ children, fullHeight = false }: { children: ReactNode; fullHeight?: boolean }) => (
  <div className="layout-root page-bg" style={{ backgroundColor: "var(--bg-primary)" }}>
    <Sidebar />
    <div className="main-content layout-content flex-1 relative overflow-hidden">
      <DecorativeCircles />
      <div className={`relative z-10 ${fullHeight ? "h-full" : "layout-center px-4 md:px-8"}`}>
        {children}
      </div>
    </div>
  </div>
);

export default Layout;
