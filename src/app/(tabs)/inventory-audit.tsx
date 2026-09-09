import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore, { AuditLogItem, type AuditLog } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { storage } from '@/lib/storage';
import { AuditHomeView } from '@/components/inventory-audit/AuditHomeView';
import { AuditCountView } from '@/components/inventory-audit/AuditCountView';
import { AuditHistoryView } from '@/components/inventory-audit/AuditHistoryView';
import { AuditDetailView } from '@/components/inventory-audit/AuditDetailView';
import { AuditActionModal } from '@/components/inventory-audit/AuditActionModal';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import type { AuditItem, AuditStatusFilter } from '@/components/inventory-audit/types';
import { buildAuditItems, buildCategorySections, buildWarehouseAuditItems, getAuditProgress, getLiveVarianceBreakdown, isAuditableProduct, parseCount, reconcileAuditItemsWithInventory } from '@/components/inventory-audit/utils';

type AuditView = 'home' | 'counting' | 'history' | 'detail';
type AuditScope = 'products' | 'warehouse';
const AUDIT_DRAFT_STORAGE_KEY = 'inventory-audit-draft-v1';

const areAuditItemsEquivalent = (previousItems: AuditItem[], nextItems: AuditItem[]): boolean => {
  if (previousItems.length !== nextItems.length) return false;
  return previousItems.every((previousItem, index) => {
    const nextItem = nextItems[index];
    return Boolean(nextItem) &&
      previousItem.productId === nextItem.productId &&
      previousItem.productName === nextItem.productName &&
      previousItem.categoryName === nextItem.categoryName &&
      previousItem.variantId === nextItem.variantId &&
      previousItem.variantName === nextItem.variantName &&
      previousItem.combinedName === nextItem.combinedName &&
      previousItem.expectedStock === nextItem.expectedStock &&
      previousItem.physicalCount === nextItem.physicalCount &&
      previousItem.sku === nextItem.sku &&
      previousItem.sourceType === nextItem.sourceType &&
      previousItem.unit === nextItem.unit;
  });
};

interface StoredAuditDraft {
  items: AuditItem[];
  savedAt: string;
  startedAt?: string;
  scope?: AuditScope;
}

export default function InventoryAuditScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isDark = useResolvedThemeMode() === 'dark';
  const tabBarHeight = useTabBarHeight();
  const primaryActionBg = isDark ? '#FFFFFF' : '#111111';
  const primaryActionText = isDark ? '#111111' : '#FFFFFF';

  const products = useFyllStore((state) => state.products);
  const productCategories = useFyllStore((state) => state.categories);
  const warehouseItems = useFyllStore((state) => state.warehouseItems);
  const updateProduct = useFyllStore((state) => state.updateProduct);
  const recordWarehouseCount = useFyllStore((state) => state.recordWarehouseCount);
  const addAuditLog = useFyllStore((state) => state.addAuditLog);
  const updateAuditLog = useFyllStore((state) => state.updateAuditLog);
  const storeAuditLogs = useFyllStore((state) => state.auditLogs);
  const businessId = useAuthStore((state) => state.businessId);
  const performedBy = useAuthStore((state) => state.currentUser?.name ?? state.currentUser?.email ?? 'Team');

  const [currentView, setCurrentView] = useState<AuditView>('home');
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [auditScope, setAuditScope] = useState<AuditScope>('products');
  const [auditStartedAt, setAuditStartedAt] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<AuditStatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All categories');
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [detailReturnView, setDetailReturnView] = useState<'home' | 'history'>('home');

  const [showRestartPrompt, setShowRestartPrompt] = useState(false);
  const [showScopePrompt, setShowScopePrompt] = useState(false);
  const [queuedAuditScope, setQueuedAuditScope] = useState<AuditScope | null>(null);
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);
  const [showSavedPrompt, setShowSavedPrompt] = useState(false);
  const [savedDiscrepancies, setSavedDiscrepancies] = useState(0);
  const [savedScope, setSavedScope] = useState<AuditScope>('products');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string) => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadDraft = async () => {
      const draftRaw = await storage.getItem(AUDIT_DRAFT_STORAGE_KEY);
      if (!draftRaw || isCancelled) {
        return;
      }

      try {
        const parsedDraft = JSON.parse(draftRaw) as StoredAuditDraft;
        if (!parsedDraft?.items || !Array.isArray(parsedDraft.items) || parsedDraft.items.length === 0) {
          return;
        }

        const scope: AuditScope = parsedDraft.scope === 'warehouse' ? 'warehouse' : 'products';
        const auditableProductIds = new Set(products.filter(isAuditableProduct).map((product) => product.id));
        const warehouseItemIds = new Set(warehouseItems.map((item) => item.id));
        const validItems = parsedDraft.items.filter((item) => (
          typeof item.productId === 'string' &&
          (scope === 'warehouse' ? warehouseItemIds.has(item.variantId) : auditableProductIds.has(item.productId)) &&
          typeof item.productName === 'string' &&
          typeof item.categoryName === 'string' &&
          typeof item.variantId === 'string' &&
          typeof item.variantName === 'string' &&
          typeof item.combinedName === 'string' &&
          typeof item.expectedStock === 'number' &&
          typeof item.physicalCount === 'string' &&
          typeof item.sku === 'string'
        ));

        const reconciledItems = reconcileAuditItemsWithInventory(validItems, products, warehouseItems, scope, productCategories);

        if (reconciledItems.length > 0) {
          setAuditItems(reconciledItems);
          setAuditScope(scope);
          setAuditStartedAt(parsedDraft.startedAt ?? parsedDraft.savedAt);
        }
      } catch (error) {
        console.warn('Failed to load audit draft:', error);
      }
    };

    void loadDraft();

    return () => {
      isCancelled = true;
    };
  }, [products, productCategories, warehouseItems]);

  useEffect(() => {
    setAuditItems((previousItems) => {
      if (previousItems.length === 0) return previousItems;
      const nextItems = reconcileAuditItemsWithInventory(previousItems, products, warehouseItems, auditScope, productCategories);
      return areAuditItemsEquivalent(previousItems, nextItems) ? previousItems : nextItems;
    });
  }, [products, productCategories, warehouseItems, auditScope]);

  const sortedAuditLogs = useMemo(() => {
    return [...storeAuditLogs].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }, [storeAuditLogs]);

  const auditProgress = useMemo(() => getAuditProgress(auditItems), [auditItems]);

  const categoryOptions = useMemo(() => {
    const uniqueCategories = Array.from(new Set(auditItems.map((item) => item.categoryName))).sort((a, b) => a.localeCompare(b));
    return ['All categories', ...uniqueCategories];
  }, [auditItems]);

  const filteredAuditItems = useMemo(() => {
    return auditItems.filter((item) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query ||
        item.combinedName.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) ||
        item.categoryName.toLowerCase().includes(query);

      if (!matchesSearch) {
        return false;
      }

      if (categoryFilter !== 'All categories' && item.categoryName !== categoryFilter) {
        return false;
      }

      const parsedCount = parseCount(item.physicalCount);
      if (statusFilter === 'uncounted') {
        return parsedCount === null;
      }
      if (statusFilter === 'discrepancies') {
        return parsedCount !== null && parsedCount !== item.expectedStock;
      }
      return true;
    });
  }, [auditItems, searchQuery, categoryFilter, statusFilter]);

  const categorySections = useMemo(() => buildCategorySections(filteredAuditItems), [filteredAuditItems]);
  const allCategorySections = useMemo(() => buildCategorySections(auditItems), [auditItems]);
  const liveVarianceBreakdown = useMemo(() => getLiveVarianceBreakdown(auditItems), [auditItems]);

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCategoryFilter('All categories');
  };

  const triggerMediumHaptic = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const saveAuditDraft = async (itemsToSave: AuditItem[]) => {
    if (itemsToSave.length === 0) {
      await storage.removeItem(AUDIT_DRAFT_STORAGE_KEY);
      return;
    }

    const payload: StoredAuditDraft = {
      items: itemsToSave,
      savedAt: new Date().toISOString(),
      startedAt: auditStartedAt ?? new Date().toISOString(),
      scope: auditScope,
    };
    await storage.setItem(AUDIT_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  };

  const clearAuditDraft = async () => {
    await storage.removeItem(AUDIT_DRAFT_STORAGE_KEY);
  };

  const startAudit = (scope: AuditScope = 'products') => {
    triggerMediumHaptic();
    const nextItems = scope === 'warehouse' ? buildWarehouseAuditItems(warehouseItems) : buildAuditItems(products, productCategories);
    setAuditScope(scope);
    setAuditItems(nextItems);
    setAuditStartedAt(new Date().toISOString());
    resetFilters();
    setCurrentView('counting');
    void clearAuditDraft();
  };

  const handleStartAuditPress = () => {
    if (auditItems.length > 0) {
      setShowRestartPrompt(true);
      return;
    }
    setShowScopePrompt(true);
  };

  const handleStartScopedAudit = (scope: AuditScope) => {
    if (auditItems.length > 0) {
      setQueuedAuditScope(scope);
      setShowRestartPrompt(true);
      return;
    }
    startAudit(scope);
    showToast(scope === 'warehouse' ? 'Warehouse audit started' : 'Product audit started');
  };

  const discardAudit = () => {
    triggerMediumHaptic();
    setAuditItems([]);
    setAuditScope('products');
    setAuditStartedAt(null);
    resetFilters();
    void clearAuditDraft();
  };

  const resumeAudit = () => {
    if (auditItems.length === 0) {
      setShowScopePrompt(true);
      return;
    }
    triggerMediumHaptic();
    setCurrentView('counting');
  };

  const updatePhysicalCount = (variantId: string, count: string) => {
    setAuditItems((previousItems) =>
      previousItems.map((item) => (item.variantId === variantId ? { ...item, physicalCount: count } : item))
    );
  };

  const setCategoryAsExpected = (categoryName: string, shouldMatchExpected: boolean) => {
    triggerMediumHaptic();
    setAuditItems((previousItems) =>
      previousItems.map((item) => {
        if (item.categoryName !== categoryName) {
          return item;
        }
        return {
          ...item,
          physicalCount: shouldMatchExpected ? String(item.expectedStock) : '',
        };
      })
    );
  };

  const handleSubmitAudit = () => {
    if (auditProgress.total === 0 || auditProgress.counted !== auditProgress.total) {
      return;
    }
    void processAudit();
  };

  const processAudit = async () => {
    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    const logItems: AuditLogItem[] = auditItems
      .map((item) => {
        const actual = parseCount(item.physicalCount);
        if (actual === null) {
          return null;
        }
        return {
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          variantName: item.variantName,
          sku: item.sku,
          expectedStock: item.expectedStock,
          actualStock: actual,
          discrepancy: actual - item.expectedStock,
        };
      })
      .filter((item): item is AuditLogItem => item !== null);

    const totalDiscrepancy = logItems.reduce((sum, item) => sum + Math.abs(item.discrepancy), 0);
    const now = new Date();
    const nowIso = now.toISOString();

    addAuditLog({
      id: now.getTime().toString(),
      month: now.getMonth(),
      year: now.getFullYear(),
      itemsAudited: logItems.length,
      discrepancies: totalDiscrepancy,
      completedAt: nowIso,
      performedBy,
      scope: auditScope,
      items: logItems,
    });

    if (auditScope === 'warehouse') {
      logItems.forEach((item) => {
        recordWarehouseCount(
          item.variantId,
          {
            quantity: item.actualStock,
            countedAt: nowIso,
            countedBy: performedBy,
            notes: 'Warehouse audit',
          },
          businessId ?? undefined
        );
      });
    }

    const productChanges = new Map<string, Map<string, number>>();

    if (auditScope === 'products') {
      auditItems.forEach((item) => {
        const actual = parseCount(item.physicalCount);
        if (actual === null || actual === item.expectedStock) {
          return;
        }

        if (!productChanges.has(item.productId)) {
          productChanges.set(item.productId, new Map<string, number>());
        }

        productChanges.get(item.productId)?.set(item.variantId, actual);
      });
    }

    if (productChanges.size > 0) {
      await Promise.all(
        products
          .filter((product) => productChanges.has(product.id) && isAuditableProduct(product))
          .map((product) => {
            const variantMap = productChanges.get(product.id);
            if (!variantMap) {
              return Promise.resolve();
            }

            const updatedVariants = product.variants.map((variant) => {
              const actualStock = variantMap.get(variant.id);
              if (actualStock === undefined) {
                return variant;
              }

              return {
                ...variant,
                stock: actualStock,
              };
            });

            return updateProduct(product.id, { variants: updatedVariants }, businessId ?? undefined);
          })
      );
    }

    setSavedDiscrepancies(auditProgress.discrepancyCount);
    setSavedScope(auditScope);
    setAuditItems([]);
    setAuditScope('products');
    setAuditStartedAt(null);
    resetFilters();
    setCurrentView('home');
    await clearAuditDraft();
    setShowSavedPrompt(true);
  };

  const pauseAndExitAudit = async () => {
    triggerMediumHaptic();
    await saveAuditDraft(auditItems);
    router.replace('/(tabs)/inventory');
  };

  const pauseAuditToHome = async () => {
    triggerMediumHaptic();
    await saveAuditDraft(auditItems);
    setCurrentView('home');
    showToast('Audit paused');
  };

  const saveCurrentAuditDraft = async () => {
    triggerMediumHaptic();
    await saveAuditDraft(auditItems);
    showToast('Audit progress saved');
  };

  const closeSavedPrompt = () => {
    setShowSavedPrompt(false);
  };

  const { isDesktop } = useBreakpoint();

  const catalogSkuCount = products.filter(isAuditableProduct).reduce((sum, product) => sum + product.variants.length, 0);
  const warehouseAuditItemCount = warehouseItems.length;
  const excludedAuditProductIds = useMemo(() => {
    return new Set(products.filter((product) => !isAuditableProduct(product)).map((product) => product.id));
  }, [products]);
  const excludedAuditProductNames = useMemo(() => {
    return new Set(products.filter((product) => !isAuditableProduct(product)).map((product) => product.name.trim().toLowerCase()));
  }, [products]);
  const lastCompletedLabel = sortedAuditLogs.length > 0
    ? new Date(sortedAuditLogs[0].completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const content = (
    <View style={{ flex: 1, backgroundColor: isDark || isDesktop ? colors.bg.primary : '#FFFFFF' }}>
      {currentView === 'home' ? (
        <AuditHomeView
          colors={colors}
          isDark={isDark}
          primaryActionBg={primaryActionBg}
          primaryActionText={primaryActionText}
          skuCount={catalogSkuCount}
          lastCompletedLabel={lastCompletedLabel}
          hasActiveAudit={auditItems.length > 0}
          countedItems={auditProgress.counted}
          totalItems={auditProgress.total}
          discrepancyCount={auditProgress.discrepancyCount}
          auditStartedAt={auditStartedAt}
          performedBy={performedBy}
          sortedAuditLogs={sortedAuditLogs}
          onBack={() => {
            if (auditItems.length > 0) {
              void pauseAndExitAudit();
              return;
            }
            router.replace('/(tabs)/inventory');
          }}
          onStartAudit={handleStartAuditPress}
          onResumeAudit={resumeAudit}
          onDiscardAudit={() => setShowDiscardPrompt(true)}
          onOpenHistory={(logId) => {
            triggerMediumHaptic();
            if (logId) {
              setSelectedAuditId(logId);
              setDetailReturnView('home');
              setCurrentView('detail');
              return;
            }
            setCurrentView('history');
          }}
        />
      ) : null}

      {currentView === 'counting' ? (
        <AuditCountView
          isDark={isDark}
          colors={colors}
          primaryActionBg={primaryActionBg}
          primaryActionText={primaryActionText}
          sections={categorySections}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          categoryOptions={categoryOptions}
          totalItems={auditProgress.total}
          countedItems={auditProgress.counted}
          discrepancyCount={auditProgress.discrepancyCount}
          catalogSkuCount={auditScope === 'warehouse' ? warehouseAuditItemCount : catalogSkuCount}
          auditScope={auditScope}
          lastCompletedLabel={lastCompletedLabel}
          auditStartedAt={auditStartedAt}
          performedBy={performedBy}
          allSections={allCategorySections}
          liveBreakdown={liveVarianceBreakdown}
          onBackToHome={() => {
            triggerMediumHaptic();
            setCurrentView('home');
          }}
          onRestartAudit={handleStartAuditPress}
          onUpdateCount={updatePhysicalCount}
          onSetCategoryExpected={setCategoryAsExpected}
          onSaveDraft={saveCurrentAuditDraft}
          onPause={pauseAuditToHome}
          onSubmit={handleSubmitAudit}
        />
      ) : null}

      {currentView === 'history' ? (
        <AuditHistoryView
          isDark={isDark}
          colors={colors}
          sortedAuditLogs={sortedAuditLogs}
          onBack={() => setCurrentView('home')}
          onSelectAudit={(auditId) => {
            triggerMediumHaptic();
            setSelectedAuditId(auditId);
            setDetailReturnView('history');
            setCurrentView('detail');
          }}
        />
      ) : null}

      {currentView === 'detail' ? (
        <AuditDetailView
          isDark={isDark}
          colors={colors}
          log={sortedAuditLogs.find((log) => log.id === selectedAuditId) ?? null}
          excludedProductIds={excludedAuditProductIds}
          excludedProductNames={excludedAuditProductNames}
          performedBy={performedBy}
          onBack={() => setCurrentView(detailReturnView)}
          onSave={(logId, updates: Partial<AuditLog>) => {
            updateAuditLog(logId, updates);
            showToast('Completed audit updated');
          }}
          onRestart={(scope) => handleStartScopedAudit(scope)}
        />
      ) : null}

      <AuditActionModal
        visible={showRestartPrompt}
        colors={colors}
        title="Restart audit?"
        description="This will clear the current count and start a fresh audit from current stock values."
        cancelLabel="Cancel"
        confirmLabel="Restart"
        onCancel={() => {
          setShowRestartPrompt(false);
          setQueuedAuditScope(null);
        }}
        onConfirm={() => {
          setShowRestartPrompt(false);
          if (queuedAuditScope) {
            startAudit(queuedAuditScope);
            showToast(queuedAuditScope === 'warehouse' ? 'Warehouse audit restarted' : 'Product audit restarted');
            setQueuedAuditScope(null);
            return;
          }
          discardAudit();
          setShowScopePrompt(true);
        }}
        confirmBackgroundColor={primaryActionBg}
        confirmTextColor={primaryActionText}
      />

      <Modal
        visible={showScopePrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowScopePrompt(false)}
      >
        <Pressable
          onPress={() => setShowScopePrompt(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="rounded-3xl p-5"
            style={{
              width: '100%',
              maxWidth: 460,
              backgroundColor: isDark ? '#1A1A1E' : '#FFFFFF',
              borderWidth: 1,
              borderColor: colors.border.light,
            }}
          >
            <Text style={{ color: colors.text.primary }} className="text-lg font-bold">What do you want to audit?</Text>
            <Text style={{ color: colors.text.tertiary }} className="text-sm mt-1 mb-4">
              Product audits exclude services and warehouse materials.
            </Text>
            <Pressable
              onPress={() => {
                setShowScopePrompt(false);
                handleStartScopedAudit('products');
              }}
              className="rounded-2xl px-4 py-4 mb-3"
              style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
            >
              <Text style={{ color: colors.text.primary }} className="text-base font-bold">Products</Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">{catalogSkuCount} stock SKUs</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowScopePrompt(false);
                handleStartScopedAudit('warehouse');
              }}
              className="rounded-2xl px-4 py-4"
              style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.light }}
            >
              <Text style={{ color: colors.text.primary }} className="text-base font-bold">Warehouse</Text>
              <Text style={{ color: colors.text.tertiary }} className="text-xs mt-0.5">{warehouseAuditItemCount} materials and packaging items</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowScopePrompt(false)}
              className="h-12 rounded-full items-center justify-center mt-4"
            >
              <Text style={{ color: colors.text.secondary }} className="text-sm font-semibold">Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <AuditActionModal
        visible={showDiscardPrompt}
        colors={colors}
        title="Discard audit?"
        description="This will permanently clear your current count. This can't be undone."
        cancelLabel="Cancel"
        confirmLabel="Discard"
        onCancel={() => setShowDiscardPrompt(false)}
        onConfirm={() => {
          setShowDiscardPrompt(false);
          discardAudit();
        }}
        confirmBackgroundColor="#EF4444"
        confirmTextColor="#FFFFFF"
      />

      <AuditActionModal
        visible={showSavedPrompt}
        colors={colors}
        title="Audit saved"
        description={`${savedScope === 'warehouse' ? 'Warehouse quantities' : 'Stock'} updated successfully. ${savedDiscrepancies} discrepancy${savedDiscrepancies === 1 ? '' : 'ies'} recorded.`}
        cancelLabel="Close"
        confirmLabel="View Home"
        onCancel={closeSavedPrompt}
        onConfirm={closeSavedPrompt}
        confirmBackgroundColor={primaryActionBg}
        confirmTextColor={primaryActionText}
      />

      {toast ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 20, right: 20, bottom: 24, alignItems: 'center' }}
        >
          <View
            style={{
              backgroundColor: isDark ? '#FFFFFF' : '#111111',
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 12,
              minHeight: 44,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: isDark ? '#111111' : '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
              {toast}
            </Text>
          </View>
        </View>
      ) : null}

      {!isDesktop && currentView === 'home' ? (
        <Pressable
          onPress={handleStartAuditPress}
          accessibilityLabel="Start new audit"
          className="items-center justify-center active:opacity-85"
          style={{
            position: 'absolute',
            right: 20,
            bottom: Math.max(24, tabBarHeight - 30),
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: primaryActionBg,
            shadowColor: '#000000',
            shadowOpacity: isDark ? 0.28 : 0.16,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          <Plus size={24} color={primaryActionText} strokeWidth={2.6} />
        </Pressable>
      ) : null}
    </View>
  );

  return content;
}
