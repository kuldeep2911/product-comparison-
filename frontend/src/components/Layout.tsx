import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import DecorativeCircles from "./DecorativeCircles";

const Layout = () => {
  const location = useLocation();
  const fullHeight = location.pathname !== "/"; // Index page is centered, others are full height

  return (
    <div className="layout-root page-bg" style={{ backgroundColor: "var(--bg-primary)" }}>
      <Sidebar />
      <div className="main-content layout-content flex-1 relative overflow-hidden">
        <DecorativeCircles />
        <div className={`relative z-10 ${fullHeight ? "h-full" : "layout-center px-4 md:px-8"}`}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
