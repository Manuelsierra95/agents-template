/**
 * Pure projection logic for tool entries — turns the raw `input` /
 * `simulatedOutput` of a tool call into the labelled fields the
 * `ToolCard` renders. Stays free of React so both the playground
 * renderer and any future consumer can share it.
 */

import type { ToolEntry } from "@/features/chat/utils/types"

export type ProjectionField = { label: string; value: string }

export function projectToolInput(
	tool: string,
	input: Record<string, unknown>,
): ProjectionField[] {
	switch (tool) {
		case "create_appointment":
			return [
				...(input.customerId ? [{ label: "Cliente", value: String(input.customerId) }] : []),
				...(input.serviceId ? [{ label: "Servicio", value: String(input.serviceId) }] : []),
				...(input.staffId ? [{ label: "Profesional", value: String(input.staffId) }] : []),
				...(input.startsAt
					? [{ label: "Fecha y hora", value: new Date(String(input.startsAt)).toLocaleString() }]
					: []),
				...(input.notes ? [{ label: "Notas", value: String(input.notes) }] : []),
			]
		case "reschedule_appointment":
			return [
				...(input.appointmentId
					? [{ label: "Reserva", value: String(input.appointmentId) }]
					: []),
				...(input.startsAt
					? [{ label: "Nueva fecha", value: new Date(String(input.startsAt)).toLocaleString() }]
					: []),
				...(input.staffId ? [{ label: "Profesional", value: String(input.staffId) }] : []),
			]
		case "cancel_appointment":
			return [
				...(input.appointmentId
					? [{ label: "Reserva", value: String(input.appointmentId) }]
					: []),
				...(input.reason ? [{ label: "Motivo", value: String(input.reason) }] : []),
			]
		case "create_customer":
			return [
				...(input.name ? [{ label: "Nombre", value: String(input.name) }] : []),
				...(input.phone ? [{ label: "Teléfono", value: String(input.phone) }] : []),
				...(input.email ? [{ label: "Email", value: String(input.email) }] : []),
			]
		case "save_intake":
			return [
				...(input.data && typeof input.data === "object"
					? Object.entries(input.data as Record<string, unknown>).map(([k, v]) => ({
							label: k,
							value: typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v),
						}))
					: []),
			]
		case "get_services":
		case "get_staff":
		case "get_availability":
		case "get_business":
			return []
		default:
			return []
	}
}

export function projectToolOutputSummary(
	tool: string,
	output: Record<string, unknown> | null,
): string {
	if (!output) return "Pendiente de resultado"
	switch (tool) {
		case "create_appointment": {
			const appointment = output.appointment as { id?: string; startsAt?: string } | undefined
			if (!appointment) return "Sin resultado"
			return `ID simulado ${appointment.id ?? "?"} — ${appointment.startsAt ? new Date(appointment.startsAt).toLocaleString() : "?"}`
		}
		case "cancel_appointment": {
			const appointment = output.appointment as { id?: string; status?: string } | undefined
			return appointment
				? `ID ${appointment.id} → estado simulado ${appointment.status}`
				: "Sin resultado"
		}
		case "create_customer": {
			const customer = output.customer as { id?: string; name?: string } | undefined
			return customer ? `ID simulado ${customer.id} — ${customer.name}` : "Sin resultado"
		}
		case "save_intake": {
			const intake = output.intake as { id?: string; reason?: string } | undefined
			return intake ? `ID simulado ${intake.id} — ${intake.reason}` : "Sin resultado"
		}
		case "reschedule_appointment": {
			const appointment = output.appointment as { id?: string; startsAt?: string } | undefined
			if (!appointment) return "Sin resultado"
			return `ID ${appointment.id} → ${appointment.startsAt ? new Date(appointment.startsAt).toLocaleString() : "?"}`
		}
		default:
			return "Resultado simulado"
	}
}

const TOOL_STATUS_LABEL: Record<ToolEntry["status"], string> = {
	running: "ejecutando…",
	completed: "simulado",
	failed: "error simulado",
}
