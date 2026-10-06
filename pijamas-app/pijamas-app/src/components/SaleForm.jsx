import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./SaleForm.css";

function SaleForm({ onClose, onSaleCreated }) {
  const [variants, setVariants] = useState([]);
  const [items, setItems] = useState([
    {
      product_variant_id: "",
      quantity: 1,
    },
  ]);

  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [notes, setNotes] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [creditNotes, setCreditNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchVariants();
  }, []);

  const fetchVariants = async () => {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("product_variants")
      .select(
        `
        id,
        size,
        color,
        stock,
        minimum_stock,
        products (
          id,
          name,
          sku,
          cost,
          sale_price
        )
      `,
      )
      .order("id");

    if (error) {
      console.error("Error obteniendo variantes:", error);
      setError("No se pudieron cargar los productos.");
    } else {
      setVariants(data || []);
    }

    setLoading(false);
  };

  const updateItem = (index, field, value) => {
    const updatedItems = [...items];

    updatedItems[index][field] = value;

    setItems(updatedItems);
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        product_variant_id: "",
        quantity: 1,
      },
    ]);
  };

  const removeItem = (index) => {
    if (items.length === 1) {
      return;
    }

    setItems(items.filter((_, i) => i !== index));
  };

  const getVariant = (variantId) => {
    return variants.find((variant) => String(variant.id) === String(variantId));
  };

  const getItemSubtotal = (item) => {
    const variant = getVariant(item.product_variant_id);

    if (!variant) {
      return 0;
    }

    return Number(variant.products.sale_price) * Number(item.quantity);
  };

  const total = items.reduce((sum, item) => sum + getItemSubtotal(item), 0);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      // Validar que todas las variantes estén seleccionadas
      for (const item of items) {
        if (!item.product_variant_id) {
          throw new Error("Selecciona una pijama para cada producto.");
        }

        if (!item.quantity || Number(item.quantity) <= 0) {
          throw new Error("La cantidad debe ser mayor a 0.");
        }

        const variant = getVariant(item.product_variant_id);

        if (!variant) {
          throw new Error("Una de las variantes seleccionadas no existe.");
        }

        if (Number(item.quantity) > Number(variant.stock)) {
          throw new Error(
            `No hay suficiente stock para ${variant.products.name} (${variant.size} / ${variant.color}).`,
          );
        }
      }

      if (paymentMethod === "Crédito" && !customerName.trim()) {
        throw new Error(
          "Debes ingresar el nombre del cliente para una venta a crédito.",
        );
      }

      // 1. Crear la venta
      const { data: newSale, error: saleError } = await supabase
        .from("sales")
        .insert({
          sale_date: new Date().toISOString(),
          payment_method: paymentMethod,
          total,
          notes,
        })
        .select()
        .single();

      if (saleError) {
        throw saleError;
      }

      // 2. Crear los productos de la venta
      const saleItems = items.map((item) => {
        const variant = getVariant(item.product_variant_id);
        const quantity = Number(item.quantity);

        const unitPrice = Number(variant.products.sale_price);

        const unitCost = Number(variant.products.cost);

        return {
          sale_id: newSale.id,
          product_variant_id: variant.id,
          quantity,
          unit_price: unitPrice,
          unit_cost: unitCost,
        };
      });

      const { error: itemsError } = await supabase
        .from("sale_items")
        .insert(saleItems);

      if (itemsError) {
        // Si fallan los productos, eliminamos la venta
        await supabase.from("sales").delete().eq("id", newSale.id);

        throw itemsError;
      }

      // 3. Crear crédito si la venta es a crédito

      if (paymentMethod === "Crédito") {
        const { error: creditError } = await supabase.from("credits").insert({
          sale_id: newSale.id,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || null,
          total_amount: total,
          status: "pending",
          notes: creditNotes.trim() || null,
        });

        if (creditError) {
          // Si falla el crédito, eliminamos los productos y la venta
          await supabase.from("sale_items").delete().eq("sale_id", newSale.id);

          await supabase.from("sales").delete().eq("id", newSale.id);

          throw creditError;
        }
      }

      // 4. Descontar stock
      for (const item of items) {
        const variant = getVariant(item.product_variant_id);

        const newStock = Number(variant.stock) - Number(item.quantity);

        const { error: stockError } = await supabase
          .from("product_variants")
          .update({
            stock: newStock,
          })
          .eq("id", variant.id);

        if (stockError) {
          throw stockError;
        }
      }

      // 5. Actualizar Inventario / Ventas
      if (onSaleCreated) {
        await onSaleCreated();
      }

      // 6. Cerrar formulario
      onClose();
    } catch (error) {
      console.error("Error registrando venta:", error);

      setError(error.message || "No se pudo registrar la venta.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="product-modal">
          <div className="loading">Cargando productos...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="product-modal sale-modal">
        <div className="modal-header">
          <div>
            <h2>Nueva venta</h2>
            <p>Registra una venta y actualiza automáticamente tu inventario.</p>
          </div>

          <button type="button" className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <div className="section-title">
              <div>
                <h3>Productos</h3>
                <p>Selecciona las pijamas y cantidades vendidas.</p>
              </div>

              <button
                type="button"
                className="add-variant-button"
                onClick={addItem}
              >
                + Agregar producto
              </button>
            </div>

            <div className="sale-items-container">
              {items.map((item, index) => {
                const variant = getVariant(item.product_variant_id);

                return (
                  <div className="sale-item-row" key={index}>
                    <div className="form-group">
                      <label>Pijama / variante</label>

                      <select
                        value={item.product_variant_id}
                        onChange={(e) =>
                          updateItem(
                            index,
                            "product_variant_id",
                            e.target.value,
                          )
                        }
                        required
                      >
                        <option value="">Selecciona una variante</option>

                        {variants.map((variant) => (
                          <option
                            key={variant.id}
                            value={variant.id}
                            disabled={variant.stock <= 0}
                          >
                            {variant.products.name} · {variant.products.sku} ·{" "}
                            {variant.size} · {variant.color} · Stock:{" "}
                            {variant.stock}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group quantity-group">
                      <label>Cantidad</label>

                      <input
                        type="number"
                        min="1"
                        max={variant?.stock || undefined}
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(index, "quantity", e.target.value)
                        }
                        required
                      />
                    </div>

                    <div className="sale-item-price">
                      <span>Subtotal</span>

                      <strong>${getItemSubtotal(item).toFixed(2)}</strong>
                    </div>

                    <button
                      type="button"
                      className="remove-variant-button"
                      onClick={() => removeItem(index)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="form-section">
            <h3>Información de pago</h3>

            <div className="form-grid">
              <div className="form-group">
                <label>Método de pago</label>

                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="Efectivo">Efectivo</option>

                  <option value="Transferencia">Transferencia</option>

                  <option value="Tarjeta">Tarjeta</option>

                  <option value="Crédito">Crédito</option>
                </select>

                {paymentMethod === "Crédito" && (
                  <>
                    <div className="form-group">
                      <label>Nombre del cliente *</label>

                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ej. María López"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Teléfono</label>

                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Ej. 55 1234 5678"
                      />
                    </div>

                    <div className="form-group">
                      <label>Notas del crédito</label>

                      <input
                        type="text"
                        value={creditNotes}
                        onChange={(e) => setCreditNotes(e.target.value)}
                        placeholder="Ej. Paga el viernes"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="form-group">
                <label>Notas</label>

                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas de la venta..."
                />
              </div>
            </div>
          </div>

          <div className="sale-total">
            <span>Total de la venta</span>

            <strong>${total.toFixed(2)}</strong>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-footer">
            <button
              type="button"
              className="cancel-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>

            <button type="submit" className="save-button" disabled={saving}>
              {saving ? "Guardando..." : "Guardar venta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SaleForm;
