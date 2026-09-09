import { uploadBusinessAttachment } from '@/lib/storage-attachments';

const LOCAL_MEDIA_PATTERN = /^(file:|blob:|data:)/i;

type UploadWarehouseMediaIfNeededInput = {
  businessId?: string | null;
  itemId: string;
  uri?: string | null;
  fileName: string;
};

export const uploadWarehouseMediaIfNeeded = async ({
  businessId,
  itemId,
  uri,
  fileName,
}: UploadWarehouseMediaIfNeededInput) => {
  const normalizedUri = uri?.trim();
  if (!normalizedUri) return undefined;

  if (!LOCAL_MEDIA_PATTERN.test(normalizedUri)) {
    return normalizedUri;
  }

  if (!businessId) {
    return normalizedUri;
  }

  const uploaded = await uploadBusinessAttachment({
    businessId,
    folder: `inventory/warehouse/${itemId}`,
    uri: normalizedUri,
    fileName,
  });

  return uploaded.storagePath;
};
