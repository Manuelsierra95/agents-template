import { WorkspacePane } from "@/components/layout/workspace-pane"
import { CalendarWeekView } from "@/features/calendar/components/calendar"
import { CalendarPageShell } from "./_components/calendar-page-shell"

export default function CalendarPage() {
  return (
    <WorkspacePane>
      <CalendarPageShell>
        <CalendarWeekView />
      </CalendarPageShell>
    </WorkspacePane>
  )
}