import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./Reports.css";

function Reports() {
  const [sales, setSales] = useState([]);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        id,
        sale_date,
        total,
        payment_method,
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
      console.error("Error obteniendo datos:", error);
      setError("No se pudieron cargar los reportes.");
    } else {
      setSales(data || []);
    }

    setLoading(false);
  };

  const getStartDate = () => {
    const now = new Date();

    if (period === "today") {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    if (period === "week") {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      return date;
    }

    if (period === "month") {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return null;
  };

  const startDate = getStartDate();

  const filteredSales = sales.filter((sale) => {
    if (!startDate) {
      return true;
    }

    return new Date(sale.sale_date) >= startDate;
  });

  const totalSales = filteredSales.reduce(
    (total, sale) => total + Number(sale.total || 0),
    0,
  );

  const totalUnits = filteredSales.reduce(
    (total, sale) =>
      total +
      sale.sale_items.reduce(
        (items, item) => items + Number(item.quantity || 0),
        0,
      ),
    0,
  );

  const totalCost = filteredSales.reduce(
    (total, sale) =>
      total +
      sale.sale_items.reduce(
        (cost, item) =>
          cost + Number(item.unit_cost || 0) * Number(item.quantity || 0),
        0,
      ),
    0,
  );

  const profit = totalSales - totalCost;

  const productSales = {};

  filteredSales.forEach((sale) => {
    sale.sale_items.forEach((item) => {
      const product = item.product_variants?.products;

      if (!product) {
        return;
      }

      if (!productSales[product.id]) {
        productSales[product.id] = {
          name: product.name,
          sku: product.sku,
          quantity: 0,
          revenue: 0,
        };
      }

      productSales[product.id].quantity += Number(item.quantity || 0);

      productSales[product.id].revenue += Number(item.subtotal || 0);
    });
  });

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  if (loading) {
    return (
      <div className="reports-page">
        <div className="loading">Cargando reportes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="reports-page">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div>
          <h1>Reportes</h1>
          <p>Consulta el rendimiento de tus ventas.</p>
        </div>

        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="period-select"
        >
          <option value="today">Hoy</option>
          <option value="week">Últimos 7 días</option>
          <option value="month">Este mes</option>
          <option value="all">Todo</option>
        </select>
      </div>

      <div className="reports-summary">
        <div className="report-card">
          <span>Total vendido</span>
          <strong>${totalSales.toFixed(2)}</strong>
        </div>

        <div className="report-card">
          <span>Total invertido</span>
          <strong>${totalCost.toFixed(2)}</strong>
        </div>

        <div className="report-card">
          <span>Ganancia</span>
          <strong>${profit.toFixed(2)}</strong>
        </div>

        <div className="report-card">
          <span>Unidades vendidas</span>
          <strong>{totalUnits}</strong>
        </div>

        <div className="report-card">
          <span>Ventas realizadas</span>
          <strong>{filteredSales.length}</strong>
        </div>
      </div>

      <div className="reports-section">
        <div className="section-header">
          <div>
            <h2>Productos más vendidos</h2>
            <p>Las pijamas con mayor cantidad de unidades vendidas.</p>
          </div>
        </div>

        {topProducts.length === 0 ? (
          <div className="empty-report">No hay ventas en este periodo.</div>
        ) : (
          <div className="top-products">
            {topProducts.map((product, index) => (
              <div className="top-product" key={product.sku}>
                <div className="product-position">#{index + 1}</div>

                <div className="product-report-info">
                  <strong>{product.name}</strong>

                  <span>{product.sku}</span>
                </div>

                <div className="product-report-sales">
                  <strong>{product.quantity}</strong>

                  <span>unidades</span>
                </div>

                <div className="product-report-revenue">
                  ${product.revenue.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="reports-section">
        <div className="section-header">
          <div>
            <h2>Resumen de ventas</h2>
            <p>Historial de ventas del periodo seleccionado.</p>
          </div>
        </div>

        <div className="report-sales-list">
          {filteredSales.length === 0 ? (
            <div className="empty-report">No hay ventas en este periodo.</div>
          ) : (
            filteredSales.map((sale) => (
              <div className="report-sale-row" key={sale.id}>
                <div>
                  <strong>
                    {new Date(sale.sale_date).toLocaleDateString("es-MX")}
                  </strong>

                  <span>{sale.payment_method}</span>
                </div>

                <strong>${Number(sale.total).toFixed(2)}</strong>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default Reports;
