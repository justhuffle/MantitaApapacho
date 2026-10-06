import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./Inventory.css";
import ProductForm from "../components/ProductForm";

function Inventory() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showProductForm, setShowProductForm] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [requestedQuantities, setRequestedQuantities] = useState({});

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *,
        product_variants (
          id,
          size,
          color,
          stock,
          minimum_stock
        )
      `,
      )
      .order("name");

    if (error) {
      console.error("Error obteniendo productos:", error);
      setError("No se pudo cargar el inventario.");
    } else {
      setProducts(data || []);
    }

    setLoading(false);
  };

  const getStockStatus = (stock, minimumStock) => {
    if (stock === 0) {
      return {
        label: "Agotada",
        className: "status-out",
      };
    }

    if (stock <= minimumStock) {
      return {
        label: "Poco stock",
        className: "status-low",
      };
    }

    return {
      label: "Disponible",
      className: "status-ok",
    };
  };

  // Seleccionar o deseleccionar una pijama
  const toggleProductSelection = (productId) => {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    );
  };

  const updateRequestedQuantity = (variantId, quantity) => {
    const parsedQuantity = Math.max(0, Number(quantity) || 0);

    setRequestedQuantities((prev) => ({
      ...prev,
      [variantId]: parsedQuantity,
    }));
  };

  // Inicializar cantidades en 0 para las variantes seleccionadas
  const initializeRequestedQuantities = (productIds) => {
    const quantities = {};

    products
      .filter((product) => productIds.includes(product.id))
      .forEach((product) => {
        product.product_variants?.forEach((variant) => {
          quantities[variant.id] = requestedQuantities[variant.id] ?? 0;
        });
      });

    setRequestedQuantities((prev) => ({
      ...prev,
      ...quantities,
    }));
  };

  // Seleccionar agotadas
  const selectOutOfStock = () => {
    const ids = products
      .filter((product) =>
        product.product_variants?.some((variant) => variant.stock === 0),
      )
      .map((product) => product.id);

    setSelectedProducts(ids);
    initializeRequestedQuantities(ids);
  };

  // Seleccionar poco stock
  const selectLowStock = () => {
    const ids = products
      .filter((product) =>
        product.product_variants?.some(
          (variant) =>
            variant.stock > 0 && variant.stock <= variant.minimum_stock,
        ),
      )
      .map((product) => product.id);

    setSelectedProducts(ids);
    initializeRequestedQuantities(ids);
  };

  // Seleccionar agotadas + poco stock
  const selectNeedsRestock = () => {
    const ids = products
      .filter((product) =>
        product.product_variants?.some(
          (variant) =>
            variant.stock === 0 ||
            (variant.stock > 0 && variant.stock <= variant.minimum_stock),
        ),
      )
      .map((product) => product.id);

    setSelectedProducts(ids);
    initializeRequestedQuantities(ids);
  };

  // Limpiar selección
  const clearSelection = () => {
    setSelectedProducts([]);
    setRequestedQuantities({});
  };

  const imageUrlToDataUrl = async (url) => {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("No se pudo cargar la imagen");
      }

      const blob = await response.blob();

      return await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;

        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Error cargando imagen:", error);
      return null;
    }
  };

  const generateSupplierPDF = async () => {
    const selected = products.filter((product) =>
      selectedProducts.includes(product.id),
    );

    if (selected.length === 0) {
      return;
    }

    const doc = new jsPDF();

    const today = new Date().toLocaleDateString("es-MX");

    // =========================
    // ENCABEZADO
    // =========================

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Solicitud de reabastecimiento", 14, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${today}`, 14, 28);

    doc.setFontSize(11);
    doc.text("Detalle de productos solicitados:", 14, 40);

    let currentY = 48;

    for (const product of selected) {
      const variants = product.product_variants || [];

      // Solo mostramos variantes donde se solicitó
      // al menos una pieza.
      const variantsToOrder = variants.filter(
        (variant) => Number(requestedQuantities[variant.id] || 0) > 0,
      );

      // Si no se pidió ninguna pieza de este producto,
      // no lo incluimos.
      if (variantsToOrder.length === 0) {
        continue;
      }

      // =========================
      // ESPACIO PARA PRODUCTO
      // =========================

      if (currentY > 220) {
        doc.addPage();
        currentY = 20;
      }

      // =========================
      // IMAGEN
      // =========================

      if (product.image_url) {
        const imageData = await imageUrlToDataUrl(product.image_url);

        if (imageData) {
          try {
            doc.addImage(imageData, "JPEG", 14, currentY, 40, 40);
          } catch (error) {
            console.error("No se pudo insertar la imagen:", error);
          }
        }
      }

      // =========================
      // INFORMACIÓN
      // =========================

      const infoX = 60;

      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text(product.name, infoX, currentY + 7);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      if (product.description) {
        const description = doc.splitTextToSize(product.description, 130);

        doc.text(description, infoX, currentY + 14);
      }

      currentY += 48;

      // =========================
      // TABLA DE PEDIDO
      // =========================

      autoTable(doc, {
        startY: currentY,
        head: [["Talla", "Color", "Cantidad solicitada"]],
        body: variantsToOrder.map((variant) => [
          variant.size,
          variant.color,
          requestedQuantities[variant.id] || 0,
        ]),
        theme: "grid",
        styles: {
          fontSize: 9,
          cellPadding: 4,
        },
        headStyles: {
          fontStyle: "bold",
        },
        margin: {
          left: 14,
          right: 14,
        },
      });

      currentY = doc.lastAutoTable.finalY + 18;
    }

    // =========================
    // GUARDAR PDF
    // =========================

    doc.save(`solicitud-reabastecimiento-${today.replace(/\//g, "-")}.pdf`);
  };

  const handleDeleteProduct = async (product) => {
    const confirmed = window.confirm(
      `¿Estás seguro de eliminar "${product.name}"?\n\nTambién se eliminarán todas sus variantes.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      // 1. Eliminar variantes

      const { error: variantsError } = await supabase
        .from("product_variants")
        .delete()
        .eq("product_id", product.id);

      if (variantsError) {
        throw variantsError;
      }

      // 2. Eliminar producto

      const { error: productError } = await supabase
        .from("products")
        .delete()
        .eq("id", product.id);

      if (productError) {
        throw productError;
      }

      // 3. Actualizar inventario

      await fetchProducts();
    } catch (error) {
      console.error("Error eliminando producto:", error);

      setError("No se pudo eliminar la pijama.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="inventory-page">
        <div className="loading">Cargando inventario...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="inventory-page">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="inventory-page">
      {/* ENCABEZADO */}

      <div className="inventory-header">
        <div>
          <h1>Inventario</h1>
          <p>Administra tus pijamas y controla tu stock.</p>
        </div>

        <button
          className="add-button"
          onClick={() => {
            setSelectedProduct(null);
            setShowProductForm(true);
          }}
        >
          + Nueva pijama
        </button>
      </div>

      {/* ACCIONES PARA PROVEEDOR */}

      <div className="supplier-actions">
        <div className="supplier-actions-info">
          <strong>
            {selectedProducts.length} pijama
            {selectedProducts.length !== 1 ? "s" : ""} seleccionada
            {selectedProducts.length !== 1 ? "s" : ""}
          </strong>

          <span>
            Selecciona las pijamas que quieras solicitar a tu proveedor.
          </span>
        </div>

        <div className="supplier-buttons">
          <button className="select-button" onClick={selectOutOfStock}>
            Seleccionar agotadas
          </button>

          <button className="select-button" onClick={selectLowStock}>
            Seleccionar poco stock
          </button>

          <button
            className="select-button select-restock-button"
            onClick={selectNeedsRestock}
          >
            Seleccionar por reabastecer
          </button>

          {selectedProducts.length > 0 && (
            <button className="clear-selection-button" onClick={clearSelection}>
              Limpiar selección
            </button>
          )}

          <button
            className="pdf-button"
            disabled={selectedProducts.length === 0}
            onClick={generateSupplierPDF}
          >
            Generar PDF para proveedor
          </button>
        </div>
      </div>

      {/* RESUMEN */}

      <div className="inventory-summary">
        <div className="summary-card">
          <span>Productos</span>
          <strong>{products.length}</strong>
        </div>

        <div className="summary-card">
          <span>Variantes</span>
          <strong>
            {products.reduce(
              (total, product) => total + product.product_variants.length,
              0,
            )}
          </strong>
        </div>
      </div>

      {/* TABLA */}

      <div className="inventory-table-container">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Seleccionar</th>
              <th>Imagen</th>
              <th>Pijama</th>
              <th>Tallas / Colores</th>
              <th>Stock</th>
              <th>Costo</th>
              <th>Precio de venta</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {products.map((product) => {
              const variants = product.product_variants || [];

              // Stock total de todas las variantes
              const totalStock = variants.reduce(
                (total, variant) => total + variant.stock,
                0,
              );

              // Determinar el estado general del producto
              const hasOutOfStock = variants.some(
                (variant) => variant.stock === 0,
              );

              const hasLowStock = variants.some(
                (variant) =>
                  variant.stock > 0 && variant.stock <= variant.minimum_stock,
              );

              let productStatus;

              if (hasOutOfStock) {
                productStatus = {
                  label: "Agotada",
                  className: "status-out",
                };
              } else if (hasLowStock) {
                productStatus = {
                  label: "Poco stock",
                  className: "status-low",
                };
              } else {
                productStatus = {
                  label: "Disponible",
                  className: "status-ok",
                };
              }

              return (
                <tr key={product.id}>
                  {/* SELECCIÓN */}
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(product.id)}
                      onChange={() => toggleProductSelection(product.id)}
                    />
                  </td>

                  {/* IMAGEN */}
                  <td>
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="fabric-image"
                      />
                    ) : (
                      <div className="no-image">Sin imagen</div>
                    )}
                  </td>

                  {/* PRODUCTO */}
                  <td>
                    <div className="product-info">
                      <strong>{product.name}</strong>
                      <span>{product.sku}</span>
                    </div>
                  </td>

                  {/* TALLAS / COLORES */}
                  <td>
                    <div className="variants-list">
                      {variants.map((variant) => (
                        <div key={variant.id} className="variant-item">
                          <span className="size-badge">{variant.size}</span>

                          <span className="variant-color">{variant.color}</span>

                          {selectedProducts.includes(product.id) && (
                            <input
                              type="number"
                              min="0"
                              value={requestedQuantities[variant.id] ?? 0}
                              onChange={(e) =>
                                updateRequestedQuantity(
                                  variant.id,
                                  e.target.value,
                                )
                              }
                              className="requested-quantity"
                              title="Cantidad a solicitar"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </td>

                  {/* STOCK */}
                  <td>
                    <strong>{totalStock}</strong>
                  </td>

                  {/* COSTO */}
                  <td>${Number(product.cost || 0).toFixed(2)}</td>

                  {/* PRECIO DE VENTA */}
                  <td>${Number(product.sale_price || 0).toFixed(2)}</td>

                  {/* ESTADO */}
                  <td>
                    <span className={`status-badge ${productStatus.className}`}>
                      {productStatus.label}
                    </span>
                  </td>

                  {/* ACCIONES */}
                  <td>
                    <div className="action-buttons">
                      <button
                        className="edit-button"
                        onClick={() => {
                          setSelectedProduct(product);
                          setShowProductForm(true);
                        }}
                      >
                        Editar
                      </button>

                      <button
                        className="delete-button"
                        onClick={() => handleDeleteProduct(product)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showProductForm && (
        <ProductForm
          product={selectedProduct}
          onClose={() => {
            setShowProductForm(false);
            setSelectedProduct(null);
          }}
          onProductCreated={fetchProducts}
        />
      )}
    </div>
  );
}

export default Inventory;
