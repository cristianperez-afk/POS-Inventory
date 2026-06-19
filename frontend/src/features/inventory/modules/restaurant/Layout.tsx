import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { LayoutDashboard, Apple, FileText, ShoppingCart, ClipboardCheck, Users, PlusCircle, LogOut, Package, ChefHat, ArrowLeftRight, MapPin, Shield, User, Boxes, ReceiptText } from "lucide-react";
import logoImage from "../../imports/ims-logo.png";
import { useState, useEffect } from "react";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState<string>("staff");
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    const role = localStorage.getItem("userRole") || "staff";
    const email = localStorage.getItem("userEmail") || "user@bukolabs.io";
    setUserRole(role);
    setUserEmail(email);
  }, []);

  const allNavItems = [
    { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ["admin", "staff"] },
    { path: "/stock-control", icon: Package, label: "Stock Control & Alerts", roles: ["admin", "staff"] },
    { path: "/inventory", icon: Apple, label: "Food Inventory", roles: ["admin", "staff"] },
    { path: "/add-product", icon: PlusCircle, label: "Add Food Item", roles: ["admin", "staff"] },
    { path: "/purchase-orders", icon: ShoppingCart, label: "Purchase Orders", roles: ["admin", "staff"] },
    { path: "/goods-received", icon: ClipboardCheck, label: "Goods Received", roles: ["admin", "staff"] },
    { path: "/pos-kitchen-orders", icon: ReceiptText, label: "POS / Kitchen Orders", roles: ["admin", "staff"] },
    { path: "/recipe-bom", icon: ChefHat, label: "Recipe & BOM", roles: ["admin", "staff"] },
    { path: "/transfers", icon: ArrowLeftRight, label: "Transfers & Adjustments", roles: ["admin", "staff"] },
    { path: "/multi-location", icon: MapPin, label: "Multi-Location", roles: ["admin", "staff"] },
    { path: "/reports", icon: FileText, label: "Reports", roles: ["admin", "staff"] },
    { path: "/product-management", icon: Boxes, label: "Product Management", roles: ["admin"] },
    { path: "/users", icon: Users, label: "User Management", roles: ["admin"] },
  ];

  // Filter navigation items based on user role
  const navItems = allNavItems.filter(item => item.roles.includes(userRole));

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userEmail");
    navigate("/");
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col shadow-xl border-r border-sidebar-border">
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-white shadow-lg flex-shrink-0">
              <img src={logoImage} alt="Bukolabs.io Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Bukolabs.io</h1>
              <p className="text-xs text-sidebar-foreground/70">Restaurant</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                  ${isActive
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-4 py-3 bg-sidebar-accent rounded-xl mb-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm`} style={{ background: userRole === "admin" ? "linear-gradient(to bottom right, #009BA5, #00A7A5)" : "linear-gradient(to bottom right, #007A5E, #008967)" }}>
              {userRole === "admin" ? <Shield className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium">{userRole === "admin" ? "Admin User" : "Staff User"}</p>
                <span className={`px-2 py-0.5 rounded text-xs font-medium`} style={{ backgroundColor: userRole === "admin" ? "#E0F7F7" : "#D1F2E8", color: userRole === "admin" ? "#005656" : "#007A5E" }}>
                  {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                </span>
              </div>
              <p className="text-xs text-sidebar-foreground/70">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <Outlet />
      </main>
    </div>
  );
}
