import * as React from 'react'
import { cn } from '@/lib/utils'

export interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number
  maxHeight?: number
}

/**
 * Textarea de altura dinâmica que se ajusta automaticamente ao conteúdo (scrollHeight).
 * Não corta o texto, não adiciona rolagem interna (salvo se exceder maxHeight, caso definido),
 * sem reticências, e redimensiona imediatamente quando o valor é atualizado programaticamente
 * ou pelo usuário.
 */
export const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  ({ className, value, minRows = 1, maxHeight, onChange, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null)

    // Sincroniza refs externa e interna
    React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement)

    const resize = React.useCallback(() => {
      const el = innerRef.current
      if (!el) return
      // Reseta temporariamente para auto para calcular o scrollHeight real com precisão
      el.style.height = 'auto'
      const newHeight = el.scrollHeight
      if (maxHeight && newHeight > maxHeight) {
        el.style.height = `${maxHeight}px`
        el.style.overflowY = 'auto'
      } else {
        el.style.height = `${newHeight}px`
        el.style.overflowY = 'hidden'
      }
    }, [maxHeight])

    // Ajusta na montagem e sempre que o `value` mudar (inclusive quando preenchido via auto-busca do colaborador)
    React.useLayoutEffect(() => {
      resize()
    }, [value, resize])

    // Também observa redimensionamentos de layout ou fonts carregadas
    React.useEffect(() => {
      const el = innerRef.current
      if (!el || typeof ResizeObserver === 'undefined') return
      const ro = new ResizeObserver(() => {
        // Evita loops infinitos verificando se a largura mudou
        resize()
      })
      ro.observe(el)
      return () => ro.disconnect()
    }, [resize])

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      resize()
      onChange?.(e)
    }

    return (
      <textarea
        ref={innerRef}
        rows={minRows}
        value={value}
        onChange={handleChange}
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs ring-offset-background',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden transition-[height] duration-75',
          className,
        )}
        {...props}
      />
    )
  },
)

AutoResizeTextarea.displayName = 'AutoResizeTextarea'
