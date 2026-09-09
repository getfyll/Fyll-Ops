import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Image, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  FileText,
  User as UserIcon,
  Package,
  Tag,
  MessageSquare,
  Check,
  DollarSign,
  ChevronLeft,
  ChevronDown,
  Edit2,
  Trash2,
  ExternalLink,
  Clock,
  Flag,
  RefreshCcw,
  Undo2,
  Zap,
  ShieldCheck,
  HelpCircle,
  Mail,
  Phone,
  Globe,
  Store,
  Plus,
  History,
  ArrowLeft,
  Send,
  MoreVertical,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import useFyllStore, {
  Case,
  CaseType,
  CaseSource,
  CaseTimelineEntry,
  CASE_STATUS_COLORS,
  CASE_PRIORITY_COLORS,
  formatCurrency,
} from '@/lib/state/fyll-store';
import useAuthStore, { type TeamMember } from '@/lib/state/auth-store';
import { CaseForm } from './CaseForm';
import { collaborationData } from '@/lib/supabase/collaboration';
import { supabase } from '@/lib/supabase';
import { inferRefundRequestType } from '@/lib/refund-requests';
import { sendThreadNotification } from '@/hooks/useWebPushNotifications';

// Get icon for case type
const getCaseTypeIcon = (type: CaseType, color: string, size: number = 20) => {
  const props = { size, color, strokeWidth: 1.5 };
  switch (type) {
    case 'Repair': return <RefreshCcw {...props} />;
    case 'Replacement': return <Undo2 {...props} />;
    case 'Refund': return <DollarSign {...props} />;
    case 'Partial Refund': return <Zap {...props} />;
    case 'Return': return <RefreshCcw {...props} />;
    case 'Goodwill': return <ShieldCheck {...props} />;
    default: return <HelpCircle {...props} />;
  }
};

// Get icon for case source
const getCaseSourceIcon = (source: CaseSource | undefined, color: string, size: number = 16) => {
  const props = { size, color, strokeWidth: 1.5 };
  switch (source) {
    case 'Email': return <Mail {...props} />;
    case 'Phone': return <Phone {...props} />;
    case 'Chat': return <MessageSquare {...props} />;
    case 'Web': return <Globe {...props} />;
    case 'In-Store': return <Store {...props} />;
    default: return <HelpCircle {...props} />;
  }
};

interface CaseDetailPanelProps {
  caseId: string;
  onClose?: () => void;
  onNavigateToOrder?: (orderId: string) => void;
  showBackButton?: boolean;
}

function CaseCommentAvatar({ member, size = 28 }: { member?: TeamMember; size?: number }) {
  const name = member?.name?.trim() ?? 'T';
  const initial = name.charAt(0).toUpperCase();
  const palette = ['#111827', '#2563EB', '#0F766E', '#9333EA', '#C2410C'];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash + name.charCodeAt(i) * (i + 1)) % 10000;
  }
  const bg = palette[hash % palette.length];

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: size <= 24 ? 10 : 11, fontWeight: '700' }}>{initial}</Text>
    </View>
  );
}

const normalizeMentionToken = (value: string) =>
  value.trim().toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_.-]/g, '');

const mentionHandleFromMember = (member: TeamMember) => {
  const normalized = member.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized || member.id.toLowerCase();
};

const buildMentionAliasMap = (teamMembers: TeamMember[]) => {
  const aliasMap = new Map<string, string>();
  teamMembers.forEach((member) => {
    const userId = member.id;
    const aliases = new Set<string>();

    aliases.add(normalizeMentionToken(member.id));
    aliases.add(normalizeMentionToken(member.name.replace(/\s+/g, '')));
    aliases.add(normalizeMentionToken(member.name.split(' ')[0] ?? ''));
    aliases.add(normalizeMentionToken(mentionHandleFromMember(member)));
    aliases.add(normalizeMentionToken(member.email.split('@')[0] ?? ''));

    aliases.forEach((alias) => {
      if (alias && !aliasMap.has(alias)) aliasMap.set(alias, userId);
    });
  });

  return aliasMap;
};

const getCommentTextSegments = (
  body: string,
  mentionAliasMap: Map<string, string>,
) => {
  const segments: Array<{ text: string; isMention: boolean }> = [];
  const mentionRegex = /@([A-Za-z0-9_.-]+)/g;
  let cursor = 0;

  for (const match of body.matchAll(mentionRegex)) {
    const matchText = match[0];
    const mentionToken = normalizeMentionToken(match[1] ?? '');
    const matchIndex = match.index ?? 0;
    if (matchIndex > cursor) {
      segments.push({ text: body.slice(cursor, matchIndex), isMention: false });
    }

    segments.push({
      text: matchText,
      isMention: mentionToken === 'everyone' || mentionAliasMap.has(mentionToken),
    });
    cursor = matchIndex + matchText.length;
  }

  if (cursor < body.length) {
    segments.push({ text: body.slice(cursor), isMention: false });
  }

  return segments.length > 0 ? segments : [{ text: body, isMention: false }];
};

const parseAssignedNames = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

function CaseCommentsSection({
  caseItem,
  businessId,
  isOfflineMode,
  currentUserName,
  teamMembers,
}: {
  caseItem: Case;
  businessId: string | null;
  isOfflineMode: boolean;
  currentUserName: string;
  teamMembers: TeamMember[];
}) {
  const colors = useThemeColors();
  const { isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.currentUser);
  const currentUserId = currentUser?.id ?? '';
  const [commentText, setCommentText] = useState('');
  const [replyTarget, setReplyTarget] = useState<{ commentId: string; authorName: string } | null>(null);
  const lastTapTimeRef = useRef<Record<string, number>>({});
  const commentBodyFontSize = isDesktop ? 13 : 14;
  const commentBodyLineHeight = isDesktop ? 20 : 22;
  const commentsListMaxHeight = isWebDesktop ? 340 : 300;
  const commentsSectionSurface = isWebDesktop
    ? colors.bg.card
    : (colors.bg.secondary || '#F3F4F6');
  const commentsSectionHorizontalPadding = isWebDesktop ? 0 : 18;
  const commentsSectionContentPadding = isWebDesktop ? 0 : 2;
  const mentionBg = isWebDesktop ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.10)';
  const mentionText = '#1D4ED8';
  const commentDividerColor = colors.border.light.startsWith('#')
    ? `${colors.border.light}${isWebDesktop ? '7A' : '5E'}`
    : colors.border.light;
  const teamMap = useMemo(() => new Map(teamMembers.map((member) => [member.id, member])), [teamMembers]);
  const mentionAliasMap = useMemo(() => buildMentionAliasMap(teamMembers), [teamMembers]);
  const activeMentionQuery = useMemo(() => {
    const match = commentText.match(/(^|\s)@([A-Za-z0-9_.-]*)$/);
    return match ? match[2].toLowerCase() : null;
  }, [commentText]);

  const filteredMentionMembers = useMemo(() => {
    if (activeMentionQuery === null) return [];
    return teamMembers
      .filter((member) => {
        const handle = mentionHandleFromMember(member);
        return (
          member.name.toLowerCase().includes(activeMentionQuery)
          || member.email.toLowerCase().includes(activeMentionQuery)
          || member.id.toLowerCase().includes(activeMentionQuery)
          || handle.includes(activeMentionQuery)
        );
      })
      .slice(0, 5);
  }, [activeMentionQuery, teamMembers]);

  const threadQuery = useQuery({
    queryKey: ['collaboration-thread', businessId, 'case', caseItem.id],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.getOrCreateThread(businessId as string, 'case', caseItem.id),
    retry: 0,
  });

  const threadId = threadQuery.data?.id ?? null;

  const commentsQuery = useQuery({
    queryKey: ['case-comments', businessId, threadId],
    enabled: Boolean(businessId) && Boolean(threadId) && !isOfflineMode,
    queryFn: () => collaborationData.listThreadComments(businessId as string, threadId as string),
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 20_000,
  });

  const commentIds = useMemo(
    () => (commentsQuery.data ?? []).map((comment) => comment.id),
    [commentsQuery.data]
  );

  const reactionsQuery = useQuery({
    queryKey: ['case-comment-reactions', businessId, threadId, commentIds],
    enabled: Boolean(businessId) && Boolean(threadId) && commentIds.length > 0 && !isOfflineMode,
    queryFn: () => collaborationData.listCommentReactions(businessId as string, commentIds),
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 20_000,
  });

  useEffect(() => {
    if (!businessId || !threadId || isOfflineMode) return;

    const channel: RealtimeChannel = supabase
      .channel(`case-comments-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'collaboration_comments',
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['case-comments', businessId, threadId] });
          void queryClient.invalidateQueries({ queryKey: ['collaboration-thread-counts', businessId, 'case'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'collaboration_comment_reactions',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['case-comment-reactions', businessId, threadId] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, isOfflineMode, queryClient, threadId]);

  useEffect(() => {
    if (!businessId || !threadId || isOfflineMode) return;
    void collaborationData.markThreadAsSeen(businessId, threadId);
  }, [businessId, isOfflineMode, threadId]);

  const reactionState = useMemo(() => {
    const counts: Record<string, number> = {};
    const mine: Record<string, boolean> = {};
    (reactionsQuery.data ?? []).forEach((row) => {
      if (row.reaction !== 'thumbs_up') return;
      counts[row.comment_id] = (counts[row.comment_id] ?? 0) + 1;
      if (row.user_id === currentUserId) {
        mine[row.comment_id] = true;
      }
    });
    return { counts, mine };
  }, [currentUserId, reactionsQuery.data]);

  const handleBubbleTap = (commentId: string, liked: boolean) => {
    const now = Date.now();
    const lastTap = lastTapTimeRef.current[commentId] ?? 0;
    if (now - lastTap < 300) {
      lastTapTimeRef.current[commentId] = 0;
      if (!businessId) return;
      reactionMutation.mutate({ commentId, liked });
    } else {
      lastTapTimeRef.current[commentId] = now;
    }
  };

  const postMutation = useMutation({
    mutationFn: async () => {
      const trimmed = commentText.trim();
      if (!trimmed) return;
      if (!businessId || !threadId) {
        throw new Error('Missing comment thread context.');
      }

      const mentionIds = Array.from(new Set(
        (trimmed.match(/@([A-Za-z0-9_.-]+)/g) ?? [])
          .map((token) => normalizeMentionToken(token))
          .map((token) => mentionAliasMap.get(token))
          .filter((id): id is string => Boolean(id))
      ));

      await collaborationData.createComment({
        businessId,
        threadId,
        body: trimmed,
        mentionUserIds: mentionIds,
        parentCommentId: replyTarget?.commentId ?? null,
      });
    },
    onSuccess: async () => {
      setCommentText('');
      setReplyTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['case-comments', businessId, threadId] }),
        queryClient.invalidateQueries({ queryKey: ['collaboration-thread-counts', businessId, 'case'] }),
      ]);
      if (businessId && threadId) {
        void collaborationData.markThreadAsSeen(businessId, threadId);
      }
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
  });

  const reactionMutation = useMutation({
    mutationFn: async ({ commentId, liked }: { commentId: string; liked: boolean }) => {
      if (!businessId) return;
      if (liked) {
        await collaborationData.removeCommentReaction(businessId, commentId);
      } else {
        await collaborationData.addCommentReaction(businessId, commentId);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['case-comment-reactions', businessId, threadId] });
    },
  });

  const comments = commentsQuery.data ?? [];

  return (
    <View
      style={{
        marginTop: 16,
        backgroundColor: commentsSectionSurface,
        borderWidth: isWebDesktop ? 1 : 0,
        borderColor: colors.border.light,
        borderTopWidth: isWebDesktop ? 1 : 0.5,
        borderTopColor: colors.border.light,
        borderRadius: isWebDesktop ? 12 : 0,
      }}
    >
      <View
        style={{
          paddingHorizontal: isWebDesktop ? 16 : commentsSectionHorizontalPadding,
          paddingTop: isWebDesktop ? 16 : 12,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
        }}
      >
        <View className="flex-row items-center gap-2">
          <MessageSquare size={16} color={colors.text.tertiary} strokeWidth={2} />
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider">
            Comments
          </Text>
          <Text style={{ color: colors.text.muted }} className="text-xs ml-auto">
            {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          </Text>
        </View>
      </View>

      {isOfflineMode ? (
        <Text
          style={{
            color: colors.text.muted,
            fontSize: 14,
            paddingHorizontal: isWebDesktop ? 16 : commentsSectionHorizontalPadding,
            paddingBottom: 16,
          }}
        >
          Comments are unavailable while offline.
        </Text>
      ) : (
        <>
          <ScrollView
            style={{ maxHeight: commentsListMaxHeight }}
            contentContainerStyle={{
              gap: 3,
              paddingRight: 4,
              paddingTop: isWebDesktop ? 12 : 14,
              paddingBottom: 8,
              paddingHorizontal: isWebDesktop ? 0 : commentsSectionContentPadding,
            }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={comments.length > 4}
          >
            {threadQuery.isPending || commentsQuery.isPending ? (
              <Text style={{ color: colors.text.muted }} className="text-sm text-center py-4">
                Loading comments...
              </Text>
            ) : null}

            {threadQuery.isError || commentsQuery.isError ? (
              <Text style={{ color: '#B91C1C' }} className="text-sm text-center py-2">
                Could not load case comments right now.
              </Text>
            ) : null}

            {!threadQuery.isPending && !commentsQuery.isPending && comments.length === 0 ? (
              <View className="py-5">
                <Text style={{ color: colors.text.secondary }} className="text-sm font-semibold text-center">
                  No follow-ups yet
                </Text>
                <Text style={{ color: colors.text.muted }} className="text-xs text-center mt-1">
                  Leave a note or tag a team member with @name.
                </Text>
              </View>
            ) : null}

            {comments.map((comment, index) => {
              const author = teamMap.get(comment.author_user_id);
              const isMine = comment.author_user_id === currentUserId;
              const likeCount = reactionState.counts[comment.id] ?? 0;
              const liked = Boolean(reactionState.mine[comment.id]);
              const showDivider = index < comments.length - 1;
              const commentSegments = getCommentTextSegments(comment.body, mentionAliasMap);
              return (
                <View
                  key={comment.id}
                  style={{
                    width: '100%',
                    paddingTop: index === 0 ? 6 : 8,
                    paddingHorizontal: isWebDesktop ? 16 : commentsSectionHorizontalPadding,
                    paddingBottom: showDivider ? 14 : 0,
                    marginBottom: showDivider ? 2 : 0,
                    borderBottomWidth: showDivider ? 1 : 0,
                    borderBottomColor: commentDividerColor,
                  }}
                >
                  <View
                    className="flex-row gap-2"
                    style={{
                      alignItems: 'flex-start',
                      width: '100%',
                    }}
                  >
                    <CaseCommentAvatar member={author} />
                    <View style={{ minWidth: 0, flex: 1 }}>
                      <View className="flex-row items-center gap-2 mb-1 pr-2">
                        <Text style={{ color: colors.text.secondary }} className="text-[11px] font-semibold">
                          {author?.name ?? currentUserName ?? 'Team member'}
                        </Text>
                        <Text style={{ color: colors.text.muted }} className="text-[10px]">
                          {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        {isMine ? (
                          <Text style={{ color: colors.text.muted }} className="text-[10px] font-semibold">
                            You
                          </Text>
                        ) : null}
                      </View>
                      <View className="flex-row items-start gap-2">
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Pressable
                            onPress={() => handleBubbleTap(comment.id, liked)}
                            className="py-1 active:opacity-90"
                            style={{
                              maxWidth: '100%',
                              marginTop: 4,
                            }}
                          >
                            <Text
                              style={{
                                color: colors.text.primary,
                                fontSize: commentBodyFontSize,
                                lineHeight: commentBodyLineHeight,
                              }}
                            >
                              {commentSegments.map((segment, segmentIndex) => (
                                <Text
                                  key={`${comment.id}-segment-${segmentIndex}`}
                                  style={segment.isMention ? {
                                    color: mentionText,
                                    backgroundColor: mentionBg,
                                    fontWeight: '600',
                                  } : undefined}
                                >
                                  {segment.text}
                                </Text>
                              ))}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setReplyTarget({ commentId: comment.id, authorName: author?.name?.split(' ')[0] ?? 'Member' })}
                            className="mt-2 px-1 active:opacity-70"
                          >
                            <Text style={{ color: colors.text.muted }} className="text-[11px] font-bold">Reply</Text>
                          </Pressable>
                        </View>

                        <Pressable
                          onPress={() => {
                            if (!businessId) return;
                            reactionMutation.mutate({ commentId: comment.id, liked });
                          }}
                          className="items-center active:opacity-80"
                          style={{
                            minWidth: 34,
                            paddingTop: 2,
                          }}
                        >
                          <View
                            style={{
                              minWidth: 30,
                              height: 30,
                              borderRadius: 15,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: liked || likeCount > 0 ? 'rgba(245, 158, 11, 0.16)' : colors.bg.secondary,
                              borderWidth: 1,
                              borderColor: liked || likeCount > 0 ? 'rgba(245, 158, 11, 0.32)' : colors.border.light,
                            }}
                          >
                            <Text style={{ fontSize: 14, opacity: liked || likeCount > 0 ? 1 : 0.7 }}>👍</Text>
                          </View>
                          {likeCount > 0 ? (
                            <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '700', marginTop: 4 }}>
                              {likeCount}
                            </Text>
                          ) : null}
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View
            className="mt-4 pt-4"
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border.light,
              paddingHorizontal: isWebDesktop ? 16 : commentsSectionHorizontalPadding,
              paddingBottom: isWebDesktop ? 16 : 26,
            }}
          >
            {activeMentionQuery !== null ? (
              <View
                className="mb-2 rounded-xl overflow-hidden"
                style={{
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  backgroundColor: colors.bg.secondary,
                }}
              >
                {filteredMentionMembers.length === 0 ? (
                  <View className="px-3 py-2">
                    <Text style={{ color: colors.text.muted }} className="text-xs">
                      No team member match.
                    </Text>
                  </View>
                ) : (
                  filteredMentionMembers.map((member) => {
                    const handle = mentionHandleFromMember(member);
                    return (
                      <Pressable
                        key={`mention-match-${member.id}`}
                        onPress={() => {
                          setCommentText((current) =>
                            current.replace(/(^|\s)@([A-Za-z0-9_.-]*)$/, (_full, prefix) => `${prefix}@${handle} `)
                          );
                        }}
                        className="px-3 py-2 flex-row items-center gap-2 active:opacity-80"
                      >
                        <CaseCommentAvatar member={member} size={20} />
                        <Text style={{ color: colors.text.primary }} className="text-xs font-semibold">
                          @{handle}
                        </Text>
                        <Text style={{ color: colors.text.muted }} className="text-xs" numberOfLines={1}>
                          {member.name}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : null}

            {replyTarget && (
              <View className="flex-row items-center justify-between mt-3 px-1" style={{ gap: 8 }}>
                <Text style={{ color: colors.text.muted }} className="text-xs flex-1" numberOfLines={1}>
                  Replying to {replyTarget.authorName}
                </Text>
                <Pressable onPress={() => setReplyTarget(null)}>
                  <Text style={{ color: colors.text.muted }} className="text-xs font-semibold">Cancel</Text>
                </Pressable>
              </View>
            )}
            <View className="flex-row items-center gap-2 mt-3">
              <View
                className="flex-1 rounded-full px-4 flex-row items-center"
                style={{
                  backgroundColor: colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  minHeight: 44,
                }}
              >
                <TextInput
                  placeholder={replyTarget ? `Reply to ${replyTarget.authorName}...` : 'Add case follow-up'}
                  placeholderTextColor={colors.text.muted}
                  value={commentText}
                  onChangeText={setCommentText}
                  className="flex-1 text-sm"
                  style={{
                    color: colors.text.primary,
                    height: 42,
                    lineHeight: 18,
                    paddingVertical: 0,
                    textAlignVertical: 'center',
                  }}
                  returnKeyType="send"
                  onSubmitEditing={() => {
                    if (!postMutation.isPending && commentText.trim()) {
                      postMutation.mutate();
                    }
                  }}
                />
              </View>
              <Pressable
                onPress={() => postMutation.mutate()}
                disabled={postMutation.isPending || !commentText.trim()}
                className="w-10 h-10 rounded-full items-center justify-center active:opacity-80"
                style={{
                  backgroundColor: postMutation.isPending || !commentText.trim()
                    ? colors.bg.secondary
                    : '#111111',
                }}
              >
                <Send size={16} color={postMutation.isPending || !commentText.trim() ? colors.text.muted : '#FFFFFF'} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

export function CaseDetailPanel({
  caseId,
  onClose,
  onNavigateToOrder,
  showBackButton = false,
}: CaseDetailPanelProps) {
  const colors = useThemeColors();
  const isDark = colors.bg.primary === '#111111';
  const router = useRouter();
  const { isDesktop, width: viewportWidth } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const isMobileHeaderContext = Boolean(showBackButton && !isWebDesktop);
  const webMaxWidth = 1456;
  const isIpadWidth = isWebDesktop && viewportWidth >= 1024 && viewportWidth <= 1366;
  const rightRailWidth = isWebDesktop
    ? Math.max(
      isIpadWidth ? 280 : 320,
      Math.round(Math.min(webMaxWidth, viewportWidth - 56) * (isIpadWidth ? 0.22 : 0.25))
    )
    : 420;
  const businessId = useAuthStore((s) => s.businessId);
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);
  const currentUser = useAuthStore((s) => s.currentUser);
  const teamMembers = useAuthStore((s) => s.teamMembers);
  const userName = currentUser?.name || 'Unknown';
  const collaborationBusinessId = businessId ?? currentUser?.businessId ?? null;

  const cases = useFyllStore((s) => s.cases);
  const orders = useFyllStore((s) => s.orders);
  const refundRequests = useFyllStore((s) => s.refundRequests);
  const returns = useFyllStore((s) => s.returns);
  const updateCase = useFyllStore((s) => s.updateCase);
  const deleteCase = useFyllStore((s) => s.deleteCase);
  const addRefundRequest = useFyllStore((s) => s.addRefundRequest);
  const caseStatuses = useFyllStore((s) => s.caseStatuses);
  const statusColorMap = caseStatuses.reduce<Record<string, string>>((map, option) => {
    map[option.name] = option.color;
    return map;
  }, {});
  Object.entries(CASE_STATUS_COLORS).forEach(([name, color]) => {
    if (!statusColorMap[name]) {
      statusColorMap[name] = color;
    }
  });
  const sortedCaseStatuses = Array.from(
    caseStatuses.reduce<Map<string, typeof caseStatuses[number]>>((map, option) => {
      const key = option.name.trim().toLowerCase();
      if (!key) return map;
      const existing = map.get(key);
      if (!existing || (option.order ?? 0) < (existing.order ?? 0)) {
        map.set(key, option);
      }
      return map;
    }, new Map()).values()
  )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));

  const caseItem = useMemo(
    () => cases.find((c) => c.id === caseId),
    [cases, caseId]
  );

  const linkedOrderThreadQuery = useQuery({
    queryKey: ['collaboration-thread-existing', collaborationBusinessId, 'order', caseItem?.orderId],
    enabled: Boolean(collaborationBusinessId) && Boolean(caseItem?.orderId) && !isOfflineMode,
    queryFn: () => collaborationData.getThreadByEntity(collaborationBusinessId as string, 'order', caseItem?.orderId as string),
  });

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCaseActionsModal, setShowCaseActionsModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [showResolutionTypeMenu, setShowResolutionTypeMenu] = useState(false);
  const [resolutionType, setResolutionType] = useState('No Action Required');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionValue, setResolutionValue] = useState('');
  const [showRefundRequestModal, setShowRefundRequestModal] = useState(false);
  const [refundRequestAmount, setRefundRequestAmount] = useState('');
  const [refundRequestReason, setRefundRequestReason] = useState('');
  const [refundRequestNote, setRefundRequestNote] = useState('');
  const [refundRequestError, setRefundRequestError] = useState('');
  const [isSubmittingRefundRequest, setIsSubmittingRefundRequest] = useState(false);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const resolutionTypes = useFyllStore((s) => s.resolutionTypes);
  const resolutionTypeOptions = resolutionTypes.map((rt) => rt.name);

  useEffect(() => {
    if (!isMobileHeaderContext && showCaseActionsModal) {
      setShowCaseActionsModal(false);
    }
  }, [isMobileHeaderContext, showCaseActionsModal]);

  const assignedNames = useMemo(
    () => parseAssignedNames(caseItem?.assignedTo),
    [caseItem?.assignedTo]
  );

  const assignedNameSet = useMemo(
    () => new Set(assignedNames.map((name) => name.toLowerCase())),
    [assignedNames]
  );

  const assignableMembers = useMemo(
    () => teamMembers.filter((member) => !assignedNameSet.has(member.name.toLowerCase())),
    [assignedNameSet, teamMembers]
  );

  const filteredAssignableMembers = useMemo(() => {
    const query = assigneeQuery.trim().toLowerCase();
    if (!query) return [];
    return assignableMembers.filter((member) =>
      member.name.toLowerCase().includes(query)
      || member.email.toLowerCase().includes(query)
    );
  }, [assigneeQuery, assignableMembers]);

  if (!caseItem) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg.primary }}>
        <FileText size={48} color={colors.text.muted} strokeWidth={1} />
        <Text style={{ color: colors.text.muted }} className="mt-4 text-lg">
          Case not found
        </Text>
      </View>
    );
  }

  const statusColor = statusColorMap[caseItem.status] ?? colors.text.muted;
  const formattedCreatedDate = new Date(caseItem.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const formattedResolvedDate = caseItem.resolution?.resolvedAt
    ? new Date(caseItem.resolution.resolvedAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    : null;
  const currentUserId = currentUser?.id ?? '';
  const currentUserRole = currentUser?.role ?? null;
  // Cases allow staff to submit refund requests; Orders/Finance keep stricter checks.
  const canCreateRefundRequest = currentUserRole === 'admin'
    || currentUserRole === 'manager'
    || currentUserRole === 'staff';
  const refundRequestReviewerLabel = currentUserRole === 'staff' ? 'manager review' : 'admin review';
  const linkedOrder = caseItem.orderId
    ? (orders.find((order) => order.id === caseItem.orderId) ?? null)
    : null;
  const linkedReturn = caseItem.returnId
    ? (returns.find((item) => item.id === caseItem.returnId) ?? null)
    : returns.find((item) => item.caseId === caseItem.id) ?? null;
  const isRefundCaseType = caseItem.type.toLowerCase().includes('refund');
  const isRefundResolutionType = (caseItem.resolution?.type ?? '').toLowerCase().includes('refund');
  const needsRefundWorkflow = isRefundCaseType || isRefundResolutionType;
  const refundedAmountForOrder = linkedOrder?.refund?.amount ?? 0;
  const remainingRefundableAmount = linkedOrder
    ? Math.max(0, linkedOrder.totalAmount - refundedAmountForOrder)
    : 0;
  const openRefundRequestsForOrder = caseItem.orderId
    ? refundRequests.filter((request) => (
      request.orderId === caseItem.orderId
      && (request.status === 'draft' || request.status === 'submitted' || request.status === 'approved')
    ))
    : [];
  const pendingRefundRequestCountForOrder = openRefundRequestsForOrder.length;
  const latestOpenRefundRequestForOrder = openRefundRequestsForOrder
    .slice()
    .sort((left, right) => {
      const leftAt = new Date(left.updatedAt ?? left.createdAt).getTime();
      const rightAt = new Date(right.updatedAt ?? right.createdAt).getTime();
      return rightAt - leftAt;
    })[0] ?? null;
  const hasOpenRefundRequestForOrder = Boolean(latestOpenRefundRequestForOrder);
  const refundRequestActionLabel = latestOpenRefundRequestForOrder?.status === 'submitted'
    ? 'Refund Request Submitted'
    : latestOpenRefundRequestForOrder?.status === 'approved'
      ? 'Refund Request Approved'
      : latestOpenRefundRequestForOrder?.status === 'draft'
        ? 'Refund Request Draft Saved'
        : 'Create Refund Request';
  const refundActionBlockMessage = hasOpenRefundRequestForOrder
    ? 'A refund request already exists for this order. Track it in Finance > Refunds.'
    : remainingRefundableAmount <= 0
      ? 'This order has no refundable balance left.'
      : '';
  const canStartRefundRequestFromCase = Boolean(
    linkedOrder
    && needsRefundWorkflow
    && canCreateRefundRequest
    && remainingRefundableAmount > 0
    && !hasOpenRefundRequestForOrder
  );
  const shouldShowRefundPromptFromCase = Boolean(linkedOrder && needsRefundWorkflow);
  const shouldConstrainRefundButtonWidth = viewportWidth >= 900;
  const isApprovedRefundRequestForOrder = latestOpenRefundRequestForOrder?.status === 'approved';
  const refundButtonActiveBg = '#DC2626';
  const refundButtonActiveBorder = '#B91C1C';
  const refundButtonActiveText = '#FFFFFF';
  const refundButtonApprovedBg = isDark ? 'rgba(22, 101, 52, 0.28)' : '#DCFCE7';
  const refundButtonApprovedBorder = isDark ? 'rgba(74, 222, 128, 0.35)' : '#86EFAC';
  const refundButtonApprovedText = isDark ? '#34D399' : '#166534';
  const refundButtonBg = canStartRefundRequestFromCase
    ? refundButtonActiveBg
    : isApprovedRefundRequestForOrder
      ? refundButtonApprovedBg
      : colors.bg.secondary;
  const refundButtonBorder = canStartRefundRequestFromCase
    ? refundButtonActiveBorder
    : isApprovedRefundRequestForOrder
      ? refundButtonApprovedBorder
      : colors.border.light;
  const refundButtonText = canStartRefundRequestFromCase
    ? refundButtonActiveText
    : isApprovedRefundRequestForOrder
      ? refundButtonApprovedText
      : colors.text.muted;
  const isWebOrTabletRefundLayout = Platform.OS === 'web' || viewportWidth >= 768;
  const refundButtonLabelFontSize = isWebOrTabletRefundLayout ? 13 : (viewportWidth <= 390 ? 12 : 13);
  const refundButtonMinHeight = isWebOrTabletRefundLayout ? 44 : 42;
  const refundButtonPaddingVertical = isWebOrTabletRefundLayout ? 8 : 7;
  const refundButtonPaddingHorizontal = 14;

  const handleStatusChange = async (newStatus: typeof caseItem.status) => {
    Haptics.selectionAsync();
    const now = new Date().toISOString();
    const newTimelineEntry: CaseTimelineEntry = {
      id: Math.random().toString(36).slice(2),
      date: now,
      action: `Status changed to ${newStatus}`,
      user: userName || 'System',
    };
    const updatedTimeline = [newTimelineEntry, ...(caseItem.timeline || [])];
    await updateCase(
      caseItem.id,
      { status: newStatus, updatedBy: userName || undefined, timeline: updatedTimeline },
      businessId
    );
    setShowStatusModal(false);
  };

  const selectedStatusColor = statusColorMap[caseItem.status] ?? colors.text.muted;

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const now = new Date().toISOString();
    const newTimelineEntry: CaseTimelineEntry = {
      id: Math.random().toString(36).slice(2),
      date: now,
      action: `Note added: ${noteText.trim()}`,
      user: userName || 'System',
    };
    const updatedTimeline = [newTimelineEntry, ...(caseItem.timeline || [])];
    await updateCase(
      caseItem.id,
      { updatedBy: userName || undefined, timeline: updatedTimeline },
      businessId
    );
    setNoteText('');
    setShowNoteModal(false);
  };

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteCase(caseItem.id, businessId);
    setShowDeleteModal(false);
    if (onClose) {
      onClose();
    } else {
      router.back();
    }
  };

  const handleSaveEdit = async (updatedCase: Case) => {
    await updateCase(caseItem.id, updatedCase, businessId);
    setShowEditForm(false);
  };

  const handleAddResolution = async () => {
    if (!resolutionType && !resolutionNotes.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const now = new Date().toISOString();
    const newTimelineEntry: CaseTimelineEntry = {
      id: Math.random().toString(36).slice(2),
      date: now,
      action: `Resolution added: ${resolutionType}${resolutionNotes ? ` - ${resolutionNotes.trim().slice(0, 50)}...` : ''}`,
      user: userName || 'System',
    };
    const updatedTimeline = [newTimelineEntry, ...(caseItem.timeline || [])];
    await updateCase(
      caseItem.id,
      {
        resolution: {
          type: resolutionType as any,
          notes: resolutionNotes.trim(),
          value: resolutionValue ? parseFloat(resolutionValue) : undefined,
          resolvedAt: now,
          resolvedBy: userName,
        },
        status: 'Resolved',
        updatedBy: userName || undefined,
        timeline: updatedTimeline,
      },
      businessId
    );
    setResolutionType('No Action Required');
    setResolutionNotes('');
    setResolutionValue('');
    setShowResolutionModal(false);
  };

  const handleAssignCase = async (assigneeNames?: string[]) => {
    const nextNames = Array.from(new Set((assigneeNames ?? []).map((name) => name.trim()).filter(Boolean)));
    const nextAssignedTo = nextNames.join(', ');
    const shouldChangeAssignment = nextAssignedTo !== (caseItem.assignedTo ?? '');
    if (!shouldChangeAssignment) return;

    const now = new Date().toISOString();
    const timelineEntry: CaseTimelineEntry = {
      id: Math.random().toString(36).slice(2),
      date: now,
      action: nextAssignedTo
        ? `Assigned to ${nextAssignedTo}`
        : 'Assignment cleared',
      user: userName || 'System',
    };
    const updatedTimeline = [timelineEntry, ...(caseItem.timeline || [])];

    await updateCase(
      caseItem.id,
      {
        assignedTo: nextAssignedTo || undefined,
        updatedBy: userName || undefined,
        timeline: updatedTimeline,
      },
      businessId
    );
  };

  const handleViewOrder = () => {
    Haptics.selectionAsync();
    if (!caseItem.orderId) return;
    if (onNavigateToOrder) {
      onNavigateToOrder(caseItem.orderId);
    } else {
      router.push(`/order/${caseItem.orderId}`);
    }
  };

  const handleViewReturn = () => {
    Haptics.selectionAsync();
    if (!linkedReturn) return;
    router.push(`/return/${linkedReturn.id}` as any);
  };

  const handleOpenOrderThread = async () => {
    Haptics.selectionAsync();
    if (!caseItem.orderId) return;
    try {
      if (collaborationBusinessId && !isOfflineMode && !linkedOrderThreadQuery.data) {
        await collaborationData.getOrCreateThread(collaborationBusinessId, 'order', caseItem.orderId);
      }
    } catch (error) {
      console.warn('Failed to initialize linked order thread:', error);
    } finally {
      router.push(`/threads?orderId=${caseItem.orderId}`);
    }
  };

  const closeRefundRequestModal = () => {
    setShowRefundRequestModal(false);
    setRefundRequestError('');
    setIsSubmittingRefundRequest(false);
  };

  const openRefundRequestModalFromCase = () => {
    if (!linkedOrder) return;
    const resolutionAmount = caseItem.resolution?.value ?? 0;
    const safeResolutionAmount = Number.isFinite(resolutionAmount) ? Math.max(0, resolutionAmount) : 0;
    const recommendedAmount = safeResolutionAmount > 0
      ? Math.min(safeResolutionAmount, remainingRefundableAmount)
      : 0;
    const prefilledReason = caseItem.resolution?.notes?.trim() || caseItem.issueSummary.trim();

    setRefundRequestAmount(recommendedAmount > 0 ? String(Number(recommendedAmount.toFixed(2))) : '');
    setRefundRequestReason(prefilledReason);
    setRefundRequestNote(`Created from ${caseItem.caseNumber}`);
    setRefundRequestError('');
    setShowRefundRequestModal(true);
  };

  const handleSubmitRefundRequestFromCase = async () => {
    if (!linkedOrder || !caseItem.orderId) {
      setRefundRequestError('Link this case to an order before creating a refund request.');
      return;
    }
    if (!canCreateRefundRequest) {
      setRefundRequestError('Only staff, managers, or admins can create refund requests from cases.');
      return;
    }
    if (!currentUserId) {
      setRefundRequestError('Could not identify your profile. Please refresh and try again.');
      return;
    }

    const parsedAmount = Number.parseFloat(refundRequestAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setRefundRequestError('Enter a valid refund amount greater than 0.');
      return;
    }
    if (parsedAmount > remainingRefundableAmount + 0.01) {
      setRefundRequestError(`Refund exceeds remaining balance of ${formatCurrency(remainingRefundableAmount)}.`);
      return;
    }

    const reason = refundRequestReason.trim() || caseItem.issueSummary.trim();
    if (!reason) {
      setRefundRequestError('Add a refund reason before submitting.');
      return;
    }

    setIsSubmittingRefundRequest(true);
    setRefundRequestError('');

    const nowIso = new Date().toISOString();
    const nextStatus = currentUserRole === 'admin' ? 'approved' : 'submitted';
    const noteParts = [`Case ${caseItem.caseNumber}`];
    if (refundRequestNote.trim()) noteParts.push(refundRequestNote.trim());
    const combinedNote = noteParts.join(' - ');

    try {
      await addRefundRequest({
        id: Math.random().toString(36).slice(2, 15),
        orderId: linkedOrder.id,
        orderNumber: linkedOrder.orderNumber,
        customerName: linkedOrder.customerName,
        customerPhone: linkedOrder.customerPhone,
        customerEmail: linkedOrder.customerEmail,
        amount: parsedAmount,
        requestedDate: nowIso,
        reason,
        note: combinedNote,
        status: nextStatus,
        refundType: inferRefundRequestType(linkedOrder.totalAmount, (linkedOrder.refund?.amount ?? 0) + parsedAmount),
        source: 'order',
        submittedByUserId: currentUserId,
        submittedByName: userName,
        submittedAt: nowIso,
        reviewedByUserId: nextStatus === 'approved' ? currentUserId : undefined,
        reviewedByName: nextStatus === 'approved' ? userName : undefined,
        reviewedAt: nextStatus === 'approved' ? nowIso : undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      }, businessId);

      const timelineEntry: CaseTimelineEntry = {
        id: Math.random().toString(36).slice(2),
        date: nowIso,
        action: nextStatus === 'approved'
          ? `Refund request approved for ${formatCurrency(parsedAmount)} (${linkedOrder.orderNumber})`
          : `Refund request submitted for ${formatCurrency(parsedAmount)} (${linkedOrder.orderNumber})`,
        user: userName || 'System',
      };
      try {
        await updateCase(
          caseItem.id,
          {
            updatedBy: userName || undefined,
            timeline: [timelineEntry, ...(caseItem.timeline || [])],
          },
          businessId
        );
      } catch (error) {
        console.warn('Failed to append case refund timeline:', error);
      }

      if (nextStatus === 'submitted' && collaborationBusinessId) {
        const managerRecipientIds = teamMembers
          .filter((member) => member.role === 'manager' && member.id !== currentUserId)
          .map((member) => member.id);
        const adminRecipientIds = teamMembers
          .filter((member) => member.role === 'admin' && member.id !== currentUserId)
          .map((member) => member.id);
        const recipientUserIds = currentUserRole === 'staff'
          ? (managerRecipientIds.length > 0 ? managerRecipientIds : adminRecipientIds)
          : adminRecipientIds;
        const reviewStageLabel = currentUserRole === 'staff' && managerRecipientIds.length > 0
          ? 'for manager review'
          : 'for admin review';
        if (recipientUserIds.length > 0) {
          void sendThreadNotification({
            businessId: collaborationBusinessId,
            recipientUserIds,
            senderUserId: currentUserId,
            authorName: userName,
            body: `${userName} submitted a refund request from ${caseItem.caseNumber} for ${linkedOrder.orderNumber} (${formatCurrency(parsedAmount)}) ${reviewStageLabel}.`,
            entityType: 'order',
            entityDisplayName: linkedOrder.orderNumber,
            entityId: linkedOrder.id,
          });
        }
      }

      setShowRefundRequestModal(false);
      setRefundRequestAmount('');
      setRefundRequestReason('');
      setRefundRequestNote('');
      setRefundRequestError('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.warn('Case refund request submit failed:', error);
      setRefundRequestError('Could not create refund request right now. Please try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmittingRefundRequest(false);
    }
  };

  const linkedOrderActionBg = isDark ? '#FFFFFF' : colors.accent.primary;
  const linkedOrderActionTextColor = isDark ? '#000000' : '#FFFFFF';
  const linkedOrderThreadDotColor = linkedOrderThreadQuery.data ? '#EF4444' : '#9CA3AF';

  // Left column content sections
  const caseDetailsSection = (
    <View
      className="p-4 rounded-xl"
      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
    >
      <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider mb-3">
        Case Details
      </Text>
      <View className="gap-3">
        <View className="flex-row justify-between">
          <Text style={{ color: colors.text.secondary }} className="text-sm">Category</Text>
          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">{caseItem.type}</Text>
        </View>
        {caseItem.assignedTo && (
          <View className="flex-row justify-between">
            <Text style={{ color: colors.text.secondary }} className="text-sm">Assigned To</Text>
            <Text style={{ color: colors.text.primary }} className="text-sm font-semibold text-right flex-1 ml-4">{caseItem.assignedTo}</Text>
          </View>
        )}
        <View className="flex-row justify-between">
          <Text style={{ color: colors.text.secondary }} className="text-sm">Created</Text>
          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">{formattedCreatedDate}</Text>
        </View>
        {caseItem.updatedAt && (
          <View className="flex-row justify-between">
            <Text style={{ color: colors.text.secondary }} className="text-sm">Updated</Text>
            <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
              {new Date(caseItem.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>
        )}
      </View>
      <View className="mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
        <View className="flex-row items-center justify-between gap-3">
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider">
            Assign Case
          </Text>

          <Pressable
            onPress={() => setShowAssigneePicker((current) => !current)}
            className="rounded-xl px-3 py-2 flex-row items-center gap-2 active:opacity-80"
            style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, maxWidth: isWebDesktop ? 280 : 240 }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.border.medium,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserIcon size={12} color={colors.text.muted} strokeWidth={2} />
            </View>
            <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold" numberOfLines={1}>
              {assignedNames.length === 0
                ? 'No assignee'
                : assignedNames.length === 1
                  ? assignedNames[0]
                  : `${assignedNames.length} assignees`}
            </Text>
            <Text style={{ color: colors.text.muted }} className="text-[11px] font-semibold">
              {showAssigneePicker ? 'Hide' : 'Assign'}
            </Text>
          </Pressable>
        </View>

        {showAssigneePicker ? (
          <View
            className="mt-2 rounded-xl p-2"
            style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
          >
            {assignedNames.length > 0 ? (
              <View className="flex-row flex-wrap gap-1.5 mb-2">
                {assignedNames.map((name) => (
                  <View
                    key={`assigned-${name}`}
                    className="flex-row items-center gap-1.5 px-2 py-1 rounded-full"
                    style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                  >
                    <CaseCommentAvatar member={teamMembers.find((member) => member.name === name)} size={18} />
                    <Text style={{ color: colors.text.secondary }} className="text-[11px] font-semibold" numberOfLines={1}>
                      {name}
                    </Text>
                    <Pressable
                      onPress={() => { void handleAssignCase(assignedNames.filter((item) => item !== name)); }}
                      hitSlop={6}
                    >
                      <Text style={{ color: colors.text.muted }} className="text-xs font-semibold">×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <View
              className="rounded-lg px-2.5 flex-row items-center gap-1.5"
              style={{
                backgroundColor: colors.bg.card,
                borderWidth: 1,
                borderColor: colors.border.light,
                minHeight: 34,
              }}
            >
              <UserIcon size={13} color={colors.text.muted} strokeWidth={2} />
              <TextInput
                value={assigneeQuery}
                onChangeText={setAssigneeQuery}
                placeholder="Name or email"
                placeholderTextColor={colors.text.muted}
                style={{ color: colors.text.primary, fontSize: 12, height: 32, flex: 1 }}
                returnKeyType="done"
                onSubmitEditing={() => {
                  const first = filteredAssignableMembers[0];
                  if (first) {
                    void handleAssignCase([...assignedNames, first.name]);
                    setAssigneeQuery('');
                  }
                }}
              />
            </View>

            {assigneeQuery.trim().length > 0 ? (
              <View className="mt-1.5 rounded-lg overflow-hidden" style={{ borderWidth: 1, borderColor: colors.border.light }}>
                {filteredAssignableMembers.length === 0 ? (
                  <View className="px-2.5 py-2" style={{ backgroundColor: colors.bg.card }}>
                    <Text style={{ color: colors.text.muted }} className="text-xs">No team member found.</Text>
                  </View>
                ) : (
                  filteredAssignableMembers.slice(0, 6).map((member) => (
                    <Pressable
                      key={`assign-option-${member.id}`}
                      onPress={() => {
                        void handleAssignCase([...assignedNames, member.name]);
                        setAssigneeQuery('');
                      }}
                      className="px-2.5 py-2 flex-row items-center gap-2 active:opacity-80"
                      style={{ backgroundColor: colors.bg.card }}
                    >
                      <CaseCommentAvatar member={member} size={20} />
                      <Text style={{ color: colors.text.primary }} className="text-xs font-semibold flex-1" numberOfLines={1}>
                        {member.name}
                      </Text>
                      <Text style={{ color: colors.text.muted }} className="text-[11px]" numberOfLines={1}>
                        {member.email}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}

            <View className="mt-2 flex-row items-center gap-2">
              <Pressable
                onPress={() => {
                  if (userName && !assignedNameSet.has(userName.toLowerCase())) {
                    void handleAssignCase([...assignedNames, userName]);
                  }
                }}
                className="px-2.5 py-1.5 rounded-full active:opacity-80"
                style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.secondary }} className="text-[11px] font-semibold">
                  Assign to me
                </Text>
              </Pressable>
              {assignedNames.length > 0 ? (
                <Pressable
                  onPress={() => { void handleAssignCase([]); }}
                  className="px-2.5 py-1.5 rounded-full active:opacity-80"
                  style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                >
                  <Text style={{ color: colors.text.muted }} className="text-[11px] font-semibold">
                    Clear all
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );

  const linkedOrderSection = (
    <View
      className="p-4 rounded-xl mt-4"
      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider">
          Linked Order
        </Text>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleOpenOrderThread}
            className="active:opacity-80"
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: colors.bg.secondary,
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <MessageSquare size={14} color={colors.text.primary} strokeWidth={2} />
            <View
              style={{
                position: 'absolute',
                top: 5,
                right: 5,
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: linkedOrderThreadDotColor,
              }}
            />
          </Pressable>
          <Pressable
            onPress={handleViewOrder}
            className="px-3 py-1.5 rounded-full flex-row items-center gap-1.5 active:opacity-80"
            style={{ backgroundColor: linkedOrderActionBg }}
          >
            <ExternalLink size={12} color={linkedOrderActionTextColor} strokeWidth={2} />
            <Text className="text-xs font-semibold" style={{ color: linkedOrderActionTextColor }}>View Order</Text>
          </Pressable>
        </View>
      </View>
      <View className="gap-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Package size={14} color={colors.text.muted} strokeWidth={1.8} />
            <Text style={{ color: colors.text.secondary }} className="text-sm">Order</Text>
          </View>
          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
            {caseItem.orderNumber}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <UserIcon size={14} color={colors.text.muted} strokeWidth={1.8} />
            <Text style={{ color: colors.text.secondary }} className="text-sm">Customer</Text>
          </View>
          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold text-right ml-4" numberOfLines={1}>
            {caseItem.customerName}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <DollarSign size={14} color={colors.text.muted} strokeWidth={1.8} />
            <Text style={{ color: colors.text.secondary }} className="text-sm">Original Total</Text>
          </View>
          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold text-right ml-4" numberOfLines={1}>
            {linkedOrder ? formatCurrency(linkedOrder.totalAmount) : '—'}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <DollarSign size={14} color={colors.text.muted} strokeWidth={1.8} />
            <Text style={{ color: colors.text.secondary }} className="text-sm">Refunded</Text>
          </View>
          <Text
            style={{ color: refundedAmountForOrder > 0 ? '#DC2626' : colors.text.primary }}
            className="text-sm font-semibold text-right ml-4"
            numberOfLines={1}
          >
            {linkedOrder ? formatCurrency(refundedAmountForOrder) : '—'}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <DollarSign size={14} color={colors.text.muted} strokeWidth={1.8} />
            <Text style={{ color: colors.text.secondary }} className="text-sm">Remaining Balance</Text>
          </View>
          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold text-right ml-4" numberOfLines={1}>
            {linkedOrder ? formatCurrency(remainingRefundableAmount) : '—'}
          </Text>
        </View>
      </View>

      {linkedReturn ? (
        <View className="mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
          <View className="flex-row items-center justify-between gap-3">
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider mb-1.5">
                Linked Return
              </Text>
              <Text style={{ color: colors.text.primary }} className="text-sm font-semibold" numberOfLines={1}>
                {linkedReturn.ref} · {linkedReturn.status.replace(/_/g, ' ')}
              </Text>
              <Text style={{ color: colors.text.secondary }} className="text-xs mt-1" numberOfLines={1}>
                {linkedReturn.shippingPayer === 'seller' ? 'Seller pays shipping' : 'Customer pays shipping'}
              </Text>
            </View>
            <Pressable
              onPress={handleViewReturn}
              className="px-3 py-1.5 rounded-full flex-row items-center gap-1.5 active:opacity-80"
              style={{ backgroundColor: linkedOrderActionBg }}
            >
              <RefreshCcw size={12} color={linkedOrderActionTextColor} strokeWidth={2} />
              <Text className="text-xs font-semibold" style={{ color: linkedOrderActionTextColor }}>View Return</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {caseItem.issueSummary && (
        <View className="mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider mb-1.5">
            Inquiry
          </Text>
          <Text style={{ color: colors.text.secondary }} className="text-sm leading-5">
            {caseItem.issueSummary}
          </Text>
        </View>
      )}

      {shouldShowRefundPromptFromCase ? (
        <View className="mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
          <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider mb-2">
            Refund Workflow
          </Text>
          {canCreateRefundRequest ? (
            <>
              <Text style={{ color: colors.text.secondary }} className="text-xs mb-2">
                Remaining refundable: {formatCurrency(remainingRefundableAmount)}
              </Text>
              {pendingRefundRequestCountForOrder > 0 ? (
                <Text style={{ color: colors.text.muted }} className="text-[11px] mb-2">
                  {pendingRefundRequestCountForOrder} pending refund request{pendingRefundRequestCountForOrder > 1 ? 's' : ''} already exist for this order.
                </Text>
              ) : null}
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  openRefundRequestModalFromCase();
                }}
                disabled={!canStartRefundRequestFromCase}
                className="rounded-full px-4 py-3 flex-row items-center justify-center active:opacity-80"
                style={{
                  backgroundColor: refundButtonBg,
                  borderWidth: 1,
                  borderColor: refundButtonBorder,
                  minHeight: refundButtonMinHeight,
                  paddingVertical: refundButtonPaddingVertical,
                  paddingHorizontal: refundButtonPaddingHorizontal,
                  alignSelf: shouldConstrainRefundButtonWidth ? 'flex-start' : 'stretch',
                  minWidth: shouldConstrainRefundButtonWidth ? 260 : undefined,
                  maxWidth: shouldConstrainRefundButtonWidth ? 340 : undefined,
                }}
              >
                <DollarSign
                  size={16}
                  color={refundButtonText}
                  strokeWidth={2}
                />
                <Text
                  className="text-xs font-semibold ml-1.5"
                  style={{ color: refundButtonText, fontSize: refundButtonLabelFontSize }}
                >
                  {refundRequestActionLabel}
                </Text>
              </Pressable>
              {refundActionBlockMessage ? (
                <Text style={{ color: colors.text.muted }} className="text-[11px] mt-2">
                  {refundActionBlockMessage}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={{ color: colors.text.muted }} className="text-xs">
              Only staff, managers, or admins can create refund requests from cases.
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );

  const caseTypeSection = (
    <View
      className="p-4 rounded-xl mt-4"
      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
    >
      <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider mb-3">
        Case Type
      </Text>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Tag size={14} color={colors.text.muted} strokeWidth={1.8} />
          <Text style={{ color: colors.text.secondary }} className="text-sm">Type</Text>
        </View>
        <Text style={{ color: colors.text.primary }} className="text-sm font-semibold text-right ml-4" numberOfLines={1}>
          {caseItem.type}
        </Text>
      </View>
    </View>
  );

  const issueSummarySection = (
    <View
      className="p-4 rounded-xl mt-4"
      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
    >
      <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider mb-3">
        Issue Summary
      </Text>
      <Text style={{ color: colors.text.primary }} className="text-base leading-6">
        {caseItem.issueSummary}
      </Text>
    </View>
  );

  const originalMessageSection = caseItem.originalCustomerMessage ? (
    <View
      className="p-4 rounded-xl mt-4"
      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <MessageSquare size={16} color={colors.text.muted} strokeWidth={1.5} />
        <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider">
          Original Customer Message
        </Text>
      </View>
      <View
        className="p-3 rounded-lg"
        style={{ backgroundColor: colors.bg.secondary }}
      >
        <Text style={{ color: colors.text.secondary }} className="text-sm leading-5 italic">
          "{caseItem.originalCustomerMessage}"
        </Text>
      </View>
    </View>
  ) : null;

  const resolutionSection = caseItem.resolution ? (
    <View
      className="p-4 rounded-xl mt-4"
      style={{
        backgroundColor: CASE_STATUS_COLORS['Resolved'] ? CASE_STATUS_COLORS['Resolved'] + '15' : '#10B98115',
        borderWidth: 1,
        borderColor: CASE_STATUS_COLORS['Resolved'] ? CASE_STATUS_COLORS['Resolved'] + '30' : '#10B98130',
      }}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <Check size={16} color={CASE_STATUS_COLORS['Resolved'] || '#10B981'} strokeWidth={2} />
        <Text
          style={{ color: CASE_STATUS_COLORS['Resolved'] || '#10B981' }}
          className="text-xs font-semibold uppercase tracking-wider"
        >
          Resolution
        </Text>
      </View>
      <View className="gap-3">
        <View className="flex-row justify-between">
          <Text style={{ color: colors.text.secondary }} className="text-sm">Resolution Type</Text>
          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
            {caseItem.resolution.type}
          </Text>
        </View>
        {caseItem.resolution.value != null && caseItem.resolution.value > 0 && (
          <View className="flex-row justify-between">
            <Text style={{ color: colors.text.secondary }} className="text-sm">Value</Text>
            <View className="flex-row items-center gap-1">
              <DollarSign size={14} color={colors.text.primary} strokeWidth={1.5} />
              <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                {formatCurrency(caseItem.resolution.value)}
              </Text>
            </View>
          </View>
        )}
        {caseItem.resolution.resolvedAt && (
          <View className="flex-row justify-between">
            <Text style={{ color: colors.text.secondary }} className="text-sm">Resolved On</Text>
            <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
              {new Date(caseItem.resolution.resolvedAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </View>
        )}
        {caseItem.resolution.notes && (
          <View className="mt-2 pt-2" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
            <Text style={{ color: colors.text.secondary }} className="text-xs mb-1">Notes</Text>
            <Text style={{ color: colors.text.primary }} className="text-sm leading-5">
              {caseItem.resolution.notes}
            </Text>
          </View>
        )}
      </View>
    </View>
  ) : (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        setShowResolutionModal(true);
      }}
      className="p-4 rounded-xl mt-4 active:opacity-80"
      style={{
        backgroundColor: colors.bg.card,
        borderWidth: 1,
        borderColor: colors.border.light,
        borderStyle: 'dashed',
      }}
    >
      <View className="flex-row items-center justify-center gap-2">
        <Plus size={18} color={colors.text.secondary} strokeWidth={2} />
        <Text style={{ color: colors.text.secondary }} className="text-sm font-semibold">
          Add Resolution
        </Text>
      </View>
      <Text style={{ color: colors.text.muted }} className="text-xs text-center mt-2">
        Record how this case was resolved
      </Text>
    </Pressable>
  );

  // Right column content sections
  const updateStatusSection = (
    <View
      className="p-4 rounded-xl"
      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
    >
      <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider mb-3">
        Update Status
      </Text>
      <Pressable
        onPress={() => setShowStatusModal((value) => !value)}
        className="flex-row items-center px-4 py-3 rounded-full active:opacity-70"
        style={{
          backgroundColor: selectedStatusColor + '20',
          borderWidth: 1,
          borderColor: selectedStatusColor + '55',
        }}
      >
        <View
          className="w-6 h-6 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: selectedStatusColor + '30' }}
        >
          <View className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedStatusColor }} />
        </View>
        <Text className="font-semibold text-sm flex-1" style={{ color: selectedStatusColor }}>
          {caseItem.status}
        </Text>
        <ChevronDown size={18} color={selectedStatusColor} strokeWidth={2} />
      </Pressable>
      {showStatusModal ? (
        <View className="mt-2 gap-2">
          {sortedCaseStatuses.map((statusOption) => {
            const statusName = statusOption.name;
            const isSelected = statusName === caseItem.status;
            const color = statusColorMap[statusName] ?? colors.text.muted;
            return (
              <Pressable
                key={statusName}
                onPress={() => handleStatusChange(statusName)}
                className="w-full py-3 px-4 rounded-full active:opacity-70 flex-row items-center justify-between"
                style={{
                  backgroundColor: isSelected ? color + '20' : colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: isSelected ? color + '55' : colors.border.light,
                }}
              >
                <View className="flex-row items-center gap-3 flex-1 min-w-0">
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: color,
                      opacity: isSelected ? 1 : 0.55,
                    }}
                  />
                  <Text
                    style={{ color: isSelected ? color : colors.text.primary }}
                    className="text-sm font-semibold flex-1"
                    numberOfLines={1}
                  >
                    {statusName}
                  </Text>
                </View>
                {isSelected ? <Check size={16} color={color} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  // Helper to get activity badge info
  const getActivityBadge = (action: string) => {
    if (action.startsWith('Note added:')) return { label: 'Note', color: colors.accent.primary };
    if (action.startsWith('Status') || action.includes('Status →')) return { label: 'Status', color: '#F59E0B' };
    if (action.startsWith('Resolution') || action.includes('Resolution added')) return { label: 'Resolved', color: '#10B981' };
    if (action.startsWith('Assigned') || action.includes('Assigned to')) return { label: 'Assigned', color: '#6366F1' };
    if (action.includes('Priority →')) return { label: 'Priority', color: '#EF4444' };
    if (action === 'Case Created') return { label: 'Created', color: '#8B5CF6' };
    if (action.includes('Type →') || action.includes('Source →') || action.includes('summary')) return { label: 'Edited', color: '#6B7280' };
    return { label: 'Update', color: colors.text.muted };
  };

  const activitySection = (caseItem.timeline && caseItem.timeline.length > 0) ? (
    <View
      className="p-4 rounded-xl mt-4"
      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <MessageSquare size={16} color={colors.text.tertiary} strokeWidth={2} />
        <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider">
          Activity
        </Text>
        <Text style={{ color: colors.text.muted }} className="text-xs ml-auto">
          {caseItem.timeline.length} {caseItem.timeline.length === 1 ? 'entry' : 'entries'}
        </Text>
      </View>
      <View className="gap-3">
        {caseItem.timeline.slice(0, 8).map((entry, index) => {
          const isNote = entry.action.startsWith('Note added:');
          const noteContent = isNote ? entry.action.replace('Note added: ', '') : entry.action;
          const entryDate = new Date(entry.date);
          const formattedEntryDate = entryDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
          const badge = getActivityBadge(entry.action);

          return (
            <View
              key={entry.id}
              style={{
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border.light,
                paddingTop: index === 0 ? 0 : 12,
              }}
            >
              <View className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center gap-2">
                  <View
                    className="px-2 py-0.5 rounded"
                    style={{ backgroundColor: badge.color + '18' }}
                  >
                    <Text
                      style={{ color: badge.color }}
                      className="text-[10px] font-bold"
                    >
                      {badge.label}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                    {entry.user}
                  </Text>
                </View>
                <Text style={{ color: colors.text.muted }} className="text-xs">
                  {formattedEntryDate}
                </Text>
              </View>
              <Text style={{ color: colors.text.secondary }} className="text-sm leading-5 mt-1">
                {noteContent}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Add note input */}
      <View className="mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
        <View className="flex-row items-center gap-2">
          <TextInput
            placeholder="Add a note..."
            placeholderTextColor={colors.text.muted}
            className="flex-1 rounded-full px-4 py-2.5 text-sm"
            style={{
              backgroundColor: colors.bg.secondary,
              color: colors.text.primary,
              borderWidth: 1,
              borderColor: colors.border.light,
              height: 40,
            }}
            value={noteText}
            onChangeText={setNoteText}
            onSubmitEditing={handleAddNote}
          />
          <Pressable
            onPress={handleAddNote}
            className="w-10 h-10 rounded-full items-center justify-center active:opacity-80"
            style={{ backgroundColor: noteText.trim() ? '#111111' : colors.bg.secondary }}
          >
            <ArrowLeft size={18} color={noteText.trim() ? '#fff' : colors.text.muted} strokeWidth={2} style={{ transform: [{ rotate: '90deg' }] }} />
          </Pressable>
        </View>
      </View>
    </View>
  ) : (
    <View
      className="p-4 rounded-xl mt-4"
      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
    >
      <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider mb-3">
        Activity
      </Text>
      <Text style={{ color: colors.text.muted }} className="text-sm text-center py-4">No activity yet</Text>
      <Pressable
        onPress={() => setShowNoteModal(true)}
        className="flex-row items-center justify-center py-3 rounded-full active:opacity-80"
        style={{ backgroundColor: '#111111' }}
      >
        <Plus size={16} color="#FFFFFF" strokeWidth={2} />
        <Text className="text-white font-semibold ml-2 text-sm">Add Note</Text>
      </Pressable>
    </View>
  );

  const commentsSection = (
    <CaseCommentsSection
      caseItem={caseItem}
      businessId={collaborationBusinessId}
      isOfflineMode={isOfflineMode}
      currentUserName={userName}
      teamMembers={teamMembers}
    />
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
      {/* Desktop Header */}
      {isWebDesktop ? (
        <View style={{ backgroundColor: colors.bg.primary }}>
          <View
            style={{
              paddingHorizontal: 28,
              paddingTop: 32,
              paddingBottom: 18,
              width: '100%',
              maxWidth: webMaxWidth,
              alignSelf: 'flex-start',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    if (onClose) {
                      onClose();
                    } else {
                      router.back();
                    }
                  }}
                  className="active:opacity-70"
                  style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}
                >
                  <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
                </Pressable>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700' }} numberOfLines={1}>
                      {caseItem.caseNumber}
                    </Text>
                    <View
                      style={{ backgroundColor: statusColor + '20', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Text style={{ color: statusColor, fontSize: 13, fontWeight: '700' }}>
                        {caseItem.status.toLowerCase()}
                      </Text>
                    </View>
                    <View
                      style={{ backgroundColor: CASE_PRIORITY_COLORS[caseItem.priority ?? 'Low'] + '20', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Text style={{ color: CASE_PRIORITY_COLORS[caseItem.priority ?? 'Low'], fontSize: 13, fontWeight: '700' }}>
                        {caseItem.priority?.toLowerCase() ?? '—'}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.text.muted, fontSize: 14, marginTop: 6 }} numberOfLines={1}>
                    {caseItem.issueSummary}
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable
                  onPress={() => setShowDeleteModal(true)}
                  className="active:opacity-80"
                  style={{ paddingHorizontal: 8, height: 44, justifyContent: 'center' }}
                >
                  <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: '700' }}>Delete</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowEditForm(true)}
                  className="active:opacity-80"
                  style={{
                    height: 44,
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    backgroundColor: colors.bg.primary,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Edit2 size={16} color={colors.text.primary} strokeWidth={2} />
                  <Text style={{ color: colors.text.primary, fontWeight: '700' }}>Edit</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      ) : showBackButton ? (
        <View
          className="flex-row items-center px-5 py-4"
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light, position: 'relative', zIndex: 60 }}
        >
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              if (onClose) {
                onClose();
              } else {
                router.back();
              }
            }}
            className="p-2 -ml-2 active:opacity-70"
          >
            <ChevronLeft size={24} color={colors.text.primary} strokeWidth={1.5} />
          </Pressable>
          <Text style={{ color: colors.text.primary }} className="text-xl font-bold ml-2">
            Case Details
          </Text>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setShowCaseActionsModal((current) => !current);
            }}
            className="ml-auto w-10 h-10 rounded-full items-center justify-center active:opacity-80"
            style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
          >
            <MoreVertical size={18} color={colors.text.primary} strokeWidth={2} />
          </Pressable>

          {isMobileHeaderContext && showCaseActionsModal ? (
            <View
              className="absolute right-5 rounded-xl p-2"
              style={{
                top: 58,
                width: 186,
                backgroundColor: colors.bg.card,
                borderWidth: 1,
                borderColor: colors.border.light,
                shadowColor: '#000000',
                shadowOpacity: 0.15,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                elevation: 10,
                zIndex: 80,
              }}
            >
              <Pressable
                onPress={() => {
                  setShowCaseActionsModal(false);
                  Haptics.selectionAsync();
                  setShowNoteModal(true);
                }}
                className="w-full flex-row items-center py-2.5 px-2 rounded-lg active:opacity-80"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <Plus size={16} color={colors.text.primary} strokeWidth={2} />
                <Text style={{ color: colors.text.primary }} className="font-semibold ml-2 text-sm">Add Note</Text>
              </Pressable>

              {shouldShowRefundPromptFromCase ? (
                <Pressable
                  onPress={() => {
                    setShowCaseActionsModal(false);
                    Haptics.selectionAsync();
                    openRefundRequestModalFromCase();
                  }}
                  disabled={!canStartRefundRequestFromCase}
                  className="w-full flex-row items-center py-2.5 px-2 rounded-lg active:opacity-80 mt-1.5"
                  style={{
                    backgroundColor: canStartRefundRequestFromCase ? colors.bg.secondary : colors.bg.primary,
                    opacity: canStartRefundRequestFromCase ? 1 : 0.7,
                  }}
                >
                  <DollarSign
                    size={16}
                    color={canStartRefundRequestFromCase ? colors.text.primary : colors.text.muted}
                    strokeWidth={2}
                  />
                  <Text
                    style={{ color: canStartRefundRequestFromCase ? colors.text.primary : colors.text.muted }}
                    className="font-semibold ml-2 text-sm"
                  >
                    {refundRequestActionLabel}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => {
                  setShowCaseActionsModal(false);
                  Haptics.selectionAsync();
                  setShowEditForm(true);
                }}
                className="w-full flex-row items-center py-2.5 px-2 rounded-lg active:opacity-80 mt-1.5"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <Edit2 size={16} color={colors.text.primary} strokeWidth={2} />
                <Text style={{ color: colors.text.primary }} className="font-semibold ml-2 text-sm">Edit Case</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setShowCaseActionsModal(false);
                  Haptics.selectionAsync();
                  setShowDeleteModal(true);
                }}
                className="w-full flex-row items-center py-2.5 px-2 rounded-lg active:opacity-80 mt-1.5"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: '#EF4444' + '40' }}
              >
                <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                <Text style={{ color: '#EF4444' }} className="font-semibold ml-2 text-sm">Delete Case</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {isMobileHeaderContext && showCaseActionsModal ? (
        <Pressable
          onPress={() => setShowCaseActionsModal(false)}
          style={{
            position: 'absolute',
            top: 72,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
          }}
        />
      ) : null}

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: isWebDesktop ? 40 : 0,
          width: '100%',
          maxWidth: isWebDesktop ? webMaxWidth : undefined,
          alignSelf: isWebDesktop ? 'flex-start' : undefined,
          paddingHorizontal: isWebDesktop ? 28 : 0,
        }}
      >
        {isWebDesktop ? (
          <View style={{ flexDirection: 'row', gap: 24 }}>
            {/* Left Column */}
            <View style={{ flex: 1, minWidth: 0 }}>
              {caseDetailsSection}
              {linkedOrderSection}
              {caseTypeSection}
              {issueSummarySection}
              {originalMessageSection}
              {commentsSection}
              {resolutionSection}
            </View>
            {/* Right Column */}
            <View style={{ width: rightRailWidth, maxWidth: rightRailWidth, flexShrink: 0 }}>
              {updateStatusSection}
              {activitySection}
            </View>
          </View>
        ) : (
          <>
          <View className="px-5 py-4">
            {/* Status Update Card */}
            <View className="mb-4">
              {updateStatusSection}
            </View>

            {/* Case Header Card */}
            <View
              className="p-4 rounded-xl mb-4"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <View className="flex-row justify-between items-start mb-4">
                <View className="flex-1 min-w-0">
                  <Text style={{ color: colors.text.primary }} className="text-2xl font-bold tracking-tight" numberOfLines={1}>
                    {caseItem.customerName}
                  </Text>
                  <Text style={{ color: colors.text.secondary }} className="text-sm font-semibold mt-2" numberOfLines={1}>
                    {caseItem.caseNumber}
                  </Text>
                </View>
                <View
                  className="w-14 h-14 rounded-xl items-center justify-center"
                  style={{ backgroundColor: colors.bg.tertiary }}
                >
                  {getCaseTypeIcon(caseItem.type, colors.text.primary, 26)}
                </View>
              </View>

              <View className="gap-3 pt-4" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
                {caseItem.priority && (
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Flag size={14} color={colors.text.muted} strokeWidth={1.8} />
                      <Text style={{ color: colors.text.secondary }} className="text-sm">Priority</Text>
                    </View>
                    <Text style={{ color: CASE_PRIORITY_COLORS[caseItem.priority] }} className="text-sm font-semibold">
                      {caseItem.priority}
                    </Text>
                  </View>
                )}
                {caseItem.source && (
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      {getCaseSourceIcon(caseItem.source, colors.text.muted, 14)}
                      <Text style={{ color: colors.text.secondary }} className="text-sm">Source</Text>
                    </View>
                    <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                      {caseItem.source}
                    </Text>
                  </View>
                )}
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Clock size={14} color={colors.text.muted} strokeWidth={1.8} />
                    <Text style={{ color: colors.text.secondary }} className="text-sm">Logged On</Text>
                  </View>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                    {formattedCreatedDate}
                  </Text>
                </View>
                {caseItem.createdBy ? (
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <UserIcon size={14} color={colors.text.muted} strokeWidth={1.8} />
                      <Text style={{ color: colors.text.secondary }} className="text-sm">Created By</Text>
                    </View>
                    <Text style={{ color: colors.text.primary }} className="text-sm font-semibold" numberOfLines={1}>
                      {caseItem.createdBy}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View className="mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
                <Text style={{ color: colors.text.muted }} className="text-[9px] font-bold uppercase tracking-widest mb-2">
                  Status
                </Text>
                <View
                  className="self-start px-3.5 py-2 rounded-full flex-row items-center gap-2"
                  style={{ backgroundColor: statusColor + '20', borderWidth: 1, borderColor: statusColor + '35' }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: statusColor,
                    }}
                  />
                  <Text style={{ color: statusColor }} className="text-xs font-bold uppercase tracking-wider" numberOfLines={1}>
                    {caseItem.status}
                  </Text>
                </View>
              </View>
            </View>

            {/* Assign Case (Mobile) */}
            <View
              className="p-4 rounded-xl mb-4"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <View className="flex-row items-center justify-between gap-3">
                <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold">
                  Assign Case
                </Text>

                <Pressable
                  onPress={() => setShowAssigneePicker((current) => !current)}
                  className="rounded-xl px-3 py-2 flex-row items-center gap-2 active:opacity-80"
                  style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light, maxWidth: 240 }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: colors.border.medium,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <UserIcon size={12} color={colors.text.muted} strokeWidth={2} />
                  </View>
                  <Text style={{ color: colors.text.secondary }} className="text-xs font-semibold" numberOfLines={1}>
                    {assignedNames.length === 0
                      ? 'No assignee'
                      : assignedNames.length === 1
                        ? assignedNames[0]
                        : `${assignedNames.length} assignees`}
                  </Text>
                  <Text style={{ color: colors.text.muted }} className="text-[11px] font-semibold">
                    {showAssigneePicker ? 'Hide' : 'Assign'}
                  </Text>
                </Pressable>
              </View>

              {showAssigneePicker ? (
                <View
                  className="mt-2 rounded-xl p-2"
                  style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
                >
                  {assignedNames.length > 0 ? (
                    <View className="flex-row flex-wrap gap-1.5 mb-2">
                      {assignedNames.map((name) => (
                        <View
                          key={`assigned-mobile-${name}`}
                          className="flex-row items-center gap-1.5 px-2 py-1 rounded-full"
                          style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                        >
                          <CaseCommentAvatar member={teamMembers.find((member) => member.name === name)} size={18} />
                          <Text style={{ color: colors.text.secondary }} className="text-[11px] font-semibold" numberOfLines={1}>
                            {name}
                          </Text>
                          <Pressable
                            onPress={() => { void handleAssignCase(assignedNames.filter((item) => item !== name)); }}
                            hitSlop={6}
                          >
                            <Text style={{ color: colors.text.muted }} className="text-xs font-semibold">×</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <View
                    className="rounded-lg px-2.5 flex-row items-center gap-1.5"
                    style={{
                      backgroundColor: colors.bg.card,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      minHeight: 34,
                    }}
                  >
                    <UserIcon size={13} color={colors.text.muted} strokeWidth={2} />
                    <TextInput
                      value={assigneeQuery}
                      onChangeText={setAssigneeQuery}
                      placeholder="Name or email"
                      placeholderTextColor={colors.text.muted}
                      style={{ color: colors.text.primary, fontSize: 12, height: 32, flex: 1 }}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        const first = filteredAssignableMembers[0];
                        if (first) {
                          void handleAssignCase([...assignedNames, first.name]);
                          setAssigneeQuery('');
                        }
                      }}
                    />
                  </View>

                  {assigneeQuery.trim().length > 0 ? (
                    <View className="mt-1.5 rounded-lg overflow-hidden" style={{ borderWidth: 1, borderColor: colors.border.light }}>
                      {filteredAssignableMembers.length === 0 ? (
                        <View className="px-2.5 py-2" style={{ backgroundColor: colors.bg.card }}>
                          <Text style={{ color: colors.text.muted }} className="text-xs">No team member found.</Text>
                        </View>
                      ) : (
                        filteredAssignableMembers.slice(0, 6).map((member) => (
                          <Pressable
                            key={`assign-option-mobile-${member.id}`}
                            onPress={() => {
                              void handleAssignCase([...assignedNames, member.name]);
                              setAssigneeQuery('');
                            }}
                            className="px-2.5 py-2 flex-row items-center gap-2 active:opacity-80"
                            style={{ backgroundColor: colors.bg.card }}
                          >
                            <CaseCommentAvatar member={member} size={20} />
                            <Text style={{ color: colors.text.primary }} className="text-xs font-semibold flex-1" numberOfLines={1}>
                              {member.name}
                            </Text>
                            <Text style={{ color: colors.text.muted }} className="text-[11px]" numberOfLines={1}>
                              {member.email}
                            </Text>
                          </Pressable>
                        ))
                      )}
                    </View>
                  ) : null}

                  <View className="mt-2 flex-row items-center gap-2">
                    <Pressable
                      onPress={() => {
                        if (userName && !assignedNameSet.has(userName.toLowerCase())) {
                          void handleAssignCase([...assignedNames, userName]);
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-full active:opacity-80"
                      style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                    >
                      <Text style={{ color: colors.text.secondary }} className="text-[11px] font-semibold">
                        Assign to me
                      </Text>
                    </Pressable>
                    {assignedNames.length > 0 ? (
                      <Pressable
                        onPress={() => { void handleAssignCase([]); }}
                        className="px-2.5 py-1.5 rounded-full active:opacity-80"
                        style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
                      >
                        <Text style={{ color: colors.text.muted }} className="text-[11px] font-semibold">
                          Clear all
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>

            {/* Order Info Section */}
            <View
              className="p-4 rounded-xl mb-4"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <View className="flex-row items-center justify-between mb-3">
                <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold">
                  Linked Order
                </Text>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={handleOpenOrderThread}
                    className="active:opacity-80"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: colors.bg.secondary,
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}
                  >
                    <MessageSquare size={15} color={colors.text.primary} strokeWidth={2} />
                    <View
                      style={{
                        position: 'absolute',
                        top: 5,
                        right: 5,
                        width: 7,
                        height: 7,
                        borderRadius: 3.5,
                        backgroundColor: linkedOrderThreadDotColor,
                      }}
                    />
                  </Pressable>
                  <Pressable
                    onPress={handleViewOrder}
                    className="px-4 py-2 rounded-full flex-row items-center gap-1 active:opacity-80"
                    style={{ backgroundColor: linkedOrderActionBg }}
                  >
                    <ExternalLink size={14} color={linkedOrderActionTextColor} strokeWidth={1.5} />
                    <Text className="text-sm font-semibold" style={{ color: linkedOrderActionTextColor }}>View Order</Text>
                  </Pressable>
                </View>
              </View>
              <View className="gap-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Package size={14} color={colors.text.muted} strokeWidth={1.8} />
                    <Text style={{ color: colors.text.secondary }} className="text-sm">Order</Text>
                  </View>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold">
                    {caseItem.orderNumber}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <UserIcon size={14} color={colors.text.muted} strokeWidth={1.8} />
                    <Text style={{ color: colors.text.secondary }} className="text-sm">Customer</Text>
                  </View>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold text-right ml-4" numberOfLines={1}>
                    {caseItem.customerName}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <DollarSign size={14} color={colors.text.muted} strokeWidth={1.8} />
                    <Text style={{ color: colors.text.secondary }} className="text-sm">Original Total</Text>
                  </View>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold text-right ml-4" numberOfLines={1}>
                    {linkedOrder ? formatCurrency(linkedOrder.totalAmount) : '—'}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <DollarSign size={14} color={colors.text.muted} strokeWidth={1.8} />
                    <Text style={{ color: colors.text.secondary }} className="text-sm">Refunded</Text>
                  </View>
                  <Text
                    style={{ color: refundedAmountForOrder > 0 ? '#DC2626' : colors.text.primary }}
                    className="text-sm font-semibold text-right ml-4"
                    numberOfLines={1}
                  >
                    {linkedOrder ? formatCurrency(refundedAmountForOrder) : '—'}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <DollarSign size={14} color={colors.text.muted} strokeWidth={1.8} />
                    <Text style={{ color: colors.text.secondary }} className="text-sm">Remaining Balance</Text>
                  </View>
                  <Text style={{ color: colors.text.primary }} className="text-sm font-semibold text-right ml-4" numberOfLines={1}>
                    {linkedOrder ? formatCurrency(remainingRefundableAmount) : '—'}
                  </Text>
                </View>
              </View>
              {shouldShowRefundPromptFromCase ? (
                <View className="mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border.light }}>
                  <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold mb-2">
                    Refund Workflow
                  </Text>
                  {canCreateRefundRequest ? (
                    <>
                      <Text style={{ color: colors.text.secondary }} className="text-xs mb-2">
                        Remaining refundable: {formatCurrency(remainingRefundableAmount)}
                      </Text>
                      {pendingRefundRequestCountForOrder > 0 ? (
                        <Text style={{ color: colors.text.muted }} className="text-[11px] mb-2">
                          {pendingRefundRequestCountForOrder} pending refund request{pendingRefundRequestCountForOrder > 1 ? 's' : ''} already exist for this order.
                        </Text>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          openRefundRequestModalFromCase();
                        }}
                        disabled={!canStartRefundRequestFromCase}
                        className="rounded-full px-4 py-3 flex-row items-center justify-center active:opacity-80"
                        style={{
                          backgroundColor: refundButtonBg,
                          borderWidth: 1,
                          borderColor: refundButtonBorder,
                          minHeight: refundButtonMinHeight,
                          paddingVertical: refundButtonPaddingVertical,
                          paddingHorizontal: refundButtonPaddingHorizontal,
                          alignSelf: shouldConstrainRefundButtonWidth ? 'flex-start' : 'stretch',
                          minWidth: shouldConstrainRefundButtonWidth ? 260 : undefined,
                          maxWidth: shouldConstrainRefundButtonWidth ? 340 : undefined,
                        }}
                      >
                        <DollarSign
                          size={16}
                          color={refundButtonText}
                          strokeWidth={2}
                        />
                        <Text
                          className="text-xs font-semibold ml-1.5"
                          style={{ color: refundButtonText, fontSize: refundButtonLabelFontSize }}
                        >
                          {refundRequestActionLabel}
                        </Text>
                      </Pressable>
                      {refundActionBlockMessage ? (
                        <Text style={{ color: colors.text.muted }} className="text-[11px] mt-2">
                          {refundActionBlockMessage}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={{ color: colors.text.muted }} className="text-xs">
                      Only staff, managers, or admins can create refund requests from cases.
                    </Text>
                  )}
                </View>
              ) : null}
            </View>

            {/* Case Type Section */}
            <View
              className="p-4 rounded-xl mb-4"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold mb-3">
                Case Type
              </Text>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Tag size={14} color={colors.text.muted} strokeWidth={1.8} />
                  <Text style={{ color: colors.text.secondary }} className="text-sm">Type</Text>
                </View>
                <Text style={{ color: colors.text.primary }} className="text-sm font-semibold text-right ml-4" numberOfLines={1}>
                  {caseItem.type}
                </Text>
              </View>
            </View>

            {/* Issue Summary Section */}
            <View
              className="p-4 rounded-xl mb-4"
              style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
            >
              <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold mb-3">
                Issue Summary
              </Text>
              <Text style={{ color: colors.text.primary }} className="text-base leading-6">
                {caseItem.issueSummary}
              </Text>
            </View>

            {/* Original Customer Message */}
            {caseItem.originalCustomerMessage && (
              <View
                className="p-4 rounded-xl mb-4"
                style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
              >
                <View className="flex-row items-center gap-2 mb-3">
                  <MessageSquare size={16} color={colors.text.muted} strokeWidth={1.5} />
                  <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold">
                    Original Customer Message
                  </Text>
                </View>
                <View
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: colors.bg.secondary }}
                >
                  <Text style={{ color: colors.text.secondary }} className="text-sm leading-5 italic">
                    "{caseItem.originalCustomerMessage}"
                  </Text>
                </View>
              </View>
            )}

            {/* Proof Images */}
            {caseItem.attachments && caseItem.attachments.length > 0 && (
              <View
                className="p-4 rounded-xl mb-4"
                style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold mb-3">
                  Proof Images
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 4 }}
                >
                  {caseItem.attachments.map((attachment) => (
                    <View key={attachment.id} className="mr-3">
                      <View
                        className="rounded-xl overflow-hidden"
                        style={{ borderWidth: 1, borderColor: colors.border.light }}
                      >
                        <Image
                          source={{ uri: attachment.preview ?? attachment.uri }}
                          style={{ width: 140, height: 120 }}
                          resizeMode="cover"
                        />
                      </View>
                      <Text
                        style={{ color: colors.text.secondary }}
                        className="text-[11px] mt-2"
                      >
                        {attachment.label}
                      </Text>
                      <Text
                        style={{ color: colors.text.tertiary }}
                        className="text-[9px]"
                      >
                        {new Date(
                          attachment.uploadedAt || caseItem.createdAt
                        ).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Resolution Section */}
            {caseItem.resolution ? (
              <View
                className="p-4 rounded-xl mb-4"
                style={{
                  backgroundColor: CASE_STATUS_COLORS['Resolved'] + '10',
                  borderWidth: 1,
                  borderColor: CASE_STATUS_COLORS['Resolved'] + '30',
                }}
              >
                <View className="flex-row items-center gap-2 mb-3">
                  <Check size={16} color={CASE_STATUS_COLORS['Resolved']} strokeWidth={2} />
                  <Text style={{ color: CASE_STATUS_COLORS['Resolved'] }} className="text-xs uppercase font-semibold">
                    Resolution
                  </Text>
                </View>
                <View className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <Text style={{ color: colors.text.secondary }} className="text-sm">
                      Resolution Type
                    </Text>
                    <Text style={{ color: colors.text.primary }} className="font-semibold">
                      {caseItem.resolution.type}
                    </Text>
                  </View>
                  {caseItem.resolution.value && (
                    <View className="flex-row items-center justify-between">
                      <Text style={{ color: colors.text.secondary }} className="text-sm">
                        Value
                      </Text>
                      <View className="flex-row items-center gap-1">
                        <DollarSign size={14} color={colors.text.primary} strokeWidth={1.5} />
                        <Text style={{ color: colors.text.primary }} className="font-semibold">
                          {formatCurrency(caseItem.resolution.value)}
                        </Text>
                      </View>
                    </View>
                  )}
                  {formattedResolvedDate && (
                    <View className="flex-row items-center justify-between">
                      <Text style={{ color: colors.text.secondary }} className="text-sm">
                        Resolved On
                      </Text>
                      <Text style={{ color: colors.text.primary }} className="font-medium">
                        {formattedResolvedDate}
                      </Text>
                    </View>
                  )}
                  {caseItem.resolution.notes && (
                    <View className="mt-2">
                      <Text style={{ color: colors.text.secondary }} className="text-sm mb-1">
                        Notes
                      </Text>
                      <Text style={{ color: colors.text.primary }} className="text-sm leading-5">
                        {caseItem.resolution.notes}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowResolutionModal(true);
                }}
                className="p-4 rounded-xl mb-4 active:opacity-80"
                style={{
                  backgroundColor: colors.bg.card,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderStyle: 'dashed',
                }}
              >
                <View className="flex-row items-center justify-center gap-2">
                  <Plus size={18} color={colors.text.secondary} strokeWidth={2} />
                  <Text style={{ color: colors.text.secondary }} className="text-sm font-semibold">
                    Add Resolution
                  </Text>
                </View>
                <Text style={{ color: colors.text.muted }} className="text-xs text-center mt-2">
                  Record how this case was resolved
                </Text>
              </Pressable>
            )}

            {/* Audit History / Timeline Section */}
            {(caseItem.timeline && caseItem.timeline.length > 0) && (
              <View className="mb-4">
                <View className="flex-row items-center gap-2 mb-4">
                  <History size={16} color={colors.text.muted} strokeWidth={1.5} />
                  <Text style={{ color: colors.text.muted }} className="text-[10px] font-bold uppercase tracking-[0.2em]">
                    Audit History
                  </Text>
                </View>
                <View className="relative pl-4">
                  {/* Vertical line */}
                  <View
                    className="absolute left-[5px] top-2 bottom-2 w-[2px]"
                    style={{ backgroundColor: colors.border.light }}
                  />
                  {caseItem.timeline.map((entry, index) => {
                    const isNote = entry.action.startsWith('Note added:');
                    const entryDate = new Date(entry.date);
                    const formattedEntryDate = `${entryDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}, ${entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                    return (
                      <View
                        key={entry.id} className="flex-row gap-4 mb-4"
                      >
                        <View
                          className="w-3 h-3 rounded-full z-10"
                          style={{
                            backgroundColor: isNote ? colors.accent.primary : colors.bg.card,
                            borderWidth: isNote ? 0 : 3,
                            borderColor: colors.border.medium,
                          }}
                        />
                        <View className="flex-1 -mt-0.5">
                          <Text
                            style={{ color: isNote ? colors.accent.primary : colors.text.primary }}
                            className="text-sm font-semibold leading-5"
                          >
                            {entry.action}
                          </Text>
                          <Text style={{ color: colors.text.muted }} className="text-[10px] font-bold uppercase tracking-tighter mt-1">
                            {entry.user} • {formattedEntryDate}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

          </View>
          {commentsSection}
          </>
        )}
      </ScrollView>

      <Modal
        visible={showRefundRequestModal}
        transparent
        animationType="fade"
        onRequestClose={closeRefundRequestModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <Pressable className="absolute inset-0" onPress={closeRefundRequestModal} />
          <View
            className="w-full max-w-md rounded-[28px] p-6"
            style={{ backgroundColor: colors.bg.card }}
          >
            <View className="flex-row items-center gap-2 mb-5">
              <DollarSign size={20} color={colors.text.primary} strokeWidth={2} />
              <Text style={{ color: colors.text.primary }} className="text-xl font-bold tracking-tight">
                Create Refund Request
              </Text>
            </View>

            <View className="rounded-xl px-4 py-3 mb-3" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
              <Text style={{ color: colors.text.muted }} className="text-[10px] uppercase font-semibold">Case</Text>
              <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mt-1">{caseItem.caseNumber}</Text>
            </View>

            <View className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}>
              <Text style={{ color: colors.text.muted }} className="text-[10px] uppercase font-semibold">Order</Text>
              <Text style={{ color: colors.text.primary }} className="text-sm font-semibold mt-1">
                {linkedOrder?.orderNumber ?? caseItem.orderNumber ?? 'No linked order'}
              </Text>
              <Text style={{ color: colors.text.secondary }} className="text-xs mt-1">
                Remaining refundable: {formatCurrency(remainingRefundableAmount)}
              </Text>
              <Text style={{ color: colors.text.muted }} className="text-[11px] mt-2">
                {`This request will be sent for ${refundRequestReviewerLabel}.`}
              </Text>
            </View>

            <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold mb-2">
              Refund Amount
            </Text>
            <TextInput
              value={refundRequestAmount}
              onChangeText={setRefundRequestAmount}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={colors.text.muted}
              className="rounded-xl px-4 mb-4"
              style={{
                backgroundColor: colors.bg.secondary,
                color: colors.text.primary,
                borderWidth: 1,
                borderColor: colors.border.light,
                height: 50,
              }}
            />

            <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold mb-2">
              Refund Reason
            </Text>
            <TextInput
              value={refundRequestReason}
              onChangeText={setRefundRequestReason}
              placeholder="Why should this refund be paid?"
              placeholderTextColor={colors.text.muted}
              className="rounded-xl px-4 py-3 mb-4"
              style={{
                backgroundColor: colors.bg.secondary,
                color: colors.text.primary,
                borderWidth: 1,
                borderColor: colors.border.light,
                minHeight: 90,
                textAlignVertical: 'top',
              }}
              multiline
              numberOfLines={3}
            />

            <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold mb-2">
              Internal Note
            </Text>
            <TextInput
              value={refundRequestNote}
              onChangeText={setRefundRequestNote}
              placeholder="Optional note for finance reviewers"
              placeholderTextColor={colors.text.muted}
              className="rounded-xl px-4 py-3 mb-4"
              style={{
                backgroundColor: colors.bg.secondary,
                color: colors.text.primary,
                borderWidth: 1,
                borderColor: colors.border.light,
                minHeight: 80,
                textAlignVertical: 'top',
              }}
              multiline
              numberOfLines={3}
            />

            {refundRequestError ? (
              <Text style={{ color: '#EF4444' }} className="text-xs mb-3">
                {refundRequestError}
              </Text>
            ) : null}

            <View className="flex-row gap-3">
              <Pressable
                onPress={closeRefundRequestModal}
                className="flex-1 py-4 rounded-full active:opacity-80"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.secondary }} className="text-center font-semibold">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { void handleSubmitRefundRequestFromCase(); }}
                disabled={isSubmittingRefundRequest}
                className="flex-1 py-4 rounded-full active:opacity-80"
                style={{ backgroundColor: isSubmittingRefundRequest ? colors.bg.secondary : (isDark ? '#FFFFFF' : '#111111') }}
              >
                <Text
                  className="text-center font-semibold"
                  style={{ color: isSubmittingRefundRequest ? colors.text.muted : (isDark ? '#111111' : '#FFFFFF') }}
                >
                  {isSubmittingRefundRequest ? 'Submitting...' : 'Submit'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setShowDeleteModal(false)}
        >
          <View
            className="w-80 rounded-xl p-5"
            style={{ backgroundColor: colors.bg.card }}
          >
            <Text style={{ color: colors.text.primary }} className="text-lg font-bold mb-2 text-center">
              Delete Case?
            </Text>
            <Text style={{ color: colors.text.secondary }} className="text-center mb-6">
              This action cannot be undone. The case will be permanently deleted.
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setShowDeleteModal(false)}
                className="flex-1 py-4 rounded-full active:opacity-80"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.secondary }} className="text-center font-semibold">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDelete}
                className="flex-1 py-4 rounded-full active:opacity-80"
                style={{ backgroundColor: '#EF4444' }}
              >
                <Text className="text-white text-center font-semibold">Delete</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Add Note Modal */}
      <Modal visible={showNoteModal} transparent animationType="fade" onRequestClose={() => { setShowNoteModal(false); setNoteText(''); }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <Pressable
            className="absolute inset-0"
            onPress={() => {
              setShowNoteModal(false);
              setNoteText('');
            }}
          />
          <View
            className="w-full max-w-md rounded-[28px] p-6"
            style={{ backgroundColor: colors.bg.card }}
          >
            <Text style={{ color: colors.text.primary }} className="text-xl font-bold mb-5 tracking-tight">
              Add Internal Note
            </Text>
            <TextInput
              autoFocus
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Type your notes here..."
              placeholderTextColor={colors.text.muted}
              multiline
              numberOfLines={4}
              className="rounded-xl p-4 text-sm mb-5"
              style={{
                backgroundColor: colors.bg.secondary,
                color: colors.text.primary,
                borderWidth: 1,
                borderColor: colors.border.light,
                minHeight: 120,
                textAlignVertical: 'top',
              }}
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => {
                  setShowNoteModal(false);
                  setNoteText('');
                }}
                className="flex-1 py-4 rounded-full active:opacity-80"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.secondary }} className="text-center font-semibold">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleAddNote}
                className="flex-1 py-4 rounded-full active:opacity-80"
                style={{ backgroundColor: '#111111' }}
              >
                <Text className="text-white text-center font-semibold">
                  Post Note
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Resolution Modal */}
      <Modal visible={showResolutionModal} transparent animationType="fade" onRequestClose={() => {
        setShowResolutionModal(false);
        setShowResolutionTypeMenu(false);
        setResolutionType('No Action Required');
        setResolutionNotes('');
        setResolutionValue('');
      }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <Pressable
            className="absolute inset-0"
            onPress={() => {
              setShowResolutionModal(false);
              setShowResolutionTypeMenu(false);
              setResolutionType('No Action Required');
              setResolutionNotes('');
              setResolutionValue('');
            }}
          />
          <View
            className="w-full max-w-md rounded-[28px] p-6"
            style={{ backgroundColor: colors.bg.card }}
          >
            <View className="flex-row items-center gap-2 mb-5">
              <Check size={20} color="#10B981" strokeWidth={2} />
              <Text style={{ color: colors.text.primary }} className="text-xl font-semibold tracking-tight">
                Add Resolution
              </Text>
            </View>

            {/* Resolution Type */}
            <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold mb-2">
              Resolution Type
            </Text>
            <View style={{ marginBottom: 16 }}
            >
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowResolutionTypeMenu((current) => !current);
                }}
                className="flex-row items-center justify-between py-3 px-4 rounded-xl active:opacity-80"
                style={{
                  backgroundColor: colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: showResolutionTypeMenu ? colors.accent.primary : colors.border.light,
                }}
              >
                <Text style={{ color: colors.text.primary }} className="text-sm font-medium">
                  {resolutionType}
                </Text>
                <ChevronDown size={18} color={colors.text.muted} strokeWidth={1.8} />
              </Pressable>

              {showResolutionTypeMenu ? (
                <View
                  className="mt-2 rounded-xl overflow-hidden"
                  style={{
                    backgroundColor: colors.bg.secondary,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                  }}
                >
                  {resolutionTypeOptions.map((type) => {
                    const isSelected = resolutionType === type;
                    return (
                      <Pressable
                        key={type}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setResolutionType(type);
                          setShowResolutionTypeMenu(false);
                        }}
                        className="flex-row items-center justify-between px-4 py-3 active:opacity-80"
                        style={{
                          backgroundColor: isSelected ? (isDark ? colors.bg.card : '#F9FAFB') : colors.bg.secondary,
                        }}
                      >
                        <Text
                          style={{ color: isSelected ? colors.text.primary : colors.text.secondary }}
                          className="text-sm font-medium"
                        >
                          {type}
                        </Text>
                        {isSelected ? <Check size={16} color={colors.accent.primary} strokeWidth={2.2} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            {/* Resolution Value (for refunds/credits) */}
            {(resolutionType === 'Refund Issued' || resolutionType === 'Credit Applied') && (
              <View className="mb-4">
                <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold mb-2">
                  Resolution Value
                </Text>
                <TextInput
                  value={resolutionValue}
                  onChangeText={setResolutionValue}
                  placeholder="0"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  className="py-3 px-4 rounded-xl"
                  style={{
                    backgroundColor: colors.bg.secondary,
                    color: colors.text.primary,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                  }}
                />
              </View>
            )}

            {/* Resolution Notes */}
            <Text style={{ color: colors.text.muted }} className="text-xs uppercase font-semibold mb-2">
              Resolution Notes
            </Text>
            <TextInput
              value={resolutionNotes}
              onChangeText={setResolutionNotes}
              placeholder="How was this case resolved..."
              placeholderTextColor={colors.text.muted}
              multiline
              numberOfLines={3}
              className="rounded-xl p-4 text-sm mb-5"
              style={{
                backgroundColor: colors.bg.secondary,
                color: colors.text.primary,
                borderWidth: 1,
                borderColor: colors.border.light,
                minHeight: 100,
                textAlignVertical: 'top',
              }}
            />

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => {
                  setShowResolutionModal(false);
                  setShowResolutionTypeMenu(false);
                  setResolutionType('No Action Required');
                  setResolutionNotes('');
                  setResolutionValue('');
                }}
                className="flex-1 py-4 rounded-full active:opacity-80"
                style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
              >
                <Text style={{ color: colors.text.secondary }} className="text-center font-semibold">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleAddResolution}
                className="flex-1 py-4 rounded-full active:opacity-80"
                style={{ backgroundColor: isDark ? '#FFFFFF' : '#111111' }}
              >
                <Text
                  className="text-center font-semibold"
                  style={{ color: isDark ? '#111111' : '#FFFFFF' }}
                >
                  Save Resolution
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Form */}
      <CaseForm
        visible={showEditForm}
        onClose={() => setShowEditForm(false)}
        onSave={handleSaveEdit}
        orderId={caseItem.orderId}
        orderNumber={caseItem.orderNumber}
        customerId={caseItem.customerId}
        customerName={caseItem.customerName}
        existingCase={caseItem}
        createdBy={userName || undefined}
      />
    </View>
  );
}

export default CaseDetailPanel;
