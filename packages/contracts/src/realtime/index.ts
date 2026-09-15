/**
 * Realtime event contracts — wire shape shared by `apps/api` (publishers)
 * and `apps/web` (consumer via SSE → `useEventStream`). See
 * `./schemas.ts` for the discriminated union and the full list of event
 * types.
 */
export {
  RealtimeEventSchema,
  MessageCreatedEventSchema,
  ActivityCreatedEventSchema,
  ApprovalCreatedEventSchema,
  ApprovalUpdatedEventSchema,
  ConversationUpdatedEventSchema,
  ConversationCreatedEventSchema,
  AppointmentCreatedEventSchema,
  AppointmentUpdatedEventSchema,
  REALTIME_EVENT_TYPES,
  type RealtimeEvent,
  type RealtimeEventType,
} from "./schemas"
