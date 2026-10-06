import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./ProductForm.css";

function ProductForm({ product, onClose, onProductCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fabric, setFabric] = useState("");
  const [design, setDesign] = useState("");
  const [cost, setCost] = useState("");
  const [salePrice, setSalePrice] = useState("");

  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");

  const [variants, setVariants] = useState([
    {
      size: "",
      color: "",
      stock: "",
      minimum_stock: 3,
    },
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!product) {
      return;
    }

    setName(product.name || "");
    setDescription(product.description || "");
    setFabric(product.fabric || "");
    setDesign(product.design || "");
    setCost(product.cost ?? "");
    setSalePrice(product.sale_price ?? "");

    setImage(null);
    setImagePreview(product.image_url || "");

    setVariants(
      product.product_variants?.length
        ? product.product_variants.map((variant) => ({
            id: variant.id,
            size: variant.size || "",
            color: variant.color || "",
            stock: variant.stock ?? "",
            minimum_stock: variant.minimum_stock ?? 3,
          }))
        : [
            {
              size: "",
              color: "",
              stock: "",
              minimum_stock: 3,
            },
          ],
    );
  }, [product]);

  const handleImageChange = (event) => {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    setImage(file);

    const previewUrl = URL.createObjectURL(file);

    setImagePreview(previewUrl);
  };

  const addVariant = () => {
    setVariants([
      ...variants,
      {
        size: "",
        color: "",
        stock: "",
        minimum_stock: 3,
      },
    ]);
  };

  const removeVariant = async (index) => {
    const variant = variants[index];

    // Si es una variante que todavía no se ha guardado,
    // simplemente la quitamos del formulario.
    if (!variant.id) {
      if (variants.length === 1) {
        return;
      }

      setVariants(variants.filter((_, i) => i !== index));

      return;
    }

    const confirmed = window.confirm(
      `¿Estás seguro de eliminar la variante ${variant.size} / ${variant.color}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      const { error: deleteError } = await supabase
        .from("product_variants")
        .delete()
        .eq("id", variant.id);

      if (deleteError) {
        throw deleteError;
      }

      setVariants(variants.filter((_, i) => i !== index));
    } catch (error) {
      console.error("Error eliminando variante:", error);

      setError("No se pudo eliminar la variante.");
    } finally {
      setSaving(false);
    }
  };

  const updateVariant = (index, field, value) => {
    const updatedVariants = [...variants];

    updatedVariants[index][field] = value;

    setVariants(updatedVariants);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      // Validar variantes
      for (const variant of variants) {
        if (
          !variant.size ||
          !variant.color ||
          variant.stock === "" ||
          variant.minimum_stock === ""
        ) {
          throw new Error("Completa todos los campos de las variantes.");
        }
      }

      // 1. Subir imagen si seleccionaste una nueva
      let imageUrl = null;

      if (image) {
        const fileExtension = image.name.split(".").pop();

        const fileName = `${crypto.randomUUID()}.${fileExtension}`;

        const filePath = `products/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("pijamas")
          .upload(filePath, image);

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
          .from("pijamas")
          .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;
      }

      // 2. Crear o actualizar producto
      let savedProduct;

      if (product) {
        // ==========================
        // EDITAR PRODUCTO
        // ==========================

        const updateData = {
          name,
          description,
          fabric,
          design,
          cost: Number(cost),
          sale_price: Number(salePrice),
        };

        // Solo actualizar imagen si seleccionaste una nueva
        if (imageUrl) {
          updateData.image_url = imageUrl;
        }

        const { data: updatedProduct, error: productError } = await supabase
          .from("products")
          .update(updateData)
          .eq("id", product.id)
          .select()
          .single();

        if (productError) {
          throw productError;
        }

        savedProduct = updatedProduct;

        // ==========================
        // ACTUALIZAR VARIANTES
        // ==========================

        for (const variant of variants) {
          const variantData = {
            product_id: product.id,
            size: variant.size,
            color: variant.color,
            stock: Number(variant.stock),
            minimum_stock: Number(variant.minimum_stock),
          };

          if (variant.id) {
            // Actualizar variante existente
            const { error: variantError } = await supabase
              .from("product_variants")
              .update(variantData)
              .eq("id", variant.id);

            if (variantError) {
              throw variantError;
            }
          } else {
            // Crear nueva variante
            const { error: variantError } = await supabase
              .from("product_variants")
              .insert(variantData);

            if (variantError) {
              throw variantError;
            }
          }
        }
      } else {
        // ==========================
        // CREAR PRODUCTO
        // ==========================

        const { data: newProduct, error: productError } = await supabase
          .from("products")
          .insert({
            name,
            description,
            fabric,
            design,
            image_url: imageUrl,
            cost: Number(cost),
            sale_price: Number(salePrice),
          })
          .select()
          .single();

        if (productError) {
          throw productError;
        }

        savedProduct = newProduct;

        // ==========================
        // CREAR VARIANTES
        // ==========================

        const variantsToInsert = variants.map((variant) => ({
          product_id: newProduct.id,
          size: variant.size,
          color: variant.color,
          stock: Number(variant.stock),
          minimum_stock: Number(variant.minimum_stock),
        }));

        const { error: variantsError } = await supabase
          .from("product_variants")
          .insert(variantsToInsert);

        if (variantsError) {
          // Si falla la creación de variantes,
          // eliminamos el producto para no dejar
          // registros incompletos.
          await supabase.from("products").delete().eq("id", newProduct.id);

          throw variantsError;
        }
      }

      // 3. Actualizar inventario
      if (onProductCreated) {
        await onProductCreated();
      }

      // 4. Cerrar formulario
      onClose();
    } catch (error) {
      console.error("Error guardando producto:", error);

      setError(error.message || "No se pudo guardar la pijama.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-overlay">
      <div className="product-modal">
        <div className="modal-header">
          <div>
            <h2>{product ? "Editar pijama" : "Nueva pijama"}</h2>
            <p>
              {product
                ? "Modifica la información de tu pijama."
                : "Registra una nueva pijama en tu inventario."}
            </p>
          </div>

          <button type="button" className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* INFORMACIÓN */}

          <div className="form-section">
            <h3>Información de la pijama</h3>

            <div className="form-grid">
              <div className="form-group">
                <label>Nombre *</label>

                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Pijama Floral"
                  required
                />
              </div>

              <div className="form-group">
                <label>Tela</label>

                <input
                  type="text"
                  value={fabric}
                  onChange={(e) => setFabric(e.target.value)}
                  placeholder="Ej. Algodón"
                />
              </div>

              <div className="form-group">
                <label>Diseño</label>

                <input
                  type="text"
                  value={design}
                  onChange={(e) => setDesign(e.target.value)}
                  placeholder="Ej. Floral"
                />
              </div>

              <div className="form-group">
                <label>Costo</label>

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="180.00"
                />
              </div>

              <div className="form-group">
                <label>Precio de venta</label>

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="299.00"
                />
              </div>
            </div>

            {product && (
              <div className="sku-display">
                <span>SKU</span>
                <strong>{product.sku}</strong>
              </div>
            )}
            <div className="form-group">
              <label>Descripción</label>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción de la pijama..."
                rows="3"
              />
            </div>
          </div>

          {/* IMAGEN */}

          <div className="form-section">
            <h3>Imagen de la tela</h3>

            <div className="image-upload">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Vista previa"
                  className="image-preview"
                />
              ) : (
                <div className="image-placeholder">
                  📷
                  <span>Selecciona una imagen</span>
                </div>
              )}

              <label className="upload-button">
                Seleccionar imagen
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  hidden
                />
              </label>
            </div>
          </div>

          {/* VARIANTES */}

          <div className="form-section">
            <div className="section-title">
              <div>
                <h3>Variantes</h3>

                <p>Agrega las tallas, colores y cantidades.</p>
              </div>

              <button
                type="button"
                className="add-variant-button"
                onClick={addVariant}
              >
                + Agregar variante
              </button>
            </div>

            <div className="variants-container">
              {variants.map((variant, index) => (
                <div className="variant-row" key={index}>
                  <div className="form-group">
                    <label>Talla</label>

                    <input
                      type="text"
                      value={variant.size}
                      onChange={(e) =>
                        updateVariant(index, "size", e.target.value)
                      }
                      placeholder="M"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Color</label>

                    <input
                      type="text"
                      value={variant.color}
                      onChange={(e) =>
                        updateVariant(index, "color", e.target.value)
                      }
                      placeholder="Rosa"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Stock</label>

                    <input
                      type="number"
                      min="0"
                      value={variant.stock}
                      onChange={(e) =>
                        updateVariant(index, "stock", e.target.value)
                      }
                      placeholder="10"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Mínimo</label>

                    <input
                      type="number"
                      min="0"
                      value={variant.minimum_stock}
                      onChange={(e) =>
                        updateVariant(index, "minimum_stock", e.target.value)
                      }
                      required
                    />
                  </div>

                  <button
                    type="button"
                    className="remove-variant-button"
                    onClick={() => removeVariant(index)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          {/* FOOTER */}

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
              {saving
                ? "Guardando..."
                : product
                  ? "Guardar cambios"
                  : "Guardar pijama"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProductForm;
