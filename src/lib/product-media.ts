import type { ProductVariant } from '@/lib/state/fyll-store';
import { uploadBusinessAttachment } from '@/lib/storage-attachments';

const LOCAL_PRODUCT_MEDIA_PATTERN = /^(file:|blob:|data:)/i;

type UploadProductMediaIfNeededInput = {
  businessId?: string | null;
  productId: string;
  uri?: string | null;
  fileName: string;
};

type PrepareProductMediaForPersistenceInput = {
  businessId?: string | null;
  productId: string;
  imageUrl?: string | null;
  variants: ProductVariant[];
};

export const uploadProductMediaIfNeeded = async ({
  businessId,
  productId,
  uri,
  fileName,
}: UploadProductMediaIfNeededInput) => {
  const normalizedUri = uri?.trim();
  if (!normalizedUri) return undefined;

  if (!LOCAL_PRODUCT_MEDIA_PATTERN.test(normalizedUri)) {
    return normalizedUri;
  }

  if (!businessId) {
    return normalizedUri;
  }

  const uploaded = await uploadBusinessAttachment({
    businessId,
    folder: `inventory/products/${productId}`,
    uri: normalizedUri,
    fileName,
  });

  return uploaded.storagePath;
};

export const prepareProductMediaForPersistence = async ({
  businessId,
  productId,
  imageUrl,
  variants,
}: PrepareProductMediaForPersistenceInput) => {
  const [nextImageUrl, nextVariants] = await Promise.all([
    uploadProductMediaIfNeeded({
      businessId,
      productId,
      uri: imageUrl,
      fileName: 'main.jpg',
    }),
    Promise.all(
      variants.map(async (variant) => ({
        ...variant,
        imageUrl: await uploadProductMediaIfNeeded({
          businessId,
          productId,
          uri: variant.imageUrl,
          fileName: `variant-${variant.id}.jpg`,
        }),
      }))
    ),
  ]);

  const fallbackImageUrl = nextVariants.find((variant) => variant.imageUrl?.trim())?.imageUrl;

  return {
    imageUrl: nextImageUrl ?? fallbackImageUrl,
    variants: nextVariants,
  };
};
