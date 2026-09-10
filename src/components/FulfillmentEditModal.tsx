import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Check, ChevronDown, X } from 'lucide-react-native';
import useFyllStore, { type Order } from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import { addBusinessDays, resolveOrderTimeline } from '@/lib/fulfillment';

interface FulfillmentEditModalProps {
  order: Order;
  visible: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Order>) => Promise<void> | void;
}

const formatFullDate = (value: Date) => (
  value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
);

export function FulfillmentEditModal({
  order,
  visible,
  onClose,
  onSave,
}: FulfillmentEditModalProps) {
  const colors = useThemeColors();
  const orderTimelineSettings = useFyllStore((s) => s.orderTimelineSettings);

  const [orderTypeId, setOrderTypeId] = useState(order.orderTypeId ?? orderTimelineSettings.defaultOrderType.id);
  const [showOrderTypeMenu, setShowOrderTypeMenu] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setOrderTypeId(order.orderTypeId ?? orderTimelineSettings.orderTypes[0]?.id ?? orderTimelineSettings.defaultOrderType.id);
    setShowOrderTypeMenu(false);
  }, [order.orderTypeId, orderTimelineSettings.defaultOrderType.id, orderTimelineSettings.orderTypes, visible]);

  const availableOrderTypes = useMemo(() => {
    return orderTimelineSettings.orderTypes;
  }, [orderTimelineSettings.orderTypes]);

  const resolvedTimeline = useMemo(() => resolveOrderTimeline(
    {
      orderTypeId,
      orderTypeName: order.orderTypeName,
      deliveryState: order.deliveryState,
    },
    orderTimelineSettings
  ), [order.deliveryState, order.orderTypeName, orderTimelineSettings, orderTypeId]);

  const selectedOrderType = resolvedTimeline.orderType;
  const startedAt = useMemo(() => {
    const source = order.fulfillmentStartedAt ?? order.orderDate ?? order.createdAt;
    return new Date(source);
  }, [order.createdAt, order.fulfillmentStartedAt, order.orderDate]);
  const nextOriginalEta = useMemo(
    () => addBusinessDays(new Date(startedAt), resolvedTimeline.maxBusinessDays),
    [resolvedTimeline.maxBusinessDays, startedAt]
  );

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const existingOriginal = order.fulfillmentOriginalEta ?? null;
      const existingEffective = order.fulfillmentEffectiveEta ?? null;
      const nextOriginalIso = nextOriginalEta.toISOString();
      const preserveRevisedEffectiveEta = existingEffective && existingOriginal && existingEffective !== existingOriginal;

      await onSave({
        orderTypeId: selectedOrderType.id,
        orderTypeName: selectedOrderType.name,
        fulfillmentStartedAt: startedAt.toISOString(),
        fulfillmentTimelineDays: resolvedTimeline.maxBusinessDays,
        fulfillmentOriginalEta: nextOriginalIso,
        fulfillmentEffectiveEta: preserveRevisedEffectiveEta ? existingEffective : nextOriginalIso,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.52)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 520,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: colors.border.light,
            backgroundColor: colors.bg.primary,
            overflow: 'hidden',
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View
              style={{
                paddingHorizontal: 20,
                paddingVertical: 18,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottomWidth: 1,
                borderBottomColor: colors.border.light,
              }}
            >
              <View>
                <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: '600' }}>
                  Edit fulfillment
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 4 }}>
                  Update only fulfillment details for this order.
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              >
                <X size={18} color={colors.text.secondary} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: 560 }}
              contentContainerStyle={{ padding: 20, gap: 18 }}
              keyboardShouldPersistTaps="handled"
            >
              <View>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '500', marginBottom: 10 }}>
                  Order type
                </Text>
                <Pressable
                  onPress={() => setShowOrderTypeMenu((open) => !open)}
                  style={{
                    minHeight: 48,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.input.bg,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                  }}
                >
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                    {selectedOrderType.name}
                  </Text>
                  <ChevronDown size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
                {showOrderTypeMenu ? (
                  <View
                    style={{
                      marginTop: 8,
                      borderRadius: 16,
                      overflow: 'hidden',
                      backgroundColor: colors.bg.card,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                    }}
                  >
                    {availableOrderTypes.map((type, index) => {
                      const selected = type.id === selectedOrderType.id;
                      return (
                        <Pressable
                          key={type.id}
                          onPress={() => {
                            setOrderTypeId(type.id);
                            setShowOrderTypeMenu(false);
                          }}
                          style={{
                            minHeight: 46,
                            paddingHorizontal: 14,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderTopWidth: index > 0 ? 1 : 0,
                            borderTopColor: colors.border.light,
                          }}
                        >
                          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: selected ? '600' : '400' }}>
                            {type.name}
                          </Text>
                          {selected ? <Check size={16} color={colors.text.primary} strokeWidth={2.4} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              <View
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  backgroundColor: colors.bg.secondary,
                  padding: 16,
                  gap: 10,
                }}
              >
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600' }}>
                  Timeline preview
                </Text>
                <Text style={{ color: colors.text.secondary, fontSize: 13 }}>
                  {resolvedTimeline.minBusinessDays}-{resolvedTimeline.maxBusinessDays} total business days
                  {resolvedTimeline.shippingZone ? ` · ${resolvedTimeline.shippingZone.name}` : ''}
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                  {resolvedTimeline.shippingZone
                    ? `${resolvedTimeline.orderType.minBusinessDays}-${resolvedTimeline.orderType.maxBusinessDays} processing days + ${resolvedTimeline.shippingZone.minBusinessDays}-${resolvedTimeline.shippingZone.maxBusinessDays} delivery days`
                    : `${resolvedTimeline.orderType.minBusinessDays}-${resolvedTimeline.orderType.maxBusinessDays} processing days`}
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                  Delivery state: {order.deliveryState || 'Not set'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  <View
                    style={{
                      flex: 1,
                      minWidth: 160,
                      borderRadius: 14,
                      padding: 14,
                      backgroundColor: colors.bg.card,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                    }}
                  >
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase' }}>
                      Started
                    </Text>
                    <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500', marginTop: 6 }}>
                      {formatFullDate(startedAt)}
                    </Text>
                  </View>
                  <View
                    style={{
                      flex: 1,
                      minWidth: 160,
                      borderRadius: 14,
                      padding: 14,
                      backgroundColor: colors.bg.card,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                    }}
                  >
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase' }}>
                      Estimated delivery
                    </Text>
                    <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500', marginTop: 6 }}>
                      {formatFullDate(nextOriginalEta)}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View
              style={{
                padding: 20,
                borderTopWidth: 1,
                borderTopColor: colors.border.light,
                flexDirection: 'row',
                gap: 10,
              }}
            >
              <Pressable
                onPress={onClose}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                }}
              >
                <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '600' }}>
                  Close
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void handleSave();
                }}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.text.primary,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <Text style={{ color: colors.bg.primary, fontSize: 14, fontWeight: '600' }}>
                  {saving ? 'Saving...' : 'Save fulfillment'}
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
