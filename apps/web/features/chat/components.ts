/**
 * The chat module's public component barrel. Consumers write
 * `import { ChatMessage, InputMessage, … } from "@/features/chat/components"`
 * and the rest of the file system stays free of `@workspace/ui/...`
 * import paths.
 *
 * Every component here is re-exported verbatim from `@workspace/ui`.
 * The fluid `InputMessage` already implements "Enter to send, Shift+Enter
 * for newline" (see input-message.tsx — `if (e.key === "Enter" && !e.shiftKey)`),
 * so we never wrap it: the user's snippet from the docs works literally.
 */

export { ChatMessage } from "@workspace/ui/components/chat-message"
export type { ChatMessageProps } from "@workspace/ui/components/chat-message"

export { InputMessage } from "@workspace/ui/components/input-message"
export type { InputMessageProps } from "@workspace/ui/components/input-message"

export { ThinkingIndicator } from "@workspace/ui/components/thinking-indicator"
export type { ThinkingIndicatorProps } from "@workspace/ui/components/thinking-indicator"

export {
	ThinkingSteps,
	ThinkingStepsHeader,
	ThinkingStepsContent,
	ThinkingStep,
	ThinkingStepDetails,
	ThinkingStepSource,
	ThinkingStepSources,
	ThinkingStepImage,
} from "@workspace/ui/components/thinking-steps"
