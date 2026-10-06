import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Login from "./pages/Login";
import Inventory from "./pages/Inventory";
import Sales from "./pages/Sales";
import Reports from "./pages/Reports";
import Credits from "./pages/Credits";

import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./layouts/AppLayout";

function App() {
  return (
    <BrowserRouter>

      <Routes>

        {/* LOGIN */}

        <Route
          path="/login"
          element={<Login />}
        />

        {/* APP PROTEGIDA */}

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >

          <Route
            path="/"
            element={
              <Navigate
                to="/inventory"
                replace
              />
            }
          />

          <Route
            path="/inventory"
            element={<Inventory />}
          />

          <Route
            path="/sales"
            element={<Sales />}
          />

          <Route
            path="/sales/reports"
            element={<Reports />}
          />

          <Route
            path="/credits"
            element={<Credits />}
          />

        </Route>

        {/* CUALQUIER RUTA DESCONOCIDA */}

        <Route
          path="*"
          element={
            <Navigate
              to="/inventory"
              replace
            />
          }
        />

      </Routes>

    </BrowserRouter>
  );
}

export default App;