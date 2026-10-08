import { Linking, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image-compression';

export const COLLABORATION_ATTACHMENTS_BUCKET = 'collaboration-attachments';
export const BUSINESS_ASSETS_BUCKET = 'business-assets';
export const SOCIAL_CHECKOUT_PROOFS_BUCKET = 'social-checkout-proofs';

type UploadBusinessAttachmentInput = {
  businessId: string;
  folder: string;
  uri: string;
  fileName: string;
  mimeType?: string | null;
  compressImages?: boolean;
};

type UploadedBusinessAttachment = {
  storagePath: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
};

const sanitizeFileName = (fileName: string) => {
  const trimmed = fileName.trim();
  const safe = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || 'attachment';
};

const toJpegFileName = (fileName: string) => {
  const safe = sanitizeFileName(fileName);
  const dotIndex = safe.lastIndexOf('.');
  const base = dotIndex > 0 ? safe.slice(0, dotIndex) : safe;
  return `${base || 'attachment'}.jpg`;
};

const isImageUpload = (fileName: string, mimeType?: string | null) => {
  const normalizedMime = mimeType?.toLowerCase() ?? '';
  if (normalizedMime.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(fileName);
};

const isDirectUrl = (value: string) => /^(https?:|file:|blob:|data:)/i.test(value);

const openUrlDirectly = async (url: string) => {
  if (Platform.OS === 'web') {
    const webWindow = (globalThis as any)?.window;
    if (webWindow?.open) {
      webWindow.open(url, '_blank');
      return;
    }
  }
  await Linking.openURL(url);
};

export const uploadBusinessAttachment = async ({
  businessId,
  folder,
  uri,
  fileName,
  mimeType = null,
  compressImages = true,
}: UploadBusinessAttachmentInput): Promise<UploadedBusinessAttachment> => {
  let uploadUri = uri;
  let uploadMimeType = mimeType;
  let uploadName = sanitizeFileName(fileName || 'attachment');

  if (compressImages && isImageUpload(uploadName, uploadMimeType)) {
    try {
      uploadUri = await compressImage(uploadUri, { maxDimension: 1600, quality: 0.72 });
      uploadMimeType = 'image/jpeg';
      uploadName = toJpegFileName(uploadName);
    } catch (error) {
      console.warn('Attachment image compression failed:', error);
    }
  }

  const response = await fetch(uploadUri);
  if (!response.ok) {
    throw new Error('Could not read selected attachment file.');
  }
  const blob = await response.blob();
  const resolvedMimeType = uploadMimeType ?? blob.type ?? undefined;
  const uniqueKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
  const storagePath = `${businessId}/${normalizedFolder}/${uniqueKey}-${uploadName}`;

  const { error } = await supabase
    .storage
    .from(COLLABORATION_ATTACHMENTS_BUCKET)
    .upload(storagePath, blob, {
      upsert: false,
      contentType: resolvedMimeType,
    });

  if (error) throw error;

  return {
    storagePath,
    fileName: uploadName,
    mimeType: resolvedMimeType,
    fileSize: blob.size || undefined,
  };
};

export const getSignedAttachmentUrl = async (pathOrUrl: string, expiresInSeconds = 60 * 10) => {
  const normalizedPath = pathOrUrl.trim();
  if (!normalizedPath) {
    throw new Error('Attachment path is empty.');
  }

  if (isDirectUrl(normalizedPath)) {
    return normalizedPath;
  }

  const { data, error } = await supabase
    .storage
    .from(COLLABORATION_ATTACHMENTS_BUCKET)
    .createSignedUrl(normalizedPath.replace(/^\/+/, ''), expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw error || new Error('Could not create signed URL for attachment.');
  }

  return data.signedUrl;
};

export const openAttachmentPath = async (pathOrUrl: string, expiresInSeconds = 60 * 10) => {
  const normalizedPath = pathOrUrl.trim();
  if (!normalizedPath) return;

  if (Platform.OS !== 'web') {
    const url = await getSignedAttachmentUrl(normalizedPath, expiresInSeconds);
    await Linking.openURL(url);
    return;
  }

  const webWindow = (globalThis as any)?.window;
  let pendingWindow: any = null;
  if (webWindow?.open) {
    pendingWindow = webWindow.open('about:blank', '_blank');
  }

  try {
    const url = await getSignedAttachmentUrl(normalizedPath, expiresInSeconds);
    if (pendingWindow && typeof pendingWindow === 'object') {
      if (pendingWindow.location && typeof pendingWindow.location.replace === 'function') {
        pendingWindow.location.replace(url);
      } else {
        pendingWindow.location.href = url;
      }
      return;
    }
    await openUrlDirectly(url);
  } catch (error) {
    if (pendingWindow && typeof pendingWindow.close === 'function') {
      pendingWindow.close();
    }
    throw error;
  }
};

export const uploadBusinessPublicAsset = async ({
  businessId,
  folder,
  uri,
  fileName,
  mimeType = null,
  compressImages = true,
}: UploadBusinessAttachmentInput): Promise<UploadedBusinessAttachment & { publicUrl: string }> => {
  let uploadUri = uri;
  let uploadMimeType = mimeType;
  let uploadName = sanitizeFileName(fileName || 'asset');

  if (compressImages && isImageUpload(uploadName, uploadMimeType)) {
    try {
      uploadUri = await compressImage(uploadUri, { maxDimension: 1200, quality: 0.82, format: 'png' });
      uploadMimeType = 'image/png';
      uploadName = uploadName.replace(/\.[a-z0-9]+$/i, '') || 'asset';
      uploadName = `${uploadName}.png`;
    } catch (error) {
      console.warn('Public business asset compression failed:', error);
    }
  }

  const response = await fetch(uploadUri);
  if (!response.ok) {
    throw new Error('Could not read selected asset file.');
  }

  const blob = await response.blob();
  const resolvedMimeType = uploadMimeType ?? blob.type ?? undefined;
  const uniqueKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
  const storagePath = `${businessId}/${normalizedFolder}/${uniqueKey}-${sanitizeFileName(uploadName)}`;

  const { error } = await supabase
    .storage
    .from(BUSINESS_ASSETS_BUCKET)
    .upload(storagePath, blob, {
      upsert: false,
      contentType: resolvedMimeType,
      cacheControl: '3600',
    });

  if (error) throw error;

  const { data } = supabase
    .storage
    .from(BUSINESS_ASSETS_BUCKET)
    .getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: data.publicUrl,
    fileName: sanitizeFileName(uploadName),
    mimeType: resolvedMimeType,
    fileSize: blob.size || undefined,
  };
};

// Uploaded from the public, unauthenticated /checkout/[code] page — no
// businessId scoping benefit here since there's no session, so the path is
// just keyed by the draft code. Mirrors uploadBusinessPublicAsset exactly,
// targeting the anon-writable social-checkout-proofs bucket instead (see
// supabase/social_checkout_proofs_bucket.sql).
export const uploadSocialCheckoutProof = async ({
  code,
  uri,
  fileName,
  mimeType = null,
}: {
  code: string;
  uri: string;
  fileName: string;
  mimeType?: string | null;
}): Promise<{ publicUrl: string; storagePath: string }> => {
  let uploadUri = uri;
  let uploadMimeType = mimeType;
  let uploadName = sanitizeFileName(fileName || 'proof');

  if (isImageUpload(uploadName, uploadMimeType)) {
    try {
      uploadUri = await compressImage(uploadUri, { maxDimension: 1200, quality: 0.82, format: 'png' });
      uploadMimeType = 'image/png';
      uploadName = uploadName.replace(/\.[a-z0-9]+$/i, '') || 'proof';
      uploadName = `${uploadName}.png`;
    } catch (error) {
      console.warn('Social checkout proof compression failed:', error);
    }
  }

  const response = await fetch(uploadUri);
  if (!response.ok) {
    throw new Error('Could not read selected proof file.');
  }

  const blob = await response.blob();
  const resolvedMimeType = uploadMimeType ?? blob.type ?? undefined;
  const uniqueKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `${code}/${uniqueKey}-${sanitizeFileName(uploadName)}`;

  const { error } = await supabase
    .storage
    .from(SOCIAL_CHECKOUT_PROOFS_BUCKET)
    .upload(storagePath, blob, {
      upsert: false,
      contentType: resolvedMimeType,
      cacheControl: '3600',
    });

  if (error) throw error;

  const { data } = supabase
    .storage
    .from(SOCIAL_CHECKOUT_PROOFS_BUCKET)
    .getPublicUrl(storagePath);

  return { publicUrl: data.publicUrl, storagePath };
};

// Product and variant photos are uploaded to the private attachments bucket, but the public
// tracking page and storefront only read the public business-assets bucket. Publish a copy under
// the same path so the photo shows up there without anyone running a copy script. Never throws:
// a failed copy must not block saving the product.
export const publishAttachmentToPublicBucket = async (storagePath: string) => {
  const path = storagePath.replace(/^\/+/, '');
  if (!path) return;
  try {
    const { error } = await supabase
      .storage
      .from(COLLABORATION_ATTACHMENTS_BUCKET)
      .copy(path, path, { destinationBucket: BUSINESS_ASSETS_BUCKET });
    if (error && !/already exists|duplicate/i.test(error.message ?? '')) {
      console.warn('Could not publish photo to the public bucket:', error.message);
    }
  } catch (error) {
    console.warn('Could not publish photo to the public bucket:', error);
  }
};

export const resolveBusinessAssetUrl = (pathOrUrl: string | null | undefined) => {
  const normalized = pathOrUrl?.trim() ?? '';
  if (!normalized) return null;
  if (/^data:image\//i.test(normalized)) return normalized;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (/^\/\//.test(normalized)) return `https:${normalized}`;

  const { data } = supabase
    .storage
    .from(BUSINESS_ASSETS_BUCKET)
    .getPublicUrl(normalized.replace(/^\/+/, ''));

  return data.publicUrl;
};
