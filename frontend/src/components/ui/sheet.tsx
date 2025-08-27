import * as React from "react"
import { cn } from "../../lib/utils"
import { X } from "lucide-react"

interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  onClose?: () => void
}

const Sheet = React.forwardRef<HTMLDivElement, SheetProps>(
  ({ open = false, onOpenChange, children }, ref) => {
    if (!open) return null
    
    return (
      <div ref={ref}>
        {React.Children.map(children, child => {
          if (React.isValidElement(child) && child.type === SheetContent) {
            return React.cloneElement(child as any, { onClose: () => onOpenChange?.(false) })
          }
          return child
        })}
      </div>
    )
  }
)
Sheet.displayName = "Sheet"

const SheetTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ children, onClick, asChild, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as any, {
      ...props,
      onClick: (e: React.MouseEvent) => {
        onClick?.(e as any)
        ;(children as any).props?.onClick?.(e)
      },
      ref
    })
  }
  
  return (
    <button ref={ref} {...props} onClick={onClick}>
      {children}
    </button>
  )
})
SheetTrigger.displayName = "SheetTrigger"

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, children, onClose, ...props }, ref) => {
    return (
      <>
        <div 
          className="fixed inset-0 z-50 bg-black/50 animate-in fade-in"
          onClick={onClose}
        />
        <div
          ref={ref}
          className={cn(
            "fixed right-0 top-0 z-50 h-full bg-background shadow-lg animate-in slide-in-from-right",
            className
          )}
          {...props}
        >
          <button
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
          {children}
        </div>
      </>
    )
  }
)
SheetContent.displayName = "SheetContent"

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-2 p-6", className)}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref as any}
    className={cn("text-lg font-semibold", className)}
    {...props}
  />
))
SheetTitle.displayName = "SheetTitle"

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = "SheetDescription"

export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
}