import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatFirestoreDate } from "@/lib/pdf/format-firestore-date";
import type { MaterialOtListRow } from "@/modules/materials/types";
import type { WorkOrder } from "@/modules/work-orders/types";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#0f172a",
    paddingBottom: 10,
  },
  brand: { fontSize: 18, fontWeight: "bold", color: "#0f172a" },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    backgroundColor: "#f4f4f5",
    padding: 6,
    marginTop: 14,
    marginBottom: 8,
  },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 120, fontWeight: "bold", color: "#52525b" },
  value: { flex: 1 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    paddingTop: 8,
    textAlign: "center",
    color: "#a1a1aa",
    fontSize: 8,
  },
  signatureBlock: { marginTop: 16 },
  signatureImg: { width: 140, height: 56, marginBottom: 4 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#fafafa",
    padding: 5,
    fontWeight: "bold",
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
  },
  tableRow: { flexDirection: "row", padding: 5, borderBottomWidth: 1, borderBottomColor: "#e4e4e7" },
});

function materialCodigo(m: MaterialOtListRow): string {
  return m._kind === "field" ? m.origen : m.codigo_material;
}

function materialDesc(m: MaterialOtListRow): string {
  return m._kind === "field" ? m.descripcion : m.descripcion_snapshot;
}

function materialCant(m: MaterialOtListRow): number {
  return m._kind === "field" ? m.cantidad : m.cantidad_consumida;
}

function materialUd(m: MaterialOtListRow): string {
  return m._kind === "field" ? m.unidad : m.unidad_medida;
}

export function WorkOrderPdfDocument({
  workOrder,
  materiales,
}: {
  workOrder: WorkOrder;
  materiales: MaterialOtListRow[];
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>Arauco-Seam</Text>
            <Text>Mantenimiento industrial</Text>
          </View>
          <View style={{ textAlign: "right" }}>
            <Text style={{ fontWeight: "bold" }}>OT {workOrder.n_ot}</Text>
            <Text>Estado: {workOrder.estado}</Text>
            <Text>Creada: {formatFirestoreDate(workOrder.created_at)}</Text>
          </View>
        </View>

        <View style={styles.sectionTitle}>
          <Text>ACTIVO Y UBICACIÓN</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Código activo:</Text>
          <Text style={styles.value}>{workOrder.codigo_activo_snapshot}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Ubicación:</Text>
          <Text style={styles.value}>{workOrder.ubicacion_tecnica}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Centro:</Text>
          <Text style={styles.value}>{workOrder.centro}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Tipo / esp.:</Text>
          <Text style={styles.value}>
            {workOrder.tipo_trabajo} · {workOrder.especialidad} · {workOrder.frecuencia}
          </Text>
        </View>

        <View style={styles.sectionTitle}>
          <Text>EJECUCIÓN</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Técnico:</Text>
          <Text style={styles.value}>{workOrder.tecnico_asignado_nombre ?? "—"}</Text>
        </View>
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontWeight: "bold", marginBottom: 4 }}>Trabajo / informe:</Text>
          <Text style={{ lineHeight: 1.45 }}>{workOrder.texto_trabajo || "—"}</Text>
        </View>

        {materiales.length > 0 ? (
          <>
            <View style={styles.sectionTitle}>
              <Text>MATERIALES CONSUMIDOS</Text>
            </View>
            <View style={styles.tableHeader}>
              <Text style={{ width: "22%" }}>Código</Text>
              <Text style={{ width: "48%" }}>Descripción</Text>
              <Text style={{ width: "15%", textAlign: "right" }}>Cant.</Text>
              <Text style={{ width: "15%" }}>Ud.</Text>
            </View>
            {materiales.map((m) => (
              <View key={m.id} style={styles.tableRow}>
                <Text style={{ width: "22%", fontWeight: "bold" }}>{materialCodigo(m)}</Text>
                <Text style={{ width: "48%" }}>{materialDesc(m)}</Text>
                <Text style={{ width: "15%", textAlign: "right" }}>{materialCant(m)}</Text>
                <Text style={{ width: "15%" }}>{materialUd(m)}</Text>
              </View>
            ))}
          </>
        ) : null}

        {workOrder.firma_tecnico ? (
          <View style={styles.signatureBlock}>
            <Text style={{ fontWeight: "bold", marginBottom: 6 }}>Firma técnico</Text>
            <Image src={workOrder.firma_tecnico.image_data_url_base64} style={styles.signatureImg} />
            <Text>{workOrder.firma_tecnico.signer_display_name}</Text>
            <Text>{formatFirestoreDate(workOrder.firma_tecnico.signed_at)}</Text>
          </View>
        ) : null}

        {workOrder.firma_usuario ? (
          <View style={styles.signatureBlock}>
            <Text style={{ fontWeight: "bold", marginBottom: 6 }}>Firma usuario planta</Text>
            <Image src={workOrder.firma_usuario.image_data_url_base64} style={styles.signatureImg} />
            <Text>{workOrder.firma_usuario.signer_display_name}</Text>
            <Text>{formatFirestoreDate(workOrder.firma_usuario.signed_at)}</Text>
          </View>
        ) : null}

        {workOrder.firma_usuario_pad ? (
          <View style={styles.signatureBlock}>
            <Text style={{ fontWeight: "bold", marginBottom: 6 }}>Firma usuario (conformidad)</Text>
            <Image src={workOrder.firma_usuario_pad} style={styles.signatureImg} />
            <Text>{workOrder.firma_usuario_pad_nombre ?? "—"}</Text>
            <Text>{formatFirestoreDate(workOrder.firmado_at)}</Text>
          </View>
        ) : null}

        {workOrder.firma_tecnico_pad ? (
          <View style={styles.signatureBlock}>
            <Text style={{ fontWeight: "bold", marginBottom: 6 }}>Firma técnico (cierre)</Text>
            <Image src={workOrder.firma_tecnico_pad} style={styles.signatureImg} />
            <Text>{workOrder.firma_tecnico_pad_nombre ?? "—"}</Text>
            <Text>{formatFirestoreDate(workOrder.firmado_at)}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Documento generado por Arauco-Seam · ID interno {workOrder.id}
        </Text>
      </Page>
    </Document>
  );
}
