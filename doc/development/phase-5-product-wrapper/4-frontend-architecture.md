# Phase 5 Frontend Architecture - Desktop UI Development

## Framework Selection

### Comparison Matrix for Tauri v2 Desktop Apps

| Framework | Bundle Size | Startup | Tauri Support | Learning Curve | Tailwind | Recommendation |
|-----------|-------------|---------|---------------|----------------|----------|----------------|
| **React + Vite** | 42KB runtime | ~210ms | Official template | None (familiar) | Excellent | **Recommended** |
| Solid.js | <20KB | ~100ms | Official template | Low (JSX) | Excellent | Best performance |
| SvelteKit | 1.6KB runtime | ~65ms | Manual setup | Moderate | Good | Best bundle size |
| Preact | 3KB | Fastest | Official template | Minimal | Excellent | Ultra-minimal |
| **Next.js** | 50-100KB+ | Slower | **NOT SUPPORTED** | None | Excellent | **Avoid** |

### Why NOT Next.js for Tauri

**Critical Limitations:**
1. **No SSR** - Tauri has no Node.js runtime
2. **Static export required** - Must use `output: 'export'`
3. **API routes broken** - No backend routes work
4. **next/image broken** - Requires Vercel hosting
5. **HMR breaks** - `assetPrefix` setting breaks hot reload
6. **Tauri API issues** - `window` undefined during SSR

**Bottom Line:** Use React + Vite instead. Same familiarity, none of the gotchas.

### Recommended Stack

```
Frontend:     React 18 + TypeScript
Bundler:      Vite 5
Styling:      Tailwind CSS 3
State:        Zustand (lightweight) or React Context
Icons:        Lucide React
UI Kit:       Custom components (or shadcn/ui)
```

---

## Project Structure

```
apps/teleport-ui/
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts
├── src/
│   ├── main.tsx                 # Entry point
│   ├── App.tsx                  # Root component
│   ├── index.css                # Tailwind imports
│   ├── vite-env.d.ts
│   │
│   ├── components/
│   │   ├── ui/                  # Base UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Tabs.tsx
│   │   │   └── StatusIndicator.tsx
│   │   │
│   │   ├── layout/              # Layout components
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── StatusBar.tsx
│   │   │
│   │   └── features/            # Feature components
│   │       ├── HostPanel.tsx
│   │       ├── ConnectPanel.tsx
│   │       ├── JoinCodeDisplay.tsx
│   │       ├── PeerList.tsx
│   │       └── SyncStatus.tsx
│   │
│   ├── hooks/
│   │   ├── useTauriEvents.ts    # Event listener hook
│   │   ├── useHosting.ts        # Host state management
│   │   ├── useConnection.ts     # Connection state
│   │   └── useFileDialog.ts     # Native file picker
│   │
│   ├── store/
│   │   ├── index.ts             # Zustand store
│   │   └── slices/
│   │       ├── hostSlice.ts
│   │       ├── connectionSlice.ts
│   │       └── settingsSlice.ts
│   │
│   ├── lib/
│   │   ├── tauri.ts             # Tauri API wrappers
│   │   ├── utils.ts             # Utility functions
│   │   └── constants.ts         # App constants
│   │
│   └── types/
│       ├── events.ts            # Event type definitions
│       └── state.ts             # State type definitions
│
└── src-tauri/                   # Rust backend (existing)
```

---

## Package Configuration

### package.json

```json
{
  "name": "teleport-ui",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "lint": "eslint src --ext ts,tsx",
    "format": "prettier --write src"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-dialog": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.0",
    "lucide-react": "^0.400.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.0",
    "vite": "^5.3.0"
  }
}
```

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Tauri expects a fixed port
  server: {
    port: 5173,
    strictPort: true,
  },

  // Path aliases for cleaner imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@store': path.resolve(__dirname, './src/store'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },

  // Prevent Vite from obscuring Rust errors
  clearScreen: false,

  // Env variables starting with TAURI_ are available in frontend
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    // Tauri uses Chromium on Windows/Linux and WebKit on macOS
    target: process.env.TAURI_PLATFORM === 'windows'
      ? 'chrome105'
      : 'safari14',
    // Don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    /* Path aliases */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@hooks/*": ["./src/hooks/*"],
      "@store/*": ["./src/store/*"],
      "@lib/*": ["./src/lib/*"],
      "@types/*": ["./src/types/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

---

## Tailwind CSS Configuration

### tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enable dark mode via class
  theme: {
    extend: {
      colors: {
        // Wormhole brand colors
        wormhole: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        // Status colors
        status: {
          connected: '#22c55e',
          disconnected: '#ef4444',
          syncing: '#f59e0b',
          idle: '#6b7280',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.75rem' }],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
      spacing: {
        'titlebar': '30px', // macOS titlebar height
      },
    },
  },
  plugins: [],
}
```

### postcss.config.js

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### src/index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* Custom scrollbar for dark theme */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    @apply bg-gray-800;
  }

  ::-webkit-scrollbar-thumb {
    @apply bg-gray-600 rounded-full;
  }

  ::-webkit-scrollbar-thumb:hover {
    @apply bg-gray-500;
  }

  /* Disable text selection for app-like feel */
  body {
    @apply select-none;
    -webkit-user-select: none;
    user-select: none;
  }

  /* Allow selection in input fields */
  input, textarea {
    @apply select-text;
    -webkit-user-select: text;
    user-select: text;
  }

  /* macOS traffic light spacing */
  .titlebar-drag-region {
    -webkit-app-region: drag;
  }

  .titlebar-no-drag {
    -webkit-app-region: no-drag;
  }
}

@layer components {
  /* Glass morphism effect */
  .glass {
    @apply bg-white/10 backdrop-blur-md border border-white/20;
  }

  /* Button variants */
  .btn {
    @apply px-4 py-2 rounded-lg font-medium transition-colors duration-200
           focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900;
  }

  .btn-primary {
    @apply btn bg-wormhole-600 hover:bg-wormhole-700 text-white
           focus:ring-wormhole-500;
  }

  .btn-secondary {
    @apply btn bg-gray-700 hover:bg-gray-600 text-white
           focus:ring-gray-500;
  }

  .btn-danger {
    @apply btn bg-red-600 hover:bg-red-700 text-white
           focus:ring-red-500;
  }

  /* Input styling */
  .input {
    @apply w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2
           text-white placeholder-gray-500
           focus:outline-none focus:ring-2 focus:ring-wormhole-500 focus:border-transparent
           transition-colors duration-200;
  }

  /* Card styling */
  .card {
    @apply bg-gray-800/50 border border-gray-700 rounded-xl p-4;
  }
}
```

---

## Core Components

### src/components/ui/Button.tsx

```tsx
import { forwardRef, ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    className,
    variant = 'primary',
    size = 'md',
    loading,
    disabled,
    icon,
    children,
    ...props
  }, ref) => {
    const variants = {
      primary: 'bg-wormhole-600 hover:bg-wormhole-700 text-white focus:ring-wormhole-500',
      secondary: 'bg-gray-700 hover:bg-gray-600 text-white focus:ring-gray-500',
      danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
      ghost: 'bg-transparent hover:bg-gray-800 text-gray-300 focus:ring-gray-500',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
          'transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : icon ? (
          <span className="h-4 w-4">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

### src/components/ui/Input.tsx

```tsx
import { forwardRef, InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, suffix, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-gray-300">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500 h-5 w-5">{icon}</span>
            </div>
          )}
          <input
            ref={ref}
            className={clsx(
              'w-full bg-gray-800 border rounded-lg px-3 py-2',
              'text-white placeholder-gray-500',
              'focus:outline-none focus:ring-2 focus:ring-wormhole-500 focus:border-transparent',
              'transition-colors duration-200',
              icon && 'pl-10',
              suffix && 'pr-10',
              error ? 'border-red-500' : 'border-gray-700',
              className
            )}
            {...props}
          />
          {suffix && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              {suffix}
            </div>
          )}
        </div>
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
```

### src/components/ui/StatusIndicator.tsx

```tsx
import { clsx } from 'clsx';

type Status = 'connected' | 'disconnected' | 'syncing' | 'idle';

interface StatusIndicatorProps {
  status: Status;
  label?: string;
  showPulse?: boolean;
}

export function StatusIndicator({ status, label, showPulse = true }: StatusIndicatorProps) {
  const colors = {
    connected: 'bg-green-500',
    disconnected: 'bg-red-500',
    syncing: 'bg-amber-500',
    idle: 'bg-gray-500',
  };

  const labels = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    syncing: 'Syncing...',
    idle: 'Idle',
  };

  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-3 w-3">
        {showPulse && (status === 'connected' || status === 'syncing') && (
          <span
            className={clsx(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              colors[status]
            )}
          />
        )}
        <span
          className={clsx(
            'relative inline-flex rounded-full h-3 w-3',
            colors[status]
          )}
        />
      </span>
      <span className="text-sm text-gray-400">
        {label || labels[status]}
      </span>
    </div>
  );
}
```

---

## Tauri Integration Hooks

### src/hooks/useTauriEvents.ts

```typescript
import { useEffect, useCallback } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

type EventCallback<T> = (payload: T) => void;

export function useTauriEvent<T>(
  eventName: string,
  callback: EventCallback<T>
) {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<T>(eventName, (event) => {
        callback(event.payload);
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [eventName, callback]);
}

// Listen to multiple events
export function useTauriEvents<T extends Record<string, unknown>>(
  events: { [K in keyof T]: EventCallback<T[K]> }
) {
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      for (const [eventName, callback] of Object.entries(events)) {
        const unlisten = await listen(eventName, (event) => {
          (callback as EventCallback<unknown>)(event.payload);
        });
        unlisteners.push(unlisten);
      }
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);
}
```

### src/hooks/useFileDialog.ts

```typescript
import { useCallback } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';

interface OpenDialogOptions {
  directory?: boolean;
  multiple?: boolean;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
  defaultPath?: string;
  title?: string;
}

export function useFileDialog() {
  const openFolder = useCallback(async (options?: Omit<OpenDialogOptions, 'directory'>) => {
    const result = await open({
      directory: true,
      ...options,
    });
    return result as string | null;
  }, []);

  const openFile = useCallback(async (options?: OpenDialogOptions) => {
    const result = await open({
      directory: false,
      ...options,
    });
    return result as string | string[] | null;
  }, []);

  const saveFile = useCallback(async (options?: {
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    title?: string;
  }) => {
    return await save(options);
  }, []);

  return { openFolder, openFile, saveFile };
}
```

### src/lib/tauri.ts

```typescript
import { invoke } from '@tauri-apps/api/core';

// Type-safe invoke wrapper
export async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    console.error(`Tauri invoke error [${cmd}]:`, error);
    throw error;
  }
}

// Host commands
export const hostCommands = {
  startHosting: (path: string, port: number) =>
    tauriInvoke<void>('start_hosting', { path, port }),

  stopHosting: () =>
    tauriInvoke<void>('stop_hosting'),

  startHostingGlobal: (path: string, port: number) =>
    tauriInvoke<string>('start_hosting_global', { path, port }),
};

// Connection commands
export const connectionCommands = {
  connectToPeer: (hostIp: string, mountPath: string) =>
    tauriInvoke<void>('connect_to_peer', { hostIp, mountPath }),

  connectWithCode: (code: string, mountPath: string) =>
    tauriInvoke<void>('connect_with_code', { code, mountPath }),

  disconnect: () =>
    tauriInvoke<void>('disconnect'),
};

// System commands
export const systemCommands = {
  getSystemInfo: () =>
    tauriInvoke<{ platform: string; arch: string; version: string }>('get_system_info'),

  openInFinder: (path: string) =>
    tauriInvoke<void>('open_in_finder', { path }),
};
```

---

## State Management with Zustand

### src/store/index.ts

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface HostState {
  isHosting: boolean;
  sharePath: string | null;
  port: number;
  joinCode: string | null;
  connectedPeers: string[];
}

interface ConnectionState {
  isConnected: boolean;
  hostAddress: string | null;
  mountPoint: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  syncProgress: number;
  dirtyChunks: number;
}

interface SettingsState {
  defaultPort: number;
  defaultMountPath: string;
  autoConnect: boolean;
  theme: 'dark' | 'light' | 'system';
}

interface AppState {
  // Host slice
  host: HostState;
  setHosting: (isHosting: boolean) => void;
  setSharePath: (path: string | null) => void;
  setPort: (port: number) => void;
  setJoinCode: (code: string | null) => void;
  addPeer: (peer: string) => void;
  removePeer: (peer: string) => void;

  // Connection slice
  connection: ConnectionState;
  setConnected: (isConnected: boolean) => void;
  setHostAddress: (address: string | null) => void;
  setMountPoint: (path: string | null) => void;
  setSyncStatus: (status: ConnectionState['syncStatus']) => void;
  setSyncProgress: (progress: number) => void;
  setDirtyChunks: (count: number) => void;

  // Settings slice
  settings: SettingsState;
  updateSettings: (settings: Partial<SettingsState>) => void;

  // Actions
  reset: () => void;
}

const initialHostState: HostState = {
  isHosting: false,
  sharePath: null,
  port: 5000,
  joinCode: null,
  connectedPeers: [],
};

const initialConnectionState: ConnectionState = {
  isConnected: false,
  hostAddress: null,
  mountPoint: null,
  syncStatus: 'idle',
  syncProgress: 0,
  dirtyChunks: 0,
};

const initialSettingsState: SettingsState = {
  defaultPort: 5000,
  defaultMountPath: '/mnt/wormhole',
  autoConnect: false,
  theme: 'dark',
};

export const useStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        // Host state
        host: initialHostState,
        setHosting: (isHosting) =>
          set((state) => ({ host: { ...state.host, isHosting } })),
        setSharePath: (sharePath) =>
          set((state) => ({ host: { ...state.host, sharePath } })),
        setPort: (port) =>
          set((state) => ({ host: { ...state.host, port } })),
        setJoinCode: (joinCode) =>
          set((state) => ({ host: { ...state.host, joinCode } })),
        addPeer: (peer) =>
          set((state) => ({
            host: {
              ...state.host,
              connectedPeers: [...state.host.connectedPeers, peer],
            },
          })),
        removePeer: (peer) =>
          set((state) => ({
            host: {
              ...state.host,
              connectedPeers: state.host.connectedPeers.filter((p) => p !== peer),
            },
          })),

        // Connection state
        connection: initialConnectionState,
        setConnected: (isConnected) =>
          set((state) => ({ connection: { ...state.connection, isConnected } })),
        setHostAddress: (hostAddress) =>
          set((state) => ({ connection: { ...state.connection, hostAddress } })),
        setMountPoint: (mountPoint) =>
          set((state) => ({ connection: { ...state.connection, mountPoint } })),
        setSyncStatus: (syncStatus) =>
          set((state) => ({ connection: { ...state.connection, syncStatus } })),
        setSyncProgress: (syncProgress) =>
          set((state) => ({ connection: { ...state.connection, syncProgress } })),
        setDirtyChunks: (dirtyChunks) =>
          set((state) => ({ connection: { ...state.connection, dirtyChunks } })),

        // Settings state
        settings: initialSettingsState,
        updateSettings: (newSettings) =>
          set((state) => ({
            settings: { ...state.settings, ...newSettings },
          })),

        // Reset
        reset: () =>
          set({
            host: initialHostState,
            connection: initialConnectionState,
          }),
      }),
      {
        name: 'wormhole-storage',
        partialize: (state) => ({ settings: state.settings }),
      }
    )
  )
);
```

---

## Feature Components

### src/components/features/HostPanel.tsx

```tsx
import { useState } from 'react';
import { Folder, Wifi, Copy, Check } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { StatusIndicator } from '@components/ui/StatusIndicator';
import { useStore } from '@store';
import { useFileDialog } from '@hooks/useFileDialog';
import { hostCommands } from '@lib/tauri';

export function HostPanel() {
  const { host, setHosting, setSharePath, setPort, setJoinCode } = useStore();
  const { openFolder } = useFileDialog();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleBrowse = async () => {
    const path = await openFolder({ title: 'Select folder to share' });
    if (path) {
      setSharePath(path);
    }
  };

  const handleStartHosting = async () => {
    if (!host.sharePath) return;

    setLoading(true);
    try {
      const code = await hostCommands.startHostingGlobal(host.sharePath, host.port);
      setJoinCode(code);
      setHosting(true);
    } catch (error) {
      console.error('Failed to start hosting:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStopHosting = async () => {
    setLoading(true);
    try {
      await hostCommands.stopHosting();
      setHosting(false);
      setJoinCode(null);
    } catch (error) {
      console.error('Failed to stop hosting:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (host.joinCode) {
      await navigator.clipboard.writeText(host.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Host a Folder</h2>
        <StatusIndicator
          status={host.isHosting ? 'connected' : 'idle'}
          label={host.isHosting ? 'Hosting' : 'Not hosting'}
        />
      </div>

      {/* Share Path */}
      <div className="space-y-2">
        <Input
          label="Folder to Share"
          value={host.sharePath || ''}
          onChange={(e) => setSharePath(e.target.value)}
          placeholder="/path/to/folder"
          icon={<Folder className="h-5 w-5" />}
          suffix={
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBrowse}
              disabled={host.isHosting}
            >
              Browse
            </Button>
          }
          disabled={host.isHosting}
        />
      </div>

      {/* Port */}
      <div className="space-y-2">
        <Input
          label="Port"
          type="number"
          value={host.port}
          onChange={(e) => setPort(parseInt(e.target.value) || 5000)}
          min={1024}
          max={65535}
          disabled={host.isHosting}
        />
      </div>

      {/* Join Code Display */}
      {host.joinCode && (
        <div className="card">
          <p className="text-sm text-gray-400 mb-2">Share this code:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-900 px-4 py-3 rounded-lg font-mono text-xl text-wormhole-400 tracking-wider">
              {host.joinCode}
            </code>
            <Button
              variant="secondary"
              size="lg"
              onClick={handleCopyCode}
              icon={copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {/* Connected Peers */}
      {host.connectedPeers.length > 0 && (
        <div className="card">
          <p className="text-sm text-gray-400 mb-2">
            Connected peers ({host.connectedPeers.length})
          </p>
          <ul className="space-y-1">
            {host.connectedPeers.map((peer) => (
              <li key={peer} className="flex items-center gap-2 text-sm">
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="font-mono text-gray-300">{peer}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Button */}
      <Button
        className="w-full"
        variant={host.isHosting ? 'danger' : 'primary'}
        size="lg"
        loading={loading}
        disabled={!host.sharePath && !host.isHosting}
        onClick={host.isHosting ? handleStopHosting : handleStartHosting}
      >
        {host.isHosting ? 'Stop Hosting' : 'Start Hosting'}
      </Button>
    </div>
  );
}
```

### src/components/features/ConnectPanel.tsx

```tsx
import { useState } from 'react';
import { Link, FolderOpen, HardDrive } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { StatusIndicator } from '@components/ui/StatusIndicator';
import { useStore } from '@store';
import { useFileDialog } from '@hooks/useFileDialog';
import { connectionCommands } from '@lib/tauri';

export function ConnectPanel() {
  const { connection, setConnected, setHostAddress, setMountPoint } = useStore();
  const { openFolder } = useFileDialog();
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [localMountPath, setLocalMountPath] = useState(connection.mountPoint || '');

  const handleBrowse = async () => {
    const path = await openFolder({ title: 'Select mount point' });
    if (path) {
      setLocalMountPath(path);
      setMountPoint(path);
    }
  };

  const handleConnect = async () => {
    if (!joinCode || !localMountPath) return;

    setLoading(true);
    try {
      await connectionCommands.connectWithCode(joinCode, localMountPath);
      setConnected(true);
      setHostAddress(joinCode);
    } catch (error) {
      console.error('Failed to connect:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await connectionCommands.disconnect();
      setConnected(false);
      setHostAddress(null);
    } catch (error) {
      console.error('Failed to disconnect:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Connect to Peer</h2>
        <StatusIndicator
          status={connection.isConnected ? 'connected' : 'disconnected'}
        />
      </div>

      {/* Join Code Input */}
      <div className="space-y-2">
        <Input
          label="Join Code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          icon={<Link className="h-5 w-5" />}
          disabled={connection.isConnected}
          className="font-mono tracking-wider"
        />
      </div>

      {/* Mount Point */}
      <div className="space-y-2">
        <Input
          label="Mount Point"
          value={localMountPath}
          onChange={(e) => {
            setLocalMountPath(e.target.value);
            setMountPoint(e.target.value);
          }}
          placeholder="/mnt/wormhole"
          icon={<FolderOpen className="h-5 w-5" />}
          suffix={
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBrowse}
              disabled={connection.isConnected}
            >
              Browse
            </Button>
          }
          disabled={connection.isConnected}
        />
      </div>

      {/* Sync Status (when connected) */}
      {connection.isConnected && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Sync Status</span>
            <StatusIndicator
              status={connection.syncStatus === 'syncing' ? 'syncing' : 'idle'}
              label={connection.syncStatus === 'syncing'
                ? `Syncing... ${connection.syncProgress}%`
                : 'Up to date'}
            />
          </div>
          {connection.dirtyChunks > 0 && (
            <p className="text-xs text-amber-500">
              {connection.dirtyChunks} chunks pending upload
            </p>
          )}
          {connection.syncStatus === 'syncing' && (
            <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-wormhole-500 transition-all duration-300"
                style={{ width: `${connection.syncProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Mount Info */}
      {connection.isConnected && connection.mountPoint && (
        <div className="card flex items-center gap-3">
          <HardDrive className="h-5 w-5 text-wormhole-500" />
          <div>
            <p className="text-sm font-medium text-white">Mounted at</p>
            <p className="text-xs text-gray-400 font-mono">{connection.mountPoint}</p>
          </div>
        </div>
      )}

      {/* Action Button */}
      <Button
        className="w-full"
        variant={connection.isConnected ? 'danger' : 'primary'}
        size="lg"
        loading={loading}
        disabled={(!joinCode || !localMountPath) && !connection.isConnected}
        onClick={connection.isConnected ? handleDisconnect : handleConnect}
      >
        {connection.isConnected ? 'Disconnect' : 'Connect'}
      </Button>
    </div>
  );
}
```

---

## Main App Component

### src/App.tsx

```tsx
import { useState, useEffect } from 'react';
import { HardDrive, Link, Settings, Info } from 'lucide-react';
import { HostPanel } from '@components/features/HostPanel';
import { ConnectPanel } from '@components/features/ConnectPanel';
import { StatusIndicator } from '@components/ui/StatusIndicator';
import { useStore } from '@store';
import { useTauriEvent } from '@hooks/useTauriEvents';
import { ServiceEvent } from '@types/events';

type Tab = 'host' | 'connect';

function App() {
  const [tab, setTab] = useState<Tab>('host');
  const {
    host,
    connection,
    setHosting,
    addPeer,
    removePeer,
    setConnected,
    setSyncProgress,
    setDirtyChunks,
  } = useStore();

  // Listen to host events
  useTauriEvent<ServiceEvent>('host-event', (event) => {
    console.log('Host event:', event);
    if ('HostStarted' in event) {
      setHosting(true);
    } else if ('ClientConnected' in event) {
      addPeer(event.ClientConnected.peer_addr);
    } else if ('Error' in event) {
      console.error('Host error:', event.Error.message);
    }
  });

  // Listen to mount events
  useTauriEvent<ServiceEvent>('mount-event', (event) => {
    console.log('Mount event:', event);
    if ('MountReady' in event) {
      setConnected(true);
    } else if ('SyncProgress' in event) {
      setSyncProgress(event.SyncProgress.percent);
    } else if ('Error' in event) {
      console.error('Mount error:', event.Error.message);
    }
  });

  const tabs = [
    { id: 'host' as const, label: 'Host', icon: HardDrive },
    { id: 'connect' as const, label: 'Connect', icon: Link },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header with drag region */}
      <header className="titlebar-drag-region h-12 flex items-center justify-between px-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          {/* Space for macOS traffic lights */}
          <div className="w-16" />
          <h1 className="text-sm font-semibold">Wormhole</h1>
        </div>
        <div className="titlebar-no-drag flex items-center gap-1">
          <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
            <Settings className="h-4 w-4 text-gray-400" />
          </button>
          <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
            <Info className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex border-b border-gray-800">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors
              ${tab === id
                ? 'text-wormhole-400 border-b-2 border-wormhole-500 bg-wormhole-500/5'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/50'
              }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-y-auto">
        {tab === 'host' && <HostPanel />}
        {tab === 'connect' && <ConnectPanel />}
      </main>

      {/* Status Bar */}
      <footer className="h-8 flex items-center justify-between px-4 border-t border-gray-800 bg-gray-900/80 text-xs">
        <div className="flex items-center gap-4">
          {host.isHosting && (
            <StatusIndicator
              status="connected"
              label={`Hosting • ${host.connectedPeers.length} peers`}
              showPulse={false}
            />
          )}
          {connection.isConnected && (
            <StatusIndicator
              status={connection.syncStatus === 'syncing' ? 'syncing' : 'connected'}
              label={connection.syncStatus === 'syncing' ? 'Syncing' : 'Connected'}
              showPulse={false}
            />
          )}
          {!host.isHosting && !connection.isConnected && (
            <span className="text-gray-500">Ready</span>
          )}
        </div>
        <span className="text-gray-600">v0.1.0</span>
      </footer>
    </div>
  );
}

export default App;
```

---

## Cross-Platform Considerations

### WebView Differences

| Platform | WebView Engine | CSS Consideration |
|----------|---------------|-------------------|
| macOS | WKWebView (Safari) | Most restrictive - test here first |
| Windows | WebView2 (Chromium) | Modern CSS works well |
| Linux | WebKitGTK | Similar to Safari |

### Platform-Specific Styling

```tsx
// src/hooks/usePlatform.ts
import { platform } from '@tauri-apps/plugin-os';
import { useEffect, useState } from 'react';

export function usePlatform() {
  const [os, setOs] = useState<string>('');

  useEffect(() => {
    platform().then(setOs);
  }, []);

  return {
    isMacOS: os === 'macos',
    isWindows: os === 'windows',
    isLinux: os === 'linux',
  };
}
```

```tsx
// Usage in component
function Header() {
  const { isMacOS } = usePlatform();

  return (
    <header className={clsx(
      'h-12 flex items-center',
      isMacOS && 'pl-20', // Space for traffic lights
    )}>
      {/* ... */}
    </header>
  );
}
```

---

## Performance Optimization

### Bundle Size Targets

| Metric | Target | Method |
|--------|--------|--------|
| Initial JS | < 100KB gzip | Code splitting, tree shaking |
| CSS | < 20KB gzip | PurgeCSS via Tailwind |
| First Paint | < 200ms | Minimal critical path |
| TTI | < 500ms | Lazy load non-critical |

### Vite Optimizations

```typescript
// vite.config.ts additions
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'tauri-vendor': ['@tauri-apps/api'],
        },
      },
    },
  },
});
```

---

## Development Workflow

```bash
# Initial setup
cd apps/teleport-ui
npm install

# Development (starts both Vite and Tauri)
npm run tauri dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Production build
npm run tauri build

# Build for specific platform
npm run tauri build -- --target x86_64-pc-windows-msvc
npm run tauri build -- --target x86_64-apple-darwin
npm run tauri build -- --target x86_64-unknown-linux-gnu
```

---

## Summary

**Recommended Stack:**
- **React + Vite** (familiar, excellent Tauri support)
- **Tailwind CSS** (utility-first, great DX)
- **Zustand** (lightweight state management)
- **TypeScript** (type safety for Tauri invoke)

**Key Points:**
1. Avoid Next.js - use React + Vite instead
2. Test CSS on Safari/WebKit first (most restrictive)
3. Use `data-tauri-drag-region` for custom titlebars
4. Leverage Tauri events for real-time updates
5. Keep bundle size small for fast startup
