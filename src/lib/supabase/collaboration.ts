import { supabase } from '../supabase';
import { sendThreadNotification } from '@/hooks/useWebPushNotifications';
import { compressImage } from '@/lib/image-compression';
import { getTeamThreadDisplayNameFromEntityId, isTeamThreadEntityId } from '@/lib/team-threads';
import { storage } from '@/lib/storage';

export type CollaborationEntityType = 'order' | 'case' | 'task';
export type CollaborationNotificationEventType = 'mention' | 'reply';
const COLLABORATION_ATTACHMENTS_BUCKET = 'collaboration-attachments';
const FALLBACK_THREAD_SEEN_MARKERS_KEY_PREFIX = 'collaboration:fallback-thread-seen-markers';

export interface CollaborationThread {
  id: string;
  business_id: string;
  entity_type: CollaborationEntityType;
  entity_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_closed: boolean;
  closed_by?: string | null;
  closed_at?: string | null;
}

export interface CollaborationThreadSummary {
  thread: CollaborationThread;
  latestComment: Pick<CollaborationComment, 'id' | 'thread_id' | 'author_user_id' | 'body' | 'created_at'> | null;
}

export interface CollaborationComment {
  id: string;
  business_id: string;
  thread_id: string;
  parent_comment_id?: string | null;
  author_user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  edited_at?: string | null;
  attachments?: CollaborationAttachment[];
}

export interface CollaborationAttachment {
  id: string;
  business_id: string;
  comment_id: string;
  file_name: string;
  mime_type?: string | null;
  file_size: number;
  storage_path: string;
  created_at: string;
}

export interface CollaborationMention {
  id: string;
  business_id: string;
  comment_id: string;
  mentioned_user_id: string;
  created_at: string;
}

export interface CollaborationCommentReaction {
  id: string;
  business_id: string;
  comment_id: string;
  user_id: string;
  reaction: 'thumbs_up' | string;
  created_at: string;
}

export interface CollaborationNotification {
  id: string;
  business_id: string;
  user_id: string;
  actor_user_id?: string | null;
  thread_id?: string | null;
  comment_id?: string | null;
  event_type: CollaborationNotificationEventType;
  payload: Record<string, unknown>;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
  /** Joined from collaboration_threads when available */
  entity_type?: CollaborationEntityType | null;
  entity_id?: string | null;
  /** True when synthesized from comments as a fallback. */
  is_fallback?: boolean;
}

export interface CreateCollaborationCommentInput {
  businessId: string;
  threadId: string;
  body: string;
  parentCommentId?: string | null;
  mentionUserIds?: string[];
  attachments?: CreateCollaborationCommentAttachmentInput[];
}

export interface CreateCollaborationCommentAttachmentInput {
  fileName: string;
  mimeType?: string | null;
  fileSize: number;
  storagePath: string;
}

export interface UploadCollaborationAttachmentInput {
  businessId: string;
  threadId: string;
  uri: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
}

const toUniqueMentionIds = (ids?: string[]) => {
  if (!ids?.length) return [];
  const seen = new Set<string>();
  const unique: string[] = [];
  ids.forEach((rawValue) => {
    const value = rawValue.trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    unique.push(value);
  });
  return unique;
};

const normalizeUserId = (value: string) => value.trim().toLowerCase();

const listBusinessRecipientIds = async (businessId: string): Promise<string[]> => {
  const recipientIds = new Set<string>();

  const { data: teamMembers, error: teamMembersError } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('business_id', businessId);

  if (teamMembersError) {
    console.warn('Could not load team_members for thread notifications:', teamMembersError.message);
  } else {
    (teamMembers ?? []).forEach((member: { user_id: string }) => {
      if (member.user_id?.trim()) recipientIds.add(member.user_id.trim());
    });
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id')
    .eq('business_id', businessId);

  if (profilesError) {
    console.warn('Could not load profiles for thread notifications:', profilesError.message);
  } else {
    (profiles ?? []).forEach((profile: { id: string }) => {
      if (profile.id?.trim()) recipientIds.add(profile.id.trim());
    });
  }

  return Array.from(recipientIds);
};

const isMissingCreateCommentRpc = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;

  const code = 'code' in error && typeof error.code === 'string'
    ? error.code
    : '';
  const message = 'message' in error && typeof error.message === 'string'
    ? error.message
    : '';

  if (code === 'PGRST202') return true;
  if (!message) return false;

  const normalized = message.toLowerCase();
  return normalized.includes('create_collaboration_comment')
    && (normalized.includes('could not find') || normalized.includes('function'));
};

const sanitizeFileName = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 'attachment';
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_');
  return sanitized.slice(-120);
};

const isImageUpload = (fileName: string, mimeType?: string | null) => {
  const normalizedMimeType = (mimeType ?? '').toLowerCase();
  if (normalizedMimeType.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|heic|heif|gif|bmp)$/i.test(fileName);
};

const toJpegFileName = (fileName: string) => {
  if (/\.[a-z0-9]+$/i.test(fileName)) {
    return fileName.replace(/\.[a-z0-9]+$/i, '.jpg');
  }
  return `${fileName}.jpg`;
};

const getFallbackThreadSeenMarkersKey = (businessId: string, userId: string) => (
  `${FALLBACK_THREAD_SEEN_MARKERS_KEY_PREFIX}:${businessId}:${userId}`
);

const parseFallbackThreadSeenMarkers = (rawValue: string | null): Record<string, number> => {
  if (!rawValue) return {};
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const next: Record<string, number> = {};
    Object.entries(parsed).forEach(([threadId, value]) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return;
      next[threadId] = value;
    });
    return next;
  } catch {
    return {};
  }
};

const readFallbackThreadSeenMarkers = async (businessId: string, userId: string): Promise<Record<string, number>> => {
  const raw = await storage.getItem(getFallbackThreadSeenMarkersKey(businessId, userId));
  return parseFallbackThreadSeenMarkers(raw);
};

const writeFallbackThreadSeenMarkers = async (
  businessId: string,
  userId: string,
  markers: Record<string, number>
): Promise<void> => {
  await storage.setItem(getFallbackThreadSeenMarkersKey(businessId, userId), JSON.stringify(markers));
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (error: unknown) => (
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : String(error ?? '')
);

const isTransientNetworkError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('connection')
    || message.includes('load failed')
  );
};

const fetchThreadEntityRows = async (
  businessId: string,
  entityType: CollaborationEntityType
): Promise<Array<{ id: string; entity_id: string }>> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await supabase
        .from('collaboration_threads')
        .select('id, entity_id')
        .eq('business_id', businessId)
        .eq('entity_type', entityType);

      if (!error) return (data ?? []) as Array<{ id: string; entity_id: string }>;
      if (!isTransientNetworkError(error) || attempt === 1) {
        console.warn('Collaboration thread lookup failed:', error.message);
        return [];
      }
    } catch (error) {
      if (!isTransientNetworkError(error) || attempt === 1) {
        console.warn('Collaboration thread lookup failed:', getErrorMessage(error));
        return [];
      }
    }

    await wait(400);
  }

  return [];
};

const setFallbackThreadSeenAt = async (
  businessId: string,
  userId: string,
  threadId: string,
  seenAtMs: number
): Promise<void> => {
  if (!threadId || !Number.isFinite(seenAtMs) || seenAtMs <= 0) return;
  const markers = await readFallbackThreadSeenMarkers(businessId, userId);
  const normalizedSeenAt = Math.floor(seenAtMs);
  if ((markers[threadId] ?? 0) >= normalizedSeenAt) return;
  markers[threadId] = normalizedSeenAt;
  await writeFallbackThreadSeenMarkers(businessId, userId, markers);
};

const setFallbackSeenForAllThreads = async (
  businessId: string,
  userId: string,
  seenAtMs: number
): Promise<void> => {
  if (!Number.isFinite(seenAtMs) || seenAtMs <= 0) return;
  const { data: threads, error } = await supabase
    .from('collaboration_threads')
    .select('id')
    .eq('business_id', businessId);

  if (error || !threads?.length) {
    if (error) {
      console.warn('Failed to load threads for fallback seen markers:', error.message);
    }
    return;
  }

  const markers = await readFallbackThreadSeenMarkers(businessId, userId);
  const normalizedSeenAt = Math.floor(seenAtMs);
  threads.forEach((thread) => {
    const threadId = thread.id;
    if (!threadId) return;
    if ((markers[threadId] ?? 0) >= normalizedSeenAt) return;
    markers[threadId] = normalizedSeenAt;
  });
  await writeFallbackThreadSeenMarkers(businessId, userId, markers);
};

const getCurrentUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) {
    throw new Error('No authenticated user.');
  }
  return userId;
};

const getThreadByEntity = async (
  businessId: string,
  entityType: CollaborationEntityType,
  entityId: string
) => {
  const { data, error } = await supabase
    .from('collaboration_threads')
    .select('*')
    .eq('business_id', businessId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as CollaborationThread | null;
};

const getOrCreateThread = async (
  businessId: string,
  entityType: CollaborationEntityType,
  entityId: string
) => {
  const existing = await getThreadByEntity(businessId, entityType, entityId);
  if (existing) return existing;

  const currentUserId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('collaboration_threads')
    .insert({
      business_id: businessId,
      entity_type: entityType,
      entity_id: entityId,
      created_by: currentUserId,
    })
    .select('*')
    .single();

  if (!error) {
    return data as CollaborationThread;
  }

  // If another client created it first, fetch the existing row.
  if ((error as { code?: string }).code === '23505') {
    const fallback = await getThreadByEntity(businessId, entityType, entityId);
    if (fallback) return fallback;
  }
  throw error;
};

const listThreadsByEntityType = async (
  businessId: string,
  entityType: CollaborationEntityType
): Promise<CollaborationThreadSummary[]> => {
  const { data: threads, error: threadError } = await supabase
    .from('collaboration_threads')
    .select('*')
    .eq('business_id', businessId)
    .eq('entity_type', entityType)
    .order('updated_at', { ascending: false });

  if (threadError) throw threadError;
  const orderedThreads = (threads ?? []) as CollaborationThread[];
  if (orderedThreads.length === 0) return [];

  const threadIds = orderedThreads.map((thread) => thread.id);
  const { data: comments, error: commentError } = await supabase
    .from('collaboration_comments')
    .select('id, thread_id, author_user_id, body, created_at')
    .eq('business_id', businessId)
    .in('thread_id', threadIds)
    .order('created_at', { ascending: false });

  if (commentError) throw commentError;

  const latestCommentByThread = new Map<string, CollaborationThreadSummary['latestComment']>();
  (comments ?? []).forEach((row) => {
    const comment = row as CollaborationThreadSummary['latestComment'];
    if (!comment?.thread_id || latestCommentByThread.has(comment.thread_id)) return;
    latestCommentByThread.set(comment.thread_id, comment);
  });

  return orderedThreads.map((thread) => ({
    thread,
    latestComment: latestCommentByThread.get(thread.id) ?? null,
  }));
};

const listThreadComments = async (businessId: string, threadId: string) => {
  const { data, error } = await supabase
    .from('collaboration_comments')
    .select('*, collaboration_attachments(*)')
    .eq('business_id', businessId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  const rows = (data ?? []) as (CollaborationComment & { collaboration_attachments?: CollaborationAttachment[] })[];
  return rows.map((row) => ({
    ...row,
    attachments: (row.collaboration_attachments ?? [])
      .slice()
      .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()),
  }));
};

const listCommentMentions = async (businessId: string, commentId: string) => {
  const { data, error } = await supabase
    .from('collaboration_mentions')
    .select('*')
    .eq('business_id', businessId)
    .eq('comment_id', commentId);

  if (error) throw error;
  return (data ?? []) as CollaborationMention[];
};

const createComment = async ({
  businessId,
  threadId,
  body,
  parentCommentId,
  mentionUserIds,
  attachments,
}: CreateCollaborationCommentInput) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user.');

  const currentUserId = user.id;
  const authorName = user.user_metadata?.name || 'Team Member';
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    throw new Error('Comment cannot be empty.');
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc('create_collaboration_comment', {
    p_business_id: businessId,
    p_thread_id: threadId,
    p_parent_comment_id: parentCommentId ?? null,
    p_author_user_id: currentUserId,
    p_body: trimmedBody,
  });

  let comment: CollaborationComment;
  if (rpcError) {
    if (!isMissingCreateCommentRpc(rpcError)) {
      throw rpcError;
    }

    console.warn('create_collaboration_comment RPC missing. Falling back to direct insert.', rpcError);
    const { data: insertedComment, error: insertError } = await supabase
      .from('collaboration_comments')
      .insert({
        business_id: businessId,
        thread_id: threadId,
        parent_comment_id: parentCommentId ?? null,
        author_user_id: currentUserId,
        body: trimmedBody,
      })
      .select('*')
      .single();

    if (insertError) throw insertError;
    comment = insertedComment as CollaborationComment;
  } else {
    const rpcComment = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    comment = (rpcComment as CollaborationComment) ?? {
      id: crypto.randomUUID(),
      business_id: businessId,
      thread_id: threadId,
      parent_comment_id: parentCommentId ?? null,
      author_user_id: currentUserId,
      body: trimmedBody,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  const uniqueMentions = toUniqueMentionIds(mentionUserIds);
  const currentUserIdNormalized = normalizeUserId(currentUserId);
  const uniqueMentionsWithoutAuthor = uniqueMentions.filter(
    (userId) => normalizeUserId(userId) !== currentUserIdNormalized
  );

  if (uniqueMentionsWithoutAuthor.length > 0) {
    const mentionRows = uniqueMentionsWithoutAuthor.map((mentionedUserId) => ({
      business_id: businessId,
      comment_id: comment.id,
      mentioned_user_id: mentionedUserId,
    }));

    const { error: mentionInsertError } = await supabase
      .from('collaboration_mentions')
      .upsert(mentionRows, {
        onConflict: 'comment_id,mentioned_user_id',
        ignoreDuplicates: true,
      });

    if (mentionInsertError) {
      // Mention persistence should not block comment posting or push fallback.
      console.warn('Could not persist collaboration mentions from explicit ids:', mentionInsertError.message);
    }
  }

  // Mention rows also come from DB trigger `insert_collaboration_mentions_from_comment`.
  // Look up thread entity info and participants for push notifications
  void (async () => {
    try {
      // Get thread entity info
      const { data: threadRow } = await supabase
        .from('collaboration_threads')
        .select('entity_type, entity_id, created_by')
        .eq('id', threadId)
        .maybeSingle();

      const entityType = threadRow?.entity_type ?? null;
      const entityId = threadRow?.entity_id ?? null;

      // Build entity display name
      let entityDisplayName: string | null = null;
      if (entityType === 'order' && entityId) {
        const { default: useFyllStore } = await import('@/lib/state/fyll-store');
        const orderNum = useFyllStore.getState().orders.find((o) => o.id === entityId)?.orderNumber;
        entityDisplayName = orderNum ? `Order #${orderNum}` : 'an order';
      } else if (entityType === 'case' && entityId) {
        if (isTeamThreadEntityId(entityId)) {
          entityDisplayName = getTeamThreadDisplayNameFromEntityId(entityId);
        } else {
          const { default: useFyllStore } = await import('@/lib/state/fyll-store');
          const caseItem = useFyllStore.getState().cases.find((item) => item.id === entityId);
          if (caseItem?.caseNumber?.trim()) {
            entityDisplayName = `Case #${caseItem.caseNumber.trim()}`;
          } else if (caseItem?.issueSummary?.trim()) {
            entityDisplayName = `Case: ${caseItem.issueSummary.trim()}`;
          }
        }
      } else if (entityType === 'task' && entityId) {
        const { data: taskRow } = await supabase
          .from('tasks')
          .select('title')
          .eq('id', entityId)
          .maybeSingle();

        entityDisplayName = taskRow?.title?.trim() ? `Task: ${taskRow.title.trim()}` : 'a task';
      }

      // Collect all recipients from both membership sources so legacy/misaligned
      // rows do not silently drop push notifications.
      const recipientSet = new Set<string>(uniqueMentionsWithoutAuthor);
      const businessRecipientIds = await listBusinessRecipientIds(businessId);
      businessRecipientIds.forEach((recipientUserId) => recipientSet.add(recipientUserId));

      // Also add thread creator as fallback
      if (threadRow?.created_by) recipientSet.add(threadRow.created_by);

      const recipients = Array.from(recipientSet).filter(
        (id) => Boolean(id) && normalizeUserId(id) !== currentUserIdNormalized
      );
      if (recipients.length === 0) return;

      const hasEveryoneMention = /(?:^|\s)@everyone\b/i.test(trimmedBody);
      const hasMention = uniqueMentionsWithoutAuthor.length > 0;

      // Send a single notification to all recipients — one call prevents duplicate
      // pushes when a user has multiple subscriptions registered (e.g. stale workers).
      if (recipients.length > 0) {
        void sendThreadNotification({
          businessId,
          recipientUserIds: recipients,
          senderUserId: currentUserId,
          authorName,
          body: trimmedBody,
          entityType,
          entityDisplayName,
          entityId,
          threadId,
          commentId: comment.id,
          isMention: hasMention,
          isEveryoneMention: hasEveryoneMention,
        });
      }
    } catch (notifError) {
      console.warn('Thread push notification failed:', notifError);
    }
  })();

  if (attachments?.length) {
    const attachmentRows = attachments.map((attachment) => ({
      business_id: businessId,
      comment_id: comment.id,
      file_name: attachment.fileName,
      mime_type: attachment.mimeType ?? null,
      file_size: attachment.fileSize,
      storage_path: attachment.storagePath,
    }));

    const { error: attachmentError } = await supabase
      .from('collaboration_attachments')
      .insert(attachmentRows);

    if (attachmentError) throw attachmentError;

    comment.attachments = attachmentRows.map((row, index) => ({
      id: `local-${comment.id}-${index}`,
      business_id: row.business_id,
      comment_id: row.comment_id,
      file_name: row.file_name,
      mime_type: row.mime_type,
      file_size: row.file_size,
      storage_path: row.storage_path,
      created_at: comment.created_at,
    }));
  }

  return comment;
};

const uploadAttachment = async ({
  businessId,
  threadId,
  uri,
  fileName,
  mimeType,
  fileSize,
}: UploadCollaborationAttachmentInput): Promise<CreateCollaborationCommentAttachmentInput> => {
  const currentUserId = await getCurrentUserId();
  let uploadUri = uri;
  let uploadMimeType = mimeType ?? null;
  let safeFileName = sanitizeFileName(fileName);

  if (isImageUpload(safeFileName, uploadMimeType)) {
    try {
      uploadUri = await compressImage(uri, { maxDimension: 1600, quality: 0.72 });
      uploadMimeType = 'image/jpeg';
      safeFileName = sanitizeFileName(toJpegFileName(safeFileName));
    } catch (compressionError) {
      console.warn('Collaboration upload image compression failed:', compressionError);
    }
  }

  const uniqueKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `${businessId}/${threadId}/${currentUserId}/${uniqueKey}-${safeFileName}`;

  const response = await fetch(uploadUri);
  if (!response.ok) {
    throw new Error('Could not read attachment file.');
  }

  const blob = await response.blob();
  const resolvedMimeType = uploadMimeType ?? blob.type ?? null;
  const resolvedFileSize = typeof fileSize === 'number' && fileSize >= 0 ? fileSize : blob.size;

  const { error } = await supabase
    .storage
    .from(COLLABORATION_ATTACHMENTS_BUCKET)
    .upload(storagePath, blob, {
      upsert: false,
      contentType: resolvedMimeType ?? undefined,
    });

  if (error) throw error;

  return {
    fileName: safeFileName,
    mimeType: resolvedMimeType,
    fileSize: resolvedFileSize,
    storagePath,
  };
};

const getAttachmentSignedUrl = async (storagePath: string, expiresInSeconds = 300) => {
  const { data, error } = await supabase
    .storage
    .from(COLLABORATION_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) throw error;
  const signedUrl = data?.signedUrl;
  if (!signedUrl) {
    throw new Error('Could not create signed URL for attachment.');
  }
  return signedUrl;
};

const updateComment = async (commentId: string, body: string): Promise<void> => {
  const trimmedBody = body.trim();
  if (!trimmedBody) throw new Error('Comment cannot be empty.');
  const { error } = await supabase
    .from('collaboration_comments')
    .update({ body: trimmedBody, edited_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) throw error;
};

const deleteComment = async (commentId: string): Promise<void> => {
  const { error } = await supabase
    .from('collaboration_comments')
    .delete()
    .eq('id', commentId);
  if (error) throw error;
};

const closeThread = async (threadId: string): Promise<void> => {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from('collaboration_threads')
    .update({ is_closed: true, closed_by: userId, closed_at: new Date().toISOString() })
    .eq('id', threadId);
  if (error) throw error;
};

const reopenThread = async (threadId: string): Promise<void> => {
  const { error } = await supabase
    .from('collaboration_threads')
    .update({ is_closed: false, closed_by: null, closed_at: null })
    .eq('id', threadId);
  if (error) throw error;
};

const deleteThread = async (threadId: string) => {
  const { error } = await supabase
    .from('collaboration_threads')
    .delete()
    .eq('id', threadId);

  if (error) throw error;
};

const listMyNotifications = async (businessId: string, options?: { unreadOnly?: boolean; limit?: number }) => {
  const unreadOnly = options?.unreadOnly ?? false;
  const limit = options?.limit ?? 50;

  const hasAnyStoredNotifications = async () => {
    const { data, error } = await supabase
      .from('collaboration_notifications')
      .select('id')
      .eq('business_id', businessId)
      .limit(1);

    if (error) return false;
    return (data ?? []).length > 0;
  };

  const fallbackFromComments = async (
    entityType?: CollaborationEntityType,
    maxRecords: number = limit
  ): Promise<CollaborationNotification[]> => {
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData.user?.id ?? '';
    if (!currentUserId) return [];
    const fallbackSeenMarkers = await readFallbackThreadSeenMarkers(businessId, currentUserId);

    let threadsQuery = supabase
      .from('collaboration_threads')
      .select('id, entity_type, entity_id')
      .eq('business_id', businessId);

    if (entityType) {
      threadsQuery = threadsQuery.eq('entity_type', entityType);
    }

    const { data: threads, error: threadError } = await threadsQuery;

    if (threadError || !threads?.length) {
      if (threadError) {
        console.warn('Fallback notification threads query failed:', threadError.message);
      }
      return [];
    }

    const threadEntityMap = new Map<string, { entity_type: CollaborationEntityType; entity_id: string }>();
    threads.forEach((thread) => {
      threadEntityMap.set(thread.id, { entity_type: thread.entity_type, entity_id: thread.entity_id });
    });

    const threadIds = threads.map((thread) => thread.id);
    const latestNotificationByThread = new Map<string, number>();

    const { data: threadNotifications, error: threadNotificationsError } = await supabase
      .from('collaboration_notifications')
      .select('thread_id, created_at')
      .eq('business_id', businessId)
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false })
      .limit(Math.max(1000, maxRecords * 8));

    if (threadNotificationsError) {
      console.warn('Fallback latest notification query failed:', threadNotificationsError.message);
    } else {
      (threadNotifications ?? []).forEach((row) => {
        if (!row.thread_id || latestNotificationByThread.has(row.thread_id)) return;
        const createdAtMs = new Date(row.created_at).getTime();
        if (!Number.isFinite(createdAtMs)) return;
        latestNotificationByThread.set(row.thread_id, createdAtMs);
      });
    }

    let commentsQuery = supabase
      .from('collaboration_comments')
      .select('id, thread_id, author_user_id, body, created_at, parent_comment_id')
      .eq('business_id', businessId)
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false })
      .limit(Math.max(1000, maxRecords * 8));

    if (currentUserId) {
      commentsQuery = commentsQuery.neq('author_user_id', currentUserId);
    }

    const { data: comments, error: commentError } = await commentsQuery;
    if (commentError || !comments?.length) {
      if (commentError) {
        console.warn('Fallback notification comments query failed:', commentError.message);
      }
      return [];
    }

    const filteredComments = comments.filter((comment) => {
      if (!comment.thread_id) return false;
      const commentMs = new Date(comment.created_at).getTime();
      if (!Number.isFinite(commentMs)) return false;
      const latestNotificationMs = latestNotificationByThread.get(comment.thread_id) ?? 0;
      const latestSeenMs = fallbackSeenMarkers[comment.thread_id] ?? 0;
      return commentMs > Math.max(latestNotificationMs, latestSeenMs);
    });

    return filteredComments.slice(0, maxRecords).map((comment) => {
      const threadEntity = threadEntityMap.get(comment.thread_id);
      return {
        id: `fallback-comment-${comment.id}`,
        business_id: businessId,
        user_id: currentUserId,
        actor_user_id: comment.author_user_id,
        thread_id: comment.thread_id,
        comment_id: comment.id,
        event_type: 'reply',
        payload: {
          body: comment.body,
          entityType: threadEntity?.entity_type ?? null,
          entityId: threadEntity?.entity_id ?? null,
          isFallback: true,
        },
        is_read: false,
        read_at: null,
        created_at: comment.created_at,
        entity_type: threadEntity?.entity_type ?? null,
        entity_id: threadEntity?.entity_id ?? null,
        is_fallback: true,
      } as CollaborationNotification;
    });
  };

  let query = supabase
    .from('collaboration_notifications')
    .select('*, collaboration_threads(entity_type, entity_id)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;
  if (error) {
    // Fallback without join if the FK doesn't exist
    let fallbackQuery = supabase
      .from('collaboration_notifications')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (unreadOnly) {
      fallbackQuery = fallbackQuery.eq('is_read', false);
    }
    const { data: fallbackData, error: fallbackError } = await fallbackQuery;
    if (fallbackError) {
      console.warn('Notifications query failed, using comments fallback:', fallbackError.message);
      return fallbackFromComments(undefined, limit);
    }

    const baseRows = (fallbackData ?? []) as CollaborationNotification[];
    const fallbackRows = await fallbackFromComments(undefined, limit);
    const merged = [...baseRows, ...fallbackRows]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .filter((row, index, arr) => arr.findIndex((candidate) => candidate.id === row.id) === index)
      .slice(0, limit);

    if (merged.length > 0) return merged;

    const hasStoredRows = await hasAnyStoredNotifications();
    if (hasStoredRows) return [];
    return fallbackFromComments(undefined, limit);
  }

  // Map joined thread data onto notification objects
  const mapped = (data ?? []).map((row: any) => {
    const thread = row.collaboration_threads;
    return {
      ...row,
      collaboration_threads: undefined,
      entity_type: thread?.entity_type ?? null,
      entity_id: thread?.entity_id ?? null,
    } as CollaborationNotification;
  });
  const fallbackRows = await fallbackFromComments(undefined, limit);
  const merged = [...mapped, ...fallbackRows]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .filter((row, index, arr) => arr.findIndex((candidate) => candidate.id === row.id) === index)
    .slice(0, limit);

  if (merged.length > 0) return merged;

  const hasStoredRows = await hasAnyStoredNotifications();
  if (hasStoredRows) return [];
  return fallbackFromComments(undefined, limit);
};

const markNotificationAsRead = async (notificationId: string) => {
  if (notificationId.startsWith('fallback-comment-')) {
    const fallbackCommentId = notificationId.replace(/^fallback-comment-/, '').trim();
    if (!fallbackCommentId) return;

    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData.user?.id ?? '';
    if (!currentUserId) return;

    const { data: commentRow, error } = await supabase
      .from('collaboration_comments')
      .select('business_id, thread_id, created_at')
      .eq('id', fallbackCommentId)
      .maybeSingle();

    if (error || !commentRow?.business_id || !commentRow.thread_id) {
      if (error) {
        console.warn('Fallback notification read marker lookup failed:', error.message);
      }
      return;
    }

    const createdAtMs = new Date(commentRow.created_at).getTime();
    await setFallbackThreadSeenAt(
      commentRow.business_id,
      currentUserId,
      commentRow.thread_id,
      Number.isFinite(createdAtMs) ? createdAtMs : Date.now()
    );
    return;
  }

  const { error } = await supabase
    .from('collaboration_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId);

  if (error) throw error;
};

const markAllNotificationsAsRead = async (businessId: string) => {
  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData.user?.id ?? '';
  const seenAtMs = Date.now();

  const { error } = await supabase
    .from('collaboration_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('business_id', businessId)
    .eq('is_read', false);

  if (error) throw error;

  if (currentUserId) {
    await setFallbackSeenForAllThreads(businessId, currentUserId, seenAtMs);
  }
};

const markThreadAsSeen = async (businessId: string, threadId: string): Promise<void> => {
  if (!businessId || !threadId) return;

  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData.user?.id ?? '';
  const seenAtIso = new Date().toISOString();
  const seenAtMs = new Date(seenAtIso).getTime();

  const { error } = await supabase
    .from('collaboration_notifications')
    .update({
      is_read: true,
      read_at: seenAtIso,
    })
    .eq('business_id', businessId)
    .eq('thread_id', threadId)
    .eq('is_read', false);

  if (error) {
    console.warn('Failed to mark thread notifications as read:', error.message);
  }

  if (currentUserId) {
    await setFallbackThreadSeenAt(businessId, currentUserId, threadId, seenAtMs);
  }
};

/** Returns a map of entity_id (order/case id) → total comment count */
const getThreadCommentCountsByEntity = async (
  businessId: string,
  entityType: CollaborationEntityType
): Promise<Record<string, number>> => {
  // 1. Get all threads for this entity type
  const threads = await fetchThreadEntityRows(businessId, entityType);

  if (!threads.length) return {};

  const threadIdToEntityId = new Map<string, string>();
  threads.forEach((t) => threadIdToEntityId.set(t.id, t.entity_id));

  // 2. Get all comments in these threads
  const { data: comments, error: commentError } = await supabase
    .from('collaboration_comments')
    .select('thread_id')
    .eq('business_id', businessId)
    .in('thread_id', threads.map((t) => t.id));

  if (commentError || !comments?.length) return {};

  // 3. Build entity_id → count map
  const counts: Record<string, number> = {};
  comments.forEach((c) => {
    const entityId = c.thread_id ? threadIdToEntityId.get(c.thread_id) : undefined;
    if (entityId) {
      counts[entityId] = (counts[entityId] ?? 0) + 1;
    }
  });

  return counts;
};

/** Returns a map of entity_id → unread notification count for the current user */
const getUnreadNotificationCountsByEntity = async (
  businessId: string,
  entityType: CollaborationEntityType
): Promise<Record<string, number>> => {
  // 1. Get threads for this entity type to map thread_id → entity_id
  const threads = await fetchThreadEntityRows(businessId, entityType);

  if (!threads.length) return {};

  const threadIdToEntityId = new Map<string, string>();
  threads.forEach((t) => threadIdToEntityId.set(t.id, t.entity_id));

  const getFallbackCountsFromComments = async (): Promise<Record<string, number>> => {
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData.user?.id ?? '';
    if (!currentUserId) return {};
    const fallbackSeenMarkers = await readFallbackThreadSeenMarkers(businessId, currentUserId);

    const threadIds = threads.map((thread) => thread.id);
    if (threadIds.length === 0) return {};

    const latestNotificationByThread = new Map<string, number>();
    const { data: latestNotifications, error: latestNotificationsError } = await supabase
      .from('collaboration_notifications')
      .select('thread_id, created_at')
      .eq('business_id', businessId)
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false })
      .limit(4000);

    if (latestNotificationsError) {
      console.warn('Fallback latest notification query failed for thread counts:', latestNotificationsError.message);
    } else {
      (latestNotifications ?? []).forEach((row) => {
        if (!row.thread_id || latestNotificationByThread.has(row.thread_id)) return;
        const createdAtMs = new Date(row.created_at).getTime();
        if (!Number.isFinite(createdAtMs)) return;
        latestNotificationByThread.set(row.thread_id, createdAtMs);
      });
    }

    const { data: comments, error: commentsError } = await supabase
      .from('collaboration_comments')
      .select('thread_id, created_at')
      .eq('business_id', businessId)
      .in('thread_id', threadIds)
      .neq('author_user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(4000);

    if (commentsError || !comments?.length) {
      if (commentsError) {
        console.warn('Fallback comments query failed for thread counts:', commentsError.message);
      }
      return {};
    }

    const counts: Record<string, number> = {};
    comments.forEach((comment) => {
      if (!comment.thread_id) return;
      const createdAtMs = new Date(comment.created_at).getTime();
      if (!Number.isFinite(createdAtMs)) return;
      const latestNotificationMs = latestNotificationByThread.get(comment.thread_id) ?? 0;
      const latestSeenMs = fallbackSeenMarkers[comment.thread_id] ?? 0;
      if (createdAtMs <= Math.max(latestNotificationMs, latestSeenMs)) return;

      const entityId = threadIdToEntityId.get(comment.thread_id);
      if (!entityId) return;
      counts[entityId] = (counts[entityId] ?? 0) + 1;
    });

    return counts;
  };

  // 2. Get unread notifications for these threads
  const { data: notifications, error: notifError } = await supabase
    .from('collaboration_notifications')
    .select('thread_id')
    .eq('business_id', businessId)
    .eq('is_read', false)
    .in('thread_id', threads.map((t) => t.id));

  if (notifError) {
    console.warn('Unread notification count query failed, falling back to comment counts:', notifError.message);
    return getFallbackCountsFromComments();
  }

  if (!notifications?.length) {
    const { data: hasAnyNotifications, error: hasAnyError } = await supabase
      .from('collaboration_notifications')
      .select('id')
      .eq('business_id', businessId)
      .limit(1);

    if (hasAnyError) {
      console.warn('Notification existence check failed, falling back to comment counts:', hasAnyError.message);
      return getFallbackCountsFromComments();
    }

    if ((hasAnyNotifications ?? []).length === 0) {
      return getFallbackCountsFromComments();
    }
    return getFallbackCountsFromComments();
  }

  // 3. Build entity_id → count map
  const counts: Record<string, number> = {};
  notifications.forEach((n) => {
    const entityId = n.thread_id ? threadIdToEntityId.get(n.thread_id) : undefined;
    if (entityId) {
      counts[entityId] = (counts[entityId] ?? 0) + 1;
    }
  });

  const fallbackCounts = await getFallbackCountsFromComments();
  Object.entries(fallbackCounts).forEach(([entityId, count]) => {
    counts[entityId] = Math.max(counts[entityId] ?? 0, count);
  });

  return counts;
};

const fetchProfilesForBusiness = async (businessId: string) => {
  // Try profiles table first
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .eq('business_id', businessId);

  if (!error && data && data.length > 0) {
    return data as { id: string; name: string; email: string; role: string }[];
  }

  if (error) {
    console.warn('Profiles query failed, trying team_members fallback:', error.message);
  }

  // Fallback: try team_members table (has broader RLS for same-business reads)
  const { data: teamData, error: teamError } = await supabase
    .from('team_members')
    .select('user_id, name, email, role')
    .eq('business_id', businessId);

  if (teamError) {
    console.warn('Team members fallback also failed:', teamError.message);
    return [];
  }

  return (teamData ?? []).map((row) => ({
    id: row.user_id ?? '',
    name: row.name ?? '',
    email: row.email ?? '',
    role: row.role ?? 'staff',
  })).filter((p) => Boolean(p.id));
};

// ── Comment Reactions (thread-wide, per-user) ──

const listCommentReactions = async (
  businessId: string,
  commentIds: string[],
): Promise<CollaborationCommentReaction[]> => {
  const uniqueCommentIds = Array.from(new Set(commentIds.filter(Boolean)));
  if (uniqueCommentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('collaboration_comment_reactions')
    .select('id, business_id, comment_id, user_id, reaction, created_at')
    .eq('business_id', businessId)
    .in('comment_id', uniqueCommentIds);

  if (error) {
    console.warn('Failed to fetch comment reactions:', error.message);
    return [];
  }

  return (data ?? []) as CollaborationCommentReaction[];
};

const addCommentReaction = async (
  businessId: string,
  commentId: string,
  reaction: 'thumbs_up' = 'thumbs_up',
): Promise<void> => {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from('collaboration_comment_reactions')
    .insert({
      business_id: businessId,
      comment_id: commentId,
      user_id: userId,
      reaction,
    });

  if (error && (error as { code?: string }).code !== '23505') throw error;
};

const removeCommentReaction = async (
  businessId: string,
  commentId: string,
  reaction: 'thumbs_up' = 'thumbs_up',
): Promise<void> => {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from('collaboration_comment_reactions')
    .delete()
    .eq('business_id', businessId)
    .eq('comment_id', commentId)
    .eq('user_id', userId)
    .eq('reaction', reaction);

  if (error) throw error;
};

// ── Pinned Messages (thread-wide) ──

const listPinnedMessages = async (businessId: string, threadId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('collaboration_pinned_messages')
    .select('comment_id')
    .eq('business_id', businessId)
    .eq('thread_id', threadId);

  if (error) {
    console.warn('Failed to fetch pinned messages:', error.message);
    return [];
  }
  return (data ?? []).map((row) => row.comment_id as string);
};

const pinMessage = async (businessId: string, threadId: string, commentId: string): Promise<void> => {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from('collaboration_pinned_messages')
    .insert({ business_id: businessId, thread_id: threadId, comment_id: commentId, pinned_by: userId });

  if (error && (error as { code?: string }).code !== '23505') throw error;
};

const unpinMessage = async (businessId: string, threadId: string, commentId: string): Promise<void> => {
  const { error } = await supabase
    .from('collaboration_pinned_messages')
    .delete()
    .eq('thread_id', threadId)
    .eq('comment_id', commentId);

  if (error) throw error;
};

// ── Saved Messages (per-user) ──

const listSavedMessages = async (businessId: string, threadId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('collaboration_saved_messages')
    .select('comment_id')
    .eq('business_id', businessId)
    .eq('thread_id', threadId);

  if (error) {
    console.warn('Failed to fetch saved messages:', error.message);
    return [];
  }
  return (data ?? []).map((row) => row.comment_id as string);
};

const saveMessage = async (businessId: string, threadId: string, commentId: string): Promise<void> => {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from('collaboration_saved_messages')
    .insert({ business_id: businessId, thread_id: threadId, comment_id: commentId, user_id: userId });

  if (error && (error as { code?: string }).code !== '23505') throw error;
};

const unsaveMessage = async (businessId: string, threadId: string, commentId: string): Promise<void> => {
  const { error } = await supabase
    .from('collaboration_saved_messages')
    .delete()
    .eq('comment_id', commentId);

  if (error) throw error;
};

export const collaborationData = {
  getThreadByEntity,
  getOrCreateThread,
  listThreadsByEntityType,
  listThreadComments,
  listCommentMentions,
  createComment,
  updateComment,
  deleteComment,
  closeThread,
  reopenThread,
  uploadAttachment,
  getAttachmentSignedUrl,
  deleteThread,
  listMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  markThreadAsSeen,
  fetchProfilesForBusiness,
  getThreadCommentCountsByEntity,
  getUnreadNotificationCountsByEntity,
  listCommentReactions,
  addCommentReaction,
  removeCommentReaction,
  listPinnedMessages,
  pinMessage,
  unpinMessage,
  listSavedMessages,
  saveMessage,
  unsaveMessage,
};
