import React, { ReactNode } from 'react';
import { Image, ImageProps } from 'react-native';
import { useResolvedAttachmentUrl } from '@/hooks/useResolvedAttachmentUrl';

interface ResolvedAttachmentImageProps extends Omit<ImageProps, 'source'> {
  imageUrl?: string | null;
  fallback?: ReactNode;
}

export function ResolvedAttachmentImage({
  imageUrl,
  fallback = null,
  ...imageProps
}: ResolvedAttachmentImageProps) {
  const resolvedUrl = useResolvedAttachmentUrl(imageUrl);

  if (!resolvedUrl) {
    return <>{fallback}</>;
  }

  return <Image {...imageProps} source={{ uri: resolvedUrl }} />;
}
