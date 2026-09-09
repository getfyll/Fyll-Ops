import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, ImageBackground, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { AtSign, Bell, Bookmark, CheckCircle2, ChevronDown, ChevronRight, CornerUpLeft, Copy, FileText, Image as ImageIcon, Info, Package, Paperclip, Pencil, Pin, Plus, Search, Send, ThumbsUp, Trash2, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '@/lib/supabase';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore from '@/lib/state/fyll-store';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { compressImage } from '@/lib/image-compression';
import { getTeamThreadDisplayNameFromEntityId, isTeamThreadEntityId } from '@/lib/team-threads';
import { ThreadInfoMembersSection } from '@/components/thread-info/ThreadInfoMembersSection';
import { ThreadInfoTopBar } from '@/components/thread-info/ThreadInfoTopBar';
import { ThreadInfoIdentityHeader } from '@/components/thread-info/ThreadInfoIdentityHeader';
import { ThreadInfoMediaSection } from '@/components/thread-info/ThreadInfoMediaSection';
import { ThreadInfoSettingsSection } from '@/components/thread-info/ThreadInfoSettingsSection';
import {
  type CollaborationAttachment,
  collaborationData,
  type CollaborationComment,
  type CollaborationEntityType,
  type CollaborationNotification,
  type UploadCollaborationAttachmentInput,
} from '@/lib/supabase/collaboration';

interface CollaborationThreadPanelProps {
  businessId?: string | null;
  entityType: CollaborationEntityType;
  entityId: string;
  displayEntityId?: string | null;
  isOfflineMode?: boolean;
  variant?: 'card' | 'pane';
  showHeader?: boolean;
  /** When true, opens the Thread Info modal from outside the panel */
  forceShowInfo?: boolean;
  onInfoModalDismiss?: () => void;
  /** When true, opens the search bar from outside the panel */
  forceShowSearch?: boolean;
  onSearchDismiss?: () => void;
}

interface ReplyTarget {
  commentId: string;
  authorUserId: string;
  authorName: string;
}

interface CreateCommentVariables {
  body: string;
  parentCommentId?: string | null;
  mentionUserIds?: string[];
  attachment?: PendingAttachment | null;
  optimisticId?: string;
  rawComposerText?: string;
  replyTargetSnapshot?: ReplyTarget | null;
  selectedMentionIdsSnapshot?: string[];
  pendingAttachmentSnapshot?: PendingAttachment | null;
}

interface PendingAttachment {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
}

interface CreateCommentMutationContext {
  optimisticId: string;
  rawComposerText: string;
  replyTargetSnapshot: ReplyTarget | null;
  selectedMentionIdsSnapshot: string[];
  pendingAttachmentSnapshot: PendingAttachment | null;
}

interface MentionableMember {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'staff';
  createdAt: string;
  isEveryone?: boolean;
  helperText?: string;
}

const EVERYONE_MENTION_ID = '__mention_everyone__';
const EVERYONE_MENTION_TOKEN = 'everyone';
const TYPING_IDLE_MS = 1800;
const TYPING_REFRESH_MS = 4000;

const formatRelativeTime = (value: string) => {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '';

  const diffMs = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < week) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const formatMessageTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const isSameCalendarDay = (left: string, right: string) => {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return false;
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
};

const formatDayDivider = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffInDays = Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));

  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatFileSize = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return 'Unknown size';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageAttachment = (name: string, mimeType?: string | null) => {
  const normalizedMime = (mimeType ?? '').toLowerCase();
  if (normalizedMime.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|heic|heif|gif|bmp)$/i.test(name);
};

const toJpegFileName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return 'attachment.jpg';
  const withoutExt = trimmed.replace(/\.[a-z0-9]+$/i, '');
  return `${withoutExt}.jpg`;
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
};

const getAvatarColor = (seed: string) => {
  const palette = ['#2563EB', '#7C3AED', '#0891B2', '#EA580C', '#059669', '#DB2777'];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % 10000;
  }
  return palette[hash % palette.length];
};

const formatDisplayName = (authorName: string, authorRole?: string) => {
  const cleanedName = authorName.trim();
  if (!cleanedName) return 'Team member';
  if (authorRole !== 'admin') return cleanedName;

  if (/\(admin\)/i.test(cleanedName)) return cleanedName;
  if (/^admin$/i.test(cleanedName)) return 'Admin';
  if (/^admin\b/i.test(cleanedName)) {
    const withoutPrefix = cleanedName.replace(/^admin\b[\s:-]*/i, '').trim();
    if (!withoutPrefix) return 'Admin';
    return `${withoutPrefix} (Admin)`;
  }
  return `${cleanedName} (Admin)`;
};

const getTypingNamesFromPresenceState = (
  presenceState: Record<string, unknown>,
  currentUserId: string | null
) => {
  const names: string[] = [];
  const now = Date.now();

  Object.values(presenceState).forEach((entrySet) => {
    if (!Array.isArray(entrySet)) return;

    entrySet.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;

      const meta = entry as Record<string, unknown>;
      const userId = typeof meta.user_id === 'string' ? meta.user_id : null;
      if (!userId || (currentUserId && userId === currentUserId)) return;
      if (meta.is_typing !== true) return;

      const rawUpdatedAt = meta.typing_updated_at;
      let updatedAt: number | null = null;
      if (typeof rawUpdatedAt === 'number' && Number.isFinite(rawUpdatedAt)) {
        updatedAt = rawUpdatedAt;
      } else if (typeof rawUpdatedAt === 'string') {
        const parsed = Number(rawUpdatedAt);
        updatedAt = Number.isFinite(parsed) ? parsed : null;
      }
      if (updatedAt !== null && now - updatedAt > 8000) return;

      const rawName = typeof meta.display_name === 'string' ? meta.display_name.trim() : '';
      const name = rawName.length > 0 ? rawName : 'Someone';
      if (!names.includes(name)) names.push(name);
    });
  });

  return names;
};

const mergeCommentIntoList = (
  previous: CollaborationComment[] | undefined,
  nextComment: CollaborationComment
): CollaborationComment[] => {
  const existing = previous ?? [];
  const nextCommentTime = new Date(nextComment.created_at).getTime();
  const normalizedNextCommentTime = Number.isFinite(nextCommentTime) ? nextCommentTime : Date.now();
  let didUpdate = false;

  const withoutDuplicate = existing.map((comment) => {
    if (comment.id !== nextComment.id) return comment;
    didUpdate = true;
    return {
      ...comment,
      ...nextComment,
      attachments: nextComment.attachments ?? comment.attachments ?? [],
    };
  });

  const merged = didUpdate ? withoutDuplicate : [...withoutDuplicate, nextComment];
  return merged.slice().sort((left, right) => {
    const leftTime = new Date(left.created_at).getTime();
    const rightTime = new Date(right.created_at).getTime();
    const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : normalizedNextCommentTime;
    const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : normalizedNextCommentTime;
    return normalizedLeftTime - normalizedRightTime;
  });
};

const buildOptimisticComment = ({
  businessId,
  threadId,
  authorUserId,
  body,
  parentCommentId,
  optimisticId,
}: {
  businessId: string;
  threadId: string;
  authorUserId: string;
  body: string;
  parentCommentId?: string | null;
  optimisticId: string;
}): CollaborationComment => {
  const nowIso = new Date().toISOString();
  return {
    id: optimisticId,
    business_id: businessId,
    thread_id: threadId,
    parent_comment_id: parentCommentId ?? null,
    author_user_id: authorUserId,
    body,
    created_at: nowIso,
    updated_at: nowIso,
    attachments: [],
  };
};

type MessageSegment = { type: 'text' | 'mention' | 'url' | 'order'; value: string; orderId?: string };

const parseMessageSegments = (text: string, orderMap?: Map<string, string>): MessageSegment[] => {
  const segments: MessageSegment[] = [];
  // Match: order tags (📦 #XXXX), URLs, @mentions.
  // The @mention branch requires whitespace (or string start) right before
  // the "@" so it doesn't match mid-word, e.g. the "@gmail.com" half of an
  // email address like "name@gmail.com".
  const tokenRegex = /(📦\s*#(\S+)[^\n]*|https?:\/\/[^\s]+|(?<!\S)@\S+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
   
  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('📦')) {
      const orderNum = match[2] ?? '';
      const orderId = orderMap?.get(orderNum) ?? undefined;
      segments.push({ type: 'order', value: token, orderId });
    } else {
      segments.push({ type: token.startsWith('http') ? 'url' : 'mention', value: token });
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
};

const chatWallpaperLight = require('../../assets/fylls threads bg-lm.png');
const chatWallpaperDark = require('../../assets/fylls threads dm.png');

// Native swipe-to-reply keeps vertical scroll reliable by only activating on deliberate horizontal pans.
function SwipeableMessage({
  isOwnMessage,
  onSwipeReply,
  children,
}: {
  isOwnMessage: boolean;
  onSwipeReply: () => void;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  const translateX = useSharedValue<number>(0);
  const didTriggerReply = useSharedValue<boolean>(false);
  const swipeDirection = isOwnMessage ? -1 : 1;
  const maxSwipeDistance = 84;
  const replyTriggerDistance = 56;

  const bubbleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      Math.abs(translateX.value),
      [8, replyTriggerDistance],
      [0, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity: progress,
      transform: [{ scale: 0.88 + progress * 0.12 }],
    };
  });

  const panGesture = useMemo(
    () => Gesture.Pan()
      .enabled(Platform.OS !== 'web')
      .activeOffsetX([-12, 12])
      .failOffsetY([-10, 10])
      .onUpdate((event) => {
        const rawTranslation = event.translationX * swipeDirection;
        if (rawTranslation <= 0) {
          translateX.value = withSpring(0, {
            damping: 22,
            stiffness: 280,
            mass: 0.3,
          });
          didTriggerReply.value = false;
          return;
        }

        translateX.value = Math.min(rawTranslation, maxSwipeDistance) * swipeDirection;
      })
      .onEnd(() => {
        const didCrossThreshold = Math.abs(translateX.value) >= replyTriggerDistance;
        translateX.value = withSpring(0, {
          damping: 22,
          stiffness: 280,
          mass: 0.3,
        });

        if (didCrossThreshold && !didTriggerReply.value) {
          didTriggerReply.value = true;
          runOnJS(onSwipeReply)();
        }

        didTriggerReply.value = false;
      })
      .onFinalize(() => {
        translateX.value = withSpring(0, {
          damping: 22,
          stiffness: 280,
          mass: 0.3,
        });
        didTriggerReply.value = false;
      }),
    [didTriggerReply, maxSwipeDistance, onSwipeReply, replyTriggerDistance, swipeDirection, translateX]
  );

  if (Platform.OS === 'web') {
    return <>{children}</>;
  }

  const replyIconColor = isOwnMessage
    ? 'rgba(255,255,255,0.88)'
    : colors.text.muted;

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={{
          position: 'relative',
          alignSelf: isOwnMessage ? 'flex-end' : 'flex-start',
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: '50%',
              zIndex: 0,
              marginTop: -10,
              left: isOwnMessage ? undefined : -30,
              right: isOwnMessage ? -30 : undefined,
            },
            iconAnimatedStyle,
          ]}
        >
          <CornerUpLeft size={18} color={replyIconColor} strokeWidth={2.4} />
        </Animated.View>

        <Animated.View style={bubbleAnimatedStyle}>
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

export function CollaborationThreadPanel({
  businessId,
  entityType,
  entityId,
  isOfflineMode = false,
  variant = 'card',
  showHeader = true,
  forceShowInfo,
  onInfoModalDismiss,
  forceShowSearch,
  onSearchDismiss,
}: CollaborationThreadPanelProps) {
  const colors = useThemeColors();
  const isDark = useResolvedThemeMode() === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isPaneVariant = variant === 'pane';
  const { width: viewportWidth } = useWindowDimensions();
  const isNarrowWebViewport = Platform.OS === 'web' && viewportWidth <= 900;
  const isTabletWebViewport = Platform.OS === 'web' && viewportWidth > 900 && viewportWidth <= 1366;
  const mobileBubbleMaxWidth = Math.max(220, Math.floor(viewportWidth * 0.66));
  const webBubbleMaxWidth = isNarrowWebViewport
    ? Math.max(300, Math.floor(viewportWidth * 0.54))
    : isTabletWebViewport
      ? Math.min(420, Math.floor(viewportWidth * 0.4))
      : 560;
  const bubbleMaxWidth = Platform.OS === 'web' ? webBubbleMaxWidth : mobileBubbleMaxWidth;
  const defaultBubbleRightPadding = isTabletWebViewport ? 24 : 32;
  const replyPreviewMaxWidth = Math.max(140, Math.floor(bubbleMaxWidth * 0.78));
  const attachmentPreviewWidth = Platform.OS === 'web'
    ? 220
    : Math.max(160, Math.min(220, bubbleMaxWidth - 46));
  const useFullscreenThreadInfo = Platform.OS !== 'web' || isNarrowWebViewport;
  const showThreadWallpaper = entityType === 'order'
    || (entityType === 'case' && isTeamThreadEntityId(entityId));
  const wallpaperSource = isDark ? chatWallpaperDark : chatWallpaperLight;
  const wallpaperPatternOpacity = 0.6;
  const wallpaperOverlay = 'transparent';
  const wallpaperWebUri = isDark ? '/thread-bg-dm.png' : '/thread-bg-lm.png';
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.currentUser);
  const teamMembers = useAuthStore((s) => s.teamMembers);
  const refreshTeamData = useAuthStore((s) => s.refreshTeamData);
  const currentUserId = currentUser?.id ?? null;
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const typingIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef<boolean>(false);
  const lastTypingTrackAtRef = useRef<number>(0);
  const composerInputRef = useRef<TextInput>(null);
  const threadScrollRef = useRef<ScrollView>(null);
  const shouldScrollToBottomOnContentChangeRef = useRef<boolean>(true);
  const pendingOwnMessageScrollRef = useRef<boolean>(false);
  const isAtBottomRef = useRef<boolean>(true);
  const latestSeenCommentIdRef = useRef<string | null>(null);
  const lastSendAttemptRef = useRef<{ fingerprint: string; sentAt: number } | null>(null);

  const [composerText, setComposerText] = useState<string>('');
  const deferredComposerText = useDeferredValue(composerText);
  const [composerInputHeight, setComposerInputHeight] = useState<number>(24);
  const composerSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const [controlledSelection, setControlledSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [editTarget, setEditTarget] = useState<CollaborationComment | null>(null);
  const [messageActionTarget, setMessageActionTarget] = useState<CollaborationComment | null>(null);
  // Snapshot: only updated when OPENING the menu (not on close) to prevent flicker during fade-out
  const actionModalSnapRef = useRef<CollaborationComment | null>(null);
  const [messageActionY, setMessageActionY] = useState<number>(300);
  const [messageActionX, setMessageActionX] = useState<number>(100);
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [showThreadInfo, setShowThreadInfo] = useState<boolean>(false);
  const [showInfoMenu, setShowInfoMenu] = useState<boolean>(false);
  const [showSavedMessages, setShowSavedMessages] = useState<boolean>(false);
  const [showPinnedMessages, setShowPinnedMessages] = useState<boolean>(false);
  const [showSearchBar, setShowSearchBar] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<TextInput>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState<boolean>(false);
  const [showOrderPicker, setShowOrderPicker] = useState<boolean>(false);
  const [orderSearch, setOrderSearch] = useState<string>('');
  const storeOrders = useFyllStore((s) => s.orders);
  const orderByNumber = useMemo(() => new Map(storeOrders.map((o) => [o.orderNumber, o.id])), [storeOrders]);
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  // pinnedMessages and starredMessages (saved) are derived from DB queries below
  const [pinnedMessages, setPinnedMessages] = useState<Record<string, boolean>>({});
  const [starredMessages, setStarredMessages] = useState<Record<string, boolean>>({});
  const lastTapStateRef = useRef<Record<string, { time: number; count: number }>>({});
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [typingUserNames, setTypingUserNames] = useState<string[]>([]);
  const [typingDotCount, setTypingDotCount] = useState<number>(1);
  const [selectedMentionIds, setSelectedMentionIds] = useState<string[]>([]);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [composerError, setComposerError] = useState<string>('');
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true);
  const [pendingIncomingCount, setPendingIncomingCount] = useState<number>(0);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<Record<string, string>>({});
  const [loadedAttachmentImages, setLoadedAttachmentImages] = useState<Record<string, boolean>>({});
  const [activeImagePreview, setActiveImagePreview] = useState<{ uri: string; fileName: string } | null>(null);
  const [optimisticComments, setOptimisticComments] = useState<CollaborationComment[]>([]);
  const lastMarkedNotificationKeyRef = useRef<string>('');
  const lastSeenThreadKeyRef = useRef<string>('');
  const [isScrollReady, setIsScrollReady] = useState<boolean>(false);

  const addOptimisticComment = useCallback((comment: CollaborationComment) => {
    setOptimisticComments((previous) => {
      if (previous.some((existingComment) => existingComment.id === comment.id)) return previous;
      return [...previous, comment];
    });
  }, []);

  const scrollThreadToBottom = (animated: boolean, onComplete?: () => void) => {
    requestAnimationFrame(() => {
      threadScrollRef.current?.scrollToEnd({ animated });
      if (onComplete) {
        requestAnimationFrame(() => {
          onComplete();
        });
      }
    });
  };

  const setBottomState = (nextValue: boolean) => {
    if (isAtBottomRef.current === nextValue) return;
    isAtBottomRef.current = nextValue;
    setIsAtBottom(nextValue);
    if (nextValue) {
      setPendingIncomingCount(0);
    }
  };

  const trackTypingPresence = useCallback((isTyping: boolean, force = false) => {
    const channel = presenceChannelRef.current;
    if (!channel || !currentUserId || isOfflineMode) return;

    const now = Date.now();
    if (typingIdleTimeoutRef.current) {
      clearTimeout(typingIdleTimeoutRef.current);
      typingIdleTimeoutRef.current = null;
    }

    if (!force) {
      const shouldSkipStartUpdate = isTyping
        && isTypingRef.current
        && now - lastTypingTrackAtRef.current < TYPING_REFRESH_MS;
      const shouldSkipStopUpdate = !isTyping && !isTypingRef.current;
      if (shouldSkipStartUpdate || shouldSkipStopUpdate) {
        if (isTyping) {
          typingIdleTimeoutRef.current = setTimeout(() => {
            trackTypingPresence(false, true);
          }, TYPING_IDLE_MS);
        }
        return;
      }
    }

    isTypingRef.current = isTyping;
    lastTypingTrackAtRef.current = now;

    void channel.track({
      user_id: currentUserId,
      display_name: currentUser?.name ?? 'Team member',
      is_typing: isTyping,
      typing_updated_at: now,
    }).catch((error) => {
      console.warn('Could not update typing presence:', error);
    });

    if (isTyping) {
      typingIdleTimeoutRef.current = setTimeout(() => {
        trackTypingPresence(false, true);
      }, TYPING_IDLE_MS);
    }
  }, [currentUser?.name, currentUserId, isOfflineMode]);

  useEffect(() => {
    if (!businessId || isOfflineMode) return;
    void refreshTeamData().catch((error) => {
      console.warn('Team member refresh failed for collaboration stream:', error);
    });
  }, [businessId, isOfflineMode, refreshTeamData]);

  useEffect(() => {
    if (!businessId || !currentUserId || isOfflineMode) {
      presenceChannelRef.current = null;
      setOnlineCount(0);
      setTypingUserNames([]);
      return;
    }

    const channelName = `presence-thread-${businessId}-${entityId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: currentUserId } },
    });
    presenceChannelRef.current = channel;

    const syncPresence = () => {
      const presenceState = channel.presenceState() as Record<string, unknown>;
      setOnlineCount(Object.keys(presenceState).length);
      setTypingUserNames(getTypingNamesFromPresenceState(presenceState, currentUserId));
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            const now = Date.now();
            await channel.track({
              user_id: currentUserId,
              display_name: currentUser?.name ?? 'Team member',
              is_typing: false,
              typing_updated_at: now,
            });
            isTypingRef.current = false;
            lastTypingTrackAtRef.current = now;
            syncPresence();
          } catch (error) {
            console.warn('Presence track failed for collaboration stream:', error);
          }
        }
      });

    return () => {
      if (typingIdleTimeoutRef.current) {
        clearTimeout(typingIdleTimeoutRef.current);
        typingIdleTimeoutRef.current = null;
      }
      isTypingRef.current = false;
      if (presenceChannelRef.current === channel) {
        presenceChannelRef.current = null;
      }
      setTypingUserNames([]);
      setOnlineCount(0);
      void channel.unsubscribe();
    };
  }, [businessId, currentUser?.name, currentUserId, entityId, isOfflineMode]);

  useEffect(() => {
    if (typingUserNames.length === 0) {
      setTypingDotCount(1);
      return;
    }
    const timer = setInterval(() => {
      setTypingDotCount((value) => (value >= 3 ? 1 : value + 1));
    }, 450);
    return () => {
      clearInterval(timer);
    };
  }, [typingUserNames.length]);

  useEffect(() => {
    return () => {
      if (typingIdleTimeoutRef.current) {
        clearTimeout(typingIdleTimeoutRef.current);
      }
    };
  }, []);

  const threadQuery = useQuery({
    queryKey: ['collaboration-thread', businessId, entityType, entityId],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.getOrCreateThread(businessId as string, entityType, entityId),
    refetchInterval: 10000,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const threadId = threadQuery.data?.id ?? null;
  const commentsQueryKey = useMemo(
    () => ['collaboration-comments', businessId, threadId] as const,
    [businessId, threadId]
  );

  useLayoutEffect(() => {
    setIsScrollReady(false);
    shouldScrollToBottomOnContentChangeRef.current = true;
    pendingOwnMessageScrollRef.current = false;
    latestSeenCommentIdRef.current = null;
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setPendingIncomingCount(0);
    setLoadedAttachmentImages({});
  }, [businessId, entityType, entityId]);

  const commentsQuery = useQuery({
    queryKey: commentsQueryKey,
    enabled: Boolean(businessId) && Boolean(threadId) && !isOfflineMode,
    queryFn: () => collaborationData.listThreadComments(businessId as string, threadId as string),
    refetchInterval: 30000,
    staleTime: 30 * 1000,       // keep cached data fresh for 30s — no flicker on reopen
    gcTime: 5 * 60 * 1000,      // keep in memory for 5 min after unmount
    placeholderData: (previous) => previous,
  });

  const commentIds = commentsQuery.data?.map((comment) => comment.id) ?? [];

  const reactionsQuery = useQuery({
    queryKey: ['collaboration-comment-reactions', businessId, threadId, commentIds],
    enabled: Boolean(businessId) && Boolean(threadId) && commentIds.length > 0 && !isOfflineMode,
    queryFn: () => collaborationData.listCommentReactions(businessId as string, commentIds),
    refetchInterval: 8000,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!businessId || !threadId || isOfflineMode) return;

    const channel = supabase
      .channel(`collaboration-comments-${businessId}-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'collaboration_comments',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const nextComment = payload.new as CollaborationComment;
          if (!nextComment?.id || nextComment.business_id !== businessId) return;
          queryClient.setQueryData<CollaborationComment[]>(
            commentsQueryKey,
            (previous) => mergeCommentIntoList(previous, { ...nextComment, attachments: undefined })
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'collaboration_comments',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const nextComment = payload.new as CollaborationComment;
          if (!nextComment?.id || nextComment.business_id !== businessId) return;
          queryClient.setQueryData<CollaborationComment[]>(
            commentsQueryKey,
            (previous) => mergeCommentIntoList(previous, { ...nextComment, attachments: undefined })
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'collaboration_comments',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const deletedComment = payload.old as Partial<CollaborationComment>;
          if (!deletedComment?.id) return;
          queryClient.setQueryData<CollaborationComment[]>(
            commentsQueryKey,
            (previous) => (previous ?? []).filter((comment) => comment.id !== deletedComment.id)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'collaboration_attachments',
        },
        (payload) => {
          const nextAttachment = payload.new as CollaborationAttachment;
          if (!nextAttachment?.comment_id || nextAttachment.business_id !== businessId) return;
          const commentExistsInThisThread = (queryClient.getQueryData<CollaborationComment[]>(commentsQueryKey) ?? [])
            .some((comment) => comment.id === nextAttachment.comment_id);
          if (!commentExistsInThisThread) return;
          void queryClient.refetchQueries({ queryKey: commentsQueryKey, exact: true });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, commentsQueryKey, isOfflineMode, queryClient, threadId]);

  const unreadNotificationsQuery = useQuery({
    queryKey: ['collaboration-notifications-unread', businessId],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.listMyNotifications(businessId as string, { unreadOnly: true, limit: 200 }),
    refetchInterval: 15000,
  });

  // ── Pinned & Saved messages (persisted to DB) ──
  const pinnedQuery = useQuery({
    queryKey: ['collaboration-pinned', businessId, threadId],
    enabled: Boolean(businessId) && Boolean(threadId) && !isOfflineMode,
    queryFn: () => collaborationData.listPinnedMessages(businessId as string, threadId as string),
    staleTime: 30_000,
  });

  const savedQuery = useQuery({
    queryKey: ['collaboration-saved', businessId, threadId],
    enabled: Boolean(businessId) && Boolean(threadId) && !isOfflineMode,
    queryFn: () => collaborationData.listSavedMessages(businessId as string, threadId as string),
    staleTime: 30_000,
  });

  // Sync DB data into local state maps for fast lookups
  useEffect(() => {
    if (pinnedQuery.data) {
      const map: Record<string, boolean> = {};
      pinnedQuery.data.forEach((id) => { map[id] = true; });
      setPinnedMessages(map);
    }
  }, [pinnedQuery.data]);

  useEffect(() => {
    if (savedQuery.data) {
      const map: Record<string, boolean> = {};
      savedQuery.data.forEach((id) => { map[id] = true; });
      setStarredMessages(map);
    }
  }, [savedQuery.data]);

  useEffect(() => {
    if (commentIds.length === 0) {
      setLikes({});
      setLikeCounts({});
      return;
    }

    const rows = reactionsQuery.data ?? [];
    const nextLikes: Record<string, boolean> = {};
    const nextLikeCounts: Record<string, number> = {};

    rows.forEach((row) => {
      if (row.reaction !== 'thumbs_up') return;
      nextLikeCounts[row.comment_id] = (nextLikeCounts[row.comment_id] ?? 0) + 1;
      if (currentUserId && row.user_id === currentUserId) {
        nextLikes[row.comment_id] = true;
      }
    });

    setLikes(nextLikes);
    setLikeCounts(nextLikeCounts);
  }, [commentIds.length, currentUserId, reactionsQuery.data]);

  const pinMessageMutation = useMutation({
    mutationFn: async ({ commentId, isPinned }: { commentId: string; isPinned: boolean }) => {
      if (!businessId || !threadId) return;
      if (isPinned) {
        await collaborationData.unpinMessage(businessId, threadId, commentId);
      } else {
        await collaborationData.pinMessage(businessId, threadId, commentId);
      }
    },
    onMutate: async ({ commentId, isPinned }) => {
      setPinnedMessages((prev) => ({ ...prev, [commentId]: !isPinned }));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['collaboration-pinned', businessId, threadId] });
    },
  });

  const saveMessageMutation = useMutation({
    mutationFn: async ({ commentId, isSaved }: { commentId: string; isSaved: boolean }) => {
      if (!businessId || !threadId) return;
      if (isSaved) {
        await collaborationData.unsaveMessage(businessId, threadId, commentId);
      } else {
        await collaborationData.saveMessage(businessId, threadId, commentId);
      }
    },
    onMutate: async ({ commentId, isSaved }) => {
      setStarredMessages((prev) => ({ ...prev, [commentId]: !isSaved }));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['collaboration-saved', businessId, threadId] });
    },
  });

  const commentReactionMutation = useMutation({
    mutationFn: async ({ commentId, isLiked }: { commentId: string; isLiked: boolean }) => {
      if (!businessId) throw new Error('Missing businessId');
      if (isLiked) {
        await collaborationData.removeCommentReaction(businessId, commentId, 'thumbs_up');
      } else {
        await collaborationData.addCommentReaction(businessId, commentId, 'thumbs_up');
      }
    },
    onMutate: ({ commentId, isLiked }) => {
      const nextLiked = !isLiked;
      setLikes((prev) => ({ ...prev, [commentId]: nextLiked }));
      setLikeCounts((prev) => ({
        ...prev,
        [commentId]: nextLiked
          ? (prev[commentId] ?? 0) + 1
          : Math.max(0, (prev[commentId] ?? 0) - 1),
      }));
    },
    onError: (error) => {
      console.warn('Comment reaction update failed:', error);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['collaboration-comment-reactions', businessId, threadId] });
    },
  });

  const markNotificationsReadMutation = useMutation({
    mutationFn: async ({ notificationIds, threadId: targetThreadId }: { notificationIds: string[]; threadId: string }) => {
      if (!businessId) return;
      await collaborationData.markThreadAsSeen(businessId, targetThreadId);
      if (notificationIds.length === 0) return;
      await Promise.all(notificationIds.map((id) => collaborationData.markNotificationAsRead(id)));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['collaboration-notifications-unread', businessId] });
      await queryClient.invalidateQueries({ queryKey: ['collaboration-thread-counts', businessId] });
    },
  });
  const markNotificationsReadMutateAsync = markNotificationsReadMutation.mutateAsync;
  const isMarkNotificationsReadPending = markNotificationsReadMutation.isPending;

  const createCommentMutation = useMutation({
    mutationFn: async (variables: CreateCommentVariables) => {
      if (!businessId || !threadId) {
        throw new Error('Missing collaboration thread context.');
      }

      let attachmentPayload: UploadCollaborationAttachmentInput[] = [];
      if (variables.attachment) {
        attachmentPayload = [{
          businessId,
          threadId,
          uri: variables.attachment.uri,
          fileName: variables.attachment.name,
          mimeType: variables.attachment.mimeType ?? null,
          fileSize: variables.attachment.size ?? null,
        }];
      }

      const uploadedAttachments = attachmentPayload.length > 0
        ? await Promise.all(attachmentPayload.map((attachment) => collaborationData.uploadAttachment(attachment)))
        : [];

      return collaborationData.createComment({
        businessId,
        threadId,
        body: variables.body,
        parentCommentId: variables.parentCommentId ?? null,
        mentionUserIds: variables.mentionUserIds ?? [],
        attachments: uploadedAttachments,
      });
    },
    onMutate: async (variables): Promise<CreateCommentMutationContext> => {
      const optimisticId = variables.optimisticId ?? `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (businessId && threadId && currentUserId) {
        const optimisticComment = buildOptimisticComment({
          businessId,
          threadId,
          authorUserId: currentUserId,
          body: variables.body,
          parentCommentId: variables.parentCommentId ?? null,
          optimisticId,
        });
        addOptimisticComment(optimisticComment);
      }

      setComposerText('');
      trackTypingPresence(false, true);
      composerSelectionRef.current = { start: 0, end: 0 };
      setControlledSelection({ start: 0, end: 0 });
      setReplyTarget(null);
      setSelectedMentionIds([]);
      setPendingAttachment(null);
      setComposerError('');
      setPendingIncomingCount(0);
      shouldScrollToBottomOnContentChangeRef.current = true;

      return {
        optimisticId,
        rawComposerText: variables.rawComposerText ?? variables.body,
        replyTargetSnapshot: variables.replyTargetSnapshot ?? null,
        selectedMentionIdsSnapshot: variables.selectedMentionIdsSnapshot ?? [],
        pendingAttachmentSnapshot: variables.pendingAttachmentSnapshot ?? null,
      };
    },
    onSuccess: async (createdComment, _variables, context) => {
      if (context?.optimisticId) {
        setOptimisticComments((previous) => previous.filter((comment) => comment.id !== context.optimisticId));
      }
      queryClient.setQueryData<CollaborationComment[]>(
        commentsQueryKey,
        (previous) => mergeCommentIntoList(previous, createdComment)
      );
      shouldScrollToBottomOnContentChangeRef.current = true;
      await queryClient.invalidateQueries({ queryKey: ['collaboration-notifications-unread', businessId] });
    },
    onError: async (error, variables, context) => {
      if (context?.optimisticId) {
        setOptimisticComments((previous) => previous.filter((comment) => comment.id !== context.optimisticId));
      }
      // Refetch comments to check if the comment actually appeared
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
      const latestComments = queryClient.getQueryData(commentsQueryKey) ?? [];
      // Check if the comment body matches the one just sent (trimmed)
      const sentBody = variables?.body?.trim?.();
      const found = Array.isArray(latestComments) && sentBody
        ? latestComments.some((c) => c.body?.trim?.() === sentBody)
        : false;
      if (found) {
        setComposerError('');
        setComposerText('');
        trackTypingPresence(false, true);
        composerSelectionRef.current = { start: 0, end: 0 };
        setControlledSelection({ start: 0, end: 0 });
        setReplyTarget(null);
        setSelectedMentionIds([]);
        setPendingAttachment(null);
        setPendingIncomingCount(0);
        shouldScrollToBottomOnContentChangeRef.current = true;
        pendingOwnMessageScrollRef.current = false;
        scrollThreadToBottom(false);
      } else {
        pendingOwnMessageScrollRef.current = false;
        setComposerText(context?.rawComposerText ?? variables?.rawComposerText ?? variables?.body ?? '');
        const restoreText = context?.rawComposerText ?? variables?.rawComposerText ?? variables?.body ?? '';
        const nextCursor = restoreText.length;
        composerSelectionRef.current = { start: nextCursor, end: nextCursor };
        setControlledSelection({ start: nextCursor, end: nextCursor });
        setReplyTarget(context?.replyTargetSnapshot ?? variables?.replyTargetSnapshot ?? null);
        setSelectedMentionIds(context?.selectedMentionIdsSnapshot ?? variables?.selectedMentionIdsSnapshot ?? []);
        setPendingAttachment(context?.pendingAttachmentSnapshot ?? variables?.pendingAttachmentSnapshot ?? null);
        setComposerError(error instanceof Error ? error.message : 'Could not send comment. Please try again.');
      }
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, body }: { commentId: string; body: string }) => {
      await collaborationData.updateComment(commentId, body);
      return { commentId, body };
    },
    onSuccess: ({ commentId, body }) => {
      queryClient.setQueryData<CollaborationComment[]>(
        commentsQueryKey,
        (previous) => (previous ?? []).map((comment) => (
          comment.id === commentId
            ? { ...comment, body, edited_at: new Date().toISOString(), updated_at: new Date().toISOString() }
            : comment
        ))
      );
      setEditTarget(null);
      setComposerText('');
      trackTypingPresence(false, true);
      composerSelectionRef.current = { start: 0, end: 0 };
      setComposerError('');
    },
    onError: (error) => {
      setComposerError(error instanceof Error ? error.message : 'Could not edit message. Please try again.');
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await collaborationData.deleteComment(commentId);
      return commentId;
    },
    onSuccess: (commentId) => {
      queryClient.setQueryData<CollaborationComment[]>(
        commentsQueryKey,
        (previous) => (previous ?? []).filter((comment) => comment.id !== commentId)
      );
      setMessageActionTarget(null);
    },
    onError: (error) => {
      console.warn('Delete comment failed:', error);
    },
  });

  const closeThreadMutation = useMutation({
    mutationFn: async (close: boolean) => {
      if (!threadId) throw new Error('No thread');
      return close ? collaborationData.closeThread(threadId) : collaborationData.reopenThread(threadId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['collaboration-thread', businessId, entityType, entityId] });
      await queryClient.invalidateQueries({ queryKey: ['collaboration-order-threads', businessId] });
      await queryClient.invalidateQueries({ queryKey: ['collaboration-team-threads', businessId] });
    },
    onError: (error) => {
      console.warn('Close/reopen thread failed:', error);
      setComposerError(error instanceof Error ? error.message : 'Could not update thread status.');
    },
  });

  // Open info modal when triggered externally (e.g. from team.tsx header button)
  useEffect(() => {
    if (forceShowInfo) setShowThreadInfo(true);
  }, [forceShowInfo]);

  // Open search bar when triggered externally
  useEffect(() => {
    if (forceShowSearch) {
      setShowSearchBar(true);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [forceShowSearch]);

  const handleSearchClose = () => {
    setShowSearchBar(false);
    setSearchQuery('');
    onSearchDismiss?.();
  };

  const handleInfoModalClose = () => {
    setShowThreadInfo(false);
    onInfoModalDismiss?.();
  };

  const thread = threadQuery.data ?? null;
  const isClosed = thread?.is_closed ?? false;
  const currentUserRole = currentUser?.role ?? 'staff';
  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'manager';

  useEffect(() => {
    if (isClosed) {
      trackTypingPresence(false, true);
    }
  }, [isClosed, trackTypingPresence]);

  const comments = useMemo(() => {
    const persistedComments = commentsQuery.data ?? [];
    if (optimisticComments.length === 0) return persistedComments;
    const persistedIds = new Set(persistedComments.map((comment) => comment.id));
    return [
      ...persistedComments,
      ...optimisticComments.filter((comment) => !persistedIds.has(comment.id)),
    ];
  }, [commentsQuery.data, optimisticComments]);
  const unreadNotifications = useMemo(() => unreadNotificationsQuery.data ?? [], [unreadNotificationsQuery.data]);

  const unreadForThread = useMemo(() => {
    if (!threadId) return [] as CollaborationNotification[];
    return unreadNotifications.filter((notification) => notification.thread_id === threadId);
  }, [unreadNotifications, threadId]);

  useEffect(() => {
    if (!businessId || !threadId || isOfflineMode) return;
    const key = `${businessId}:${threadId}`;
    if (lastSeenThreadKeyRef.current === key) return;
    lastSeenThreadKeyRef.current = key;
    void collaborationData.markThreadAsSeen(businessId, threadId).then(async () => {
      await queryClient.invalidateQueries({ queryKey: ['collaboration-notifications-unread', businessId] });
      await queryClient.invalidateQueries({ queryKey: ['collaboration-thread-counts', businessId] });
    }).catch((error) => {
      console.warn('Failed to mark thread as seen:', error);
    });
  }, [businessId, isOfflineMode, queryClient, threadId]);

  useEffect(() => {
    if (!threadId || unreadForThread.length === 0 || isMarkNotificationsReadPending) {
      if (unreadForThread.length === 0) {
        lastMarkedNotificationKeyRef.current = '';
      }
      return;
    }

    const ids = unreadForThread.map((item) => item.id);
    const key = ids.slice().sort().join(',');
    if (!key || key === lastMarkedNotificationKeyRef.current) return;

    lastMarkedNotificationKeyRef.current = key;
    void markNotificationsReadMutateAsync({ notificationIds: ids, threadId }).catch((error) => {
      lastMarkedNotificationKeyRef.current = '';
      console.warn('Failed to mark collaboration notifications as read:', error);
    });
  }, [isMarkNotificationsReadPending, markNotificationsReadMutateAsync, threadId, unreadForThread]);

  // Fetch all profiles for this business as a fallback for when teamMembers
  // is incomplete (e.g. staff users with restricted RLS on team_members table)
  const businessProfilesQuery = useQuery({
    queryKey: ['collaboration-business-profiles', businessId],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.fetchProfilesForBusiness(businessId as string),
    staleTime: 5 * 60 * 1000,
  });

  const businessProfiles = useMemo(() => businessProfilesQuery.data ?? [], [businessProfilesQuery.data]);

  const authorMap = useMemo(() => {
    const map = new Map<string, string>();
    // Start with profiles (broadest source, works even when teamMembers is empty)
    businessProfiles.forEach((profile) => {
      if (profile.name) map.set(profile.id, profile.name);
    });
    // Layer team members on top (may have more up-to-date names)
    teamMembers.forEach((member) => {
      map.set(member.id, member.name);
    });
    // Current user always takes priority
    if (currentUser?.id) {
      map.set(currentUser.id, currentUser.name);
    }
    return map;
  }, [businessProfiles, currentUser, teamMembers]);

  const roleMap = useMemo(() => {
    const map = new Map<string, string>();
    businessProfiles.forEach((profile) => {
      if (profile.role) map.set(profile.id, profile.role);
    });
    teamMembers.forEach((member) => {
      map.set(member.id, member.role);
    });
    if (currentUser?.id) {
      map.set(currentUser.id, currentUser.role);
    }
    return map;
  }, [businessProfiles, currentUser, teamMembers]);

  const orderedComments = useMemo(() => {
    return comments
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [comments]);

  useEffect(() => {
    if (orderedComments.length === 0) {
      latestSeenCommentIdRef.current = null;
      return;
    }

    const newestComment = orderedComments[orderedComments.length - 1];
    const previousNewestCommentId = latestSeenCommentIdRef.current;
    if (!previousNewestCommentId) {
      latestSeenCommentIdRef.current = newestComment.id;
      return;
    }

    if (newestComment.id === previousNewestCommentId) return;

    let delta = 1;
    const previousIndex = orderedComments.findIndex((comment) => comment.id === previousNewestCommentId);
    if (previousIndex >= 0) {
      delta = Math.max(1, orderedComments.length - 1 - previousIndex);
    }

    if (
      newestComment.author_user_id !== currentUserId
      && !isAtBottomRef.current
      && !pendingOwnMessageScrollRef.current
    ) {
      setPendingIncomingCount((count) => count + delta);
    }

    latestSeenCommentIdRef.current = newestComment.id;
  }, [currentUserId, orderedComments]);

  useEffect(() => {
    if (!pendingOwnMessageScrollRef.current || orderedComments.length === 0 || !currentUserId) return;
    const newestComment = orderedComments[orderedComments.length - 1];
    if (newestComment.author_user_id !== currentUserId) return;

    shouldScrollToBottomOnContentChangeRef.current = true;
    pendingOwnMessageScrollRef.current = false;
    setPendingIncomingCount(0);
    scrollThreadToBottom(false);
  }, [currentUserId, orderedComments]);

  const commentsById = useMemo(() => {
    const map = new Map<string, CollaborationComment>();
    orderedComments.forEach((comment) => {
      map.set(comment.id, comment);
    });
    return map;
  }, [orderedComments]);

  const trimmedCommentSearch = searchQuery.trim().toLowerCase();
  const displayedComments = useMemo(() => {
    if (!trimmedCommentSearch) return orderedComments;
    return orderedComments.filter((comment) => {
      const body = comment.body.toLowerCase();
      const author = (authorMap.get(comment.author_user_id) ?? '').toLowerCase();
      return body.includes(trimmedCommentSearch) || author.includes(trimmedCommentSearch);
    });
  }, [authorMap, orderedComments, trimmedCommentSearch]);

  const imageAttachmentsForPreview = useMemo(() => {
    const unique = new Map<string, CollaborationAttachment>();
    orderedComments.forEach((comment) => {
      (comment.attachments ?? []).forEach((attachment) => {
        if (!isImageAttachment(attachment.file_name, attachment.mime_type)) return;
        if (unique.has(attachment.id)) return;
        unique.set(attachment.id, attachment);
      });
    });
    return [...unique.values()];
  }, [orderedComments]);

  useEffect(() => {
    setAttachmentPreviewUrls((previous) => {
      const activeIds = new Set(imageAttachmentsForPreview.map((attachment) => attachment.id));
      let changed = false;
      const next: Record<string, string> = {};
      Object.entries(previous).forEach(([id, url]) => {
        if (!activeIds.has(id)) {
          changed = true;
          return;
        }
        next[id] = url;
      });
      return changed ? next : previous;
    });
  }, [imageAttachmentsForPreview]);

  useEffect(() => {
    setLoadedAttachmentImages((previous) => {
      const activeIds = new Set(imageAttachmentsForPreview.map((attachment) => attachment.id));
      let changed = false;
      const next: Record<string, boolean> = {};
      Object.entries(previous).forEach(([id, loaded]) => {
        if (!activeIds.has(id)) {
          changed = true;
          return;
        }
        next[id] = loaded;
      });
      return changed ? next : previous;
    });
  }, [imageAttachmentsForPreview]);

  useEffect(() => {
    const missingAttachments = imageAttachmentsForPreview.filter((attachment) => !attachmentPreviewUrls[attachment.id]);
    if (missingAttachments.length === 0) return;

    let isActive = true;
    void Promise.all(missingAttachments.map(async (attachment) => {
      try {
        const url = await collaborationData.getAttachmentSignedUrl(attachment.storage_path, 3600);
        return { id: attachment.id, url } as const;
      } catch (error) {
        console.warn('Could not fetch image preview URL for collaboration attachment:', error);
        return null;
      }
    })).then((results) => {
      if (!isActive) return;
      setAttachmentPreviewUrls((previous) => {
        let changed = false;
        const next = { ...previous };
        results.forEach((result) => {
          if (!result) return;
          if (next[result.id] === result.url) return;
          next[result.id] = result.url;
          changed = true;
        });
        return changed ? next : previous;
      });
    });

    return () => {
      isActive = false;
    };
  }, [attachmentPreviewUrls, imageAttachmentsForPreview]);

  const mentionableMembers = useMemo<MentionableMember[]>(() => {
    // Merge team members, business profiles, AND thread comment authors to build the
    // full mentionable list. This ensures the mention picker works even when RLS
    // restricts team_members or profiles queries for staff users.
    const seen = new Set<string>();
    const result: MentionableMember[] = [];

    // Add from team members first (most up-to-date names)
    teamMembers.forEach((member) => {
      if (member.id === currentUserId || seen.has(member.id)) return;
      seen.add(member.id);
      result.push(member);
    });

    // Fill in anyone missing from business profiles
    businessProfiles.forEach((profile) => {
      if (profile.id === currentUserId || seen.has(profile.id) || !profile.name) return;
      seen.add(profile.id);
      result.push({
        id: profile.id,
        email: profile.email ?? '',
        name: profile.name,
        role: profile.role as 'admin' | 'manager' | 'staff',
        createdAt: '',
      });
    });

    // Ultimate fallback: extract mentionable users from thread comment authors
    // This way even if both team_members and profiles queries fail/return empty,
    // users who have commented in this thread can still be @mentioned
    orderedComments.forEach((comment) => {
      const userId = comment.author_user_id;
      if (userId === currentUserId || seen.has(userId)) return;
      const name = authorMap.get(userId);
      if (!name || name === 'Team member') return;
      seen.add(userId);
      result.push({
        id: userId,
        email: '',
        name,
        role: (roleMap.get(userId) as 'admin' | 'manager' | 'staff') ?? 'staff',
        createdAt: '',
      });
    });

    return result;
  }, [authorMap, businessProfiles, currentUserId, orderedComments, roleMap, teamMembers]);

  const getMentionTokenAt = (text: string, cursorIndex: number) => {
    if (cursorIndex < 0 || cursorIndex > text.length) return null;

    const beforeCursor = text.slice(0, cursorIndex);
    const triggerMatch = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (!triggerMatch) return null;

    const atIndex = beforeCursor.lastIndexOf('@');
    if (atIndex < 0) return null;

    return {
      query: (triggerMatch[1] ?? '').toLowerCase(),
      atIndex,
      cursorIndex,
    };
  };

  const activeMentionToken = useMemo(() => {
    return getMentionTokenAt(deferredComposerText, composerSelectionRef.current.start);
  }, [deferredComposerText]);

  const filteredMentionMembers = useMemo(() => {
    if (!activeMentionToken) return [];

    const query = activeMentionToken.query.trim();
    const filtered = mentionableMembers.filter((member) => {
      if (!query) return true;
      return member.name.toLowerCase().includes(query);
    });

    const shouldShowEveryone = !query
      || EVERYONE_MENTION_TOKEN.includes(query)
      || 'all'.includes(query)
      || 'team'.includes(query);

    if (!shouldShowEveryone || mentionableMembers.length === 0) {
      return filtered;
    }

    return [
      {
        id: EVERYONE_MENTION_ID,
        email: '',
        name: EVERYONE_MENTION_TOKEN,
        role: 'staff',
        createdAt: '',
        isEveryone: true,
        helperText: 'Notify everyone in this business',
      },
      ...filtered,
    ];
  }, [activeMentionToken, mentionableMembers]);

  const showMentionPicker = Boolean(activeMentionToken) && filteredMentionMembers.length > 0;

  const unreadCount = unreadForThread.length;

  const insertMention = (userId: string, userName: string, isEveryone = false) => {
    if (isEveryone) {
      const allMentionableIds = mentionableMembers.map((member) => member.id);
      setSelectedMentionIds((previous) => Array.from(new Set([...previous, ...allMentionableIds])));
    } else {
      setSelectedMentionIds((previous) => {
        if (previous.includes(userId)) return previous;
        return [...previous, userId];
      });
    }

    const mentionToken = isEveryone ? `@${EVERYONE_MENTION_TOKEN}` : `@${userName}`;

    // Recompute against the live composerText/cursor rather than reusing
    // activeMentionToken — that's derived from a useDeferredValue snapshot,
    // which can lag a keystroke behind by the time a suggestion is tapped,
    // leaving a stray trailing character (e.g. "@David d") in the result.
    const liveMentionToken = getMentionTokenAt(composerText, composerSelectionRef.current.start) ?? activeMentionToken;

    if (liveMentionToken) {
      const prefix = composerText.slice(0, liveMentionToken.atIndex);
      const suffix = composerText.slice(liveMentionToken.cursorIndex).replace(/^\s*/, '');
      const nextText = `${prefix}${mentionToken} ${suffix}`;
      const nextCursor = `${prefix}${mentionToken} `.length;

      setComposerText(nextText);
      setControlledSelection({ start: nextCursor, end: nextCursor });
      // Re-focus after a tick so the keyboard stays open
      requestAnimationFrame(() => composerInputRef.current?.focus());
      return;
    }

    setComposerText((previous) => {
      const separator = previous.trim().length > 0 ? ' ' : '';
      const nextText = `${previous}${separator}${mentionToken} `;
      const nextCursor = nextText.length;
      setControlledSelection({ start: nextCursor, end: nextCursor });
      return nextText;
    });
    requestAnimationFrame(() => composerInputRef.current?.focus());
  };

  const handleDoubleTap = (commentId: string) => {
    if (!businessId || !threadId) return;
    commentReactionMutation.mutate({
      commentId,
      isLiked: Boolean(likes[commentId]),
    });
  };

  const handleBubbleTap = (comment: CollaborationComment) => {
    const now = Date.now();
    const previous = lastTapStateRef.current[comment.id];
    const isBurstTap = previous && (now - previous.time < 320);
    const nextCount = isBurstTap ? previous.count + 1 : 1;

    if (nextCount === 2) {
      handleDoubleTap(comment.id);
      lastTapStateRef.current[comment.id] = { time: now, count: 2 };
      return;
    }

    if (nextCount >= 3) {
      beginReply(comment);
      lastTapStateRef.current[comment.id] = { time: 0, count: 0 };
      return;
    }

    lastTapStateRef.current[comment.id] = { time: now, count: 1 };
  };

  const beginReply = (comment: CollaborationComment) => {
    const authorName = authorMap.get(comment.author_user_id) ?? 'Team member';
    setReplyTarget({
      commentId: comment.id,
      authorUserId: comment.author_user_id,
      authorName,
    });
    if (comment.author_user_id !== currentUserId) {
      setSelectedMentionIds((previousIds) => {
        if (previousIds.includes(comment.author_user_id)) return previousIds;
        return [...previousIds, comment.author_user_id];
      });
    }
  };

  const insertComposerToken = (token: string) => {
    const cursorIndex = composerSelectionRef.current.start;
    const beforeCursor = composerText.slice(0, cursorIndex);
    const afterCursor = composerText.slice(cursorIndex);
    const needsSpace = beforeCursor.length > 0 && !/\s$/.test(beforeCursor);
    const insertion = `${needsSpace ? ' ' : ''}${token}`;
    const nextText = `${beforeCursor}${insertion}${afterCursor}`;
    const nextCursor = beforeCursor.length + insertion.length;

    setComposerText(nextText);
    setControlledSelection({ start: nextCursor, end: nextCursor });
    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  };

  const handleMentionButtonPress = () => {
    insertComposerToken('@');
  };

  const handlePingEveryonePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    insertComposerToken('@everyone ');
  };

  const handlePickAttachment = async (mode: 'image' | 'document' = 'document') => {
    try {
      setComposerError('');
      const result = await DocumentPicker.getDocumentAsync({
        type: mode === 'image' ? ['image/*', 'video/*'] : '*/*',
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const maxFileSize = 15 * 1024 * 1024;
      let nextAttachment: PendingAttachment = {
        uri: asset.uri,
        name: asset.name ?? 'attachment',
        mimeType: asset.mimeType ?? null,
        size: asset.size ?? null,
      };

      if (isImageAttachment(nextAttachment.name, nextAttachment.mimeType)) {
        try {
          const compressedUri = await compressImage(nextAttachment.uri, {
            maxDimension: 1600,
            quality: 0.72,
          });
          const compressedResponse = await fetch(compressedUri);
          if (compressedResponse.ok) {
            const compressedBlob = await compressedResponse.blob();
            if (compressedBlob.size > 0) {
              const originalSize = typeof nextAttachment.size === 'number' ? nextAttachment.size : null;
              if (!originalSize || compressedBlob.size <= originalSize) {
                nextAttachment = {
                  uri: compressedUri,
                  name: toJpegFileName(nextAttachment.name),
                  mimeType: 'image/jpeg',
                  size: compressedBlob.size,
                };
              }
            }
          }
        } catch (compressionError) {
          console.warn('Collaboration attachment compression failed:', compressionError);
        }
      }

      if (typeof nextAttachment.size === 'number' && nextAttachment.size > maxFileSize) {
        setComposerError('Attachment too large after compression. Max size is 15 MB.');
        return;
      }

      setPendingAttachment(nextAttachment);
    } catch (error) {
      console.warn('Attachment picker failed:', error);
      setComposerError('Could not pick attachment.');
    }
  };

  const openAttachmentExternally = async (attachment: CollaborationAttachment) => {
    try {
      const url = await collaborationData.getAttachmentSignedUrl(attachment.storage_path);
      await Linking.openURL(url);
    } catch (error) {
      console.warn('Could not open collaboration attachment:', error);
      setComposerError('Could not open attachment.');
    }
  };

  const openAttachmentInModal = async (
    attachment: CollaborationAttachment,
    preloadedImageUrl?: string
  ) => {
    try {
      const imageUrl = preloadedImageUrl ?? await collaborationData.getAttachmentSignedUrl(attachment.storage_path);
      setActiveImagePreview({
        uri: imageUrl,
        fileName: attachment.file_name,
      });
    } catch (error) {
      console.warn('Could not preview collaboration attachment:', error);
      setComposerError('Could not preview attachment.');
    }
  };

  const handleAttachmentPress = async (
    attachment: CollaborationAttachment,
    preloadedImageUrl?: string
  ) => {
    if (isImageAttachment(attachment.file_name, attachment.mime_type)) {
      await openAttachmentInModal(attachment, preloadedImageUrl);
      return;
    }
    await openAttachmentExternally(attachment);
  };

  const handleSend = () => {
    if (editTarget) {
      const trimmed = composerText.trim();
      if (!trimmed || updateCommentMutation.isPending) return;
      trackTypingPresence(false, true);
      updateCommentMutation.mutate({ commentId: editTarget.id, body: trimmed });
      return;
    }
    const trimmed = composerText.trim();
    if ((!trimmed && !pendingAttachment) || !threadId) return;
    const rawComposerText = composerText;
    const optimisticBody = trimmed || `Shared an attachment: ${pendingAttachment?.name ?? ''}`;
    const sendFingerprint = [
      threadId,
      rawComposerText.trim(),
      pendingAttachment?.uri ?? '',
      replyTarget?.commentId ?? '',
    ].join(':');
    const now = Date.now();
    if (
      lastSendAttemptRef.current?.fingerprint === sendFingerprint
      && now - lastSendAttemptRef.current.sentAt < 700
    ) {
      return;
    }
    lastSendAttemptRef.current = { fingerprint: sendFingerprint, sentAt: now };
    trackTypingPresence(false, true);
    setComposerError('');

    let mentionIds = selectedMentionIds.filter((userId) => {
      const member = mentionableMembers.find((candidate) => candidate.id === userId);
      if (!member) return false;
      return trimmed.includes(`@${member.name}`);
    });
    const hasEveryoneMention = /(?:^|\s)@everyone\b/i.test(trimmed);
    if (hasEveryoneMention) {
      mentionIds = Array.from(new Set([
        ...mentionIds,
        ...mentionableMembers.map((member) => member.id),
      ]));
    }
    if (replyTarget?.authorUserId && replyTarget.authorUserId !== currentUserId && !mentionIds.includes(replyTarget.authorUserId)) {
      mentionIds.push(replyTarget.authorUserId);
    }

    pendingOwnMessageScrollRef.current = true;
    shouldScrollToBottomOnContentChangeRef.current = true;
    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (businessId && currentUserId) {
      addOptimisticComment(buildOptimisticComment({
        businessId,
        threadId,
        authorUserId: currentUserId,
        body: optimisticBody,
        parentCommentId: replyTarget?.commentId ?? null,
        optimisticId,
      }));
    }
    setComposerText('');
    composerSelectionRef.current = { start: 0, end: 0 };
    setControlledSelection({ start: 0, end: 0 });
    setReplyTarget(null);
    setSelectedMentionIds([]);
    setPendingAttachment(null);
    setPendingIncomingCount(0);

    createCommentMutation.mutate({
      body: optimisticBody,
      parentCommentId: replyTarget?.commentId ?? null,
      mentionUserIds: mentionIds,
      attachment: pendingAttachment,
      optimisticId,
      rawComposerText,
      replyTargetSnapshot: replyTarget,
      selectedMentionIdsSnapshot: mentionIds,
      pendingAttachmentSnapshot: pendingAttachment,
    });
  };

  const handleComposerTextChange = (value: string) => {
    setComposerText(value);
    if (!threadId || isClosed) {
      trackTypingPresence(false, true);
      return;
    }
    if (value.trim().length > 0) {
      trackTypingPresence(true);
    } else {
      trackTypingPresence(false);
    }
  };

  const handleJumpToLatest = () => {
    setPendingIncomingCount(0);
    setBottomState(true);
    shouldScrollToBottomOnContentChangeRef.current = true;
    scrollThreadToBottom(true);
  };

  // On desktop/web: Enter sends, Shift+Enter inserts newline
  const isTouchDevice = Platform.OS === 'web' && typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const handleKeyPress = (e: { nativeEvent: { key: string; shiftKey?: boolean }; preventDefault?: () => void }) => {
    if (Platform.OS !== 'web') return;
    if (isTouchDevice) return; // Mobile web: let Return insert a newline
    if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault?.();
      handleSend();
    }
  };

  const getOrderStatusColor = (status: string) => {
    const s = status.toLowerCase().trim();
    if (['delivered', 'completed', 'fulfilled', 'verified', 'paid', 'confirmed'].some((v) => s.includes(v))) return '#10B981';
    if (['processing', 'in progress', 'in_progress', 'packed'].some((v) => s.includes(v))) return '#3B82F6';
    if (['cancelled', 'canceled', 'refunded', 'failed'].some((v) => s.includes(v))) return '#EF4444';
    if (['pending', 'new', 'draft'].some((v) => s.includes(v))) return '#F59E0B';
    return colors.accent.primary;
  };

  const getOrderStatusLabel = (status: string) => {
    const s = status.toLowerCase().trim();
    if (['verified', 'paid', 'confirmed'].some((v) => s.includes(v))) return 'Payment Confirmed';
    return status
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const canSend = editTarget
    ? (composerText.trim().length > 0 && !updateCommentMutation.isPending)
    : (Boolean(threadId) && (composerText.trim().length > 0 || Boolean(pendingAttachment)));
  const typingStatusLabel = useMemo(() => {
    if (typingUserNames.length === 0) return '';
    if (typingUserNames.length === 1) return `${typingUserNames[0]} is typing`;
    if (typingUserNames.length === 2) return `${typingUserNames[0]} and ${typingUserNames[1]} are typing`;
    return `${typingUserNames[0]} and ${typingUserNames.length - 1} others are typing`;
  }, [typingUserNames]);

  const renderedComments = useMemo(() => {
    if (orderedComments.length === 0 && !commentsQuery.isLoading) {
      return (
        <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>
          No team activity yet. Start the thread.
        </Text>
      );
    }

    if (trimmedCommentSearch && displayedComments.length === 0) {
      return (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Search size={28} color={colors.text.muted} strokeWidth={1.5} />
          <Text style={{ color: colors.text.muted, fontSize: 14, fontWeight: '600', marginTop: 10 }}>
            No results for "{searchQuery.trim()}"
          </Text>
        </View>
      );
    }

    return (
      <View>
        {displayedComments.map((comment, index) => {
      const authorName = authorMap.get(comment.author_user_id) ?? 'Team member';
      const authorRole = roleMap.get(comment.author_user_id);
      const displayName = formatDisplayName(authorName, authorRole);
      const isOwnComment = comment.author_user_id === currentUserId;
      const parentComment = comment.parent_comment_id ? commentsById.get(comment.parent_comment_id) ?? null : null;
      const parentAuthorName = parentComment ? (authorMap.get(parentComment.author_user_id) ?? 'Team member') : null;
      const avatarColor = isOwnComment ? (isDark ? '#FFFFFF' : '#000000') : getAvatarColor(authorName);
      const ownBubbleColor = '#182A66';
      const ownBubblePrimaryTextColor = '#FFFFFF';
      const ownBubbleSecondaryTextColor = 'rgba(255,255,255,0.9)';
      const ownBubbleMutedTextColor = 'rgba(255,255,255,0.74)';
      const ownBubbleSubtleTextColor = 'rgba(255,255,255,0.62)';
      const bubbleNameFontSize = Platform.OS === 'web' ? 16 : 14;
      const bubbleNameLineHeight = Platform.OS === 'web' ? 23 : 20;
      const bubbleMessageFontSize = Platform.OS === 'web' ? 16 : 14;
      const bubbleMessageLineHeight = Platform.OS === 'web' ? 23 : 20;
      const headerNameColor = isOwnComment ? ownBubbleSecondaryTextColor : avatarColor;
      const parentAuthorColor = parentComment
        ? (parentComment.author_user_id === currentUserId
          ? ownBubbleSecondaryTextColor
          : getAvatarColor(parentAuthorName ?? 'Team member'))
        : colors.text.primary;
      const attachments = comment.attachments ?? [];
      const hasOnlyImageAttachments = attachments.length > 0
        && attachments.every((attachment) => isImageAttachment(attachment.file_name, attachment.mime_type));
      const hasMessageBody = comment.body.trim().length > 0;
      const useAttachmentSizedBubble = hasOnlyImageAttachments;
      const attachmentSizedBubbleWidth = Math.min(bubbleMaxWidth, attachmentPreviewWidth + 28);
      const previousComment = index > 0 ? displayedComments[index - 1] : null;
      const nextComment = index < displayedComments.length - 1 ? displayedComments[index + 1] : null;
      const showDayDivider = !previousComment || !isSameCalendarDay(previousComment.created_at, comment.created_at);
      const showAuthorHeader = !previousComment
        || previousComment.author_user_id !== comment.author_user_id
        || !isSameCalendarDay(previousComment.created_at, comment.created_at);
      const showAvatar = !nextComment
        || nextComment.author_user_id !== comment.author_user_id
        || !isSameCalendarDay(nextComment.created_at, comment.created_at);
      const showThreadAvatar = !isOwnComment;
      const showBubbleAuthorHeader = showAuthorHeader && !parentComment && !isOwnComment;
      const isStackedWithPrevious = previousComment?.author_user_id === comment.author_user_id
        && Boolean(previousComment?.created_at)
        && isSameCalendarDay(previousComment.created_at, comment.created_at);
      const rowSpacingTop = isStackedWithPrevious ? 8 : 12;
      const isLatestDisplayedComment = index === displayedComments.length - 1;

      return (
        <View key={comment.id} style={{ marginTop: index === 0 ? 0 : rowSpacingTop }}>
          {showDayDivider && (
            <View style={{ alignItems: 'center', marginVertical: 6 }}>
              <View
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.06)',
                  borderRadius: 10,
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={{
                    color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.52)',
                    fontSize: 10,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  {formatDayDivider(comment.created_at)}
                </Text>
              </View>
            </View>
          )}

          <View
            style={{ flexDirection: isOwnComment ? 'row-reverse' : 'row' }}
            {...(Platform.OS === 'web' ? {
              onMouseEnter: () => setHoveredCommentId(comment.id),
              onMouseLeave: () => setHoveredCommentId(null),
            } : {})}
          >
            {showThreadAvatar ? (
              <View
                style={{
                  width: 32,
                  minHeight: 32,
                  marginRight: isOwnComment ? 0 : 10,
                  marginLeft: isOwnComment ? 10 : 0,
                  flexShrink: 0,
                  justifyContent: 'flex-end',
                  marginBottom: isLatestDisplayedComment ? 18 : 0,
                }}
              >
                {showAvatar ? (
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      backgroundColor: avatarColor,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: isOwnComment && isDark ? '#000000' : '#FFFFFF', fontSize: 12, fontWeight: '800' }}>
                      {getInitials(authorName)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={{ flex: 1, alignItems: isOwnComment ? 'flex-end' : 'flex-start' }}>
              <SwipeableMessage
                isOwnMessage={isOwnComment}
                onSwipeReply={() => {
                  setReplyTarget({ commentId: comment.id, authorUserId: comment.author_user_id, authorName: authorName });
                  composerInputRef.current?.focus();
                }}
              >
                <Pressable
                  onPress={() => handleBubbleTap(comment)}
                  onLongPress={(event) => {
                    actionModalSnapRef.current = comment;
                    setMessageActionTarget(comment);
                    setMessageActionY(event.nativeEvent.pageY);
                    setMessageActionX(event.nativeEvent.pageX);
                  }}
                  delayLongPress={350}
                  style={{
                    borderRadius: 14,
                    borderTopLeftRadius: 5,
                    borderTopRightRadius: 14,
                    paddingLeft: parentComment ? 0 : 14,
                    paddingRight: parentComment ? 0 : (useAttachmentSizedBubble ? 14 : defaultBubbleRightPadding),
                    paddingTop: parentComment ? 0 : 12,
                    paddingBottom: 12,
                    width: useAttachmentSizedBubble ? attachmentSizedBubbleWidth : undefined,
                    maxWidth: bubbleMaxWidth,
                    minWidth: 0,
                    backgroundColor: isOwnComment
                      ? ownBubbleColor
                      : (isDark ? '#3A3A3C' : '#FFFFFF'),
                    borderWidth: isOwnComment ? 0 : (isDark ? 0 : 1),
                    borderColor: isOwnComment ? 'transparent' : colors.border.light,
                    alignSelf: isOwnComment ? 'flex-end' : 'flex-start',
                    overflow: 'hidden',
                  }}
                >
                  {showBubbleAuthorHeader ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: 7,
                        paddingRight: 20,
                        alignSelf: 'flex-start',
                      }}
                    >
                      {pinnedMessages[comment.id] ? (
                        <Pin size={10} color="#F97316" strokeWidth={2.5} style={{ marginRight: 4 }} />
                      ) : null}
                      <Text
                        style={{
                          color: headerNameColor,
                          fontSize: bubbleNameFontSize,
                          lineHeight: bubbleNameLineHeight,
                          fontWeight: '600',
                        }}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>
                    </View>
                  ) : null}

                  {parentComment && (
                    <View
                      style={{
                        marginTop: 10,
                        marginLeft: 10,
                        marginRight: 10,
                        marginBottom: 8,
                        minWidth: 0,
                        width: 'auto',
                        maxWidth: '100%',
                        borderTopLeftRadius: 10,
                        borderTopRightRadius: 10,
                        borderBottomLeftRadius: 10,
                        borderBottomRightRadius: 10,
                        overflow: 'hidden',
                        borderBottomWidth: 1,
                        borderBottomColor: isOwnComment
                          ? 'rgba(0,0,0,0.2)'
                          : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'),
                        backgroundColor: isOwnComment
                          ? 'rgba(0,0,0,0.26)'
                          : (isDark ? '#252527' : '#2B2B2E'),
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'stretch', minWidth: 0 }}>
                        <View
                          style={{
                            flex: 1,
                            minWidth: 0,
                            paddingHorizontal: 10,
                            paddingVertical: 9,
                          }}
                        >
                          <Text
                            style={{
                              color: isOwnComment
                                ? ownBubbleSecondaryTextColor
                                : parentAuthorColor,
                              fontSize: 12,
                              fontWeight: '600',
                              marginBottom: 4,
                            }}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {parentAuthorName}
                          </Text>
                          <Text
                            style={{
                              color: isOwnComment
                                ? ownBubbleMutedTextColor
                                : 'rgba(255,255,255,0.82)',
                              fontSize: 12,
                              lineHeight: 18,
                              flexShrink: 1,
                              ...(Platform.OS === 'web' ? ({ wordBreak: 'break-word' } as any) : null),
                            }}
                            numberOfLines={3}
                            ellipsizeMode="tail"
                          >
                            {parentComment.body.trim() || 'Attachment'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  <View style={{ paddingHorizontal: parentComment ? 14 : 0 }}>
                    {attachments.length > 0 && (
                      <View
                        style={{
                          gap: 6,
                          marginBottom: hasMessageBody ? 8 : 0,
                          width: useAttachmentSizedBubble ? '100%' : undefined,
                        }}
                      >
                        {attachments.map((attachment) => (
                          (() => {
                            const canRenderImage = isImageAttachment(attachment.file_name, attachment.mime_type);
                            const imagePreviewUrl = attachmentPreviewUrls[attachment.id];
                            const isImageLoaded = Boolean(loadedAttachmentImages[attachment.id]);
                            const showImageLoader = !imagePreviewUrl || !isImageLoaded;
                            const imageBoxWidth = useAttachmentSizedBubble
                              ? attachmentSizedBubbleWidth - 28
                              : attachmentPreviewWidth;
                            const imageBoxHeight = Math.floor(imageBoxWidth * (170 / 220));

                            if (canRenderImage) {
                              return (
                                <Pressable
                                  key={attachment.id}
                                  onPress={() => { void handleAttachmentPress(attachment, imagePreviewUrl); }}
                                  style={{
                                    borderRadius: 12,
                                    overflow: 'hidden',
                                    width: imageBoxWidth,
                                    height: imageBoxHeight,
                                    borderWidth: 1,
                                    borderColor: isOwnComment
                                      ? 'rgba(255,255,255,0.16)'
                                      : colors.border.light,
                                    backgroundColor: isOwnComment
                                      ? 'rgba(255,255,255,0.06)'
                                      : colors.bg.secondary,
                                  }}
                                >
                                  <View
                                    style={{
                                      position: 'absolute',
                                      top: 0,
                                      right: 0,
                                      bottom: 0,
                                      left: 0,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      backgroundColor: isOwnComment
                                        ? 'rgba(255,255,255,0.08)'
                                        : colors.bg.secondary,
                                    }}
                                  >
                                    <ImageIcon
                                      size={24}
                                      color={isOwnComment
                                        ? ownBubbleMutedTextColor
                                        : colors.text.tertiary}
                                      strokeWidth={2}
                                    />
                                  </View>
                                  {imagePreviewUrl ? (
                                    <Image
                                      source={{ uri: imagePreviewUrl }}
                                      resizeMode="cover"
                                      fadeDuration={180}
                                      onLoad={() => {
                                        setLoadedAttachmentImages((previous) => {
                                          if (previous[attachment.id]) return previous;
                                          return { ...previous, [attachment.id]: true };
                                        });
                                      }}
                                      onError={() => {
                                        setLoadedAttachmentImages((previous) => ({
                                          ...previous,
                                          [attachment.id]: false,
                                        }));
                                      }}
                                      style={{
                                        width: imageBoxWidth,
                                        height: imageBoxHeight,
                                        opacity: isImageLoaded ? 1 : 0,
                                      }}
                                    />
                                  ) : null}
                                  {showImageLoader ? (
                                    <View
                                      style={{
                                        position: 'absolute',
                                        top: 0,
                                        right: 0,
                                        bottom: 0,
                                        left: 0,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <ActivityIndicator
                                        size="small"
                                        color={isOwnComment ? ownBubblePrimaryTextColor : colors.text.muted}
                                      />
                                    </View>
                                  ) : null}
                                </Pressable>
                              );
                            }

                            return (
                              <Pressable
                                key={attachment.id}
                                onPress={() => { void handleAttachmentPress(attachment); }}
                                style={{
                                  borderWidth: 1,
                                  borderColor: isOwnComment
                                    ? 'rgba(255,255,255,0.16)'
                                    : colors.border.light,
                                  backgroundColor: isOwnComment
                                    ? 'rgba(255,255,255,0.06)'
                                    : colors.bg.secondary,
                                  borderRadius: 10,
                                  paddingHorizontal: 10,
                                  paddingVertical: 7,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 8,
                                }}
                              >
                                <Paperclip size={14} color={isOwnComment ? ownBubblePrimaryTextColor : colors.text.tertiary} strokeWidth={2} />
                                <View style={{ flex: 1 }}>
                                  <Text
                                    numberOfLines={1}
                                    style={{
                                      color: isOwnComment ? ownBubblePrimaryTextColor : colors.text.secondary,
                                      fontSize: 12,
                                      fontWeight: '700',
                                    }}
                                  >
                                    {attachment.file_name}
                                  </Text>
                                  <Text
                                    style={{
                                      color: isOwnComment
                                        ? ownBubbleMutedTextColor
                                        : colors.text.muted,
                                      fontSize: 11,
                                      marginTop: 1,
                                    }}
                                  >
                                    {formatFileSize(attachment.file_size)}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })()
                        ))}
                      </View>
                    )}

                    {(() => {
                      const allSegs = parseMessageSegments(comment.body, orderByNumber);
                      const orderSegs = allSegs.filter(s => s.type === 'order');
                      const inlineSegs = allSegs.filter(s => s.type !== 'order');
                      const hasInlineText = inlineSegs.some(s => s.value.trim().length > 0);
                      const hasEveryonePing = /(?:^|\s)@everyone\b/i.test(comment.body);
                      return (
                        <>
                          {hasEveryonePing && (
                            <View
                              style={{
                                alignSelf: 'flex-start',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                marginBottom: (orderSegs.length > 0 || hasInlineText) ? 8 : 0,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 999,
                                backgroundColor: 'rgba(239,68,68,0.12)',
                                borderWidth: 1,
                                borderColor: 'rgba(239,68,68,0.45)',
                              }}
                            >
                              <Bell size={11} color="#DC2626" strokeWidth={2.2} />
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#DC2626', letterSpacing: 0.1 }}>
                                Team Ping
                              </Text>
                            </View>
                          )}

                          {orderSegs.map((segment, segIndex) => {
                            const rawNum = segment.value.replace('📦', '').replace('#', '').split('—')[0].trim();
                            const normalizedNum = rawNum.replace(/^ORD[-\s]*/i, '');
                            const order = storeOrders.find((o) => {
                              const n = o.orderNumber.replace(/^ORD[-\s]*/i, '');
                              return n === normalizedNum || o.orderNumber === rawNum;
                            });
                            const statusColor = order?.status ? getOrderStatusColor(order.status) : colors.accent.primary;
                            return (
                              <Pressable
                                key={`${comment.id}-order-${segIndex}`}
                                onPress={() => { if (segment.orderId) router.push(`/order/${segment.orderId}`); else if (order) router.push(`/order/${order.id}`); }}
                                style={{
                                  marginBottom: hasInlineText ? 8 : 0,
                                  borderRadius: 12,
                                  backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                                  borderWidth: 1,
                                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                                  padding: 10,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 10,
                                  shadowColor: '#000',
                                  shadowOffset: { width: 0, height: 1 },
                                  shadowOpacity: isDark ? 0.3 : 0.06,
                                  shadowRadius: 4,
                                  elevation: 2,
                                }}
                              >
                                <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: statusColor + '1A', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: statusColor + '30' }}>
                                  <Package size={18} color={statusColor} strokeWidth={2} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: isDark ? '#FFFFFF' : '#0B0B0B', fontSize: 13, fontWeight: '800', letterSpacing: -0.2 }} numberOfLines={1}>
                                    {order ? `ORD-${order.orderNumber.replace(/^ORD[-\s]*/i, '')}` : `ORD-${normalizedNum}`}
                                  </Text>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                    <Text style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)', fontSize: 12 }} numberOfLines={1}>
                                      {order?.customerName ?? 'Unknown'}
                                    </Text>
                                    {order?.status && (
                                      <>
                                        <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: statusColor }} />
                                        <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>
                                          {getOrderStatusLabel(order.status)}
                                        </Text>
                                      </>
                                    )}
                                  </View>
                                </View>
                                <ChevronRight size={14} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)'} strokeWidth={2.5} />
                              </Pressable>
                            );
                          })}

                          {hasInlineText && (
                            <View>
                              <Text
                                style={{
                                  color: isOwnComment ? ownBubblePrimaryTextColor : colors.text.secondary,
                                  fontSize: bubbleMessageFontSize,
                                  lineHeight: bubbleMessageLineHeight,
                                  flexShrink: 1,
                                  ...(Platform.OS === 'web' ? ({ wordBreak: 'break-word' } as any) : null),
                                }}
                              >
                                {inlineSegs.map((segment, segIndex) => {
                                  if (segment.type === 'mention') {
                                    return (
                                      <Text
                                        key={`${comment.id}-seg-${segIndex}`}
                                        style={{
                                          fontWeight: '600',
                                          color: isOwnComment ? ownBubblePrimaryTextColor : colors.text.secondary,
                                          backgroundColor: isOwnComment
                                            ? 'rgba(255,255,255,0.14)'
                                            : (isDark ? 'rgba(59,130,246,0.2)' : '#EFF6FF'),
                                        }}
                                      >
                                        {segment.value}
                                      </Text>
                                    );
                                  }
                                  if (segment.type === 'url') {
                                    return (
                                      <Text
                                        key={`${comment.id}-seg-${segIndex}`}
                                        style={{
                                          color: isOwnComment
                                            ? ownBubbleSecondaryTextColor
                                            : '#3B82F6',
                                          textDecorationLine: 'underline',
                                        }}
                                        onPress={() => { void Linking.openURL(segment.value); }}
                                      >
                                        {segment.value}
                                      </Text>
                                    );
                                  }
                                  return segment.value;
                                })}
                                {comment.edited_at ? (
                                  <Text style={{ fontSize: 11, color: isOwnComment ? ownBubbleSubtleTextColor : colors.text.muted }}>
                                    {' '}(edited)
                                  </Text>
                                ) : null}
                              </Text>
                            </View>
                          )}
                        </>
                      );
                    })()}

                    <Text
                      style={{
                        width: '100%',
                        textAlign: 'right',
                        color: isOwnComment
                          ? ownBubbleSubtleTextColor
                          : colors.text.muted,
                        fontSize: 9,
                        fontWeight: '700',
                        marginTop: 5,
                        lineHeight: 11,
                      }}
                    >
                      {formatMessageTime(comment.created_at)}
                    </Text>
                  </View>

                  {(Platform.OS !== 'web' || hoveredCommentId === comment.id) && (
                    <Pressable
                      onPress={(event) => { actionModalSnapRef.current = comment; setMessageActionTarget(comment); setMessageActionY(event.nativeEvent.pageY); setMessageActionX(event.nativeEvent.pageX); }}
                      hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                      style={{ position: 'absolute', top: 6, right: 10 }}
                    >
                      <ChevronDown
                        size={16}
                        strokeWidth={2.5}
                        color={isOwnComment
                          ? ownBubbleMutedTextColor
                          : (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)')}
                      />
                    </Pressable>
                  )}
                </Pressable>
              </SwipeableMessage>

              {(likeCounts[comment.id] ?? 0) > 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: 2,
                    alignSelf: isOwnComment ? 'flex-end' : 'flex-start',
                    gap: 3,
                    backgroundColor: isDark ? '#2A2A2A' : '#F3F4F6',
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    borderRadius: 99,
                  }}
                >
                  <Text style={{ fontSize: 12 }}>👍</Text>
                  {(likeCounts[comment.id] ?? 0) > 1 && (
                    <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '600' }}>
                      {likeCounts[comment.id]}
                    </Text>
                  )}
                </View>
              )}

              {isLatestDisplayedComment ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, alignSelf: isOwnComment ? 'flex-end' : 'flex-start' }}>
                  <Pressable onPress={() => beginReply(comment)}>
                    <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700' }}>Reply</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      );
        })}
      </View>
    );
  }, [
    orderedComments.length,
    commentsQuery.isLoading,
    trimmedCommentSearch,
    searchQuery,
    displayedComments,
    authorMap,
    roleMap,
    currentUserId,
    commentsById,
    isDark,
    bubbleMaxWidth,
    attachmentPreviewWidth,
    defaultBubbleRightPadding,
    replyPreviewMaxWidth,
    attachmentPreviewUrls,
    loadedAttachmentImages,
    colors,
    pinnedMessages,
    likeCounts,
    hoveredCommentId,
    orderByNumber,
    storeOrders,
    router,
  ]);

  if (!businessId) {
    return (
      <Text style={{ color: colors.text.muted, fontSize: 13 }}>
        Team stream unavailable: no business selected.
      </Text>
    );
  }

  if (isOfflineMode) {
    return (
      <Text style={{ color: colors.text.muted, fontSize: 13 }}>
        Team stream is disabled while offline.
      </Text>
    );
  }

  const systemEventLabel = entityType === 'order'
    ? 'ORDER THREAD STARTED'
    : entityType === 'task'
      ? 'TASK THREAD STARTED'
      : (isTeamThreadEntityId(entityId) ? 'NEW TEAM THREAD STARTED' : 'CASE THREAD STARTED');

  return (
    <View
      style={{
        flex: isPaneVariant ? 1 : undefined,
        backgroundColor: colors.bg.secondary,
        borderRadius: isPaneVariant ? 0 : 20,
        borderWidth: isPaneVariant ? 0 : 1,
        borderColor: isPaneVariant ? 'transparent' : colors.border.light,
        overflow: 'hidden',
      }}
    >
      {showHeader && (
        <View
          style={{
            backgroundColor: colors.bg.card,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border.light,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Pressable onPress={() => setShowThreadInfo(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '800' }}>Team Threads</Text>
            {onlineCount >= 1 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E', marginRight: 4 }} />
                <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '600' }}>
                  {onlineCount} online
                </Text>
              </View>
            )}
            {unreadCount > 0 && (
              <View
                style={{
                  backgroundColor: '#DC2626',
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 6,
                  marginLeft: 8,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              if (showSearchBar) {
                handleSearchClose();
              } else {
                setShowSearchBar(true);
                setTimeout(() => searchInputRef.current?.focus(), 100);
              }
            }}
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}
          >
            <Search size={16} color={showSearchBar ? colors.accent.primary : colors.text.muted} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            onPress={() => setShowThreadInfo(true)}
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
          >
            <Info size={16} color={colors.text.muted} strokeWidth={2} />
          </Pressable>
        </View>
      )}

      <View style={isPaneVariant ? { flex: 1, position: 'relative' } : { maxHeight: 420, position: 'relative' }}>
        {showThreadWallpaper && Platform.OS === 'web' && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              opacity: wallpaperPatternOpacity,
              ...( {
                backgroundImage: `url(${wallpaperWebUri})`,
                backgroundRepeat: 'repeat',
                backgroundSize: '560px auto',
                backgroundPosition: 'top left',
              } as any ),
            }}
          />
        )}

        {showThreadWallpaper && Platform.OS !== 'web' && (
          <ImageBackground
            source={wallpaperSource}
            resizeMode="repeat"
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            imageStyle={{ opacity: wallpaperPatternOpacity }}
          />
        )}

        {showThreadWallpaper && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: wallpaperOverlay,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* ── Pinned message banner ── */}
        {(() => {
          const pinnedCommentIds = Object.keys(pinnedMessages).filter((id) => pinnedMessages[id]);
          if (pinnedCommentIds.length === 0) return null;
          // Show the most recently pinned message
          const latestPinnedComment = [...comments].reverse().find((c) => pinnedMessages[c.id]);
          if (!latestPinnedComment) return null;
          const pinAuthor = authorMap.get(latestPinnedComment.author_user_id) ?? 'Team member';
          return (
            <Pressable
              onPress={() => setShowPinnedMessages(true)}
              style={{
                backgroundColor: isDark ? 'rgba(249,115,22,0.12)' : 'rgba(249,115,22,0.08)',
                paddingHorizontal: 14,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                borderBottomWidth: 0.5,
                borderBottomColor: isDark ? 'rgba(249,115,22,0.25)' : 'rgba(249,115,22,0.2)',
                zIndex: 10,
              }}
            >
              <Pin size={14} color="#F97316" strokeWidth={2.5} style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#F97316', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}>
                  Pinned{pinnedCommentIds.length > 1 ? ` · ${pinnedCommentIds.length} messages` : ''}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.text.primary, fontSize: 12 }}>
                  <Text style={{ fontWeight: '700' }}>{pinAuthor}: </Text>
                  {latestPinnedComment.body}
                </Text>
              </View>
              <ChevronRight size={14} color="#F97316" strokeWidth={2} />
            </Pressable>
          );
        })()}

        {/* ── Search bar ── */}
        {showSearchBar && (
          <View
            style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              paddingHorizontal: 12,
              paddingVertical: 8,
              flexDirection: 'row',
              alignItems: 'center',
              borderBottomWidth: 0.5,
              borderBottomColor: colors.border.light,
              zIndex: 10,
            }}
          >
            <Search size={14} color={colors.text.muted} strokeWidth={2} style={{ marginRight: 8 }} />
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search messages..."
              placeholderTextColor={colors.text.muted}
              style={{
                flex: 1,
                color: colors.text.primary,
                fontSize: 14,
                paddingVertical: Platform.OS === 'web' ? 6 : 4,
              }}
              autoFocus
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <X size={14} color={colors.text.muted} strokeWidth={2.5} />
              </Pressable>
            )}
            <Pressable
              onPress={handleSearchClose}
              style={{ marginLeft: 8, paddingVertical: 4, paddingHorizontal: 6 }}
            >
              <Text style={{ color: colors.accent.primary, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* Transparent overlay to dismiss attachment popup on outside tap */}
        {showAttachmentMenu && (
          <Pressable
            style={{ position: 'absolute', inset: 0, zIndex: 9 } as any}
            onPress={() => setShowAttachmentMenu(false)}
          />
        )}

        <ScrollView
          ref={threadScrollRef}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1, opacity: isScrollReady ? 1 : 0 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 18 }}
          scrollEventThrottle={16}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
            setBottomState(distanceFromBottom <= 24);
          }}
          onContentSizeChange={() => {
            const shouldStickToBottom = shouldScrollToBottomOnContentChangeRef.current || isAtBottomRef.current;
            if (!shouldStickToBottom) return;
            shouldScrollToBottomOnContentChangeRef.current = false;
            scrollThreadToBottom(false, () => {
              setIsScrollReady(true);
            });
          }}
        >
        <View style={{ alignItems: 'center' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.08)',
            }}
          >
            <CheckCircle2 size={13} color="#111111" strokeWidth={2} />
            <Text
              style={{
                marginLeft: 6,
                color: '#111111',
                fontSize: 10,
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: 1.1,
              }}
            >
              {systemEventLabel}
            </Text>
          </View>
        </View>

        {threadQuery.isLoading || commentsQuery.isLoading ? (
          <Text style={{ color: colors.text.muted, fontSize: 13 }}>Loading activity...</Text>
        ) : null}

        {renderedComments}
        </ScrollView>
      </View>

      <View
        style={{
          paddingTop: 12,
          paddingHorizontal: 12,
          paddingBottom: (Platform.OS === 'web' ? 18 : 16) + (isPaneVariant ? insets.bottom : 0),
          backgroundColor: colors.bg.card,
          borderTopWidth: 1,
          borderTopColor: colors.border.light,
        }}
      >
        {isClosed && (
          <View
            style={{
              marginBottom: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(239,68,68,0.25)' : '#FECACA',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Text style={{ fontSize: 14 }}>🔒</Text>
              <Text style={{ color: isDark ? '#FCA5A5' : '#DC2626', fontSize: 13, fontWeight: '700' }}>
                Thread closed
              </Text>
              <Text style={{ color: isDark ? 'rgba(252,165,165,0.7)' : '#EF4444', fontSize: 12 }}>
                · No new messages
              </Text>
            </View>
            {isAdmin && threadId && (
              <Pressable
                onPress={() => closeThreadMutation.mutate(false)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 7,
                  backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : '#FEE2E2',
                }}
              >
                <Text style={{ color: isDark ? '#FCA5A5' : '#DC2626', fontSize: 12, fontWeight: '700' }}>Reopen</Text>
              </Pressable>
            )}
          </View>
        )}

        {editTarget && (
          <View
            style={{
              marginBottom: 8,
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : '#EFF6FF',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
              <Pencil size={12} color={colors.status.blue} strokeWidth={2} />
              <Text style={{ color: colors.status.blue, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                Editing: {editTarget.body}
              </Text>
            </View>
            <Pressable onPress={() => { setEditTarget(null); setComposerText(''); setComposerError(''); }}>
              <X size={14} color={colors.text.muted} strokeWidth={2} />
            </Pressable>
          </View>
        )}

        {replyTarget && (
          <View
            style={{
              marginBottom: 8,
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: colors.bg.secondary,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
              Replying to {replyTarget.authorName}
            </Text>
            <Pressable onPress={() => setReplyTarget(null)}>
              <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {pendingAttachment && (
          <View
            style={{
              marginBottom: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: colors.bg.secondary,
              paddingHorizontal: 10,
              paddingVertical: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {isImageAttachment(pendingAttachment.name, pendingAttachment.mimeType) ? (
              <Image
                source={{ uri: pendingAttachment.uri }}
                resizeMode="cover"
                style={{ width: 50, height: 50, borderRadius: 8 }}
              />
            ) : (
              <Paperclip size={14} color={colors.text.tertiary} strokeWidth={2} />
            )}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '700' }}>
                {pendingAttachment.name}
              </Text>
              <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 1 }}>
                {typeof pendingAttachment.size === 'number' ? formatFileSize(pendingAttachment.size) : 'Attachment ready'}
              </Text>
            </View>
            <Pressable onPress={() => setPendingAttachment(null)} style={{ padding: 2 }}>
              <X size={14} color={colors.text.muted} strokeWidth={2} />
            </Pressable>
          </View>
        )}

        {pendingIncomingCount > 0 && !isAtBottom && (
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <Pressable
              onPress={handleJumpToLatest}
              style={{
                borderRadius: 999,
                backgroundColor: colors.status.blue,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>
                {pendingIncomingCount === 1 ? '1 new message' : `${pendingIncomingCount} new messages`} - Jump to latest
              </Text>
            </Pressable>
          </View>
        )}

        {typingStatusLabel ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '600' }}>
              {typingStatusLabel}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8 }}>
              {[0, 1, 2].map((index) => (
                <View
                  key={`typing-dot-${index}`}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: colors.text.muted,
                    opacity: index < typingDotCount ? 0.95 : 0.3,
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Input row — position:relative so the attachment popup can float above it */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, position: 'relative' }}>
          {showMentionPicker && !showAttachmentMenu && (
            <View
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 44,
                right: 44,
                marginBottom: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.card,
                overflow: 'hidden',
                zIndex: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isDark ? 0.35 : 0.12,
                shadowRadius: 10,
                elevation: 8,
              }}
            >
              <ScrollView style={{ maxHeight: 170 }} keyboardShouldPersistTaps="handled">
                {filteredMentionMembers.map((member, index) => (
                  <Pressable
                    key={member.id}
                    onPress={() => insertMention(member.id, member.name, member.isEveryone)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      borderBottomWidth: index === filteredMentionMembers.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border.light,
                    }}
                  >
                    <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '700' }}>
                      @{member.name}
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 1 }}>
                      {member.helperText ?? member.role}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Floating attachment popup — absolutely positioned above the + button */}
          {showAttachmentMenu && (
            <View
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                marginBottom: 8,
                zIndex: 10,
              }}
            >
              <View
                style={{
                  backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
                  borderRadius: 14,
                  overflow: 'hidden',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isDark ? 0.45 : 0.14,
                  shadowRadius: 12,
                  elevation: 10,
                  minWidth: 220,
                }}
              >
                <Pressable
                  onPress={() => { setShowAttachmentMenu(false); void handlePickAttachment('image'); }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 11 }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }}>
                    <ImageIcon size={15} color="#FFFFFF" strokeWidth={2} />
                  </View>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>Photos & Videos</Text>
                </Pressable>
                <View style={{ height: 0.5, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }} />
                <Pressable
                  onPress={() => { setShowAttachmentMenu(false); void handlePickAttachment('document'); }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 11 }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={15} color="#FFFFFF" strokeWidth={2} />
                  </View>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>Document</Text>
                </Pressable>
                <View style={{ height: 0.5, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }} />
                <Pressable
                  onPress={() => { setShowAttachmentMenu(false); setOrderSearch(''); setShowOrderPicker(true); }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 11 }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}>
                    <Package size={13} color="#FFFFFF" strokeWidth={2.2} />
                  </View>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>Order</Text>
                </Pressable>
                {mentionableMembers.length > 0 && !isClosed ? (
                  <>
                    <View style={{ height: 0.5, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }} />
                    <Pressable
                      onPress={() => {
                        setShowAttachmentMenu(false);
                        handlePingEveryonePress();
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 11 }}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }}>
                        <Bell size={14} color="#FFFFFF" strokeWidth={2.2} />
                      </View>
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>Ping Everyone</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          )}

          <Pressable
            onPress={() => setShowAttachmentMenu((v) => !v)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: showAttachmentMenu
                ? colors.accent.primary
                : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)'),
            }}
          >
            <Plus size={17} color={showAttachmentMenu ? (isDark ? '#000' : '#fff') : colors.text.secondary} strokeWidth={2.5} />
          </Pressable>

          <View style={{ flex: 1, position: 'relative' }}>
            <View
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.secondary,
                paddingLeft: 14,
                paddingRight: 40,
                paddingTop: 9,
                paddingBottom: 13,
              }}
            >
              <TextInput
                ref={composerInputRef}
                placeholder={
                  editTarget
                    ? 'Edit message...'
                    : replyTarget
                      ? `Reply to ${replyTarget.authorName}...`
                      : 'Write a note or @mention...'
                }
                placeholderTextColor={colors.text.muted}
                value={composerText}
                selection={controlledSelection}
                onChangeText={handleComposerTextChange}
                onSelectionChange={(event) => {
                  composerSelectionRef.current = event.nativeEvent.selection;
                  if (controlledSelection !== undefined) setControlledSelection(undefined);
                }}
                onFocus={() => {
                  if (!isClosed && composerText.trim().length > 0) {
                    trackTypingPresence(true, true);
                  }
                }}
                onBlur={() => {
                  trackTypingPresence(false, true);
                }}
                onKeyPress={handleKeyPress as any}
                onContentSizeChange={(e) => {
                  const h = e.nativeEvent.contentSize.height;
                  setComposerInputHeight(Math.max(24, Math.min(h, 120)));
                }}
                editable={!isClosed}
                multiline
                returnKeyType="default"
                blurOnSubmit={false}
                style={{
                  color: colors.text.secondary,
                  fontSize: 16,
                  lineHeight: 24,
                  fontWeight: 'normal',
                  height: Platform.OS === 'ios' ? composerInputHeight : undefined,
                  maxHeight: 120,
                }}
              />
            </View>

            {mentionableMembers.length > 0 && (
              <Pressable
                onPress={handleMentionButtonPress}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: 0,
                  bottom: 0,
                  width: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AtSign size={16} color={showMentionPicker ? colors.status.blue : colors.text.muted} strokeWidth={2} />
              </Pressable>
            )}
          </View>

          <Pressable
            onPressIn={() => {
              if (Platform.OS !== 'web') {
                void Haptics.selectionAsync().catch(() => {});
              }
            }}
            onPress={handleSend}
            disabled={!canSend}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: canSend ? colors.accent.primary : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'),
              opacity: canSend ? 1 : 0.6,
            }}
          >
            <Send size={15} color={canSend ? (isDark ? '#000000' : '#FFFFFF') : colors.text.muted} strokeWidth={2.25} />
          </Pressable>
        </View>

        {composerError ? (
          <Text style={{ color: colors.accent.danger, fontSize: 12, marginTop: 6 }}>
            {composerError}
          </Text>
        ) : null}
      </View>

      <Modal
        visible={Boolean(messageActionTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setMessageActionTarget(null)}
      >
        {(() => {
          // Use snapshot so content doesn't flicker to wrong state during fade-out
          const snap = actionModalSnapRef.current;
          const { height: screenHeight, width: screenWidth } = Dimensions.get('window');
          const isOwnActionTarget = snap?.author_user_id === currentUserId;
          const showBelow = messageActionY < screenHeight * 0.58;
          const MENU_W = 186;
          const menuLeft = Math.max(8, Math.min(
            isOwnActionTarget ? messageActionX - MENU_W + 10 : messageActionX - 10,
            screenWidth - MENU_W - 8,
          ));
          const divider = <View style={{ height: 0.5, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', marginHorizontal: 0 }} />;
          const itemStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 16, paddingVertical: 11, gap: 11 };
          const textStyle = { color: colors.text.primary, fontSize: 14, fontWeight: '500' as const };
          return (
            <Pressable
              onPress={() => setMessageActionTarget(null)}
              style={{ flex: 1 }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: showBelow ? messageActionY + 8 : undefined,
                  bottom: showBelow ? undefined : screenHeight - messageActionY + 8,
                  left: menuLeft,
                  width: MENU_W,
                  backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
                  borderRadius: 13,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: isDark ? 0.5 : 0.14,
                  shadowRadius: 18,
                  elevation: 14,
                  overflow: 'hidden',
                }}
              >
                <Pressable onPress={() => {}}>
                  {/* Reply */}
                  <Pressable
                    onPress={() => {
                      if (!snap) return;
                      setReplyTarget({
                        commentId: snap.id,
                        authorUserId: snap.author_user_id,
                        authorName: authorMap.get(snap.author_user_id) ?? 'Team member',
                      });
                      setMessageActionTarget(null);
                      requestAnimationFrame(() => composerInputRef.current?.focus());
                    }}
                    style={itemStyle}
                  >
                    <CornerUpLeft size={17} color={colors.text.primary} strokeWidth={2} />
                    <Text style={textStyle}>Reply</Text>
                  </Pressable>
                  {divider}

                  {/* React */}
                  <Pressable
                    onPress={() => {
                      if (!snap) return;
                      handleDoubleTap(snap.id);
                      setMessageActionTarget(null);
                    }}
                    style={itemStyle}
                  >
                    <ThumbsUp
                      size={17}
                      color={snap && likes[snap.id] ? '#3B82F6' : colors.text.primary}
                      fill={snap && likes[snap.id] ? '#3B82F6' : 'none'}
                      strokeWidth={2}
                    />
                    <Text style={textStyle}>
                      {snap && likes[snap.id] ? 'Unlike' : 'React'}
                    </Text>
                  </Pressable>
                  {divider}

                  {/* Copy */}
                  <Pressable
                    onPress={async () => {
                      if (!snap) return;
                      await Clipboard.setStringAsync(snap.body);
                      setMessageActionTarget(null);
                    }}
                    style={itemStyle}
                  >
                    <Copy size={17} color={colors.text.primary} strokeWidth={2} />
                    <Text style={textStyle}>Copy</Text>
                  </Pressable>

                  {/* Edit — own messages only */}
                  {isOwnActionTarget && (
                    <>
                      {divider}
                      <Pressable
                        onPress={() => {
                          if (!snap) return;
                          setEditTarget(snap);
                          setComposerText(snap.body);
                          setControlledSelection({ start: snap.body.length, end: snap.body.length });
                          setMessageActionTarget(null);
                          requestAnimationFrame(() => composerInputRef.current?.focus());
                        }}
                        style={itemStyle}
                      >
                        <Pencil size={17} color={colors.text.primary} strokeWidth={2} />
                        <Text style={textStyle}>Edit</Text>
                      </Pressable>
                    </>
                  )}
                  {divider}

                  {/* Pin */}
                  <Pressable
                    onPress={() => {
                      if (!snap) return;
                      pinMessageMutation.mutate({ commentId: snap.id, isPinned: Boolean(pinnedMessages[snap.id]) });
                      setMessageActionTarget(null);
                    }}
                    style={itemStyle}
                  >
                    <Pin
                      size={17}
                      color={snap && pinnedMessages[snap.id] ? '#3B82F6' : colors.text.primary}
                      strokeWidth={2}
                    />
                    <Text style={textStyle}>
                      {snap && pinnedMessages[snap.id] ? 'Unpin' : 'Pin'}
                    </Text>
                  </Pressable>
                  {divider}

                  {/* Save */}
                  <Pressable
                    onPress={() => {
                      if (!snap) return;
                      saveMessageMutation.mutate({ commentId: snap.id, isSaved: Boolean(starredMessages[snap.id]) });
                      setMessageActionTarget(null);
                    }}
                    style={itemStyle}
                  >
                    <Bookmark
                      size={17}
                      color={snap && starredMessages[snap.id] ? '#3B82F6' : colors.text.primary}
                      fill={snap && starredMessages[snap.id] ? '#3B82F6' : 'none'}
                      strokeWidth={2}
                    />
                    <Text style={textStyle}>
                      {snap && starredMessages[snap.id] ? 'Unsave' : 'Save'}
                    </Text>
                  </Pressable>

                  {/* Delete — own messages or admin */}
                  {(isOwnActionTarget || isAdmin) && (
                    <>
                      <View style={{ height: 0.5, backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)', marginTop: 4 }} />
                      <Pressable
                        onPress={() => {
                          if (!snap) return;
                          deleteCommentMutation.mutate(snap.id);
                        }}
                        style={[itemStyle, { paddingTop: 11 }]}
                      >
                        <Trash2 size={17} color={colors.accent.danger} strokeWidth={2} />
                        <Text style={{ ...textStyle, color: colors.accent.danger }}>Delete</Text>
                      </Pressable>
                    </>
                  )}
                </Pressable>
              </View>
            </Pressable>
          );
        })()}
      </Modal>

      {/* Long-press now uses the same action menu as the chevron button */}

      <Modal
        visible={Boolean(activeImagePreview)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveImagePreview(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.94)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Pressable
            onPress={() => setActiveImagePreview(null)}
            style={{
              position: 'absolute',
              top: 18,
              right: 18,
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.14)',
              zIndex: 2,
            }}
          >
            <X size={18} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>

          {activeImagePreview ? (
            <Image
              source={{ uri: activeImagePreview.uri }}
              resizeMode="contain"
              style={{ width: '100%', height: '100%' }}
            />
          ) : null}

          {activeImagePreview?.fileName ? (
            <Text
              numberOfLines={1}
              style={{
                position: 'absolute',
                left: 16,
                right: 16,
                bottom: 20,
                color: '#FFFFFF',
                fontSize: 12,
                textAlign: 'center',
                fontWeight: '600',
                opacity: 0.82,
              }}
            >
              {activeImagePreview.fileName}
            </Text>
          ) : null}
        </View>
      </Modal>

      {/* ── Order Picker Modal ── */}
      <Modal
        visible={showOrderPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOrderPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowOrderPicker(false)} />
          <View style={{ backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border.light }}>
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700', flex: 1 }}>Attach Order</Text>
              <Pressable onPress={() => setShowOrderPicker(false)}>
                <X size={18} color={colors.text.muted} strokeWidth={2} />
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
              <View style={{ backgroundColor: isDark ? '#2C2C2E' : '#F3F4F6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 14 }}>🔍</Text>
                <TextInput
                  value={orderSearch}
                  onChangeText={setOrderSearch}
                  placeholder="Search by order # or customer..."
                  placeholderTextColor={colors.text.muted}
                  style={{ flex: 1, color: colors.text.primary, fontSize: 14 }}
                />
              </View>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ paddingHorizontal: 14 }}>
              {storeOrders
                .filter((o) => {
                  if (!orderSearch.trim()) return true;
                  const q = orderSearch.toLowerCase();
                  return o.orderNumber?.toLowerCase().includes(q) || o.customerName?.toLowerCase().includes(q);
                })
                .slice(0, 30)
                .map((order) => (
                  <Pressable
                    key={order.id}
                    onPress={() => {
                      setShowOrderPicker(false);
                      setComposerText((prev) => {
                        const tag = `📦 #${order.orderNumber} — ${order.customerName}`;
                        return prev.trim() ? `${prev.trim()} ${tag}` : tag;
                      });
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 12,
                      borderBottomWidth: 0.5,
                      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                      gap: 12,
                    }}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: isDark ? '#2C2C2E' : '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={18} color={colors.accent.primary} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>#{order.orderNumber}</Text>
                      <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{order.customerName}</Text>
                    </View>
                    <ChevronRight size={14} color={colors.text.muted} strokeWidth={2} />
                  </Pressable>
                ))}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Thread Info Panel (side panel on web, full modal on mobile) ── */}
      {Platform.OS === 'web' && !isNarrowWebViewport && showThreadInfo && (
        <Pressable
          onPress={handleInfoModalClose}
          style={{ position: 'fixed', inset: 0, zIndex: 50 } as any}
        />
      )}
      <Modal
        visible={showThreadInfo && useFullscreenThreadInfo}
        transparent={false}
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={handleInfoModalClose}
      >
        {(() => {
          const threadName = getTeamThreadDisplayNameFromEntityId(entityId);
          const allMediaEntries = imageAttachmentsForPreview
            .map((attachment) => {
              const uri = attachmentPreviewUrls[attachment.id];
              if (!uri) return null;
              return { id: attachment.id, fileName: attachment.file_name, uri };
            })
            .filter((entry): entry is { id: string; fileName: string; uri: string } => Boolean(entry));
          const pinnedCount = comments.filter((comment) => pinnedMessages[comment.id]).length;
          const savedCount = comments.filter((comment) => starredMessages[comment.id]).length;
          const memberCount = mentionableMembers.length + 1; // +1 for current user
          return (
            <View style={{ flex: 1, width: '100%', alignSelf: 'stretch', backgroundColor: isDark ? '#000000' : '#F2F2F7' }}>
              {/* Backdrop to dismiss info menu */}
              {showInfoMenu && (
                <Pressable
                  style={{ position: 'absolute', inset: 0, zIndex: 98 } as any}
                  onPress={() => setShowInfoMenu(false)}
                />
              )}
              {/* Floating info kebab menu */}
              {showInfoMenu && (
                <View
                  style={{
                    position: 'absolute',
                    top: (insets.top > 0 ? insets.top : 20) + 56,
                    right: 14,
                    width: 210,
                    backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
                    borderRadius: 13,
                    overflow: 'hidden',
                    zIndex: 99,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: isDark ? 0.45 : 0.16,
                    shadowRadius: 14,
                    elevation: 12,
                  } as any}
                >
                  <Pressable
                    onPress={() => setShowInfoMenu(false)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 13, gap: 12, borderBottomWidth: 0.5, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}
                  >
                    <Pencil size={17} color={colors.text.primary} strokeWidth={2} />
                    <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '500' }}>Edit Thread</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowInfoMenu(false)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 13, gap: 12 }}
                  >
                    <Trash2 size={17} color="#EF4444" strokeWidth={2} />
                    <Text style={{ color: '#EF4444', fontSize: 15, fontWeight: '500' }}>Delete Thread</Text>
                  </Pressable>
                </View>
              )}
              <ThreadInfoTopBar
                onClose={handleInfoModalClose}
                onToggleMenu={() => setShowInfoMenu((value) => !value)}
                safeTopInset={insets.top > 0 ? insets.top : 20}
              />

              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              >
                <ThreadInfoIdentityHeader
                  threadName={threadName}
                  memberCount={memberCount}
                  onlineCount={onlineCount}
                />

                <ThreadInfoMediaSection
                  items={allMediaEntries}
                  onPressItem={(item) => setActiveImagePreview({ uri: item.uri, fileName: item.fileName })}
                />

                <ThreadInfoSettingsSection
                  pinnedCount={pinnedCount}
                  savedCount={savedCount}
                  isMuted={isMuted}
                  isAdmin={isAdmin}
                  hasThreadId={Boolean(threadId)}
                  isClosed={isClosed}
                  isCloseThreadPending={closeThreadMutation.isPending}
                  onOpenPinned={() => setShowPinnedMessages(true)}
                  onOpenSaved={() => setShowSavedMessages(true)}
                  onToggleMuted={() => setIsMuted((value) => !value)}
                  onToggleClosed={() => closeThreadMutation.mutate(!isClosed)}
                />

                {/* Members */}
                <ThreadInfoMembersSection
                  currentUser={currentUser}
                  mentionableMembers={mentionableMembers}
                  memberCount={memberCount}
                />
              </ScrollView>
            </View>
          );
        })()}
      </Modal>

      {/* Web side panel version of Thread Info */}
      {Platform.OS === 'web' && !isNarrowWebViewport && showThreadInfo && (() => {
        const threadName = getTeamThreadDisplayNameFromEntityId(entityId);
        const allMediaEntries = imageAttachmentsForPreview
          .map((attachment) => {
            const uri = attachmentPreviewUrls[attachment.id];
            if (!uri) return null;
            return { id: attachment.id, fileName: attachment.file_name, uri };
          })
          .filter((entry): entry is { id: string; fileName: string; uri: string } => Boolean(entry));
        const pinnedCount = comments.filter((comment) => pinnedMessages[comment.id]).length;
        const savedCount = comments.filter((comment) => starredMessages[comment.id]).length;
        const memberCount = mentionableMembers.length + 1;
        return (
          <View
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 420,
              backgroundColor: isDark ? '#111111' : '#F2F2F7',
              borderLeftWidth: 1,
              borderLeftColor: colors.border.light,
              zIndex: 51,
            } as any}
          >
            <ThreadInfoTopBar
              compact
              onClose={handleInfoModalClose}
              onToggleMenu={() => setShowInfoMenu((value) => !value)}
            />
            {/* Web info kebab dropdown */}
            {showInfoMenu && (
              <Pressable
                style={{ position: 'absolute', inset: 0, zIndex: 98 } as any}
                onPress={() => setShowInfoMenu(false)}
              />
            )}
            {showInfoMenu && (
              <View
                style={{
                  position: 'absolute',
                  top: 56,
                  right: 10,
                  width: 200,
                  backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
                  borderRadius: 12,
                  overflow: 'hidden',
                  zIndex: 99,
                  ...(Platform.OS === 'web'
                    ? { boxShadow: '0 6px 20px rgba(0,0,0,0.18)' }
                    : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 10 }),
                } as any}
              >
                <Pressable
                  onPress={() => setShowInfoMenu(false)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderBottomWidth: 0.5, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}
                >
                  <Pencil size={16} color={colors.text.primary} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>Edit Thread</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowInfoMenu(false)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}
                >
                  <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                  <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '500' }}>Delete Thread</Text>
                </Pressable>
              </View>
            )}
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 12 }}
            >
              <ThreadInfoIdentityHeader
                threadName={threadName}
                memberCount={memberCount}
                onlineCount={onlineCount}
                compact
              />
              <ThreadInfoMediaSection
                items={allMediaEntries}
                compact
                onPressItem={(item) => setActiveImagePreview({ uri: item.uri, fileName: item.fileName })}
              />
              <ThreadInfoSettingsSection
                pinnedCount={pinnedCount}
                savedCount={savedCount}
                isMuted={isMuted}
                isAdmin={isAdmin}
                hasThreadId={Boolean(threadId)}
                isClosed={isClosed}
                isCloseThreadPending={closeThreadMutation.isPending}
                onOpenPinned={() => setShowPinnedMessages(true)}
                onOpenSaved={() => setShowSavedMessages(true)}
                onToggleMuted={() => setIsMuted((value) => !value)}
                onToggleClosed={() => closeThreadMutation.mutate(!isClosed)}
                compact
              />
              {/* Members */}
              <ThreadInfoMembersSection
                currentUser={currentUser}
                mentionableMembers={mentionableMembers}
                memberCount={memberCount}
                compact
              />
            </ScrollView>
          </View>
        );
      })()}

      {/* ── Saved Messages Panel ── */}
      <Modal
        visible={showSavedMessages}
        transparent={Platform.OS === 'web'}
        animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
        presentationStyle={Platform.OS === 'web' ? undefined : 'fullScreen'}
        onRequestClose={() => setShowSavedMessages(false)}
      >
        {Platform.OS === 'web' ? (
          <>
            {/* Backdrop */}
            <Pressable
              onPress={() => setShowSavedMessages(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 60 } as any}
            />
            {/* Side panel */}
            <View
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: 420,
                backgroundColor: isDark ? '#111111' : '#F2F2F7',
                borderLeftWidth: 1,
                borderLeftColor: colors.border.light,
                zIndex: 61,
              } as any}
            >
              <View style={{ backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', paddingTop: 16, paddingBottom: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
                <Pressable onPress={() => setShowSavedMessages(false)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <X size={16} color={colors.text.primary} strokeWidth={2.5} />
                </Pressable>
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700', flex: 1 }}>Saved Messages</Text>
                <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '600' }}>
                  {comments.filter((c) => starredMessages[c.id]).length}
                </Text>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8 }}>
                {(() => {
                  const saved = comments.filter((c) => starredMessages[c.id]);
                  if (saved.length === 0) {
                    return (
                      <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
                        <Bookmark size={36} color={colors.text.muted} strokeWidth={1.5} />
                        <Text style={{ color: colors.text.muted, fontSize: 14, fontWeight: '600', marginTop: 14, textAlign: 'center' }}>
                          No saved messages yet
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                          Long-press a message and tap Save to bookmark it here.
                        </Text>
                      </View>
                    );
                  }
                  return saved.map((c) => {
                    const name = authorMap.get(c.author_user_id) ?? 'Team member';
                    const role = roleMap.get(c.author_user_id);
                    return (
                      <View
                        key={c.id}
                        style={{
                          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                          marginHorizontal: 10,
                          marginVertical: 4,
                          borderRadius: 12,
                          padding: 12,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: getAvatarColor(name), alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>{getInitials(name)}</Text>
                          </View>
                          <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '700', flex: 1 }}>
                            {formatDisplayName(name, role)}
                          </Text>
                          <Text style={{ color: colors.text.muted, fontSize: 10 }}>
                            {formatRelativeTime(c.created_at)}
                          </Text>
                        </View>
                        <Text style={{ color: colors.text.primary, fontSize: 13, lineHeight: 18 }}>
                          {c.body}
                        </Text>
                        <Pressable
                          onPress={() => saveMessageMutation.mutate({ commentId: c.id, isSaved: true })}
                          style={{ alignSelf: 'flex-end', marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        >
                          <Bookmark size={13} color="#3B82F6" fill="#3B82F6" strokeWidth={2} />
                          <Text style={{ color: '#3B82F6', fontSize: 11, fontWeight: '600' }}>Unsave</Text>
                        </Pressable>
                      </View>
                    );
                  });
                })()}
              </ScrollView>
            </View>
          </>
        ) : (
          <View style={{ flex: 1, backgroundColor: isDark ? '#000000' : '#F2F2F7' }}>
            <View
              style={{
                backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                paddingTop: (insets.top > 0 ? insets.top : 20) + 8,
                paddingBottom: 14,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                borderBottomWidth: 1,
                borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              }}
            >
              <Pressable
                onPress={() => setShowSavedMessages(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <X size={18} color={colors.text.primary} strokeWidth={2.5} />
              </Pressable>
              <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: '700', flex: 1 }}>
                Saved Messages
              </Text>
              <Text style={{ color: colors.text.muted, fontSize: 13, fontWeight: '600' }}>
                {comments.filter((c) => starredMessages[c.id]).length}
              </Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10, paddingBottom: insets.bottom + 24 }}>
              {(() => {
                const saved = comments.filter((c) => starredMessages[c.id]);
                if (saved.length === 0) {
                  return (
                    <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 28 }}>
                      <Bookmark size={42} color={colors.text.muted} strokeWidth={1.5} />
                      <Text style={{ color: colors.text.muted, fontSize: 16, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
                        No saved messages yet
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 19 }}>
                        Long-press a message and tap Save to bookmark it here.
                      </Text>
                    </View>
                  );
                }
                return saved.map((c) => {
                  const name = authorMap.get(c.author_user_id) ?? 'Team member';
                  const role = roleMap.get(c.author_user_id);
                  return (
                    <View
                      key={c.id}
                      style={{
                        backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                        marginHorizontal: 16,
                        marginVertical: 5,
                        borderRadius: 14,
                        padding: 14,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: getAvatarColor(name), alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>{getInitials(name)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
                            {formatDisplayName(name, role)}
                          </Text>
                          <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 1 }}>
                            {formatRelativeTime(c.created_at)}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 20 }}>
                        {c.body}
                      </Text>
                      <Pressable
                        onPress={() => saveMessageMutation.mutate({ commentId: c.id, isSaved: true })}
                        style={{ alignSelf: 'flex-end', marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}
                      >
                        <Bookmark size={14} color="#3B82F6" fill="#3B82F6" strokeWidth={2} />
                        <Text style={{ color: '#3B82F6', fontSize: 12, fontWeight: '600' }}>Unsave</Text>
                      </Pressable>
                    </View>
                  );
                });
              })()}
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* ── Pinned Messages Panel ── */}
      <Modal
        visible={showPinnedMessages}
        transparent={Platform.OS === 'web'}
        animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
        presentationStyle={Platform.OS === 'web' ? undefined : 'fullScreen'}
        onRequestClose={() => setShowPinnedMessages(false)}
      >
        {Platform.OS === 'web' ? (
          <>
            <Pressable
              onPress={() => setShowPinnedMessages(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 60 } as any}
            />
            <View
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: 420,
                backgroundColor: isDark ? '#111111' : '#F2F2F7',
                borderLeftWidth: 1,
                borderLeftColor: colors.border.light,
                zIndex: 61,
              } as any}
            >
              <View style={{ backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', paddingTop: 16, paddingBottom: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
                <Pressable onPress={() => setShowPinnedMessages(false)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <X size={16} color={colors.text.primary} strokeWidth={2.5} />
                </Pressable>
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700', flex: 1 }}>Pinned Messages</Text>
                <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '600' }}>
                  {comments.filter((c) => pinnedMessages[c.id]).length}
                </Text>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8 }}>
                {(() => {
                  const pinned = comments.filter((c) => pinnedMessages[c.id]);
                  if (pinned.length === 0) {
                    return (
                      <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
                        <Pin size={36} color={colors.text.muted} strokeWidth={1.5} />
                        <Text style={{ color: colors.text.muted, fontSize: 14, fontWeight: '600', marginTop: 14, textAlign: 'center' }}>
                          No pinned messages yet
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                          Long-press a message and tap Pin to pin it for everyone.
                        </Text>
                      </View>
                    );
                  }
                  return pinned.map((c) => {
                    const name = authorMap.get(c.author_user_id) ?? 'Team member';
                    const role = roleMap.get(c.author_user_id);
                    return (
                      <View
                        key={c.id}
                        style={{
                          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                          marginHorizontal: 10,
                          marginVertical: 4,
                          borderRadius: 12,
                          padding: 12,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: getAvatarColor(name), alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>{getInitials(name)}</Text>
                          </View>
                          <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '700', flex: 1 }}>
                            {formatDisplayName(name, role)}
                          </Text>
                          <Text style={{ color: colors.text.muted, fontSize: 10 }}>
                            {formatRelativeTime(c.created_at)}
                          </Text>
                        </View>
                        <Text style={{ color: colors.text.primary, fontSize: 13, lineHeight: 18 }}>
                          {c.body}
                        </Text>
                        <Pressable
                          onPress={() => pinMessageMutation.mutate({ commentId: c.id, isPinned: true })}
                          style={{ alignSelf: 'flex-end', marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        >
                          <Pin size={13} color="#F97316" strokeWidth={2} />
                          <Text style={{ color: '#F97316', fontSize: 11, fontWeight: '600' }}>Unpin</Text>
                        </Pressable>
                      </View>
                    );
                  });
                })()}
              </ScrollView>
            </View>
          </>
        ) : (
          <View style={{ flex: 1, backgroundColor: isDark ? '#000000' : '#F2F2F7' }}>
            <View
              style={{
                backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                paddingTop: (insets.top > 0 ? insets.top : 20) + 8,
                paddingBottom: 14,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                borderBottomWidth: 1,
                borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              }}
            >
              <Pressable
                onPress={() => setShowPinnedMessages(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <X size={18} color={colors.text.primary} strokeWidth={2.5} />
              </Pressable>
              <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: '700', flex: 1 }}>
                Pinned Messages
              </Text>
              <Text style={{ color: colors.text.muted, fontSize: 13, fontWeight: '600' }}>
                {comments.filter((c) => pinnedMessages[c.id]).length}
              </Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10, paddingBottom: insets.bottom + 24 }}>
              {(() => {
                const pinned = comments.filter((c) => pinnedMessages[c.id]);
                if (pinned.length === 0) {
                  return (
                    <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 28 }}>
                      <Pin size={42} color={colors.text.muted} strokeWidth={1.5} />
                      <Text style={{ color: colors.text.muted, fontSize: 16, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
                        No pinned messages yet
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 19 }}>
                        Long-press a message and tap Pin to pin it for everyone.
                      </Text>
                    </View>
                  );
                }
                return pinned.map((c) => {
                  const name = authorMap.get(c.author_user_id) ?? 'Team member';
                  const role = roleMap.get(c.author_user_id);
                  return (
                    <View
                      key={c.id}
                      style={{
                        backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                        marginHorizontal: 16,
                        marginVertical: 5,
                        borderRadius: 14,
                        padding: 14,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: getAvatarColor(name), alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>{getInitials(name)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
                            {formatDisplayName(name, role)}
                          </Text>
                          <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 1 }}>
                            {formatRelativeTime(c.created_at)}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 20 }}>
                        {c.body}
                      </Text>
                      <Pressable
                        onPress={() => pinMessageMutation.mutate({ commentId: c.id, isPinned: true })}
                        style={{ alignSelf: 'flex-end', marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}
                      >
                        <Pin size={14} color="#F97316" strokeWidth={2} />
                        <Text style={{ color: '#F97316', fontSize: 12, fontWeight: '600' }}>Unpin</Text>
                      </Pressable>
                    </View>
                  );
                });
              })()}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}
