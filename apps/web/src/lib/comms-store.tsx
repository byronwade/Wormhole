"use client";

import * as React from "react";

/**
 * In-memory messaging backend for the Messages Cockpit layout — seeded mock data
 * + React reducer with simulated commit latency and an opt-in fake realtime feed.
 * This is the swappable boundary: pass `source` to replace the seed, or implement
 * the same actions/realtime against a real API behind `MessagesProvider`.
 */

export type ConversationFlag = "pinned" | "archived" | "unread" | "spam";
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface Contact {
  id: string;
  name: string;
  handle: string;
  avatarSeed: string;
}

export interface Message {
  id: string;
  conversationId: string;
  body: string;
  direction: "in" | "out";
  at: number;
  status: MessageStatus;
  reactions: string[];
  scheduledAt?: number;
  attachments?: { name: string; kind: "image" | "file" }[];
}

export interface Conversation {
  id: string;
  contact: Contact;
  number: string;
  lastMessage: string;
  unread: number;
  flags: ConversationFlag[];
  updatedAt: number;
  hidden?: boolean;
}

export interface CommsSource {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
}

/** Deterministic seed — fixed timestamps so renders/tests are stable. */
const BASE = 1_700_000_000_000;
const min = (n: number) => n * 60_000;

const SEED_CONTACTS: Contact[] = [
  { id: "c1", name: "Ana Reyes", handle: "+1 415 555 0112", avatarSeed: "ana-reyes" },
  { id: "c2", name: "Dev Patel", handle: "+1 415 555 0143", avatarSeed: "dev-patel" },
  { id: "c3", name: "Mara Lin", handle: "+1 628 555 0190", avatarSeed: "mara-lin" },
  { id: "c4", name: "Theo Novak", handle: "+1 510 555 0177", avatarSeed: "theo-novak" },
  { id: "c5", name: "Priya Shah", handle: "+1 408 555 0166", avatarSeed: "priya-shah" },
];

function seedSource(): CommsSource {
  const conversations: Conversation[] = [
    { id: "v1", contact: SEED_CONTACTS[0], number: "Main line", lastMessage: "Sounds good — talk then.", unread: 2, flags: ["pinned"], updatedAt: BASE - min(2) },
    { id: "v2", contact: SEED_CONTACTS[1], number: "Main line", lastMessage: "Invoice is attached.", unread: 0, flags: [], updatedAt: BASE - min(40) },
    { id: "v3", contact: SEED_CONTACTS[2], number: "Support", lastMessage: "Can you resend the link?", unread: 1, flags: ["unread"], updatedAt: BASE - min(120) },
    { id: "v4", contact: SEED_CONTACTS[3], number: "Support", lastMessage: "Thanks for the quick reply!", unread: 0, flags: [], updatedAt: BASE - min(1500) },
    { id: "v5", contact: SEED_CONTACTS[4], number: "Sales", lastMessage: "Let's schedule a demo.", unread: 0, flags: ["archived"], updatedAt: BASE - min(1440) },
  ];
  const mk = (cid: string, i: number, dir: "in" | "out", body: string): Message => ({
    id: `${cid}-m${i}`,
    conversationId: cid,
    body,
    direction: dir,
    at: BASE - min(200) + min(i * 3),
    status: dir === "out" ? "read" : "delivered",
    reactions: [],
  });
  const messages: Record<string, Message[]> = {
    v1: [mk("v1", 0, "in", "Hey! Are we still on for Thursday?"), mk("v1", 1, "out", "Yes — 2pm works."), mk("v1", 2, "in", "Sounds good — talk then.")],
    v2: [mk("v2", 0, "out", "Here's the updated quote."), mk("v2", 1, "in", "Invoice is attached.")],
    v3: [mk("v3", 0, "in", "The onboarding link expired."), mk("v3", 1, "in", "Can you resend the link?")],
    v4: [mk("v4", 0, "out", "All set on our end."), mk("v4", 1, "in", "Thanks for the quick reply!")],
    v5: [mk("v5", 0, "in", "Interested in the team plan."), mk("v5", 1, "out", "Let's schedule a demo.")],
  };
  return { conversations, messages };
}

type State = { conversations: Conversation[]; messages: Record<string, Message[]>; activeId: string | null };

type Action =
  | { type: "patchConv"; id: string; patch: Partial<Conversation> }
  | { type: "upsertConv"; conv: Conversation }
  | { type: "dropConv"; id: string }
  | { type: "addMessage"; message: Message }
  | { type: "patchMessage"; conversationId: string; id: string; patch: Partial<Message> }
  | { type: "setActive"; id: string | null };

const sortConvs = (list: Conversation[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt);

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "patchConv":
      return {
        ...state,
        conversations: sortConvs(state.conversations.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c))),
      };
    case "upsertConv": {
      const exists = state.conversations.some((c) => c.id === action.conv.id);
      const conversations = exists
        ? state.conversations.map((c) => (c.id === action.conv.id ? { ...c, ...action.conv } : c))
        : [action.conv, ...state.conversations];
      return { ...state, conversations: sortConvs(conversations) };
    }
    case "dropConv":
      return { ...state, conversations: state.conversations.filter((c) => c.id !== action.id), activeId: state.activeId === action.id ? null : state.activeId };
    case "addMessage": {
      const list = state.messages[action.message.conversationId] ?? [];
      return { ...state, messages: { ...state.messages, [action.message.conversationId]: [...list, action.message] } };
    }
    case "patchMessage": {
      const list = state.messages[action.conversationId] ?? [];
      return {
        ...state,
        messages: { ...state.messages, [action.conversationId]: list.map((m) => (m.id === action.id ? { ...m, ...action.patch } : m)) },
      };
    }
    case "setActive":
      return { ...state, activeId: action.id };
  }
}

export interface CommsActions {
  send: (conversationId: string, body: string, attachments?: Message["attachments"]) => Promise<void>;
  schedule: (conversationId: string, body: string, scheduledAt: number) => void;
  react: (conversationId: string, messageId: string, emoji: string) => void;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  toggleFlag: (id: string, flag: ConversationFlag) => void;
  archive: (id: string) => void;
  remove: (id: string) => void;
  bulk: (ids: string[], op: "read" | "archive" | "remove") => void;
  createConversation: (contact: Contact, number?: string) => string;
  setActive: (id: string | null) => void;
  liveUpsert: (conv: Conversation) => void;
  liveDrop: (id: string) => void;
}

const DataCtx = React.createContext<{ conversations: Conversation[]; messages: Record<string, Message[]>; activeId: string | null } | null>(null);
const ActionsCtx = React.createContext<CommsActions | null>(null);

export function useMessages() {
  const ctx = React.useContext(DataCtx);
  if (!ctx) throw new Error("useMessages must be used within <MessagesProvider>");
  return ctx;
}

export function useMessagesActions() {
  const ctx = React.useContext(ActionsCtx);
  if (!ctx) throw new Error("useMessagesActions must be used within <MessagesProvider>");
  return ctx;
}

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${++uid}`;

export function MessagesProvider({
  children,
  source,
  latencyMs = 400,
  simulateRealtime = false,
}: {
  children: React.ReactNode;
  source?: CommsSource;
  latencyMs?: number;
  simulateRealtime?: boolean;
}) {
  const init = React.useMemo<State>(() => {
    const s = source ?? seedSource();
    return { conversations: sortConvs(s.conversations), messages: s.messages, activeId: null };
  }, [source]);
  const [state, dispatch] = React.useReducer(reducer, init);

  const commit = React.useCallback(
    (fn?: () => void) => new Promise<void>((resolve) => setTimeout(() => { fn?.(); resolve(); }, latencyMs)),
    [latencyMs],
  );

  const actions = React.useMemo<CommsActions>(() => {
    const now = () => BASE + min(++uid);
    return {
      send: async (conversationId, body, attachments) => {
        const id = nextId("m");
        const at = now();
        dispatch({ type: "addMessage", message: { id, conversationId, body, direction: "out", at, status: "sending", reactions: [], attachments } });
        dispatch({ type: "patchConv", id: conversationId, patch: { lastMessage: body, updatedAt: at } });
        await commit(() => dispatch({ type: "patchMessage", conversationId, id, patch: { status: "sent" } }));
      },
      schedule: (conversationId, body, scheduledAt) => {
        dispatch({ type: "addMessage", message: { id: nextId("m"), conversationId, body, direction: "out", at: now(), status: "sending", reactions: [], scheduledAt } });
      },
      react: (conversationId, messageId, emoji) => {
        const list = state.messages[conversationId] ?? [];
        const m = list.find((x) => x.id === messageId);
        const reactions = m && m.reactions.includes(emoji) ? m.reactions.filter((e) => e !== emoji) : [...(m?.reactions ?? []), emoji];
        dispatch({ type: "patchMessage", conversationId, id: messageId, patch: { reactions } });
      },
      markRead: (id) => dispatch({ type: "patchConv", id, patch: { unread: 0, flags: flagsWithout(state, id, "unread") } }),
      markUnread: (id) => dispatch({ type: "patchConv", id, patch: { unread: 1, flags: flagsWith(state, id, "unread") } }),
      toggleFlag: (id, flag) => {
        const conv = state.conversations.find((c) => c.id === id);
        const has = !!conv?.flags.includes(flag);
        dispatch({ type: "patchConv", id, patch: { flags: has ? conv!.flags.filter((f) => f !== flag) : [...(conv?.flags ?? []), flag] } });
      },
      archive: (id) => dispatch({ type: "patchConv", id, patch: { flags: flagsWith(state, id, "archived") } }),
      remove: (id) => dispatch({ type: "dropConv", id }),
      bulk: (ids, op) => ids.forEach((id) => {
        if (op === "read") dispatch({ type: "patchConv", id, patch: { unread: 0, flags: flagsWithout(state, id, "unread") } });
        else if (op === "archive") dispatch({ type: "patchConv", id, patch: { flags: flagsWith(state, id, "archived") } });
        else dispatch({ type: "dropConv", id });
      }),
      createConversation: (contact, number = "Main line") => {
        const id = nextId("v");
        dispatch({ type: "upsertConv", conv: { id, contact, number, lastMessage: "", unread: 0, flags: [], updatedAt: now() } });
        dispatch({ type: "setActive", id });
        return id;
      },
      setActive: (id) => dispatch({ type: "setActive", id }),
      liveUpsert: (conv) => dispatch({ type: "upsertConv", conv }),
      liveDrop: (id) => dispatch({ type: "dropConv", id }),
    };
    // state is read inside the callbacks; recompute when it changes so they see fresh data.
  }, [state, commit]);

  React.useEffect(() => {
    if (!simulateRealtime) return;
    const t = setInterval(() => {
      const first = state.conversations[0];
      if (first) actions.liveUpsert({ ...first, lastMessage: "Just checking in 👋", unread: first.unread + 1, updatedAt: BASE + min(++uid) });
    }, 8000);
    return () => clearInterval(t);
  }, [simulateRealtime, state.conversations, actions]);

  const data = React.useMemo(() => ({ conversations: state.conversations, messages: state.messages, activeId: state.activeId }), [state]);

  return (
    <DataCtx.Provider value={data}>
      <ActionsCtx.Provider value={actions}>{children}</ActionsCtx.Provider>
    </DataCtx.Provider>
  );
}

function flagsWith(state: State, id: string, flag: ConversationFlag): ConversationFlag[] {
  const conv = state.conversations.find((c) => c.id === id);
  return conv?.flags.includes(flag) ? conv.flags : [...(conv?.flags ?? []), flag];
}
function flagsWithout(state: State, id: string, flag: ConversationFlag): ConversationFlag[] {
  const conv = state.conversations.find((c) => c.id === id);
  return (conv?.flags ?? []).filter((f) => f !== flag);
}

export { seedSource };
