import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import logo from "../assets/logo.png";

function Sidebar({ isOpen, onClose }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        {/* ENCABEZADO */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src={logo} alt="Mantita Apapacho" />
          </div>

          <div>
            <h2>Mantita Apapacho</h2>
            <span>Gestión de negocio</span>
          </div>
        </div>

        {/* NAVEGACIÓN */}
        <nav className="sidebar-nav">
          <NavLink
            to="/inventory"
            onClick={onClose}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            <span>📦</span>
            Inventario
          </NavLink>

          <NavLink
            to="/sales"
            onClick={onClose}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            <span>🛍️</span>
            Ventas
          </NavLink>

          <NavLink
            to="/sales/reports"
            onClick={onClose}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            <span>📊</span>
            Reportes
          </NavLink>

          <NavLink
            to="/credits"
            onClick={onClose}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            <span>💳</span>
            Créditos
          </NavLink>
        </nav>

        {/* CERRAR SESIÓN */}
        <div className="sidebar-bottom">
          <button className="logout-button" onClick={handleLogout}>
            <span>🚪</span>
            Salir
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
