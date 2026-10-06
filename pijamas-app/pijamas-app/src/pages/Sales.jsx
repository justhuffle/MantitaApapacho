import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./Sales.css";
import SaleForm from "../components/SaleForm";

function Sales() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSaleForm, setShowSaleForm] = useState(false);

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("sales")
      .select(
        `
        *,
        sale_items (
          id,
          quantity,
          unit_price,
          unit_cost,
          subtotal,
          product_variants (
            size,
            color,
            products (
              name,
              sku
            )
          )
        )
      `,
      )
      .order("sale_date", { ascending: false });

    if (error) {
      console.error("Error obteniendo ventas:", error);
      setError("No se pudieron cargar las ventas.");
    } else {
      setSales(data || []);
    }

    setLoading(false);
  };

  const totalSales = sales.reduce(
    (total, sale) => total + Number(sale.total || 0),
    0,
  );

  const totalUnits = sales.reduce(
    (total, sale) =>
      total +
      sale.sale_items.reduce(
        (items, item) => items + Number(item.quantity || 0),
        0,
      ),
    0,
  );

  const totalProfit = sales.reduce(
    (total, sale) =>
      total +
      sale.sale_items.reduce(
        (profit, item) =>
          profit +
          (Number(item.unit_price || 0) - Number(item.unit_cost || 0)) *
            Number(item.quantity || 0),
        0,
      ),
    0,
  );

  if (loading) {
    return (
      <div className="sales-page">
        <div className="loading">Cargando ventas...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sales-page">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="sales-page">
      <div className="sales-header">
        <div>
          <h1>Ventas</h1>
          <p>Registra y consulta las ventas de tus pijamas.</p>
        </div>

        <button className="add-button" onClick={() => setShowSaleForm(true)}>
          + Nueva venta
        </button>
      </div>

      <div className="sales-summary">
        <div className="summary-card">
          <span>Ventas</span>
          <strong>{sales.length}</strong>
        </div>

        <div className="summary-card">
          <span>Unidades vendidas</span>
          <strong>{totalUnits}</strong>
        </div>

        <div className="summary-card">
          <span>Total vendido</span>
          <strong>${totalSales.toFixed(2)}</strong>
        </div>

        <div className="summary-card">
          <span>Ganancia</span>
          <strong>${totalProfit.toFixed(2)}</strong>
        </div>
      </div>

      <div className="sales-table-container">
        <table className="sales-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Productos</th>
              <th>Método de pago</th>
              <th>Total</th>
            </tr>
          </thead>

          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty-sales">
                  Aún no tienes ventas registradas.
                </td>
              </tr>
            ) : (
              sales.map((sale) => (
                <tr key={sale.id}>
                  <td>
                    {new Date(sale.sale_date).toLocaleDateString("es-MX")}
                  </td>

                  <td>
                    {sale.sale_items.map((item) => {
                      const product = item.product_variants?.products;

                      const variant = item.product_variants;

                      return (
                        <div key={item.id} className="sale-product">
                          <strong>{product?.name || "Producto"}</strong>

                          <span>
                            {product?.sku} · {variant?.size} · {variant?.color}{" "}
                            × {item.quantity}
                          </span>
                        </div>
                      );
                    })}
                  </td>

                  <td>{sale.payment_method}</td>

                  <td>
                    <strong>${Number(sale.total).toFixed(2)}</strong>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showSaleForm && (
        <SaleForm
          onClose={() => setShowSaleForm(false)}
          onSaleCreated={fetchSales}
        />
      )}
    </div>
  );
}

export default Sales;
