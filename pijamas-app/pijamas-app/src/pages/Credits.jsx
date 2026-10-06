import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./Credits.css";

function Credits() {
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedCredit, setSelectedCredit] = useState(null);
  const [creditDetails, setCreditDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  const [editingPayment, setEditingPayment] = useState(null);
  const [deletingPayment, setDeletingPayment] = useState(null);

  useEffect(() => {
    fetchCredits();
  }, []);

  const fetchCredits = async () => {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("credits")
      .select(
        `
    id,
    sale_id,
    customer_name,
    customer_phone,
    total_amount,
    status,
    notes,
    created_at,
    credit_payments (
      id,
      amount,
      payment_date,
      notes
    )
  `,
      )
      .order("created_at", { ascending: false });

    console.log("CREDITS DATA:", data);
    console.log("CREDITS ERROR:", error);

    if (error) {
      console.error("Error obteniendo créditos:", error);
      setError(error.message);
    } else {
      setCredits(data || []);
    }

    setLoading(false);
  };

  const fetchCreditDetails = async (credit) => {
    setSelectedCredit(credit);
    setLoadingDetails(true);
    setError("");

    // Reiniciar formulario de abono
    setShowPaymentForm(false);
    setPaymentAmount("");
    setPaymentNote("");

    const { data, error } = await supabase
      .from("sale_items")
      .select(
        `
      id,
      quantity,
      unit_price,
      unit_cost,
      products:product_variants (
        size,
        color,
        products (
          name,
          sku
        )
      )
    `,
      )
      .eq("sale_id", credit.sale_id);

    if (error) {
      console.error("Error obteniendo detalle del crédito:", error);
      setError("No se pudo cargar el detalle del crédito.");
      setCreditDetails(null);
    } else {
      setCreditDetails(data || []);
    }

    setLoadingDetails(false);
  };

  const handleAddPayment = async () => {
    if (!selectedCredit) {
      return;
    }

    const amount = Number(paymentAmount);
    const pending = getPendingAmount(selectedCredit);

    if (!amount || amount <= 0) {
      setError("El monto del abono debe ser mayor a 0.");
      return;
    }

    if (amount > pending) {
      setError(
        `El abono no puede ser mayor al monto pendiente de ${formatCurrency(
          pending,
        )}.`,
      );
      return;
    }

    setSavingPayment(true);
    setError("");

    try {
      // 1. Registrar el abono
      const { error: paymentError } = await supabase
        .from("credit_payments")
        .insert({
          credit_id: selectedCredit.id,
          amount,
          payment_date: new Date().toISOString(),
          notes: paymentNote,
        });

      if (paymentError) {
        throw paymentError;
      }

      // 2. Calcular cuánto quedará pendiente
      const newPending = Math.max(pending - amount, 0);

      // 3. Determinar el nuevo estado
      const newStatus = newPending <= 0 ? "paid" : "pending";

      // 4. Actualizar el estado del crédito
      const { error: creditUpdateError } = await supabase
        .from("credits")
        .update({
          status: newStatus,
        })
        .eq("id", selectedCredit.id);

      if (creditUpdateError) {
        throw creditUpdateError;
      }

      // 5. Volver a cargar los créditos
      await fetchCredits();

      // 6. Obtener nuevamente el crédito actualizado
      const { data: updatedCredit, error: updatedCreditError } = await supabase
        .from("credits")
        .select(
          `
        id,
        sale_id,
        customer_name,
        customer_phone,
        total_amount,
        status,
        notes,
        created_at,
        credit_payments (
          id,
          amount,
          payment_date,
          notes
        )
      `,
        )
        .eq("id", selectedCredit.id)
        .single();

      if (updatedCreditError) {
        throw updatedCreditError;
      }

      // 7. Actualizar el crédito que estamos viendo
      setSelectedCredit(updatedCredit);

      // 8. Limpiar formulario
      setPaymentAmount("");
      setPaymentNote("");
      setShowPaymentForm(false);
    } catch (error) {
      console.error("Error registrando abono:", error);

      setError(error.message || "No se pudo registrar el abono.");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleEditPayment = async () => {
    if (!editingPayment || !selectedCredit) {
      return;
    }

    const amount = Number(paymentAmount);

    if (!amount || amount <= 0) {
      setError("El monto del abono debe ser mayor a 0.");
      return;
    }

    const currentPaid = Number(editingPayment.amount || 0);

    const pendingWithoutCurrentPayment =
      getPendingAmount(selectedCredit) + currentPaid;

    if (amount > pendingWithoutCurrentPayment) {
      setError(
        `El abono no puede ser mayor a ${formatCurrency(
          pendingWithoutCurrentPayment,
        )}.`,
      );
      return;
    }

    setSavingPayment(true);
    setError("");

    try {
      // 1. Actualizar el abono
      const { data: updatedPayment, error: paymentError } = await supabase
        .from("credit_payments")
        .update({
          amount: amount,
          notes: paymentNote,
        })
        .eq("id", editingPayment.id)
        .select()
        .single();

      if (paymentError) {
        throw paymentError;
      }

      console.log("ABONO ACTUALIZADO:", updatedPayment);

      // 2. Crear la nueva lista de abonos localmente
      const updatedPayments = (selectedCredit.credit_payments || []).map(
        (payment) =>
          payment.id === editingPayment.id ? updatedPayment : payment,
      );

      // 3. Calcular nuevo total pagado
      const newPaid = updatedPayments.reduce(
        (total, payment) => total + Number(payment.amount || 0),
        0,
      );

      // 4. Calcular nuevo pendiente
      const newPending = Math.max(
        Number(selectedCredit.total_amount) - newPaid,
        0,
      );

      // 5. Calcular estado
      const newStatus = newPending <= 0 ? "paid" : "pending";

      // 6. Actualizar estado del crédito
      const { error: creditError } = await supabase
        .from("credits")
        .update({
          status: newStatus,
        })
        .eq("id", selectedCredit.id);

      if (creditError) {
        throw creditError;
      }

      // 7. Actualizar inmediatamente el modal
      const updatedCredit = {
        ...selectedCredit,
        status: newStatus,
        credit_payments: updatedPayments,
      };

      setSelectedCredit(updatedCredit);

      // 8. Actualizar también la tabla principal
      setCredits((currentCredits) =>
        currentCredits.map((credit) =>
          credit.id === selectedCredit.id ? updatedCredit : credit,
        ),
      );

      // 9. Limpiar formulario
      setEditingPayment(null);
      setPaymentAmount("");
      setPaymentNote("");
      setShowPaymentForm(false);

      console.log("CRÉDITO ACTUALIZADO:", updatedCredit);
    } catch (error) {
      console.error("Error editando abono:", error);
      setError(error.message || "No se pudo editar el abono.");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async (payment) => {
    if (!selectedCredit || !payment) {
      return;
    }

    const confirmed = window.confirm(
      `¿Estás segura de eliminar el abono de ${formatCurrency(
        payment.amount,
      )}?`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingPayment(payment.id);
    setError("");

    try {
      // 1. Eliminar el abono de Supabase
      const { error: deleteError } = await supabase
        .from("credit_payments")
        .delete()
        .eq("id", payment.id);

      if (deleteError) {
        throw deleteError;
      }

      console.log("ABONO ELIMINADO:", payment.id);

      // 2. Crear nueva lista SIN el abono eliminado
      const updatedPayments = (selectedCredit.credit_payments || []).filter(
        (item) => item.id !== payment.id,
      );

      // 3. Calcular nuevo total pagado
      const newPaid = updatedPayments.reduce(
        (total, item) => total + Number(item.amount || 0),
        0,
      );

      // 4. Calcular nuevo pendiente
      const newPending = Math.max(
        Number(selectedCredit.total_amount) - newPaid,
        0,
      );

      // 5. Determinar estado
      const newStatus = newPending <= 0 ? "paid" : "pending";

      // 6. Actualizar estado del crédito
      const { error: creditError } = await supabase
        .from("credits")
        .update({
          status: newStatus,
        })
        .eq("id", selectedCredit.id);

      if (creditError) {
        throw creditError;
      }

      // 7. Actualizar inmediatamente el crédito mostrado
      const updatedCredit = {
        ...selectedCredit,
        status: newStatus,
        credit_payments: updatedPayments,
      };

      setSelectedCredit(updatedCredit);

      // 8. Actualizar también la tabla principal
      setCredits((currentCredits) =>
        currentCredits.map((credit) =>
          credit.id === selectedCredit.id ? updatedCredit : credit,
        ),
      );

      console.log("CRÉDITO DESPUÉS DE ELIMINAR:", updatedCredit);
    } catch (error) {
      console.error("Error eliminando abono:", error);
      setError(error.message || "No se pudo eliminar el abono.");
    } finally {
      setDeletingPayment(null);
    }
  };

  const getPaidAmount = (credit) => {
    return (credit.credit_payments || []).reduce(
      (total, payment) => total + Number(payment.amount || 0),
      0,
    );
  };

  const getPendingAmount = (credit) => {
    const total = Number(credit.total_amount || 0);
    const paid = getPaidAmount(credit);

    return Math.max(total - paid, 0);
  };

  const formatCurrency = (amount) => {
    return `$${Number(amount).toFixed(2)}`;
  };

  const formatDate = (date) => {
    if (!date) {
      return "-";
    }

    return new Date(date).toLocaleDateString("es-MX");
  };

  const getStatus = (credit) => {
    const pending = getPendingAmount(credit);

    if (pending <= 0) {
      return {
        label: "Pagado",
        className: "credit-status-paid",
      };
    }

    return {
      label: "Pendiente",
      className: "credit-status-pending",
    };
  };

  const totalCredits = credits.length;

  const totalToCollect = credits.reduce(
    (total, credit) => total + getPendingAmount(credit),
    0,
  );

  const totalPaid = credits.reduce(
    (total, credit) => total + getPaidAmount(credit),
    0,
  );

  console.log("CREDITS STATE:", credits);
  console.log("LOADING:", loading);
  console.log("ERROR STATE:", error);

  if (loading) {
    return (
      <div className="credits-page">
        <div className="loading">Cargando créditos...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="credits-page">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="credits-page">
      {/* ENCABEZADO */}

      <div className="credits-header">
        <div>
          <h1>Créditos</h1>

          <p>Controla las cuentas pendientes de tus clientes.</p>
        </div>
      </div>

      {/* RESUMEN */}

      <div className="credits-summary">
        <div className="summary-card">
          <span>Créditos</span>

          <strong>{totalCredits}</strong>
        </div>

        <div className="summary-card">
          <span>Por cobrar</span>

          <strong>{formatCurrency(totalToCollect)}</strong>
        </div>

        <div className="summary-card">
          <span>Total abonado</span>

          <strong>{formatCurrency(totalPaid)}</strong>
        </div>
      </div>

      {/* TABLA */}

      <div className="credits-table-container">
        {credits.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>

            <h3>No hay créditos registrados</h3>

            <p>Cuando registres una venta a crédito, aparecerá aquí.</p>
          </div>
        ) : (
          <table className="credits-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Total</th>
                <th>Abonado</th>
                <th>Pendiente</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {credits.map((credit) => {
                const paid = getPaidAmount(credit);
                const pending = getPendingAmount(credit);
                const status = getStatus(credit);

                return (
                  <tr key={credit.id}>
                    {/* CLIENTE */}

                    <td>
                      <div className="credit-customer">
                        <strong>{credit.customer_name}</strong>

                        {credit.customer_phone && (
                          <span>{credit.customer_phone}</span>
                        )}
                      </div>
                    </td>

                    {/* FECHA */}

                    <td>{formatDate(credit.created_at)}</td>

                    {/* TOTAL */}

                    <td>{formatCurrency(credit.total_amount)}</td>

                    {/* ABONADO */}

                    <td>{formatCurrency(paid)}</td>

                    {/* PENDIENTE */}

                    <td>
                      <strong>{formatCurrency(pending)}</strong>
                    </td>

                    {/* ESTADO */}

                    <td>
                      <span className={`credit-status ${status.className}`}>
                        {status.label}
                      </span>
                    </td>

                    <td>
                      <button
                        className="credit-detail-button"
                        onClick={() => fetchCreditDetails(credit)}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedCredit && (
        <div className="credit-modal-overlay">
          <div className="credit-modal">
            <div className="credit-modal-header">
              <div>
                <h2>Crédito de {selectedCredit.customer_name}</h2>

                {selectedCredit.customer_phone && (
                  <p>{selectedCredit.customer_phone}</p>
                )}
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => {
                  setSelectedCredit(null);
                  setCreditDetails(null);
                }}
              >
                ×
              </button>
            </div>

            <div className="credit-modal-content">
              {loadingDetails ? (
                <div className="loading">Cargando detalle...</div>
              ) : (
                <>
                  <div className="credit-detail-summary">
                    <div>
                      <span>Total</span>
                      <strong>
                        {formatCurrency(selectedCredit.total_amount)}
                      </strong>
                    </div>

                    <div>
                      <span>Abonado</span>
                      <strong>
                        {formatCurrency(getPaidAmount(selectedCredit))}
                      </strong>
                    </div>

                    <div>
                      <span>Pendiente</span>
                      <strong>
                        {formatCurrency(getPendingAmount(selectedCredit))}
                      </strong>
                    </div>
                  </div>

                  <div className="credit-products">
                    <h3>Productos de la venta</h3>

                    {creditDetails && creditDetails.length > 0 ? (
                      creditDetails.map((item) => (
                        <div className="credit-product-item" key={item.id}>
                          <div>
                            <strong>{item.products?.products?.name}</strong>

                            <span>SKU: {item.products?.products?.sku}</span>

                            <span>
                              Talla: {item.products?.size} · Color:{" "}
                              {item.products?.color}
                            </span>
                          </div>

                          <div className="credit-product-price">
                            <span>
                              {item.quantity} ×{" "}
                              {formatCurrency(item.unit_price)}
                            </span>

                            <strong>
                              {formatCurrency(item.quantity * item.unit_price)}
                            </strong>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p>No se encontraron productos.</p>
                    )}
                  </div>

                  <div className="credit-notes">
                    <h3>Notas</h3>

                    <p>
                      {selectedCredit.notes || "Sin notas para este crédito."}
                    </p>
                  </div>

                  <div className="credit-payments">
                    <div className="section-title">
                      <div>
                        <h3>Historial de abonos</h3>
                        <p>Consulta los pagos realizados por el cliente.</p>
                      </div>

                      {getPendingAmount(selectedCredit) > 0 && (
                        <button
                          type="button"
                          className="add-variant-button"
                          onClick={() => {
                            setError("");
                            setShowPaymentForm(true);
                          }}
                        >
                          + Registrar abono
                        </button>
                      )}
                    </div>

                    {selectedCredit.credit_payments?.length > 0 ? (
                      <div className="payments-list">
                        {selectedCredit.credit_payments.map((payment) => (
                          <div className="payment-item" key={payment.id}>
                            <div>
                              <strong>{formatCurrency(payment.amount)}</strong>

                              <span>{formatDate(payment.payment_date)}</span>

                              {payment.notes && <span>{payment.notes}</span>}
                            </div>

                            <div className="payment-actions">
                              <button
                                type="button"
                                className="payment-edit-button"
                                onClick={() => {
                                  setEditingPayment(payment);
                                  setPaymentAmount(payment.amount);
                                  setPaymentNote(payment.notes || "");
                                  setShowPaymentForm(true);
                                  setError("");
                                }}
                              >
                                Editar
                              </button>

                              <button
                                type="button"
                                className="payment-delete-button"
                                onClick={() => handleDeletePayment(payment)}
                                disabled={deletingPayment === payment.id}
                              >
                                {deletingPayment === payment.id
                                  ? "Eliminando..."
                                  : "Eliminar"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>No hay abonos registrados.</p>
                    )}

                    {showPaymentForm && (
                      <div className="payment-form">
                        <h3>
                          {editingPayment ? "Editar abono" : "Registrar abono"}
                        </h3>

                        <div className="form-group">
                          <label>Monto del abono</label>

                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            max={
                              editingPayment
                                ? getPendingAmount(selectedCredit) +
                                  Number(editingPayment.amount || 0)
                                : getPendingAmount(selectedCredit)
                            }
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            placeholder="Ej. 100.00"
                          />

                          <small>
                            Pendiente:{" "}
                            {formatCurrency(getPendingAmount(selectedCredit))}
                          </small>
                        </div>

                        <div className="form-group">
                          <label>Nota</label>

                          <input
                            type="text"
                            value={paymentNote}
                            onChange={(e) => setPaymentNote(e.target.value)}
                            placeholder="Ej. Abono semanal"
                          />
                        </div>

                        <div className="payment-form-actions">
                          <button
                            type="button"
                            className="cancel-button"
                            onClick={() => {
                              setShowPaymentForm(false);
                              setEditingPayment(null);
                              setPaymentAmount("");
                              setPaymentNote("");
                              setError("");
                            }}
                            disabled={savingPayment}
                          >
                            Cancelar
                          </button>

                          <button
                            type="button"
                            className="save-button"
                            onClick={
                              editingPayment
                                ? handleEditPayment
                                : handleAddPayment
                            }
                            disabled={savingPayment}
                          >
                            {savingPayment
                              ? "Guardando..."
                              : editingPayment
                                ? "Guardar cambios"
                                : "Guardar abono"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="credit-modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={() => {
                  setSelectedCredit(null);
                  setCreditDetails(null);
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Credits;
