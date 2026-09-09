import { useEffect, useState } from 'react';
import { getSignedAttachmentUrl } from '@/lib/storage-attachments';

const DIRECT_ATTACHMENT_PATTERN = /^(https?:|file:|blob:|data:)/i;
const ATTACHMENT_URL_TTL_MS = 9 * 60 * 1000;

type AttachmentUrlCacheEntry = {
  url: string;
  expiresAt: number;
};

const attachmentUrlCache = new Map<string, AttachmentUrlCacheEntry>();

const getCachedAttachmentUrl = (pathOrUrl: string) => {
  const cached = attachmentUrlCache.get(pathOrUrl);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    attachmentUrlCache.delete(pathOrUrl);
    return null;
  }
  return cached.url;
};

export const useResolvedAttachmentUrl = (pathOrUrl?: string | null) => {
  const normalizedPath = pathOrUrl?.trim() ?? '';
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(() => {
    if (!normalizedPath) return undefined;
    if (DIRECT_ATTACHMENT_PATTERN.test(normalizedPath)) return normalizedPath;
    return getCachedAttachmentUrl(normalizedPath) ?? undefined;
  });

  useEffect(() => {
    if (!normalizedPath) {
      setResolvedUrl(undefined);
      return;
    }

    if (DIRECT_ATTACHMENT_PATTERN.test(normalizedPath)) {
      setResolvedUrl(normalizedPath);
      return;
    }

    const cachedUrl = getCachedAttachmentUrl(normalizedPath);
    if (cachedUrl) {
      setResolvedUrl(cachedUrl);
      return;
    }

    let active = true;
    setResolvedUrl(undefined);

    getSignedAttachmentUrl(normalizedPath)
      .then((signedUrl) => {
        if (!active) return;
        attachmentUrlCache.set(normalizedPath, {
          url: signedUrl,
          expiresAt: Date.now() + ATTACHMENT_URL_TTL_MS,
        });
        setResolvedUrl(signedUrl);
      })
      .catch((error) => {
        console.warn('Attachment URL resolve failed:', error);
        if (active) {
          setResolvedUrl(undefined);
        }
      });

    return () => {
      active = false;
    };
  }, [normalizedPath]);

  return resolvedUrl;
};
