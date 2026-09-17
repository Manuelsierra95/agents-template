"use client"

import { InputMessage } from "@/features/chat/components"

export type ChatComposerProps = {
  /** Controlled textarea value. The composer never mutates state itself. */
  value: string
  /** Fires for every keystroke after trimming inside the fluid `InputMessage`. */
  onValueChange: (next: string) => void
  /**
   * Called when the user submits (Enter or send button, after trimming).
   * `String.prototype.trim` is applied by `InputMessage` before this
   * fires — pass through the received value as-is.
   */
  onSend: (text: string) => void
  /**
   * Called when the assistant is streaming and the user presses the
   * Stop control. Leave undefined to render a vanilla send button.
   */
  onCancel?: () => void
  /** Surface state. `true` flips the send button into Stop. */
  pending: boolean
  /** Disables the textarea + buttons entirely. */
  disabled?: boolean
  /** Optional inline error pill rendered below the composer. */
  errorMessage?: string | null
  /**
   * Placeholder for the textarea. The default is the canonical "Enter to
   * send, Shift+Enter for newline" hint copied from the fluid docs;
   * callers can override with a feature-specific phrasing.
   */
  placeholder?: string
  /** Accessible label for the textarea wrapper. */
  ariaLabel?: string
}

/**
 * Reusable composer. Wraps the fluid `InputMessage`, which already
 * implements "Enter to send, Shift+Enter for newline". The user-facing
 * snippet from the fluid docs works literally:
 *
 *   <InputMessage value={…} onValueChange={…} onSend={…} />
 *
 * `pending` toggles the send/stop button via `InputMessage`'s built-in
 * `status` prop. The error pill is rendered as a plain `role="alert"`
 * paragraph to stay readable on every theme.
 */
export function ChatComposer({
  value,
  onValueChange,
  onSend,
  onCancel,
  pending,
  disabled,
  errorMessage,
  placeholder,
  ariaLabel,
}: ChatComposerProps) {
  return (
    <section
      aria-label={ariaLabel ?? "Enviar mensaje"}
      className="shrink-0 border-t border-line/60 bg-canvas/40 p-2.5"
    >
      <InputMessage
        size="compact"
        value={value}
        onValueChange={onValueChange}
        onSend={onSend}
        onStop={onCancel}
        status={pending ? "streaming" : "idle"}
        disabled={disabled}
        clickToFocus
        placeholder={placeholder}
        sendLabel={pending && onCancel ? "Cancelar envío" : "Enviar"}
        data-testid="chat-composer-input"
      />
      {errorMessage ? (
        <p role="alert" className="mt-2 px-1 text-[12px] text-ink-3">
          No se pudo enviar el mensaje: {errorMessage}
        </p>
      ) : null}
    </section>
  )
}
