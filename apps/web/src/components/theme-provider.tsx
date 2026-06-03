"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * App theme provider.
 *
 * - Light mode is the default (light-first design).
 * - `enableSystem` lets the visitor's OS preference take over when they choose
 *   the "System" option, and the toggle exposes Light / Dark / System.
 * - `attribute="class"` toggles the `.dark` class on <html>, which the
 *   byronwade-ui tokens in globals.css key off of.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
