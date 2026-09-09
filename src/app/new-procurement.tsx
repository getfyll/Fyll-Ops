import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Plus, Minus, Trash2, Paperclip, FileText, Image as ImageIcon, Search } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import useFyllStore, { ProcurementItem, ProcurementAttachment, formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { cn } from '@/lib/cn';
import { uploadBusinessAttachment } from '@/lib/storage-attachments';

interface ItemFormData extends ProcurementItem {
  tempId: string;
}

export default function NewProcurementScreen() {
  const router = useRouter();
  const products = useFyllStore((s) => s.products);
  const addProcurement = useFyllStore((s) => s.addProcurement);
  const businessId = useAuthStore((s) => s.businessId);

  const [title, setTitle] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemFormData[]>([]);
  const [attachments, setAttachments] = useState<ProcurementAttachment[]>([]);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [pickingFile, setPickingFile] = useState(false);

  const flatVariants = useMemo(() => {
    const query = productSearch.toLowerCase().trim();
    const all = products.flatMap((p) =>
      p.variants.map((v) => ({
        productId: p.id,
        variantId: v.id,
        productName: p.name,
        variantName: Object.values(v.variableValues).join(' / '),
        sku: v.sku,
      }))
    );
    if (!query) return all;
    return all.filter(
      (v) =>
        v.productName.toLowerCase().includes(query) ||
        v.variantName.toLowerCase().includes(query) ||
        v.sku?.toLowerCase().includes(query)
    );
  }, [products, productSearch]);
  const [isSaving, setIsSaving] = useState(false);

  const totalCost = useMemo(() => {
    return items.reduce((sum, item) => sum + item.costAtPurchase * item.quantity, 0);
  }, [items]);

  const handleAddItem = (productId: string, variantId: string, productName: string, variantName: string) => {
    const existing = items.find((i) => i.productId === productId && i.variantId === variantId);
    if (existing) return;

    setItems([
      ...items,
      {
        tempId: Math.random().toString(36).substring(2, 10),
        productId,
        variantId,
        quantity: 1,
        costAtPurchase: 0,
        productName,
        variantName,
      },
    ]);
  };

  const handleUpdateItem = (tempId: string, updates: Partial<ItemFormData>) => {
    setItems(items.map((item) => (item.tempId === tempId ? { ...item, ...updates } : item)));
  };

  const handleRemoveItem = (tempId: string) => {
    setItems(items.filter((item) => item.tempId !== tempId));
  };

  const handlePickFile = async () => {
    setPickingFile(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled) return;

      const newAttachments: ProcurementAttachment[] = [];
      for (const asset of result.assets) {
        newAttachments.push({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? undefined,
          fileSize: typeof asset.size === 'number' ? asset.size : undefined,
        });
      }
      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (e) {
      console.warn('File pick error:', e);
    } finally {
      setPickingFile(false);
    }
  };

  const handleRemoveAttachment = (uri: string) => {
    setAttachments((prev) => prev.filter((a) => a.uri !== uri));
  };

  const handleSubmit = async () => {
    if (!supplierName.trim() || items.length === 0) return;
    if (isSaving) return;

    setIsSaving(true);
    try {
      const finalizedAttachments: ProcurementAttachment[] = [];
      for (const attachment of attachments) {
        const existingStoragePath = attachment.storagePath?.trim();
        if (existingStoragePath) {
          finalizedAttachments.push({
            ...attachment,
            uri: existingStoragePath,
            storagePath: existingStoragePath,
          });
          continue;
        }

        const sourceUri = attachment.uri?.trim();
        if (!sourceUri) continue;

        if (/^https?:\/\//i.test(sourceUri) || !businessId) {
          finalizedAttachments.push(attachment);
          continue;
        }

        const uploaded = await uploadBusinessAttachment({
          businessId,
          folder: 'finance/procurements',
          uri: sourceUri,
          fileName: attachment.name,
          mimeType: attachment.mimeType ?? null,
        });

        finalizedAttachments.push({
          ...attachment,
          uri: uploaded.storagePath,
          storagePath: uploaded.storagePath,
          mimeType: uploaded.mimeType ?? attachment.mimeType,
          fileSize: uploaded.fileSize ?? attachment.fileSize,
        });
      }

      const procurementItems: ProcurementItem[] = items.map(({ productId, variantId, quantity, costAtPurchase, productName, variantName }) => ({
        productId,
        variantId,
        quantity,
        costAtPurchase,
        productName,
        variantName,
      }));

      await addProcurement({
        id: Math.random().toString(36).substring(2, 15),
        title: title.trim() || undefined,
        supplierName: supplierName.trim(),
        items: procurementItems,
        totalCost,
        notes: notes.trim(),
        createdAt: new Date().toISOString(),
        attachments: finalizedAttachments.length > 0 ? finalizedAttachments : undefined,
      }, businessId);

      router.back();
    } catch (error) {
      console.warn('Procurement save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const getItemDisplayName = (item: ItemFormData) => {
    if (item.productName) {
      return { productName: item.productName, variantName: item.variantName ?? '' };
    }
    const product = products.find((p) => p.id === item.productId);
    const variant = product?.variants.find((v) => v.id === item.variantId);
    const variantName = variant ? Object.values(variant.variableValues).join(' / ') : '';
    return { productName: product?.name ?? 'Unknown', variantName };
  };

  const getFileIcon = (mimeType?: string) => {
    if (!mimeType) return <FileText size={16} color="#6B7280" strokeWidth={1.5} />;
    if (mimeType.startsWith('image/')) return <ImageIcon size={16} color="#6B7280" strokeWidth={1.5} />;
    return <FileText size={16} color="#6B7280" strokeWidth={1.5} />;
  };

  const isValid = supplierName.trim() && items.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-100">
          <Pressable onPress={() => router.back()} className="active:opacity-50">
            <X size={24} color="#111111" strokeWidth={2} />
          </Pressable>
          <Text className="text-lg font-bold text-gray-900">New Procurement</Text>
          <Pressable
            onPress={() => { void handleSubmit(); }}
            disabled={!isValid || isSaving}
            className={cn(
              'px-4 py-2 rounded-xl',
              isValid && !isSaving ? 'bg-gray-900 active:opacity-80' : 'bg-gray-200'
            )}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className={cn('font-semibold text-sm', isValid ? 'text-white' : 'text-gray-400')}>
                Record
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
          {/* Procurement Name */}
          <View className="mt-4">
            <Text className="text-gray-900 font-bold text-base mb-3">Procurement Name</Text>
            <TextInput
              placeholder="e.g. March Glasses Procurement"
              placeholderTextColor="#9CA3AF"
              value={title}
              onChangeText={setTitle}
              className="bg-gray-100 rounded-xl px-4 py-3 text-gray-900 text-sm"
            />
          </View>

          {/* Supplier Info */}
          <View className="mt-5">
            <Text className="text-gray-900 font-bold text-base mb-3">Supplier Information</Text>

            <TextInput
              placeholder="Supplier Name *"
              placeholderTextColor="#9CA3AF"
              value={supplierName}
              onChangeText={setSupplierName}
              className="bg-gray-100 rounded-xl px-4 py-3 text-gray-900 text-sm mb-2"
            />

            <TextInput
              placeholder="Notes (optional)"
              placeholderTextColor="#9CA3AF"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={2}
              className="bg-gray-100 rounded-xl px-4 py-3 text-gray-900 text-sm"
              style={{ minHeight: 60 }}
            />
          </View>

          {/* Items */}
          <View className="mt-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-gray-900 font-bold text-base">Items Received</Text>
              <Pressable
                onPress={() => setShowProductSelector(!showProductSelector)}
                className="bg-gray-900 px-3 py-1.5 rounded-lg flex-row items-center active:opacity-80"
              >
                <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text className="text-white font-semibold text-xs ml-1">Add Items</Text>
              </Pressable>
            </View>

            {/* Product Selector */}
            {showProductSelector && (
              <View className="bg-gray-50 rounded-xl p-3 mb-3">
                <View className="flex-row items-center bg-white rounded-xl px-3 py-2 mb-3 border border-gray-200">
                  <Search size={16} color="#9CA3AF" strokeWidth={2} />
                  <TextInput
                    placeholder="Search by product, variant, or SKU…"
                    placeholderTextColor="#9CA3AF"
                    value={productSearch}
                    onChangeText={setProductSearch}
                    autoCapitalize="none"
                    className="flex-1 ml-2 text-gray-900 text-sm"
                  />
                  {productSearch.length > 0 && (
                    <Pressable onPress={() => setProductSearch('')} className="active:opacity-50">
                      <X size={14} color="#9CA3AF" strokeWidth={2} />
                    </Pressable>
                  )}
                </View>

                {flatVariants.length === 0 ? (
                  <Text className="text-gray-400 text-sm text-center py-4">No variants found</Text>
                ) : (
                  flatVariants.map((v) => {
                    const isAdded = items.some(
                      (i) => i.productId === v.productId && i.variantId === v.variantId
                    );
                    return (
                      <Pressable
                        key={`${v.productId}-${v.variantId}`}
                        onPress={() => handleAddItem(v.productId, v.variantId, v.productName, v.variantName)}
                        disabled={isAdded}
                        className={cn(
                          'flex-row items-center justify-between py-2.5 px-3 rounded-xl mb-1.5',
                          isAdded ? 'bg-green-50' : 'bg-white active:bg-gray-100'
                        )}
                      >
                        <View className="flex-1 mr-2">
                          <Text className="text-gray-900 text-sm font-semibold">{v.variantName || v.productName}</Text>
                          <Text className="text-gray-500 text-xs mt-0.5">{v.productName}{v.sku ? ` · ${v.sku}` : ''}</Text>
                        </View>
                        {isAdded ? (
                          <Text className="text-green-600 text-xs font-semibold">Added</Text>
                        ) : (
                          <Plus size={18} color="#6B7280" strokeWidth={2} />
                        )}
                      </Pressable>
                    );
                  })
                )}
              </View>
            )}

            {/* Added Items */}
            {items.length > 0 ? (
              <View className="bg-gray-50 rounded-xl p-3">
                {items.map((item) => {
                  const { productName, variantName } = getItemDisplayName(item);
                  return (
                    <View key={item.tempId} className="bg-white rounded-xl p-3 mb-2">
                      <View className="flex-row items-start justify-between mb-2">
                        <View className="flex-1">
                          <Text className="text-gray-900 font-semibold text-sm">{productName}</Text>
                          {variantName ? <Text className="text-gray-500 text-xs">{variantName}</Text> : null}
                        </View>
                        <Pressable
                          onPress={() => handleRemoveItem(item.tempId)}
                          className="p-1 active:opacity-50"
                        >
                          <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                        </Pressable>
                      </View>

                      <View className="flex-row items-center gap-3">
                        <View className="flex-1">
                          <Text className="text-gray-500 text-xs mb-1">Quantity</Text>
                          <View className="flex-row items-center bg-gray-100 rounded-lg">
                            <Pressable
                              onPress={() =>
                                handleUpdateItem(item.tempId, {
                                  quantity: Math.max(1, item.quantity - 1),
                                })
                              }
                              className="p-2 active:opacity-50"
                            >
                              <Minus size={14} color="#111111" strokeWidth={2} />
                            </Pressable>
                            <TextInput
                              value={String(item.quantity)}
                              onChangeText={(text) =>
                                handleUpdateItem(item.tempId, {
                                  quantity: parseInt(text, 10) || 1,
                                })
                              }
                              keyboardType="number-pad"
                              className="flex-1 text-center text-gray-900 font-semibold text-sm"
                            />
                            <Pressable
                              onPress={() =>
                                handleUpdateItem(item.tempId, { quantity: item.quantity + 1 })
                              }
                              className="p-2 active:opacity-50"
                            >
                              <Plus size={14} color="#111111" strokeWidth={2} />
                            </Pressable>
                          </View>
                        </View>

                        <View className="flex-1">
                          <Text className="text-gray-500 text-xs mb-1">Unit Cost</Text>
                          <View className="flex-row items-center bg-gray-100 rounded-lg px-3 py-2">
                            <Text className="text-gray-500 text-sm">₦</Text>
                            <TextInput
                              value={String(item.costAtPurchase)}
                              onChangeText={(text) =>
                                handleUpdateItem(item.tempId, {
                                  costAtPurchase: parseFloat(text) || 0,
                                })
                              }
                              keyboardType="decimal-pad"
                              className="flex-1 text-gray-900 font-semibold text-sm ml-1"
                            />
                          </View>
                        </View>

                        <View className="items-end">
                          <Text className="text-gray-500 text-xs mb-1">Subtotal</Text>
                          <Text className="text-gray-900 font-bold text-base">
                            {formatCurrency(item.quantity * item.costAtPurchase)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              !showProductSelector && (
                <Pressable
                  onPress={() => setShowProductSelector(true)}
                  className="bg-gray-50 rounded-xl p-8 items-center active:opacity-70"
                >
                  <Text className="text-gray-400 text-sm">Tap to add items</Text>
                </Pressable>
              )
            )}
          </View>

          {/* Attachments */}
          <View className="mt-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-gray-900 font-bold text-base">Attachments</Text>
              <Pressable
                onPress={handlePickFile}
                disabled={pickingFile}
                className="border border-gray-200 px-3 py-1.5 rounded-lg flex-row items-center active:opacity-70"
              >
                {pickingFile ? (
                  <ActivityIndicator size="small" color="#374151" />
                ) : (
                  <>
                    <Paperclip size={15} color="#374151" strokeWidth={2} />
                    <Text className="text-gray-700 font-semibold text-xs ml-1.5">Attach Files</Text>
                  </>
                )}
              </Pressable>
            </View>

            {attachments.length > 0 ? (
              <View className="bg-gray-50 rounded-xl p-3 gap-2">
                {attachments.map((attachment) => (
                  <View key={attachment.uri} className="flex-row items-center bg-white rounded-xl px-3 py-2.5 gap-3">
                    <View className="w-8 h-8 rounded-lg bg-gray-100 items-center justify-center">
                      {getFileIcon(attachment.mimeType)}
                    </View>
                    <Text className="flex-1 text-gray-800 text-sm font-medium" numberOfLines={1}>
                      {attachment.name}
                    </Text>
                    <Pressable onPress={() => handleRemoveAttachment(attachment.uri)} className="active:opacity-50">
                      <X size={16} color="#9CA3AF" strokeWidth={2} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Pressable
                onPress={handlePickFile}
                className="bg-gray-50 rounded-xl p-6 items-center border border-dashed border-gray-200 active:opacity-70"
              >
                <Paperclip size={20} color="#9CA3AF" strokeWidth={1.5} />
                <Text className="text-gray-400 text-sm mt-2">Attach invoices, receipts, or docs</Text>
              </Pressable>
            )}
          </View>

          {/* Total */}
          {items.length > 0 && (
            <View className="mt-6 bg-blue-50 rounded-2xl p-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-blue-900 text-base font-medium">Total Cost</Text>
                  <Text className="text-blue-600 text-xs">
                    {items.reduce((sum, i) => sum + i.quantity, 0)} items
                  </Text>
                </View>
                <Text className="text-blue-900 text-2xl font-bold">{formatCurrency(totalCost)}</Text>
              </View>
            </View>
          )}

          <View className="h-24" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
