import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./SaleForm.css";

function SaleForm({ onClose, onSaleCreated }) {
  const [variants, setVariants] = useState([]);
  const [items, setItems] = useState([{ product_variant_id: "", quantity: 1 }]);

  const [search, setSearch] = useState("");
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
          sale_price,
          image_url
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

  // Solo se muestran variantes que tienen existencias.
  const availableVariants = variants.filter(
    (variant) => Number(variant.stock) > 0 && variant.products,
  );

  const filteredVariants = availableVariants.filter((variant) => {
    const product = variant.products;
    const term = search.trim().toLowerCase();

    if (!term) return true;

    return [
      product.name,
      product.sku,
      variant.size,
      variant.color,
      String(product.sale_price ?? ""),
    ].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(term),
    );
  });

  const getVariant = (variantId) =>
    variants.find((variant) => String(variant.id) === String(variantId));

  const getItemSubtotal = (item) => {
    const variant = getVariant(item.product_variant_id);

    if (!variant) return 0;

    return (
      Number(variant.products.sale_price || 0) * Number(item.quantity || 0)
    );
  };

  const total = items.reduce((sum, item) => sum + getItemSubtotal(item), 0);

  const addVariant = (variant) => {
    setError("");

    setItems((currentItems) => {
      const existingIndex = currentItems.findIndex(
        (item) => String(item.product_variant_id) === String(variant.id),
      );

      if (existingIndex !== -1) {
        const currentQuantity = Number(currentItems[existingIndex].quantity);

        if (currentQuantity >= Number(variant.stock)) {
          setError(
            `Solo hay ${variant.stock} unidades disponibles de ${variant.products.name} (${variant.size} / ${variant.color}).`,
          );
          return currentItems;
        }

        return currentItems.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: currentQuantity + 1 }
            : item,
        );
      }

      const emptyIndex = currentItems.findIndex(
        (item) => !item.product_variant_id,
      );

      if (emptyIndex !== -1) {
        return currentItems.map((item, index) =>
          index === emptyIndex
            ? {
                product_variant_id: variant.id,
                quantity: 1,
              }
            : item,
        );
      }

      return [
        ...currentItems,
        {
          product_variant_id: variant.id,
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (index, value) => {
    setError("");

    const item = items[index];
    const variant = getVariant(item.product_variant_id);

    if (variant && Number(value) > Number(variant.stock)) {
      setError(
        `Solo hay ${variant.stock} unidades disponibles de ${variant.products.name}.`,
      );
      return;
    }

    setItems((currentItems) =>
      currentItems.map((currentItem, currentIndex) =>
        currentIndex === index
          ? { ...currentItem, quantity: value }
          : currentItem,
      ),
    );
  };

  const removeItem = (index) => {
    setItems((currentItems) => {
      const updated = currentItems.filter(
        (_, itemIndex) => itemIndex !== index,
      );

      return updated.length
        ? updated
        : [{ product_variant_id: "", quantity: 1 }];
    });

    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const selectedItems = items.filter((item) => item.product_variant_id);

      if (selectedItems.length === 0) {
        throw new Error("Agrega al menos una pijama a la venta.");
      }

      // Revalidar las existencias antes de registrar la venta.
      for (const item of selectedItems) {
        if (
          !item.quantity ||
          Number(item.quantity) <= 0 ||
          !Number.isInteger(Number(item.quantity))
        ) {
          throw new Error(
            "Las cantidades deben ser números enteros mayores que cero.",
          );
        }

        const variant = getVariant(item.product_variant_id);

        if (!variant) {
          throw new Error("Una de las variantes seleccionadas ya no existe.");
        }

        if (Number(variant.stock) <= 0) {
          throw new Error(
            `${variant.products.name} ya no tiene existencias disponibles.`,
          );
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

      // 1. Crear la venta.
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

      if (saleError) throw saleError;

      // 2. Crear las partidas de la venta.
      const saleItems = selectedItems.map((item) => {
        const variant = getVariant(item.product_variant_id);
        const quantity = Number(item.quantity);

        return {
          sale_id: newSale.id,
          product_variant_id: variant.id,
          quantity,
          unit_price: Number(variant.products.sale_price),
          unit_cost: Number(variant.products.cost),
        };
      });

      const { error: itemsError } = await supabase
        .from("sale_items")
        .insert(saleItems);

      if (itemsError) {
        await supabase.from("sales").delete().eq("id", newSale.id);
        throw itemsError;
      }

      // 3. Registrar el crédito cuando corresponda.
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
          await supabase.from("sale_items").delete().eq("sale_id", newSale.id);

          await supabase.from("sales").delete().eq("id", newSale.id);
          throw creditError;
        }
      }

      // 4. Descontar las existencias.
      for (const item of selectedItems) {
        const variant = getVariant(item.product_variant_id);
        const newStock = Number(variant.stock) - Number(item.quantity);

        const { error: stockError } = await supabase
          .from("product_variants")
          .update({ stock: newStock })
          .eq("id", variant.id);

        if (stockError) {
          throw new Error(
            `La venta se registró, pero no se pudo actualizar el inventario de ${variant.products.name}. Revisa las existencias antes de volver a registrar la venta.`,
          );
        }
      }

      if (onSaleCreated) {
        await onSaleCreated();
      }

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
            <p>Elige las pijamas disponibles y registra la venta.</p>
          </div>

          <button
            type="button"
            className="close-button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar formulario"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <div className="section-title">
              <div>
                <h3>Catálogo de pijamas</h3>
                <p>
                  {availableVariants.length} variantes disponibles. Selecciona
                  una tarjeta para agregarla a la venta.
                </p>
              </div>
            </div>

            <div className="sale-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre, SKU, talla o color..."
                aria-label="Buscar pijamas"
              />
            </div>

            {filteredVariants.length === 0 ? (
              <div className="sale-catalog-empty">
                {availableVariants.length === 0
                  ? "No hay pijamas con existencias disponibles."
                  : "No encontramos pijamas que coincidan con tu búsqueda."}
              </div>
            ) : (
              <div className="sale-catalog">
                {filteredVariants.map((variant) => {
                  const product = variant.products;
                  const selectedItem = items.find(
                    (item) =>
                      String(item.product_variant_id) === String(variant.id),
                  );

                  return (
                    <article
                      className={`sale-product-card ${
                        selectedItem ? "is-selected" : ""
                      }`}
                      key={variant.id}
                    >
                      <div className="sale-product-image">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            loading="lazy"
                          />
                        ) : (
                          <div className="sale-image-placeholder">
                            <span aria-hidden="true">▧</span>
                            <small>Sin imagen</small>
                          </div>
                        )}
                      </div>

                      <div className="sale-product-info">
                        <h4>{product.name}</h4>

                        {product.sku && (
                          <span className="sale-product-sku">
                            {product.sku}
                          </span>
                        )}

                        <div className="sale-variant-details">
                          <span>Talla: {variant.size || "Sin talla"}</span>
                          <span>Color: {variant.color || "Sin color"}</span>
                        </div>

                        <strong className="sale-product-price">
                          ${Number(product.sale_price || 0).toFixed(2)}
                        </strong>

                        <span className="sale-stock">
                          Disponibles: {variant.stock}
                        </span>

                        <button
                          type="button"
                          className="sale-add-button"
                          onClick={() => addVariant(variant)}
                          disabled={
                            saving ||
                            Number(selectedItem?.quantity || 0) >=
                              Number(variant.stock)
                          }
                        >
                          {selectedItem
                            ? `Agregada (${selectedItem.quantity})`
                            : "+ Agregar a la venta"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="form-section">
            <div className="section-title">
              <div>
                <h3>Productos de esta venta</h3>
                <p>Revisa las cantidades antes de guardar.</p>
              </div>
            </div>

            <div className="sale-items-container">
              {items.map((item, index) => {
                const variant = getVariant(item.product_variant_id);

                if (!variant) return null;

                const product = variant.products;

                return (
                  <div className="sale-item-row" key={variant.id}>
                    <div className="sale-cart-product">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} />
                      ) : (
                        <div className="sale-cart-placeholder">▧</div>
                      )}

                      <div>
                        <strong>{product.name}</strong>
                        <span>
                          {variant.size} · {variant.color}
                        </span>
                      </div>
                    </div>

                    <div className="form-group quantity-group">
                      <label htmlFor={`sale-quantity-${index}`}>Cantidad</label>
                      <input
                        id={`sale-quantity-${index}`}
                        type="number"
                        min="1"
                        max={variant.stock}
                        step="1"
                        value={item.quantity}
                        onChange={(event) =>
                          updateQuantity(index, event.target.value)
                        }
                        required
                      />
                      <small>Máximo: {variant.stock}</small>
                    </div>

                    <div className="sale-item-price">
                      <span>Subtotal</span>
                      <strong>${getItemSubtotal(item).toFixed(2)}</strong>
                    </div>

                    <button
                      type="button"
                      className="remove-variant-button"
                      onClick={() => removeItem(index)}
                      disabled={saving}
                      aria-label={`Quitar ${product.name}`}
                      title="Quitar producto"
                    >
                      ×
                    </button>
                  </div>
                );
              })}

              {!items.some((item) => item.product_variant_id) && (
                <p className="sale-cart-empty">
                  Todavía no has agregado pijamas. Elige una del catálogo.
                </p>
              )}
            </div>
          </div>

          <div className="form-section">
            <h3>Información de pago</h3>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="sale-payment-method">Método de pago</label>
                <select
                  id="sale-payment-method"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Crédito">Crédito</option>
                </select>

                {paymentMethod === "Crédito" && (
                  <div className="sale-credit-fields">
                    <div className="form-group">
                      <label htmlFor="sale-customer-name">
                        Nombre del cliente *
                      </label>
                      <input
                        id="sale-customer-name"
                        type="text"
                        value={customerName}
                        onChange={(event) =>
                          setCustomerName(event.target.value)
                        }
                        placeholder="Ej. María López"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="sale-customer-phone">Teléfono</label>
                      <input
                        id="sale-customer-phone"
                        type="tel"
                        value={customerPhone}
                        onChange={(event) =>
                          setCustomerPhone(event.target.value)
                        }
                        placeholder="Ej. 55 1234 5678"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="sale-credit-notes">
                        Notas del crédito
                      </label>
                      <input
                        id="sale-credit-notes"
                        type="text"
                        value={creditNotes}
                        onChange={(event) => setCreditNotes(event.target.value)}
                        placeholder="Ej. Paga el viernes"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="sale-notes">Notas de la venta</label>
                <input
                  id="sale-notes"
                  type="text"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Notas de la venta..."
                />
              </div>
            </div>
          </div>

          <div className="sale-total">
            <span>Total de la venta</span>
            <strong>${total.toFixed(2)}</strong>
          </div>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <div className="modal-footer">
            <button
              type="button"
              className="cancel-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="save-button"
              disabled={
                saving ||
                !items.some(
                  (item) =>
                    item.product_variant_id && Number(item.quantity) > 0,
                )
              }
            >
              {saving ? "Guardando..." : "Guardar venta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SaleForm;
