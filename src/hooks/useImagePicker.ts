import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { compressImage } from '@/lib/image-compression';

export interface UseImagePickerOptions {
  allowsEditing?: boolean;
  aspect?: [number, number] | null;
  quality?: number;
}

export interface UseImagePickerResult {
  pickImage: (options?: UseImagePickerOptions) => Promise<string | null>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * A cross-platform image picker hook that works on both native and web.
 * On web (including Vibecode preview), it uses a standard file input.
 * On native, it uses expo-image-picker.
 */
export function useImagePicker(): UseImagePickerResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resolveRef = useRef<((value: string | null) => void) | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const pickImage = useCallback(async (options?: UseImagePickerOptions): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      if (Platform.OS === 'web') {
        // Web: Use standard file input
        return new Promise((resolve) => {
          resolveRef.current = resolve;

          // Create or reuse file input
          if (!fileInputRef.current) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.style.display = 'none';

            input.addEventListener('change', (event) => {
              const target = event.target as HTMLInputElement;
              const file = target.files?.[0];

              if (file) {
                // Convert to base64 data URL for display
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUrl = reader.result as string;
                  compressImage(dataUrl)
                    .then((compressed) => {
                      setIsLoading(false);
                      resolveRef.current?.(compressed);
                      resolveRef.current = null;
                    })
                    .catch(() => {
                      setIsLoading(false);
                      resolveRef.current?.(dataUrl);
                      resolveRef.current = null;
                    });
                };
                reader.onerror = () => {
                  setError('Failed to read image file');
                  setIsLoading(false);
                  resolveRef.current?.(null);
                  resolveRef.current = null;
                };
                reader.readAsDataURL(file);
              } else {
                // User cancelled
                setIsLoading(false);
                resolveRef.current?.(null);
                resolveRef.current = null;
              }

              // Reset input for next use
              target.value = '';
            });

            // Handle cancel (when user closes the file picker without selecting)
            input.addEventListener('cancel', () => {
              setIsLoading(false);
              resolveRef.current?.(null);
              resolveRef.current = null;
            });

            document.body.appendChild(input);
            fileInputRef.current = input;
          }

          // Trigger file selection
          fileInputRef.current.click();

          // Fallback timeout in case 'cancel' event doesn't fire
          setTimeout(() => {
            if (resolveRef.current) {
              setIsLoading(false);
              // Don't resolve null here - let the change event handle it
            }
          }, 60000); // 1 minute timeout
        });
      } else {
        // Native: Use expo-image-picker
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (status !== 'granted') {
          setError('Permission to access photos was denied');
          setIsLoading(false);
          return null;
        }

        const shouldEdit = options?.allowsEditing ?? true;
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: shouldEdit,
          aspect: shouldEdit ? (options?.aspect ?? [1, 1]) : undefined,
          quality: options?.quality ?? 0.8,
          base64: true,
        });

        setIsLoading(false);

        if (!result.canceled && result.assets[0]) {
          const asset = result.assets[0];
          if (asset.base64) {
            const mimeType = asset.mimeType || 'image/jpeg';
            return `data:${mimeType};base64,${asset.base64}`;
          }
          return await compressImage(asset.uri);
        }

        return null;
      }
    } catch (err) {
      console.error('Image picker error:', err);
      setError('Failed to pick image. Please try again.');
      setIsLoading(false);
      return null;
    }
  }, []);

  return {
    pickImage,
    isLoading,
    error,
    clearError,
  };
}

/**
 * Pick multiple images at once from the gallery, compressing each one.
 * Returns an array of URIs/data-URLs (empty array if cancelled).
 */
export async function pickMultipleImagesSimple(): Promise<string[]> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.style.display = 'none';

      input.addEventListener('change', async (event) => {
        const target = event.target as HTMLInputElement;
        const files = Array.from(target.files ?? []);
        document.body.removeChild(input);
        if (files.length === 0) { resolve([]); return; }
        const results = await Promise.all(
          files.map((file) => new Promise<string | null>((res) => {
            const reader = new FileReader();
            reader.onload = () => {
              compressImage(reader.result as string)
                .then((compressed) => res(compressed))
                .catch(() => res(reader.result as string));
            };
            reader.onerror = () => res(null);
            reader.readAsDataURL(file);
          }))
        );
        resolve(results.filter((r): r is string => r !== null));
      });

      input.addEventListener('cancel', () => {
        document.body.removeChild(input);
        resolve([]);
      });

      document.body.appendChild(input);
      input.click();
    });
  } else {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return [];
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled || !result.assets.length) return [];
      return await Promise.all(result.assets.map((asset) => compressImage(asset.uri)));
    } catch (err) {
      console.error('Image picker error:', err);
      return [];
    }
  }
}

/**
 * Simple function to pick an image - returns the image URI or null.
 * This is a simpler alternative when you don't need the hook's state management.
 */
export async function pickImageSimple(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';

        input.addEventListener('change', (event) => {
          const target = event.target as HTMLInputElement;
          const file = target.files?.[0];

          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              document.body.removeChild(input);
              compressImage(reader.result as string)
                .then((compressed) => resolve(compressed))
                .catch(() => resolve(reader.result as string));
            };
          reader.onerror = () => {
            document.body.removeChild(input);
            resolve(null);
          };
          reader.readAsDataURL(file);
        } else {
          document.body.removeChild(input);
          resolve(null);
        }
      });

      input.addEventListener('cancel', () => {
        document.body.removeChild(input);
        resolve(null);
      });

      document.body.appendChild(input);
      input.click();
    });
  } else {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        return await compressImage(result.assets[0].uri);
      }

      return null;
    } catch (err) {
      console.error('Image picker error:', err);
      return null;
    }
  }
}
