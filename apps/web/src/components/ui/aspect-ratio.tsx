"use client"

import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio"
import * as React from "react"

function AspectRatio({
  ...props
}: React.ComponentPropsWithoutRef<typeof AspectRatioPrimitive.Root>) {
  return <AspectRatioPrimitive.Root data-slot="aspect-ratio" {...props} />
}

export { AspectRatio }
