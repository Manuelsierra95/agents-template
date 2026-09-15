// TODO(fase 2): reactivar el módulo calendar — falta por implementar.
// El componente original vivía en `apps/web/features/calendar/` (no
// migrado) e importaba `WorkspaceSkeleton` desde
// `@/features/calendar/components/workspace/workspace-skeleton`.
// Cuando se introduzca la feature, este archivo debe ser:
//
// import { WorkspaceSkeleton } from "@/features/calendar/components/workspace/workspace-skeleton"
//
// export default function CalendarLoading() {
//   return <WorkspaceSkeleton />
// }
//
// Para evitar 404 en `/dashboard/calendar` mientras tanto, lo dejamos
// como un archivo neutro.
export default function CalendarLoading() {
  return null
}
