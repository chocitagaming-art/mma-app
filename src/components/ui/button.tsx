import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Every button speaks the header nav's UFC voice (owner, 29-oct-2026: «las
// letras de "Más noticias y vídeos", "Próximas carteleras" y etc., es decir
// botones, no llevan nuestra tipografía de letra estilo UFC»): Saira
// Condensed, semibold caps, the nav's tracking. Exported for the few
// button-looking links that cannot be a Button (their own colours, or a label
// that has to wrap): they add only their font size.
//
// One step bigger than the Archivo it replaces (text-sm): condensed caps at
// 14 px read smaller, every letter narrower. Measured on 29-oct: at 15 px the
// caps stand 10.5 px tall against Archivo's 8 px x-height, and a label keeps
// about its width (the home's «Más noticias y vídeos», lg: 201 → 216 px).
// 15 px for the default size, 16 for lg (the big CTAs), 14 sm, 13 xs.
//
// 🪤 «→» is NOT in Saira's latin subset: next/font paints it with the Arial
// of its fallback face, thin and 2.5 px below the caps. A button that wants an
// arrow takes lucide's ArrowRight with strokeWidth 2.5, the weight of Saira's
// semibold stems (button.test.ts reads the source for a text arrow).
const buttonType = "font-display font-semibold uppercase tracking-wide"

const buttonCva = cva(
  `group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding ${buttonType} text-[15px] whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
  {
    variants: {
      variant: {
        // 🪤 El hover NO puede atenuar el fondo: en oscuro `bg-primary/80` hunde
        // la tinta a 3,39:1 (ver contrast.test.ts). El anillo da el feedback sin
        // mover un solo color, igual que hace focus-visible aqui al lado.
        default: "bg-primary text-primary-foreground hover:ring-3 hover:ring-primary/40",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-[13px] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-sm in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 text-base has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    // link is the inline text-link look, a link inside a sentence or a card:
    // it keeps the body font as written. In caps it would shout like a CTA.
    compoundVariants: [
      {
        variant: "link",
        class: "font-sans font-medium normal-case tracking-normal text-sm",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// Merged here and not only inside <Button>: link undoes the base's type, and
// used bare as a className (the shadcn idiom, <Link className={buttonVariants()}>)
// both font-display and font-sans would reach the CSS, and which one wins
// would depend on the order Tailwind writes them in.
function buttonVariants(props?: Parameters<typeof buttonCva>[0]) {
  return cn(buttonCva(props))
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonType, buttonVariants }
