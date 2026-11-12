import React, { useEffect, useMemo, useState } from 'react';
import { isPickupOrder } from '@/lib/pickup';
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
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
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
  const palette = usePaymentsPalette();
  // Always a centered card, on phones too.
  const fullscreen = false;
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
      fulfillmentMethod: isPickupOrder(order) ? 'pickup' : order.fulfillmentMethod,
    },
    orderTimelineSettings
  ), [order.deliveryState, order.fulfillmentMethod, order.fulfillmentType, order.shippingOptionId, order.orderTypeName, orderTimelineSettings, orderTypeId]);

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

  const eyebrow = { color: palette.faint, fontSize: 10, fontWeight: '600' as const, letterSpacing: 1.1, textTransform: 'uppercase' as const };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.76)',
            alignItems: fullscreen ? 'stretch' : 'center',
            justifyContent: fullscreen ? 'flex-start' : 'center',
            padding: 16,
          }}
        >
          <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View
            style={{
              flex: fullscreen ? 1 : undefined,
              width: '100%',
              maxWidth: fullscreen ? undefined : 560,
              maxHeight: fullscreen ? undefined : '90%',
              alignSelf: fullscreen ? 'stretch' : 'center',
              borderRadius: fullscreen ? 0 : 28,
              borderWidth: fullscreen ? 0 : 1,
              borderColor: palette.outline,
              backgroundColor: palette.card,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                paddingHorizontal: 22,
                paddingTop: 20,
                paddingBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottomWidth: 1,
                borderBottomColor: palette.hairline,
              }}
            >
              <View style={{ flex: 1, paddingRight: 16 }}>
                <Text style={{ color: palette.limeOnSurface, fontSize: 10, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 5 }}>
                  Order fulfillment
                </Text>
                <MoneyText style={{ color: palette.text, fontSize: fullscreen ? 20 : 22, lineHeight: fullscreen ? 24 : 27 }}>Edit fulfillment</MoneyText>
                <Text style={{ color: palette.muted, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                  Update only fulfillment details for this order.
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close edit fulfillment"
                style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.softFill, opacity: pressed ? 0.6 : 1 })}
              >
                <X size={18} color={palette.text} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView
              style={{ flexGrow: fullscreen ? 1 : 0, flexShrink: 1 }}
              contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 24, gap: 20 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View>
                <Text style={{ color: palette.textSoft, fontSize: 12, fontWeight: '600', marginBottom: 7 }}>Order type</Text>
                <Pressable
                  onPress={() => setShowOrderTypeMenu((open) => !open)}
                  style={{
                    height: 50,
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: palette.inputBg,
                    borderWidth: 1,
                    borderColor: showOrderTypeMenu ? FYLL_LIME : palette.outline,
                  }}
                >
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                    {selectedOrderType.name}
                  </Text>
                  <ChevronDown size={18} color={palette.muted} strokeWidth={2} />
                </Pressable>
                {showOrderTypeMenu ? (
                  <View style={{ marginTop: 8, borderRadius: 14, overflow: 'hidden', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.outline }}>
                    {availableOrderTypes.map((type, index) => {
                      const selected = type.id === selectedOrderType.id;
                      return (
                        <Pressable
                          key={type.id}
                          onPress={() => {
                            setOrderTypeId(type.id);
                            setShowOrderTypeMenu(false);
                          }}
                          style={({ pressed }) => ({
                            minHeight: 46,
                            paddingHorizontal: 14,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderTopWidth: index > 0 ? 1 : 0,
                            borderTopColor: palette.hairline,
                            backgroundColor: selected ? palette.nudgeBg : 'transparent',
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Text style={{ color: selected ? palette.limeOnSurface : palette.textSoft, fontSize: 14, fontWeight: selected ? '600' : '400' }}>
                            {type.name}
                          </Text>
                          {selected ? <Check size={16} color={palette.limeOnSurface} strokeWidth={2.4} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              <View style={{ gap: 12 }}>
                <Text style={eyebrow}>Timeline preview</Text>
                <View style={{ borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.inset, padding: 16, gap: 6 }}>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>
                    {resolvedTimeline.minBusinessDays}-{resolvedTimeline.maxBusinessDays} total business days
                    {resolvedTimeline.shippingZone ? ` · ${resolvedTimeline.shippingZone.name}` : ''}
                  </Text>
                  <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }}>
                    {resolvedTimeline.shippingZone
                      ? `${resolvedTimeline.orderType.minBusinessDays}-${resolvedTimeline.orderType.maxBusinessDays} processing days + ${resolvedTimeline.shippingZone.minBusinessDays}-${resolvedTimeline.shippingZone.maxBusinessDays} delivery days`
                      : `${resolvedTimeline.orderType.minBusinessDays}-${resolvedTimeline.orderType.maxBusinessDays} processing days`}
                  </Text>
                  <Text style={{ color: palette.faint, fontSize: 12 }}>
                    Delivery state: {order.deliveryState || 'Not set'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {[
                    { label: 'Started', value: formatFullDate(startedAt), accent: false },
                    { label: 'Estimated delivery', value: formatFullDate(nextOriginalEta), accent: true },
                  ].map((tile) => (
                    <View
                      key={tile.label}
                      style={{
                        flex: 1,
                        minWidth: 150,
                        borderRadius: 16,
                        padding: 14,
                        backgroundColor: tile.accent ? palette.nudgeBg : palette.inset,
                        borderWidth: 1,
                        borderColor: tile.accent ? palette.nudgeBorder : palette.border,
                      }}
                    >
                      <Text style={eyebrow}>{tile.label}</Text>
                      <Text style={{ color: tile.accent ? palette.limeOnSurface : palette.text, fontSize: 14, fontWeight: '600', marginTop: 6 }}>
                        {tile.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View
              style={{
                paddingHorizontal: 22,
                paddingTop: 16,
                paddingBottom: fullscreen ? 28 : 20,
                borderTopWidth: 1,
                borderTopColor: palette.hairline,
                flexDirection: fullscreen ? 'column-reverse' : 'row',
                gap: 10,
              }}
            >
              <Pressable
                onPress={onClose}
                style={({ pressed }) => ({ flex: fullscreen ? undefined : 0.42, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.outline, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Close</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void handleSave();
                }}
                disabled={saving}
                style={({ pressed }) => ({ flex: fullscreen ? undefined : 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME, opacity: saving ? 0.6 : pressed ? 0.85 : 1 })}
              >
                <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14 }}>{saving ? 'Saving...' : 'Save fulfillment'}</MoneyText>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
