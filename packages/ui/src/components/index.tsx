// Barrel for the sidebar surface. Consumers import from
// `@workspace/ui/components/sidebar` (single path); internal cross-file
// references stay explicit so dependency direction stays auditable.

export {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  useSidebar,
  SidebarTrigger,
  SidebarRail,
  SidebarInset,
  SidebarInput,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarGroupActions,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuActions,
  SidebarMenuBadge,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  sidebarMenuButtonVariants,
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_MOBILE,
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_KEYBOARD_SHORTCUT_RIGHT,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
} from "@workspace/ui/components/sidebar"

export type {
  SidebarContextValue,
  SidebarProviderProps,
  SidebarTriggerProps,
  SidebarRailProps,
  SidebarInsetProps,
  SidebarInputProps,
  SidebarSectionProps,
  SidebarGroupLabelProps,
  SidebarGroupActionProps,
  SidebarMenuProps,
  SidebarMenuItemProps,
  SidebarMenuButtonProps,
  SidebarMenuActionProps,
  SidebarMenuBadgeProps,
  SidebarMenuSkeletonProps,
  SidebarMenuSubProps,
  SidebarMenuSubItemProps,
  SidebarMenuSubButtonProps,
} from "@workspace/ui/components/sidebar"

export type {
  SidebarSide,
  SidebarVariant,
  SidebarCollapsible,
  SidebarProps,
} from "@workspace/ui/components/sidebar"

export { Button, type ButtonProps, type ButtonSize } from "@workspace/ui/components/button"
export { Tooltip, TooltipProvider, TooltipPortalContainer } from "@workspace/ui/components/tooltip"
export { ScrollArea } from "@workspace/ui/components/scroll-area"

export {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from "@workspace/ui/components/message-scroller"

export { surfaceClasses, surfaceHoverClasses } from "@workspace/ui/lib/surface-classes.ts"
export { spring } from "@workspace/ui/lib/springs.ts"
export { useIcon, type IconComponent, type IconName } from "@workspace/ui/lib/icon-context.tsx"

export {
  Dropdown,
  DropdownLabel,
  DropdownSeparator,
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownSearch,
  DropdownEmpty,
  useDropdown,
  useDropdownMaybe,
} from "@workspace/ui/components/dropdown"

export type {
  DropdownContextValue,
  MenuItemRenderOptions,
  DropdownProps,
  DropdownMenuProps,
  DropdownTriggerProps,
  DropdownContentProps,
  DropdownSearchProps,
} from "@workspace/ui/components/dropdown"

export { MenuItem } from "@workspace/ui/components/menu-item"

export {
  Card,
  CardGroup,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  CardMedia,
  CardImage,
  CardEyebrow,
  CardFeature,
  CardButton,
} from "@workspace/ui/components/card"

export type {
  CardProps,
  CardGroupProps,
  CardLogo,
  CardButtonProps,
  CardButtonVariant,
} from "@workspace/ui/components/card"
