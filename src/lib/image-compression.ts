import { Image as RNImage, Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.7;

const getImageSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
  RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });

const compressWebDataUrl = async (
  imageSourceUri: string,
  maxDimension: number,
  quality: number,
  format: 'jpeg' | 'png'
): Promise<string> => {
  if (typeof document === 'undefined') return imageSourceUri;
  if (imageSourceUri.startsWith('data:') && !imageSourceUri.startsWith('data:image/')) {
    return imageSourceUri;
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const ImageConstructor =
      (typeof window !== 'undefined' && window.Image) ||
      (typeof globalThis !== 'undefined' && globalThis.Image);

    if (!ImageConstructor) {
      return reject(new Error('Image constructor not available'));
    }

    const image = new ImageConstructor();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = imageSourceUri;
  });

  const maxSide = Math.max(img.width, img.height);
  const scale = maxSide > maxDimension ? (maxDimension / maxSide) : 1;
  const targetWidth = Math.max(1, Math.round(img.width * scale));
  const targetHeight = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return imageSourceUri;

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  return format === 'png'
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', quality);
};

export const compressImage = async (
  uriOrDataUrl: string,
  options?: { maxDimension?: number; quality?: number; format?: 'jpeg' | 'png' }
): Promise<string> => {
  if (!uriOrDataUrl) return uriOrDataUrl;

  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options?.quality ?? DEFAULT_QUALITY;
  const format = options?.format ?? 'jpeg';

  try {
    if (Platform.OS === 'web') {
      return await compressWebDataUrl(uriOrDataUrl, maxDimension, quality, format);
    }

    const { width, height } = await getImageSize(uriOrDataUrl);
    const maxSide = Math.max(width, height);
    if (maxSide <= maxDimension) return uriOrDataUrl;

    const resize =
      width >= height ? { width: maxDimension } : { height: maxDimension };

    const result = await ImageManipulator.manipulateAsync(
      uriOrDataUrl,
      [{ resize }],
      {
        compress: quality,
        format: format === 'png' ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
      }
    );

    return result.uri;
  } catch (error) {
    console.warn('Image compression failed, using original image:', error);
    return uriOrDataUrl;
  }
};
