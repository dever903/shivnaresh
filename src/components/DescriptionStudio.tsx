import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Upload,
  Copy,
  Check,
  Trash2,
  Download,
  RefreshCw,
  Archive,
  X,
  Plus,
  MessageSquare,
  Send,
  Square,
  Sun,
  Moon,
  Menu,
  FileText,
  Maximize2,
  AlertCircle,
  Play,
  Paperclip,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  api,
  type UserGeneration,
  resolveImageUrl,
  getProxiedImageUrl,
} from '../lib/api';
import {
  type AiConversation,
  type AiMessage,
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  clearAllConversations,
  getActiveConversationId,
  setActiveConversationId,
  generateTitleFromPrompt,
} from '../lib/aiStudioDb';
import MarkdownRenderer from './MarkdownRenderer';
import { getBestGenUrl } from '../pages/Design';

interface DescriptionStudioProps {
  user?: any;
  isLight?: boolean;
  userGenerations?: UserGeneration[];
  preselectedImages?: { id: string; url: string; name: string }[];
  onClearPreselected?: () => void;
}

const DEFAULT_LISTING_PROMPT = `Look carefully at the sportswear garment in the image(s). Check the fabric look, stitching, collar, sleeves, pockets, zipper, logos, colours and overall fit. Then write a professional e-commerce listing for it.

Follow these rules strictly:

Use only simple, clean, point-wise formatting. Do not use asterisks (**), emojis, markdown symbols, tables or decorative lines.
Use proper, universal product names (for example "Men's Colourblock Zip-Up Track Jacket"). Do not use any company or brand name in the titles or text, unless I give you one.
Write only what you can see in the image. If something cannot be confirmed (such as exact fabric or GSM), write "Suggested" next to it.
Keep the language simple, attractive and easy to read. Avoid exaggerated or filler words.

Give the output in exactly this order:

PRODUCT TITLES
Give 6 titles in a numbered list. Each title should be 12 to 18 words and include gender, garment type, key feature and use. Make 2 for Amazon, 2 for Flipkart and 2 for catalogue or social media.
SHORT DESCRIPTION
Write exactly 3 lines. Cover the look, comfort and fit in a punchy way.
KEY FEATURES
Write 7 to 8 points. Each point should be one line, start with a short feature name followed by a colon, and then describe the benefit in an impressive but simple way.
Example: Breathable Fabric: Lightweight material keeps you cool and dry during long workouts.
FABRIC AND MATERIAL
Write 4 to 5 short points covering composition, weight, stretch and finish (mark as "Suggested" if not visible).
DESIGN DETAILS
Write 5 to 6 short points covering collar, sleeves, pockets, zipper, logo or print, and cuffs and hem.
BEST USE
Write 1 line each for sports use, daily wear and season or weather.
SIZE AND FIT
Write 3 to 4 short points covering fit type, sizing advice and model details if visible.
WASH AND CARE
Write 5 short points with clear do's and don'ts.
SEO KEYWORDS
Give 10 keywords separated by commas, with no brand name.`;

const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function DescriptionStudio({
  user = null,
  isLight = false,
  userGenerations = [],
  preselectedImages,
  onClearPreselected,
}: DescriptionStudioProps) {
  // Theme state (initialized from parent prop, user can toggle locally in sidebar)
  const [studioLight, setStudioLight] = useState<boolean>(isLight);
  useEffect(() => {
    setStudioLight(isLight);
  }, [isLight]);

  // Sidebar & UI state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [showMySetsDrawer, setShowMySetsDrawer] = useState<boolean>(false);
  const [imageGenMode, setImageGenMode] = useState<boolean>(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<
    | { type: 'delete-one'; conversationId: string; title: string }
    | { type: 'clear-all' }
    | null
  >(null);

  // Conversations & Active Chat
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>(() => uid('conv'));
  const [activeCreatedAt, setActiveCreatedAt] = useState<number>(() => Date.now());
  const [activeTitle, setActiveTitle] = useState<string>('New Conversation');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [hydrated, setHydrated] = useState<boolean>(false);

  // Input & Attachments
  const [inputText, setInputText] = useState<string>('');
  const [attachments, setAttachments] = useState<{ id: string; url: string; name: string }[]>([]);
  const [defaultListingPrompt, setDefaultListingPrompt] = useState<string>(DEFAULT_LISTING_PROMPT);

  // Generation & Feedback
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const isGeneratingRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [expandedPromptIds, setExpandedPromptIds] = useState<Record<string, boolean>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const preselectedHandledRef = useRef<string>('');
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    });
  }, []);

  // Fetch admin-configured default listing prompt
  useEffect(() => {
    let cancelled = false;
    api
      .getDescriptionSettings()
      .then((res) => {
        if (!cancelled && res.ok && res.defaultPrompt) {
          setDefaultListingPrompt(res.defaultPrompt);
        }
      })
      .catch(() => {
        // fallback to DEFAULT_LISTING_PROMPT
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate conversations & active conversation from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [list, storedActiveId] = await Promise.all([
          listConversations(),
          getActiveConversationId(),
        ]);
        if (cancelled) return;
        setConversations(list);
        if (storedActiveId) {
          const found =
            list.find((c) => c.conversationId === storedActiveId) ||
            (await getConversation(storedActiveId));
          if (!cancelled && found) {
            setActiveConvId(found.conversationId);
            setActiveTitle(found.title);
            setActiveCreatedAt(found.createdAt);
            setMessages(found.messages || []);
            setHydrated(true);
            setTimeout(() => scrollToBottom(false), 50);
            return;
          }
        }
      } catch (err) {
        console.warn('[DescriptionStudio] Failed to hydrate from IndexedDB:', err);
      }
      if (!cancelled) {
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scrollToBottom]);

  // Abort any in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Persist conversation helper
  const persistConversation = useCallback(
    async (
      convId: string,
      title: string,
      createdAt: number,
      nextMessages: AiMessage[]
    ) => {
      const conv: AiConversation = {
        conversationId: convId,
        title: title || 'New Conversation',
        createdAt,
        updatedAt: Date.now(),
        messages: nextMessages,
      };
      try {
        const updatedList = await saveConversation(conv, convId);
        await setActiveConversationId(convId);
        setConversations(updatedList);
      } catch (err) {
        console.warn('[DescriptionStudio] Failed to save conversation:', err);
      }
    },
    []
  );

  // Image optimization helpers (preserved from original)
  const optimizeImageUrl = useCallback(
    async (
      rawUrl: string,
      name: string,
      id?: string
    ): Promise<{ id: string; url: string; name: string }> => {
      const fallbackId = id || uid('img');
      if (!rawUrl) return { id: fallbackId, url: '', name };
      if (rawUrl.startsWith('data:')) return { id: fallbackId, url: rawUrl, name };

      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve({ id: fallbackId, url: rawUrl, name }), 4000);

        img.onload = () => {
          clearTimeout(timer);
          try {
            const maxDim = 1024;
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, w, h);
              resolve({ id: fallbackId, url: canvas.toDataURL('image/jpeg', 0.85), name });
              return;
            }
          } catch {
            // fallback below
          }
          resolve({ id: fallbackId, url: rawUrl, name });
        };

        img.onerror = () => {
          clearTimeout(timer);
          fetch(getProxiedImageUrl(rawUrl))
            .then((r) => r.blob())
            .then((blob) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({ id: fallbackId, url: reader.result as string, name });
              reader.onerror = () => resolve({ id: fallbackId, url: rawUrl, name });
              reader.readAsDataURL(blob);
            })
            .catch(() => resolve({ id: fallbackId, url: rawUrl, name }));
        };

        img.src = getProxiedImageUrl(rawUrl);
      });
    },
    []
  );

  const optimizeImageFile = (
    file: File
  ): Promise<{ id: string; url: string; name: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result;
        if (typeof src !== 'string') {
          resolve({ id: uid('up'), url: '', name: file.name });
          return;
        }
        const img = new Image();
        img.onload = () => {
          const maxDim = 1024;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve({
              id: uid('up'),
              url: canvas.toDataURL('image/jpeg', 0.82),
              name: file.name,
            });
            return;
          }
          resolve({ id: uid('up'), url: src, name: file.name });
        };
        img.onerror = () => resolve({ id: uid('up'), url: src, name: file.name });
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const optimized = await Promise.all(Array.from(files).map(optimizeImageFile));
    const valid = optimized.filter((item) => item.url);
    setAttachments((prev) => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast(`Attached ${valid.length} photo(s)`);
  };

  const toggleMySetImage = async (gen: UserGeneration) => {
    const url = getBestGenUrl(gen);
    if (!url) return;
    const resolved = resolveImageUrl(url);
    const exists = attachments.some((img) => img.id === gen.id || img.url === resolved);
    if (exists) {
      setAttachments((prev) => prev.filter((img) => img.id !== gen.id && img.url !== resolved));
    } else {
      showToast('Loading image from My Sets...');
      const opt = await optimizeImageUrl(
        resolved,
        gen.title || `Render #${gen.id.slice(-4)}`,
        gen.id
      );
      setAttachments((prev) => [...prev, opt]);
    }
  };

  // Stop Generating
  const handleStopGenerating = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Build chat API payload from message list
  const buildApiMessages = (history: AiMessage[]) =>
    history
      .filter(
        (m) =>
          (m.role === 'user' || (m.role === 'assistant' && m.content.trim().length > 0)) &&
          m.generationStatus !== 'pending' &&
          m.generationStatus !== 'error'
      )
      .map((m) => ({
        role: m.role,
        content: m.content || (m.imagePrompt ? `[Generated image for: ${m.imagePrompt}]` : ''),
        images: m.attachments?.map((a) => a.url).filter(Boolean),
      }));

  // Core send message handler
  const sendMessage = useCallback(
    async (
      rawPrompt: string,
      overrideAttachments?: { id: string; url: string; name: string }[],
      forceImageMode?: boolean
    ) => {
      if (isGeneratingRef.current) return;

      if (!user) {
        window.location.href =
          '/login?next=' + encodeURIComponent(window.location.pathname + window.location.search);
        return;
      }

      const activeImgs = overrideAttachments ?? attachments;
      const trimmed = rawPrompt.trim();
      if (!trimmed && activeImgs.length === 0) return;

      const effectivePrompt =
        trimmed ||
        (activeImgs.length > 0
          ? defaultListingPrompt || DEFAULT_LISTING_PROMPT
          : '');

      isGeneratingRef.current = true;
      setIsGenerating(true);

      // Clear composer immediately on submit
      if (!overrideAttachments) {
        setInputText('');
        setAttachments([]);
      }

      const wantImage = Boolean(forceImageMode);

      const preparedImgs = await Promise.all(
        activeImgs.map((img) =>
          img.url && !img.url.startsWith('data:')
            ? optimizeImageUrl(img.url, img.name, img.id)
            : Promise.resolve(img)
        )
      );
      const validImgs = preparedImgs.filter((i) => i.url);

      const userMsg: AiMessage = {
        messageId: uid('msg'),
        role: 'user',
        content: effectivePrompt,
        messageType: 'text',
        attachments: validImgs.length > 0 ? validImgs : undefined,
        timestamp: Date.now(),
        generationStatus: 'completed',
      };

      const assistantMsgId = uid('msg');
      const pendingAssistant: AiMessage = {
        messageId: assistantMsgId,
        role: 'assistant',
        content: '',
        messageType: wantImage ? 'image' : 'text',
        imagePrompt: wantImage ? effectivePrompt : undefined,
        timestamp: Date.now(),
        generationStatus: 'pending',
      };

      const nextTitle =
        messages.length === 0
          ? generateTitleFromPrompt(
              validImgs.length > 0 && effectivePrompt === (defaultListingPrompt || DEFAULT_LISTING_PROMPT)
                ? `Product Listing: ${validImgs[0]?.name || 'Garment'}`
                : effectivePrompt
            )
          : activeTitle;

      const convId = activeConvId;
      const createdAt = messages.length === 0 ? Date.now() : activeCreatedAt;
      if (messages.length === 0) {
        setActiveCreatedAt(createdAt);
        setActiveTitle(nextTitle);
      }

      const optimisticMessages = [...messages, userMsg, pendingAssistant];
      setMessages(optimisticMessages);
      scrollToBottom(true);
      await persistConversation(convId, nextTitle, createdAt, optimisticMessages);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        if (wantImage) {
          const res = await api.aiStudioGenerateImage(
            { prompt: effectivePrompt },
            controller.signal
          );
          const completedMsg: AiMessage = {
            ...pendingAssistant,
            content: res.prompt || effectivePrompt,
            generatedImageUrl: res.imageUrl,
            imagePrompt: effectivePrompt,
            generationStatus: 'completed',
            timestamp: Date.now(),
          };
          const finalMessages = optimisticMessages.map((m) =>
            m.messageId === assistantMsgId ? completedMsg : m
          );
          setMessages(finalMessages);
          await persistConversation(convId, nextTitle, createdAt, finalMessages);
          scrollToBottom(true);
        } else {
          const apiHistory = buildApiMessages([...messages, userMsg]);
          const res = await api.aiStudioChat(
            { messages: apiHistory },
            controller.signal
          );
          const completedMsg: AiMessage = {
            ...pendingAssistant,
            content: res.reply,
            generationStatus: 'completed',
            timestamp: Date.now(),
          };
          const finalMessages = optimisticMessages.map((m) =>
            m.messageId === assistantMsgId ? completedMsg : m
          );
          setMessages(finalMessages);
          await persistConversation(convId, nextTitle, createdAt, finalMessages);
          scrollToBottom(true);
        }
      } catch (err: any) {
        const isAborted = err?.name === 'AbortError' || controller.signal.aborted;
        const failedMsg: AiMessage = {
          ...pendingAssistant,
          generationStatus: isAborted ? 'stopped' : 'error',
          errorMessage: isAborted
            ? 'Generation stopped by user.'
            : err?.message || 'Failed to get response from Gemini AI.',
          timestamp: Date.now(),
        };
        const finalMessages = optimisticMessages.map((m) =>
          m.messageId === assistantMsgId ? failedMsg : m
        );
        setMessages(finalMessages);
        await persistConversation(convId, nextTitle, createdAt, finalMessages);
      } finally {
        abortControllerRef.current = null;
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }
    },
    [
      user,
      attachments,
      defaultListingPrompt,
      imageGenMode,
      messages,
      activeTitle,
      activeConvId,
      activeCreatedAt,
      optimizeImageUrl,
      persistConversation,
      scrollToBottom,
    ]
  );

  // Auto-handle preselected images from My Sets (passed from Design.tsx)
  useEffect(() => {
    if (!hydrated || !preselectedImages || preselectedImages.length === 0) return;
    const key = preselectedImages.map((p) => p.id || p.url).join(',');
    if (preselectedHandledRef.current === key) return;
    preselectedHandledRef.current = key;

    void (async () => {
      showToast('Analyzing selected garment from My Sets...');
      const optimized = await Promise.all(
        preselectedImages.map((p) => optimizeImageUrl(p.url, p.name, p.id))
      );
      const valid = optimized.filter((item) => item.url);
      const imgsToUse = valid.length > 0 ? valid : preselectedImages;
      // Start a fresh conversation for the incoming garment listing
      const newConvId = uid('conv');
      const now = Date.now();
      setActiveConvId(newConvId);
      setActiveCreatedAt(now);
      setActiveTitle(`Product Listing: ${imgsToUse[0]?.name || 'Garment'}`);
      setMessages([]);
      setImageGenMode(false);
      await setActiveConversationId(newConvId);

      const promptToSend = defaultListingPrompt || DEFAULT_LISTING_PROMPT;
      // Call sendMessage directly with fresh context
      if (isGeneratingRef.current) return;
      isGeneratingRef.current = true;
      setIsGenerating(true);

      const userMsg: AiMessage = {
        messageId: uid('msg'),
        role: 'user',
        content: promptToSend,
        messageType: 'text',
        attachments: imgsToUse,
        timestamp: now,
        generationStatus: 'completed',
      };
      const assistantMsgId = uid('msg');
      const pendingAssistant: AiMessage = {
        messageId: assistantMsgId,
        role: 'assistant',
        content: '',
        messageType: 'text',
        timestamp: now,
        generationStatus: 'pending',
      };

      const title = generateTitleFromPrompt(`Product Listing: ${imgsToUse[0]?.name || 'Garment'}`);
      const initialMsgs = [userMsg, pendingAssistant];
      setActiveTitle(title);
      setMessages(initialMsgs);
      await persistConversation(newConvId, title, now, initialMsgs);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const res = await api.aiStudioChat(
          {
            messages: [
              {
                role: 'user',
                content: promptToSend,
                images: imgsToUse.map((i) => i.url).filter(Boolean),
              },
            ],
          },
          controller.signal
        );
        const completed: AiMessage = {
          ...pendingAssistant,
          content: res.reply,
          generationStatus: 'completed',
          timestamp: Date.now(),
        };
        const finalMsgs = [userMsg, completed];
        setMessages(finalMsgs);
        await persistConversation(newConvId, title, now, finalMsgs);
        scrollToBottom(true);
      } catch (err: any) {
        const isAborted = err?.name === 'AbortError' || controller.signal.aborted;
        const failed: AiMessage = {
          ...pendingAssistant,
          generationStatus: isAborted ? 'stopped' : 'error',
          errorMessage: isAborted
            ? 'Generation stopped by user.'
            : err?.message || 'Failed to generate product listing.',
          timestamp: Date.now(),
        };
        const finalMsgs = [userMsg, failed];
        setMessages(finalMsgs);
        await persistConversation(newConvId, title, now, finalMsgs);
      } finally {
        abortControllerRef.current = null;
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }
    })();

    onClearPreselected?.();
  }, [
    hydrated,
    preselectedImages,
    onClearPreselected,
    optimizeImageUrl,
    defaultListingPrompt,
    persistConversation,
    scrollToBottom,
    showToast,
  ]);

  // Regenerate an assistant message
  const handleRegenerate = async (assistantIndex: number) => {
    if (isGeneratingRef.current) return;
    const targetMsg = messages[assistantIndex];
    if (!targetMsg || targetMsg.role !== 'assistant') return;

    // Find the preceding user message
    let userIndex = assistantIndex - 1;
    while (userIndex >= 0 && messages[userIndex].role !== 'user') {
      userIndex--;
    }
    if (userIndex < 0) return;

    const userMsg = messages[userIndex];
    const contextBefore = messages.slice(0, assistantIndex);
    const isImage = targetMsg.messageType === 'image';

    isGeneratingRef.current = true;
    setIsGenerating(true);

    const pendingMsg: AiMessage = {
      ...targetMsg,
      content: isImage ? targetMsg.content : '',
      generatedImageUrl: undefined,
      errorMessage: undefined,
      generationStatus: 'pending',
      timestamp: Date.now(),
    };

    const updated = messages.map((m, idx) => (idx === assistantIndex ? pendingMsg : m));
    setMessages(updated);
    await persistConversation(activeConvId, activeTitle, activeCreatedAt, updated);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (isImage) {
        const promptToUse = targetMsg.imagePrompt || userMsg.content;
        const res = await api.aiStudioGenerateImage(
          { prompt: promptToUse },
          controller.signal
        );
        const completed: AiMessage = {
          ...pendingMsg,
          content: res.prompt || promptToUse,
          generatedImageUrl: res.imageUrl,
          generationStatus: 'completed',
          timestamp: Date.now(),
        };
        const finalMsgs = updated.map((m, idx) => (idx === assistantIndex ? completed : m));
        setMessages(finalMsgs);
        await persistConversation(activeConvId, activeTitle, activeCreatedAt, finalMsgs);
      } else {
        const apiHistory = buildApiMessages(contextBefore);
        const res = await api.aiStudioChat({ messages: apiHistory }, controller.signal);
        const completed: AiMessage = {
          ...pendingMsg,
          content: res.reply,
          generationStatus: 'completed',
          timestamp: Date.now(),
        };
        const finalMsgs = updated.map((m, idx) => (idx === assistantIndex ? completed : m));
        setMessages(finalMsgs);
        await persistConversation(activeConvId, activeTitle, activeCreatedAt, finalMsgs);
      }
    } catch (err: any) {
      const isAborted = err?.name === 'AbortError' || controller.signal.aborted;
      const failed: AiMessage = {
        ...pendingMsg,
        generationStatus: isAborted ? 'stopped' : 'error',
        errorMessage: isAborted ? 'Generation stopped.' : err?.message || 'Regeneration failed.',
        timestamp: Date.now(),
      };
      const finalMsgs = updated.map((m, idx) => (idx === assistantIndex ? failed : m));
      setMessages(finalMsgs);
      await persistConversation(activeConvId, activeTitle, activeCreatedAt, finalMsgs);
    } finally {
      abortControllerRef.current = null;
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  };

  // Continue Response on a text assistant message
  const handleContinueResponse = async (assistantIndex: number) => {
    if (isGeneratingRef.current) return;
    const targetMsg = messages[assistantIndex];
    if (!targetMsg || targetMsg.role !== 'assistant' || targetMsg.messageType === 'image') return;

    isGeneratingRef.current = true;
    setIsGenerating(true);

    const previousContent = targetMsg.content;
    const pendingMsg: AiMessage = {
      ...targetMsg,
      generationStatus: 'streaming',
      errorMessage: undefined,
    };

    const updated = messages.map((m, idx) => (idx === assistantIndex ? pendingMsg : m));
    setMessages(updated);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const contextUpToTarget = buildApiMessages(messages.slice(0, assistantIndex + 1));
      const res = await api.aiStudioChat(
        { messages: contextUpToTarget, continueMode: true },
        controller.signal
      );
      const separator =
        previousContent.endsWith('\n') || res.reply.startsWith('\n') ? '' : '\n\n';
      const completed: AiMessage = {
        ...pendingMsg,
        content: `${previousContent}${separator}${res.reply}`,
        generationStatus: 'completed',
        timestamp: Date.now(),
      };
      const finalMsgs = updated.map((m, idx) => (idx === assistantIndex ? completed : m));
      setMessages(finalMsgs);
      await persistConversation(activeConvId, activeTitle, activeCreatedAt, finalMsgs);
    } catch (err: any) {
      const isAborted = err?.name === 'AbortError' || controller.signal.aborted;
      const failed: AiMessage = {
        ...pendingMsg,
        content: previousContent,
        generationStatus: isAborted ? 'stopped' : 'completed',
        errorMessage: isAborted ? undefined : err?.message || 'Continue failed.',
      };
      const finalMsgs = updated.map((m, idx) => (idx === assistantIndex ? failed : m));
      setMessages(finalMsgs);
      await persistConversation(activeConvId, activeTitle, activeCreatedAt, finalMsgs);
      if (!isAborted) showToast(err?.message || 'Failed to continue response');
    } finally {
      abortControllerRef.current = null;
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  };

  // Copy message content
  const handleCopyMessage = async (msg: AiMessage) => {
    const textToCopy =
      msg.messageType === 'image' ? msg.imagePrompt || msg.content : msg.content;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedMsgId(msg.messageId);
      showToast('Copied to clipboard');
      window.setTimeout(() => setCopiedMsgId(null), 2000);
    } catch {
      showToast('Clipboard unavailable');
    }
  };

  // Download generated image
  const handleDownloadImage = (url: string, promptText?: string) => {
    const link = document.createElement('a');
    link.href = url;
    const slug = (promptText || 'gemini-image')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 36);
    link.download = `${slug || 'gemini-image'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Downloading image...');
  };

  // Conversation management
  const handleNewConversation = async () => {
    if (isGeneratingRef.current) handleStopGenerating();
    const newId = uid('conv');
    setActiveConvId(newId);
    setActiveCreatedAt(Date.now());
    setActiveTitle('New Conversation');
    setMessages([]);
    setAttachments([]);
    setInputText('');
    setSidebarOpen(false);
    await setActiveConversationId(null);
  };

  const handleSelectConversation = async (conv: AiConversation) => {
    if (isGeneratingRef.current) handleStopGenerating();
    const fresh = (await getConversation(conv.conversationId)) || conv;
    setActiveConvId(fresh.conversationId);
    setActiveCreatedAt(fresh.createdAt);
    setActiveTitle(fresh.title);
    setMessages(fresh.messages || []);
    setSidebarOpen(false);
    await setActiveConversationId(fresh.conversationId);
    setTimeout(() => scrollToBottom(false), 50);
  };

  const handleConfirmDeleteOne = async (conversationId: string) => {
    const remaining = await deleteConversation(conversationId);
    setConversations(remaining);
    if (conversationId === activeConvId) {
      if (remaining.length > 0) {
        const next = remaining[0];
        setActiveConvId(next.conversationId);
        setActiveCreatedAt(next.createdAt);
        setActiveTitle(next.title);
        setMessages(next.messages || []);
        await setActiveConversationId(next.conversationId);
      } else {
        await handleNewConversation();
      }
    }
    setConfirmModal(null);
    showToast('Conversation deleted');
  };

  const handleConfirmClearAll = async () => {
    await clearAllConversations();
    setConversations([]);
    await handleNewConversation();
    setConfirmModal(null);
    showToast('All history cleared');
  };

  // Theme classes (Light mode uses site's Brown #756357 + Forest #263B32 + Cream #F5F0E7 palette)
  const shellBg = studioLight ? 'bg-[#756357] text-[#F5F0E7]' : 'bg-[#09090c] text-zinc-100';
  const sidebarBg = studioLight
    ? 'bg-[#5E4F45] border-[#8B7668]/50 text-[#F5F0E7]'
    : 'bg-[#0e0f13] border-white/10 text-zinc-200';
  const cardBg = studioLight
    ? 'bg-[#263B32] border-[#C9A468]/35 text-[#F5F0E7]'
    : 'bg-[#121318] border-white/10 text-zinc-100';
  const mutedText = studioLight ? 'text-[#E2DDD4]' : 'text-zinc-400';

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* New Conversation Button */}
      <div className="p-3 border-b border-inherit">
        <button
          type="button"
          onClick={() => void handleNewConversation()}
          className="w-full py-2.5 px-3 rounded-xl bg-[#e5373f] hover:bg-[#d42d35] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Conversation</span>
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
        <div className="px-2 py-1.5 flex items-center justify-between">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${mutedText}`}>
            History ({conversations.length}/10)
          </span>
        </div>

        {conversations.length === 0 ? (
          <p className={`text-xs px-2 py-6 text-center ${mutedText}`}>
            No saved conversations yet. Start chatting below!
          </p>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.conversationId === activeConvId;
            return (
              <div
                key={conv.conversationId}
                onClick={() => void handleSelectConversation(conv)}
                className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition border ${
                  isActive
                    ? studioLight
                      ? 'bg-[#263B32] border-[#C9A468]/60 text-[#F5F0E7]'
                      : 'bg-white/10 border-[#e5373f]/40 text-white'
                    : studioLight
                      ? 'border-transparent hover:bg-[#756357]/60 text-[#F5F0E7]'
                      : 'border-transparent hover:bg-white/5 text-zinc-300'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <MessageSquare
                    className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                      isActive ? 'text-[#e5373f]' : mutedText
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{conv.title}</p>
                    <p className={`text-[10px] ${mutedText}`}>
                      {formatRelativeTime(conv.updatedAt)} · {conv.messages.length} msgs
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmModal({
                      type: 'delete-one',
                      conversationId: conv.conversationId,
                      title: conv.title,
                    });
                  }}
                  className={`p-1.5 rounded-lg opacity-80 sm:opacity-0 group-hover:opacity-100 transition cursor-pointer ${
                    studioLight
                      ? 'hover:bg-rose-100 text-stone-400 hover:text-rose-600'
                      : 'hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400'
                  }`}
                  title="Delete conversation"
                  aria-label={`Delete ${conv.title}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Sidebar Footer: Clear All & Theme Toggle */}
      <div className="p-3 border-t border-inherit space-y-2">
        {conversations.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmModal({ type: 'clear-all' })}
            className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
              studioLight
                ? 'border-[#C9A468]/40 bg-[#263B32] text-rose-300 hover:bg-[#1f3129]'
                : 'border-white/10 text-rose-400 hover:bg-rose-500/10'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear All History</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setStudioLight((prev) => !prev)}
          className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-between border transition cursor-pointer ${
            studioLight
              ? 'border-[#C9A468]/40 bg-[#263B32] hover:bg-[#1f3129] text-[#F5F0E7]'
              : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200'
          }`}
          title="Toggle Dark & Light mode"
        >
          <span className="flex items-center gap-2">
            {studioLight ? (
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span>{studioLight ? 'Light Mode' : 'Dark Mode'}</span>
          </span>
          <span className={`text-[10px] ${mutedText}`}>Switch</span>
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={`relative flex h-[calc(100dvh-132px)] min-h-[420px] max-h-[920px] w-full overflow-hidden rounded-2xl border ${
        studioLight ? 'border-[#8B7668]/60' : 'border-white/10'
      } ${shellBg}`}
    >
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-[#18181b] text-white border border-emerald-500/40 px-4 py-2.5 rounded-xl shadow-2xl">
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold">{toastMsg}</span>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Desktop Left Sidebar */}
      <aside className={`hidden md:flex md:w-72 shrink-0 flex-col border-r ${sidebarBg}`}>
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Sidebar Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setSidebarOpen(false)}
          />
          <aside
            className={`relative z-10 w-72 max-w-[85vw] h-full flex flex-col border-r shadow-2xl ${sidebarBg}`}
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-inherit">
              <span className="text-xs font-bold uppercase tracking-wider">AI Studio</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10"
                aria-label="Close sidebar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">{sidebarContent}</div>
          </aside>
        </div>
      )}

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Top Bar */}
        <header
          className={`sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0 ${
            studioLight ? 'bg-[#5E4F45] border-[#8B7668]/50 text-[#F5F0E7]' : 'bg-[#0e0f13]/90 border-white/10'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl border border-inherit hover:bg-white/10 cursor-pointer"
              aria-label="Open conversations"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e5373f] text-white shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold truncate">{activeTitle}</h1>
              <p className={`text-[10px] truncate ${mutedText}`}>
                Gemini AI Studio · Chat, Product Listings & Image Generation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowMySetsDrawer((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer transition ${
                showMySetsDrawer
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                  : studioLight
                    ? 'border-[#C9A468]/40 bg-[#263B32] hover:bg-[#1f3129] text-[#F5F0E7]'
                    : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200'
              }`}
            >
              <Archive className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">My Sets</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer transition ${
                studioLight
                  ? 'border-[#C9A468]/40 bg-[#263B32] hover:bg-[#1f3129] text-[#F5F0E7]'
                  : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5 text-[#e5373f]" />
              <span className="hidden sm:inline">Upload</span>
            </button>
          </div>
        </header>

        {/* My Sets Drawer */}
        {showMySetsDrawer && (
          <div
            className={`px-4 py-3 border-b shrink-0 space-y-2 ${
              studioLight ? 'bg-stone-50 border-stone-200' : 'bg-[#121318] border-white/10'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5" />
                <span>My Sets & Wardrobe ({userGenerations.length})</span>
              </span>
              <button
                type="button"
                onClick={() => setShowMySetsDrawer(false)}
                className={`text-xs ${mutedText} hover:text-current cursor-pointer`}
              >
                Close
              </button>
            </div>
            {userGenerations.length === 0 ? (
              <p className={`text-xs py-2 ${mutedText}`}>No generated sets found in your archive.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {userGenerations.map((gen) => {
                  const u = getBestGenUrl(gen);
                  if (!u) return null;
                  const resolved = resolveImageUrl(u);
                  const isSelected = attachments.some(
                    (img) => img.id === gen.id || img.url === resolved
                  );
                  return (
                    <button
                      key={gen.id}
                      type="button"
                      onClick={() => void toggleMySetImage(gen)}
                      className={`relative w-16 h-20 rounded-xl overflow-hidden border shrink-0 cursor-pointer transition ${
                        isSelected
                          ? 'border-[#e5373f] ring-2 ring-[#e5373f]'
                          : 'border-white/15 hover:border-white/40'
                      }`}
                    >
                      <img
                        src={getProxiedImageUrl(resolved)}
                        alt={gen.title || 'Render'}
                        className="w-full h-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute top-1 right-1 p-0.5 rounded-full bg-[#e5373f] text-white">
                          <Check className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Messages Feed */}
        <div
          ref={messagesContainerRef}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const files = e.dataTransfer.files;
            if (!files || files.length === 0) return;
            const optimized = await Promise.all(Array.from(files).map(optimizeImageFile));
            const valid = optimized.filter((item) => item.url);
            setAttachments((prev) => [...prev, ...valid]);
            showToast(`Attached ${valid.length} photo(s)`);
          }}
          className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth"
        >
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.length === 0 ? (
              <div className="py-12 text-center space-y-6">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e5373f]/15 text-[#e5373f] border border-[#e5373f]/30">
                  <Sparkles className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h2
                    className="text-xl font-bold tracking-tight"
                    style={{ color: studioLight ? '#F5F0E7' : '#F4F4F5' }}
                  >
                    Gemini AI Studio
                  </h2>
                  <p
                    className={`text-xs max-w-md mx-auto ${mutedText}`}
                    style={{ color: studioLight ? '#E2DDD4' : '#A1A1AA' }}
                  >
                    Ask anything with real-time knowledge or attach garment photos for e-commerce
                    product listings.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl mx-auto text-left">
                  <button
                    type="button"
                    onClick={() =>
                      setInputText(
                        'What are the top trending activewear fabrics and colors for 2026?'
                      )
                    }
                    className={`p-3 rounded-xl border text-xs transition cursor-pointer ${cardBg} hover:border-[#e5373f]/50`}
                  >
                    <p className="font-bold mb-1">Ask Anything</p>
                    <p className={`text-[11px] ${mutedText}`}>
                      Real-time sportswear trends, copywriting, or strategy.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputText(defaultListingPrompt || DEFAULT_LISTING_PROMPT);
                      setShowMySetsDrawer(true);
                    }}
                    className={`p-3 rounded-xl border text-xs transition cursor-pointer ${cardBg} hover:border-[#e5373f]/50`}
                  >
                    <p className="font-bold mb-1">Product Listing</p>
                    <p className={`text-[11px] ${mutedText}`}>
                      Attach My Sets or upload photos to write Amazon/Flipkart copy.
                    </p>
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const isLongListingPrompt =
                  isUser && msg.content.length > 350;
                const isExpanded = !!expandedPromptIds[msg.messageId];

                if (isUser) {
                  return (
                    <div key={msg.messageId} className="flex justify-end">
                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 space-y-2.5 shadow-xs ${
                          studioLight
                            ? 'bg-stone-900 text-white'
                            : 'bg-[#1c1e26] text-zinc-100 border border-white/10'
                        }`}
                      >
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {msg.attachments.map((att) => (
                              <button
                                key={att.id}
                                type="button"
                                onClick={() =>
                                  setLightboxImage({ url: att.url, title: att.name })
                                }
                                className="relative w-20 h-24 rounded-xl overflow-hidden border border-white/20 cursor-pointer group"
                              >
                                <img
                                  src={att.url}
                                  alt={att.name}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="text-xs leading-relaxed whitespace-pre-wrap">
                          {isLongListingPrompt && !isExpanded
                            ? `${msg.content.slice(0, 180)}...`
                            : msg.content}
                        </div>
                        {isLongListingPrompt && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPromptIds((prev) => ({
                                ...prev,
                                [msg.messageId]: !prev[msg.messageId],
                              }))
                            }
                            className="text-[10px] font-semibold text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="w-3 h-3" />
                                <span>Show less</span>
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3 h-3" />
                                <span>Show full prompt</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                // Assistant Message
                const isPendingOrStreaming =
                  msg.generationStatus === 'pending' || msg.generationStatus === 'streaming';

                return (
                  <div key={msg.messageId} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e5373f] text-white shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className={`flex-1 min-w-0 rounded-2xl border p-4 space-y-3 ${cardBg}`}>
                      {/* Image Generation Result */}
                      {msg.messageType === 'image' && msg.generatedImageUrl && (
                        <div className="space-y-2.5">
                          {msg.imagePrompt && (
                            <p className={`text-xs italic ${mutedText}`}>
                              Prompt: "{msg.imagePrompt}"
                            </p>
                          )}
                          <div className="relative group inline-block max-w-full rounded-xl overflow-hidden border border-white/10">
                            <img
                              src={msg.generatedImageUrl}
                              alt={msg.imagePrompt || 'Generated image'}
                              className="max-h-[420px] w-auto object-contain cursor-pointer"
                              onClick={() =>
                                setLightboxImage({
                                  url: msg.generatedImageUrl!,
                                  title: msg.imagePrompt || 'Generated Image',
                                })
                              }
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleDownloadImage(
                                  msg.generatedImageUrl!,
                                  msg.imagePrompt
                                )
                              }
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 cursor-pointer transition ${
                                studioLight
                                  ? 'border-stone-200 hover:bg-stone-100'
                                  : 'border-white/10 hover:bg-white/10'
                              }`}
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxImage({
                                  url: msg.generatedImageUrl!,
                                  title: msg.imagePrompt || 'Generated Image',
                                })
                              }
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 cursor-pointer transition ${
                                studioLight
                                  ? 'border-stone-200 hover:bg-stone-100'
                                  : 'border-white/10 hover:bg-white/10'
                              }`}
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                              <span>Lightbox View</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Text Content */}
                      {msg.messageType !== 'image' && msg.content && (
                        <MarkdownRenderer content={msg.content} isLight={false} />
                      )}

                      {/* Pending / Loading Animation */}
                      {isPendingOrStreaming && (
                        <div className="flex items-center justify-between gap-3 py-1">
                          <div className="flex items-center gap-2 text-xs font-medium text-[#e5373f]">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>
                              {msg.messageType === 'image'
                                ? 'Generating image with Gemini...'
                                : msg.generationStatus === 'streaming'
                                  ? 'Continuing response...'
                                  : 'Gemini is thinking...'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleStopGenerating}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            <span>Stop Generating</span>
                          </button>
                        </div>
                      )}

                      {/* Error or Stopped Banner */}
                      {(msg.generationStatus === 'error' ||
                        msg.generationStatus === 'stopped') &&
                        msg.errorMessage && (
                          <div
                            className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                              msg.generationStatus === 'error'
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            }`}
                          >
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{msg.errorMessage}</span>
                          </div>
                        )}

                      {/* Assistant Action Bar (Copy, Regenerate, Continue Response) */}
                      {!isPendingOrStreaming && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-inherit">
                          <button
                            type="button"
                            onClick={() => void handleCopyMessage(msg)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition ${
                              studioLight
                                ? 'hover:bg-stone-100 text-stone-600'
                                : 'hover:bg-white/10 text-zinc-400 hover:text-white'
                            }`}
                          >
                            {copiedMsgId === msg.messageId ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedMsgId === msg.messageId ? 'Copied' : 'Copy'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={isGenerating}
                            onClick={() => void handleRegenerate(idx)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition disabled:opacity-40 ${
                              studioLight
                                ? 'hover:bg-stone-100 text-stone-600'
                                : 'hover:bg-white/10 text-zinc-400 hover:text-white'
                            }`}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Regenerate</span>
                          </button>

                          {msg.messageType === 'text' && msg.content && (
                            <button
                              type="button"
                              disabled={isGenerating}
                              onClick={() => void handleContinueResponse(idx)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition disabled:opacity-40 ${
                                studioLight
                                  ? 'hover:bg-stone-100 text-stone-600'
                                  : 'hover:bg-white/10 text-zinc-400 hover:text-white'
                              }`}
                            >
                              <Play className="w-3 h-3" />
                              <span>Continue Response</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Centered Bottom Input Area */}
        <div
          className={`shrink-0 border-t px-3 sm:px-6 py-3 ${
            studioLight ? 'bg-[#5E4F45] border-[#8B7668]/50' : 'bg-[#0e0f13] border-white/10'
          }`}
        >
          <div className="mx-auto max-w-3xl space-y-2.5">
            {/* Attached Images Strip */}
            {attachments.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="relative w-14 h-16 rounded-xl overflow-hidden border border-emerald-500/40 shrink-0 group"
                  >
                    <img
                      src={att.url}
                      alt={att.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((prev) => prev.filter((i) => i.id !== att.id))
                      }
                      className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/80 text-white hover:bg-rose-600 cursor-pointer"
                      aria-label={`Remove ${att.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Mode Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => {
                  setImageGenMode(false);
                  if (attachments.length > 0) {
                    void sendMessage(
                      defaultListingPrompt || DEFAULT_LISTING_PROMPT,
                      attachments,
                      false
                    );
                  } else {
                    setInputText(defaultListingPrompt || DEFAULT_LISTING_PROMPT);
                    setShowMySetsDrawer(true);
                    showToast('Attach a garment photo or pick from My Sets');
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border cursor-pointer transition disabled:opacity-40 ${
                  studioLight
                    ? 'border-[#C9A468]/40 bg-[#263B32] text-[#F5F0E7] hover:bg-[#1f3129]'
                    : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>Product Listing Preset</span>
              </button>
            </div>

            {/* Composer Box */}
            <div
              className={`flex items-end gap-2 rounded-2xl border p-2 ${
                studioLight
                  ? 'bg-[#263B32] border-[#C9A468]/40 focus-within:border-[#e5373f]'
                  : 'bg-[#15171e] border-white/15 focus-within:border-[#e5373f]'
              }`}
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
                  studioLight
                    ? 'hover:bg-[#756357]/50 text-[#E2DDD4] hover:text-[#F5F0E7]'
                    : 'hover:bg-white/10 text-zinc-400 hover:text-white'
                }`}
                title="Attach garment image"
                aria-label="Attach image"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(inputText);
                  }
                }}
                rows={1}
                placeholder={
                  imageGenMode
                    ? 'Describe the image you want Gemini to generate...'
                    : 'Ask Gemini anything, paste a prompt, or say "generate an image of..."'
                }
                style={{ color: studioLight ? '#F5F0E7' : '#F4F4F5' }}
                className={`flex-1 bg-transparent text-xs sm:text-sm py-2 px-1 resize-none max-h-36 focus:outline-none ${
                  studioLight ? 'placeholder:text-[#C5BFB4]' : 'placeholder:text-zinc-500'
                }`}
              />

              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleStopGenerating}
                  className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white shrink-0 cursor-pointer transition"
                  title="Stop Generating"
                  aria-label="Stop Generating"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!inputText.trim() && attachments.length === 0}
                  onClick={() => void sendMessage(inputText)}
                  className="p-2.5 rounded-xl bg-[#e5373f] hover:bg-[#d42d35] text-white shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
                  title="Send message"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage.url}
              alt={lightboxImage.title}
              className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadImage(lightboxImage.url, lightboxImage.title)}
                className="px-3.5 py-2 rounded-xl bg-[#e5373f] hover:bg-[#d42d35] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog Modal */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setConfirmModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm rounded-2xl border p-5 space-y-4 shadow-2xl ${cardBg}`}
          >
            <h3 className="text-sm font-bold">
              {confirmModal.type === 'clear-all'
                ? 'Clear All History?'
                : 'Delete Conversation?'}
            </h3>
            <p className={`text-xs ${mutedText}`}>
              {confirmModal.type === 'clear-all'
                ? 'This will permanently delete all saved conversations from this browser.'
                : `Permanently delete "${confirmModal.title}"? This action cannot be undone.`}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                  studioLight
                    ? 'border-stone-200 hover:bg-stone-100'
                    : 'border-white/10 hover:bg-white/10'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  confirmModal.type === 'clear-all'
                    ? void handleConfirmClearAll()
                    : void handleConfirmDeleteOne(confirmModal.conversationId)
                }
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
