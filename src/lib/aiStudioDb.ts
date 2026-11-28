export interface AiMessage {
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  messageType: 'text' | 'image';
  generatedImageUrl?: string;
  attachments?: { id: string; url: string; name: string }[];
  timestamp: number;
  generationStatus: 'pending' | 'streaming' | 'completed' | 'error' | 'stopped';
  errorMessage?: string;
  imagePrompt?: string;
}

export interface AiConversation {
  conversationId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AiMessage[];
}

const DB_NAME = 'shivnaresh_ai_studio';
const DB_VERSION = 1;
const CONVERSATIONS_STORE = 'conversations';
const META_STORE = 'meta';
const ACTIVE_ID_KEY = 'activeConversationId';
const MAX_CONVERSATIONS = 10;

const LS_CONVERSATIONS_KEY = 'shivnaresh_ai_studio_conversations';
const LS_ACTIVE_ID_KEY = 'shivnaresh_ai_studio_active_id';

let idbUnavailable = false;

function sortConversations(list: AiConversation[]): AiConversation[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

function enforceRetention(
  list: AiConversation[],
  protectedIds: Set<string>,
): { kept: AiConversation[]; deletedIds: string[] } {
  if (list.length <= MAX_CONVERSATIONS) {
    return { kept: list, deletedIds: [] };
  }

  // Oldest first by createdAt, then updatedAt
  const byOldest = [...list].sort(
    (a, b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt,
  );

  const deletedSet = new Set<string>();
  let remaining = list.length;

  for (const conv of byOldest) {
    if (remaining <= MAX_CONVERSATIONS) break;
    if (protectedIds.has(conv.conversationId)) continue;
    deletedSet.add(conv.conversationId);
    remaining--;
  }

  // Edge case: if all conversations were somehow protected, still respect limit on non-active ones
  if (remaining > MAX_CONVERSATIONS) {
    for (const conv of byOldest) {
      if (remaining <= MAX_CONVERSATIONS) break;
      if (deletedSet.has(conv.conversationId)) continue;
      deletedSet.add(conv.conversationId);
      remaining--;
    }
  }

  return {
    kept: list.filter((c) => !deletedSet.has(c.conversationId)),
    deletedIds: Array.from(deletedSet),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (idbUnavailable || typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      idbUnavailable = true;
      reject(err);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        db.createObjectStore(CONVERSATIONS_STORE, { keyPath: 'conversationId' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      idbUnavailable = true;
      reject(request.error ?? new Error('Failed to open IndexedDB'));
    };

    request.onblocked = () => {
      reject(new Error('IndexedDB open blocked'));
    };
  });
}

function txPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function waitTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

// --- localStorage fallback helpers ---

function lsReadConversations(): AiConversation[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LS_CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lsWriteConversations(list: AiConversation[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_CONVERSATIONS_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota / restriction errors in fallback
  }
}

function lsGetActiveId(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(LS_ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

function lsSetActiveId(id: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (id === null) {
      localStorage.removeItem(LS_ACTIVE_ID_KEY);
    } else {
      localStorage.setItem(LS_ACTIVE_ID_KEY, id);
    }
  } catch {
    // Ignore
  }
}

// --- Public API ---

export async function listConversations(): Promise<AiConversation[]> {
  try {
    const db = await openDatabase();
    try {
      const tx = db.transaction(CONVERSATIONS_STORE, 'readonly');
      const store = tx.objectStore(CONVERSATIONS_STORE);
      const all = await txPromise<AiConversation[]>(store.getAll());
      await waitTx(tx);
      return sortConversations(all);
    } finally {
      db.close();
    }
  } catch {
    return sortConversations(lsReadConversations());
  }
}

export async function getConversation(conversationId: string): Promise<AiConversation | null> {
  try {
    const db = await openDatabase();
    try {
      const tx = db.transaction(CONVERSATIONS_STORE, 'readonly');
      const store = tx.objectStore(CONVERSATIONS_STORE);
      const item = await txPromise<AiConversation | undefined>(store.get(conversationId));
      await waitTx(tx);
      return item ?? null;
    } finally {
      db.close();
    }
  } catch {
    const all = lsReadConversations();
    return all.find((c) => c.conversationId === conversationId) ?? null;
  }
}

export async function saveConversation(
  conv: AiConversation,
  activeConversationId?: string,
): Promise<AiConversation[]> {
  const protectedIds = new Set<string>([conv.conversationId]);
  if (activeConversationId) {
    protectedIds.add(activeConversationId);
  }

  try {
    const db = await openDatabase();
    try {
      const tx = db.transaction(CONVERSATIONS_STORE, 'readwrite');
      const store = tx.objectStore(CONVERSATIONS_STORE);
      await txPromise(store.put(conv));
      const all = await txPromise<AiConversation[]>(store.getAll());

      const { kept, deletedIds } = enforceRetention(all, protectedIds);
      for (const id of deletedIds) {
        await txPromise(store.delete(id));
      }

      await waitTx(tx);
      return sortConversations(kept);
    } finally {
      db.close();
    }
  } catch {
    const existing = lsReadConversations().filter(
      (c) => c.conversationId !== conv.conversationId,
    );
    existing.push(conv);
    const { kept } = enforceRetention(existing, protectedIds);
    const sorted = sortConversations(kept);
    lsWriteConversations(sorted);
    return sorted;
  }
}

export async function deleteConversation(conversationId: string): Promise<AiConversation[]> {
  try {
    const db = await openDatabase();
    try {
      const tx = db.transaction(CONVERSATIONS_STORE, 'readwrite');
      const store = tx.objectStore(CONVERSATIONS_STORE);
      await txPromise(store.delete(conversationId));
      const all = await txPromise<AiConversation[]>(store.getAll());
      await waitTx(tx);
      return sortConversations(all);
    } finally {
      db.close();
    }
  } catch {
    const next = lsReadConversations().filter((c) => c.conversationId !== conversationId);
    const sorted = sortConversations(next);
    lsWriteConversations(sorted);
    return sorted;
  }
}

export async function clearAllConversations(): Promise<void> {
  try {
    const db = await openDatabase();
    try {
      const tx = db.transaction([CONVERSATIONS_STORE, META_STORE], 'readwrite');
      tx.objectStore(CONVERSATIONS_STORE).clear();
      tx.objectStore(META_STORE).delete(ACTIVE_ID_KEY);
      await waitTx(tx);
    } finally {
      db.close();
    }
  } catch {
    lsWriteConversations([]);
    lsSetActiveId(null);
  }
}

export async function getActiveConversationId(): Promise<string | null> {
  try {
    const db = await openDatabase();
    try {
      const tx = db.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const val = await txPromise<string | undefined>(store.get(ACTIVE_ID_KEY));
      await waitTx(tx);
      return typeof val === 'string' ? val : null;
    } finally {
      db.close();
    }
  } catch {
    return lsGetActiveId();
  }
}

export async function setActiveConversationId(id: string | null): Promise<void> {
  try {
    const db = await openDatabase();
    try {
      const tx = db.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      if (id === null) {
        await txPromise(store.delete(ACTIVE_ID_KEY));
      } else {
        await txPromise(store.put(id, ACTIVE_ID_KEY));
      }
      await waitTx(tx);
    } finally {
      db.close();
    }
  } catch {
    lsSetActiveId(id);
  }
}

export function generateTitleFromPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^[\s#>*\-_~`"']+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return 'New Conversation';
  }

  const words = cleaned.split(' ').slice(0, 7);
  let title = words.join(' ');

  if (title.length > 48) {
    // Trim back by whole words where possible, otherwise hard-slice to 45 + '...'
    const fitted: string[] = [];
    for (const word of words) {
      const candidate = fitted.length > 0 ? `${fitted.join(' ')} ${word}` : word;
      if (candidate.length <= 45) {
        fitted.push(word);
      } else {
        break;
      }
    }
    title = fitted.length > 0 ? `${fitted.join(' ')}...` : `${title.slice(0, 45).trimEnd()}...`;
  } else if (cleaned.split(' ').length > 7) {
    // Keep within 48 chars even if ellipsis is omitted; 4-7 words is clean as-is
  }

  return title;
}
