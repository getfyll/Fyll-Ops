import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, Image } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Circle,
  Copy,
  Landmark,
  ShieldCheck,
  Truck,
} from 'lucide-react-native';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { PRODUCT_DETAILS, STORE_BRAND } from '@/lib/storefront-catalog';
import {
  type StorefrontPaymentReceipt,
  useStorefrontStore,
} from '@/lib/storefront-store';

type CheckoutStep = 'contact' | 'shipping' | 'review';

type CheckoutForm = {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  updatesOptIn: boolean;
};

type ShippingOption = {
  id: string;
  name: string;
  eta: string;
  description: string;
  priceValue: number;
};

const CHECKOUT_STEPS: Array<{ id: CheckoutStep; label: string }> = [
  { id: 'contact', label: 'Contact' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'review', label: 'Review' },
];

const SHIPPING_OPTIONS: ShippingOption[] = [
  {
    id: 'lagos-standard',
    name: 'Standard delivery',
    eta: '2-4 business days',
    description: 'Reliable doorstep delivery for most orders.',
    priceValue: 4500,
  },
  {
    id: 'lagos-express',
    name: 'Express delivery',
    eta: 'Next business day',
    description: 'Priority fulfilment for faster dispatch.',
    priceValue: 7500,
  },
  {
    id: 'pickup',
    name: 'Pickup point',
    eta: 'Same day confirmation',
    description: 'Collect from our selected partner pickup location.',
    priceValue: 2500,
  },
];

function formatCurrency(value: number) {
  return `₦${value.toLocaleString()}`;
}

export default function StorefrontCheckoutScreen() {
  const router = useRouter();
  const { isMobile, isDesktop } = useBreakpoint();
  const cartItems = useStorefrontStore((state) => state.cartItems);
  const submitPendingOrder = useStorefrontStore((state) => state.submitPendingOrder);
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('contact');
  const [summaryOpen, setSummaryOpen] = useState<boolean>(false);
  const [shippingOptionId, setShippingOptionId] = useState<string>('lagos-standard');
  const [promoCode, setPromoCode] = useState<string>('');
  const [paymentMarkedSent, setPaymentMarkedSent] = useState<boolean>(false);
  const [uploadedReceipt, setUploadedReceipt] = useState<StorefrontPaymentReceipt | null>(null);
  const [paymentWindowStartedAt, setPaymentWindowStartedAt] = useState<number | null>(null);
  const [paymentTimeRemaining, setPaymentTimeRemaining] = useState<number>(300);
  const [paymentExpired, setPaymentExpired] = useState<boolean>(false);
  const [pendingOrderId] = useState<string>(() => `pending-${Date.now()}-${Math.round(Math.random() * 1000)}`);
  const [orderReference] = useState<string>(() => `FYL-${Math.floor(100000 + Math.random() * 900000)}`);
  const [form, setForm] = useState<CheckoutForm>({
    email: 'nimahshoney@gmail.com',
    phone: '08162845616',
    firstName: 'Zainab',
    lastName: 'Sarumi',
    address1: '54 Wensleydale Road',
    address2: 'Apartment 3B',
    city: 'Birmingham',
    state: 'West Midlands',
    country: 'United Kingdom',
    postalCode: 'B42 1PR',
    updatesOptIn: true,
  });

  const cartProducts = useMemo(
    () =>
      Object.values(cartItems)
        .map((item) => {
          const product = PRODUCT_DETAILS[item.productId];
          if (!product) {
            return null;
          }

          return {
            item,
            product,
            lineTotal: product.priceValue * item.quantity,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    [cartItems]
  );

  const subtotal = useMemo(
    () => cartProducts.reduce((sum, entry) => sum + entry.lineTotal, 0),
    [cartProducts]
  );
  const selectedShipping = useMemo(
    () => SHIPPING_OPTIONS.find((option) => option.id === shippingOptionId) ?? SHIPPING_OPTIONS[0],
    [shippingOptionId]
  );
  const shippingCost = selectedShipping.priceValue;
  const total = subtotal + shippingCost;
  const activeStepIndex = CHECKOUT_STEPS.findIndex((step) => step.id === currentStep);
  const paymentReady = paymentMarkedSent && uploadedReceipt !== null && !paymentExpired;
  const paymentMinutes = Math.floor(paymentTimeRemaining / 60);
  const paymentSeconds = paymentTimeRemaining % 60;
  const brandInitial = STORE_BRAND.avatarText || STORE_BRAND.name.charAt(0).toUpperCase();

  const updateForm = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const pickPaymentReceipt = async () => {
    if (paymentExpired) {
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const [asset] = result.assets;
    setUploadedReceipt({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
    });
  };

  const goToNextStep = () => {
    if (currentStep === 'contact') {
      setCurrentStep('shipping');
      return;
    }
    if (currentStep === 'shipping') {
      setCurrentStep('review');
    }
  };

  const stepButtonLabel =
    currentStep === 'contact' ? 'Continue to shipping' :
    currentStep === 'shipping' ? 'Continue to review' :
    paymentExpired ? 'Restart checkout' : paymentReady ? 'Submit payment proof' : 'Complete payment steps';

  useEffect(() => {
    if (currentStep !== 'review' || paymentExpired) {
      return;
    }

    if (paymentWindowStartedAt === null) {
      setPaymentWindowStartedAt(Date.now());
      setPaymentTimeRemaining(300);
      return;
    }

    const intervalId = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - paymentWindowStartedAt) / 1000);
      const remainingSeconds = Math.max(0, 300 - elapsedSeconds);
      setPaymentTimeRemaining(remainingSeconds);

      if (remainingSeconds === 0) {
        setPaymentExpired(true);
        setPaymentMarkedSent(false);
        setUploadedReceipt(null);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [currentStep, paymentExpired, paymentWindowStartedAt]);

  const restartCheckout = () => {
    setPaymentExpired(false);
    setPaymentWindowStartedAt(null);
    setPaymentTimeRemaining(300);
    setPaymentMarkedSent(false);
    setUploadedReceipt(null);
    setCurrentStep('contact');
  };

  const renderInput = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    placeholder?: string,
    grow = false
  ) => (
    <View style={{ flex: grow ? 1 : undefined }}>
      <Text style={{ color: '#737373', fontSize: 12, fontWeight: '500', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#A3A3A3"
        style={{
          height: 52,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: 'rgba(15, 23, 42, 0.08)',
          backgroundColor: '#FFFFFF',
          paddingHorizontal: 16,
          color: '#111111',
          fontSize: 15,
          fontWeight: '400',
        }}
      />
    </View>
  );

  const renderOrderSummary = (mobile: boolean) => {
    if (!mobile) {
      return (
        <View style={{ width: 360 }}>
          <View
            style={{
              position: 'sticky' as any,
              top: 24,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: 'rgba(15, 23, 42, 0.08)',
              backgroundColor: '#FFFFFF',
              padding: 22,
            }}
          >
            <Text style={{ color: '#111111', fontSize: 20, fontWeight: '500' }}>Order summary</Text>

            <View style={{ gap: 14, marginTop: 18 }}>
              {cartProducts.map(({ item, product, lineTotal }) => (
                <View key={product.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Image
                    source={{ uri: product.images[0] }}
                    style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#F4F4F5' }}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>{product.name}</Text>
                    <Text style={{ color: '#A3A3A3', fontSize: 13, fontWeight: '400', marginTop: 4 }}>
                      ×{item.quantity}
                      {item.selectedSize ? ` · ${item.selectedSize}` : ''}
                    </Text>
                  </View>
                  <Text style={{ color: '#111111', fontSize: 14, fontWeight: '600' }}>{formatCurrency(lineTotal)}</Text>
                </View>
              ))}
            </View>

            <View
              style={{
                marginTop: 18,
                flexDirection: 'row',
                gap: 10,
              }}
            >
              <TextInput
                value={promoCode}
                onChangeText={setPromoCode}
                placeholder="Promo code"
                placeholderTextColor="#A3A3A3"
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(15, 23, 42, 0.08)',
                  paddingHorizontal: 16,
                  color: '#111111',
                  fontSize: 14,
                }}
              />
              <Pressable
                style={({ hovered }) => ({
                  height: 46,
                  borderRadius: 999,
                  paddingHorizontal: 18,
                  backgroundColor: hovered ? '#F4F4F5' : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: 'rgba(15, 23, 42, 0.08)',
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>Apply</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 22, gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#737373', fontSize: 14, fontWeight: '400' }}>Subtotal</Text>
                <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>{formatCurrency(subtotal)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#737373', fontSize: 14, fontWeight: '400' }}>Shipping</Text>
                <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>{formatCurrency(shippingCost)}</Text>
              </View>
              <View style={{ height: 1, backgroundColor: 'rgba(15, 23, 42, 0.08)' }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#111111', fontSize: 18, fontWeight: '500' }}>Total</Text>
                <Text style={{ color: '#111111', fontSize: 18, fontWeight: '600' }}>{formatCurrency(total)}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18 }}>
              <ShieldCheck size={15} color="#26A269" strokeWidth={2.2} />
              <Text style={{ color: '#737373', fontSize: 13, fontWeight: '400', marginLeft: 8 }}>
                Secure checkout. Payment details stay protected.
              </Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: 'rgba(15, 23, 42, 0.08)',
          backgroundColor: '#FFFFFF',
          overflow: 'hidden',
        }}
      >
        <Pressable
          onPress={() => setSummaryOpen((current) => !current)}
          style={{
            minHeight: 54,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Truck size={16} color="#111111" strokeWidth={2.1} />
            <Text style={{ color: '#111111', fontSize: 15, fontWeight: '500', marginLeft: 8 }}>Order summary</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: '#111111', fontSize: 15, fontWeight: '600', marginRight: 10 }}>{formatCurrency(total)}</Text>
            <ChevronDown
              size={16}
              color="#111111"
              strokeWidth={2.2}
              style={{ transform: [{ rotate: summaryOpen ? '180deg' : '0deg' }] }}
            />
          </View>
        </Pressable>

        {summaryOpen ? (
          <View style={{ paddingHorizontal: 18, paddingBottom: 18, borderTopWidth: 1, borderTopColor: 'rgba(15, 23, 42, 0.08)' }}>
            <View style={{ gap: 12, marginTop: 16 }}>
              {cartProducts.map(({ item, product, lineTotal }) => (
                <View key={product.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Image
                    source={{ uri: product.images[0] }}
                    style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#F4F4F5' }}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>{product.name}</Text>
                    <Text style={{ color: '#A3A3A3', fontSize: 12, fontWeight: '400', marginTop: 4 }}>×{item.quantity}</Text>
                  </View>
                  <Text style={{ color: '#111111', fontSize: 14, fontWeight: '600' }}>{formatCurrency(lineTotal)}</Text>
                </View>
              ))}
            </View>

            <View style={{ marginTop: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#737373', fontSize: 14 }}>Subtotal</Text>
                <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>{formatCurrency(subtotal)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#737373', fontSize: 14 }}>Shipping</Text>
                <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>{formatCurrency(shippingCost)}</Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={{ flex: 1, backgroundColor: '#FFFFFF' }}
        contentContainerStyle={{
          paddingHorizontal: isMobile ? 16 : 32,
          paddingTop: isMobile ? 20 : 30,
          paddingBottom: 48,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 1180,
            alignSelf: 'center',
          }}
        >
          <View
            style={{
              gap: 8,
              marginBottom: isMobile ? 24 : 36,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              }}
            >
              <Pressable
                onPress={() => router.back()}
                style={{
                  height: 40,
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: 'rgba(15, 23, 42, 0.08)',
                }}
              >
                <ChevronLeft size={16} color="#111111" strokeWidth={2.2} />
                <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500', marginLeft: 6 }}>Back</Text>
              </Pressable>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-end',
                  flex: 1,
                  marginLeft: 16,
                }}
              >
                <View style={{ alignItems: 'flex-end', marginRight: 10, marginTop: 2 }}>
                  <Text
                    style={{
                      color: '#A3A3A3',
                      fontSize: 11,
                      fontWeight: '500',
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      textAlign: 'right',
                    }}
                  >
                    Checking out
                  </Text>
                  <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500', marginTop: 2 }}>{STORE_BRAND.name}</Text>
                </View>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: '#111111',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>{brandInitial}</Text>
                </View>
              </View>
            </View>
          </View>

          <View
            style={{
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'flex-start',
              gap: isMobile ? 18 : 28,
              marginTop: isMobile ? 8 : 18,
            }}
          >
            {isMobile ? renderOrderSummary(true) : null}
            <View style={{ flex: isDesktop ? 1.1 : 1, minWidth: 0 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: isMobile ? 10 : 18,
                  marginTop: isMobile ? 2 : 6,
                  marginBottom: 24,
                }}
              >
                {CHECKOUT_STEPS.map((step, index) => {
                  const isActive = currentStep === step.id;
                  const isComplete = index < activeStepIndex;
                  return (
                    <React.Fragment key={step.id}>
                      <Pressable
                        onPress={() => {
                          if (isComplete) {
                            setCurrentStep(step.id);
                          }
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          opacity: isActive || isComplete ? 1 : 0.72,
                        }}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: isActive ? '#111111' : isComplete ? '#26A269' : '#D4D4D8',
                            backgroundColor: isActive ? '#111111' : '#FFFFFF',
                          }}
                        >
                          {isComplete ? (
                            <Check size={11} color="#26A269" strokeWidth={2.4} />
                          ) : isActive ? (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' }} />
                          ) : null}
                        </View>
                        <Text style={{ color: isActive ? '#111111' : '#737373', fontSize: 14, fontWeight: '500', marginLeft: 8 }}>
                          {step.label}
                        </Text>
                      </Pressable>
                      {index < CHECKOUT_STEPS.length - 1 ? (
                        <View style={{ width: isMobile ? 18 : 34, height: 1, backgroundColor: 'rgba(15, 23, 42, 0.10)' }} />
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </View>

              <View
                style={{
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: 'rgba(15, 23, 42, 0.08)',
                  backgroundColor: '#FFFFFF',
                  padding: isMobile ? 18 : 28,
                }}
              >
                {currentStep === 'contact' ? (
                  <>
                    <Text style={{ color: '#111111', fontSize: 22, fontWeight: '500' }}>Contact</Text>
                    <Text style={{ color: '#737373', fontSize: 14, fontWeight: '400', marginTop: 8 }}>
                      Start with the customer details we need for order updates and delivery coordination.
                    </Text>

                    <View style={{ marginTop: 22, gap: 16 }}>
                      {renderInput('Email', form.email, (text) => updateForm('email', text), 'name@example.com')}
                      {renderInput('Phone', form.phone, (text) => updateForm('phone', text), '0800 000 0000')}
                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
                        {renderInput('First name', form.firstName, (text) => updateForm('firstName', text), 'First name', true)}
                        {renderInput('Last name', form.lastName, (text) => updateForm('lastName', text), 'Last name', true)}
                      </View>
                    </View>

                    <Pressable
                      onPress={() => updateForm('updatesOptIn', !form.updatesOptIn)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginTop: 20,
                      }}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: form.updatesOptIn ? '#111111' : 'rgba(15, 23, 42, 0.16)',
                          backgroundColor: form.updatesOptIn ? '#111111' : '#FFFFFF',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {form.updatesOptIn ? <Check size={12} color="#FFFFFF" strokeWidth={2.8} /> : null}
                      </View>
                      <Text style={{ color: '#111111', fontSize: 14, fontWeight: '400', marginLeft: 10 }}>
                        Keep me updated on new drops and delivery updates.
                      </Text>
                    </Pressable>
                  </>
                ) : null}

                {currentStep === 'shipping' ? (
                  <>
                    <Text style={{ color: '#111111', fontSize: 22, fontWeight: '500' }}>Shipping</Text>
                    <Text style={{ color: '#737373', fontSize: 14, fontWeight: '400', marginTop: 8 }}>
                      Delivery details and method selection, kept clear and compact.
                    </Text>

                    <View style={{ marginTop: 22, gap: 16 }}>
                      {renderInput('Street address', form.address1, (text) => updateForm('address1', text), 'Street address')}
                      {renderInput('Apartment / suite', form.address2, (text) => updateForm('address2', text), 'Apartment / suite')}
                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
                        {renderInput('Town / City', form.city, (text) => updateForm('city', text), 'City', true)}
                        {renderInput('State / Region', form.state, (text) => updateForm('state', text), 'State', true)}
                      </View>
                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
                        {renderInput('Country', form.country, (text) => updateForm('country', text), 'Country', true)}
                        {renderInput('Postal code', form.postalCode, (text) => updateForm('postalCode', text), 'Postal code', true)}
                      </View>
                    </View>

                    <View style={{ marginTop: 24 }}>
                      <Text style={{ color: '#111111', fontSize: 15, fontWeight: '500', marginBottom: 14 }}>Delivery method</Text>
                      <View style={{ gap: 12 }}>
                        {SHIPPING_OPTIONS.map((option) => {
                          const active = option.id === shippingOptionId;
                          return (
                            <Pressable
                              key={option.id}
                              onPress={() => setShippingOptionId(option.id)}
                              style={{
                                borderRadius: 20,
                                borderWidth: 1,
                                borderColor: active ? '#111111' : 'rgba(15, 23, 42, 0.08)',
                                backgroundColor: active ? '#FAFAFA' : '#FFFFFF',
                                padding: 16,
                                flexDirection: 'row',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: 16,
                              }}
                            >
                              <View style={{ flexDirection: 'row', flex: 1 }}>
                                <View style={{ marginTop: 2 }}>
                                  {active ? (
                                    <Check size={16} color="#111111" strokeWidth={2.6} />
                                  ) : (
                                    <Circle size={16} color="#C4C4C8" strokeWidth={1.8} />
                                  )}
                                </View>
                                <View style={{ marginLeft: 12, flex: 1 }}>
                                  <Text style={{ color: '#111111', fontSize: 15, fontWeight: '500' }}>{option.name}</Text>
                                  <Text style={{ color: '#737373', fontSize: 14, fontWeight: '400', marginTop: 6 }}>{option.eta}</Text>
                                  <Text style={{ color: '#737373', fontSize: 14, fontWeight: '400', marginTop: 6 }}>{option.description}</Text>
                                </View>
                              </View>
                              <Text style={{ color: '#111111', fontSize: 15, fontWeight: '600' }}>{formatCurrency(option.priceValue)}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </>
                ) : null}

                {currentStep === 'review' ? (
                  <>
                    <Text style={{ color: '#111111', fontSize: 22, fontWeight: '500' }}>Review your order</Text>
                    <Text style={{ color: '#737373', fontSize: 14, fontWeight: '400', marginTop: 8 }}>
                      One last pass before confirming the order and showing the transfer instructions.
                    </Text>

                    <View style={{ marginTop: 22, gap: 14 }}>
                      <View
                        style={{
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: 'rgba(15, 23, 42, 0.08)',
                          padding: 16,
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: '#A3A3A3', fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Contact
                          </Text>
                          <Pressable onPress={() => setCurrentStep('contact')}>
                            <Text style={{ color: '#737373', fontSize: 13, fontWeight: '500' }}>Edit</Text>
                          </Pressable>
                        </View>
                        <Text style={{ color: '#111111', fontSize: 15, fontWeight: '500', marginTop: 10 }}>
                          {form.firstName} {form.lastName}
                        </Text>
                        <Text style={{ color: '#525252', fontSize: 14, fontWeight: '400', marginTop: 6 }}>
                          {form.email} · {form.phone}
                        </Text>
                      </View>

                      <View
                        style={{
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: 'rgba(15, 23, 42, 0.08)',
                          padding: 16,
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: '#A3A3A3', fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Shipping to
                          </Text>
                          <Pressable onPress={() => setCurrentStep('shipping')}>
                            <Text style={{ color: '#737373', fontSize: 13, fontWeight: '500' }}>Edit</Text>
                          </Pressable>
                        </View>
                        <Text style={{ color: '#111111', fontSize: 15, fontWeight: '500', marginTop: 10 }}>
                          {form.address1}, {form.address2}
                        </Text>
                        <Text style={{ color: '#525252', fontSize: 14, fontWeight: '400', marginTop: 6 }}>
                          {form.city}, {form.state}, {form.postalCode}, {form.country}
                        </Text>
                        <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500', marginTop: 12 }}>
                          {selectedShipping.name} · {formatCurrency(selectedShipping.priceValue)}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        marginTop: 22,
                        borderRadius: 20,
                        backgroundColor: '#FAFAFA',
                        padding: 16,
                      }}
                    >
                      <View
                        style={{
                          borderRadius: 16,
                          backgroundColor: paymentExpired ? '#FEF2F2' : '#FFF7ED',
                          borderWidth: 1,
                          borderColor: paymentExpired ? '#FECACA' : '#FED7AA',
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          marginBottom: 16,
                        }}
                      >
                        <Text style={{ color: paymentExpired ? '#991B1B' : '#9A3412', fontSize: 14, fontWeight: '500' }}>
                          {paymentExpired
                            ? 'Payment window expired. Restart checkout to generate a fresh payment confirmation session.'
                            : `Payment window: ${paymentMinutes}:${paymentSeconds.toString().padStart(2, '0')} left to confirm and upload receipt.`}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Landmark size={16} color="#111111" strokeWidth={2.2} />
                        <Text style={{ color: '#111111', fontSize: 15, fontWeight: '500', marginLeft: 8 }}>Payment</Text>
                      </View>
                      <Text style={{ color: '#737373', fontSize: 14, fontWeight: '400', lineHeight: 22, marginTop: 8 }}>
                        Payment is made by bank transfer. Your order is only reviewed after you send payment and upload your receipt here.
                      </Text>

                      <View
                        style={{
                          marginTop: 16,
                          borderRadius: 18,
                          backgroundColor: '#FFFFFF',
                          borderWidth: 1,
                          borderColor: 'rgba(15, 23, 42, 0.08)',
                          padding: 14,
                          gap: 12,
                        }}
                      >
                        <View>
                          <Text style={{ color: '#A3A3A3', fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Account name
                          </Text>
                          <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500', marginTop: 6 }}>Fyll Commerce Ltd</Text>
                        </View>
                        <View>
                          <Text style={{ color: '#A3A3A3', fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Bank
                          </Text>
                          <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500', marginTop: 6 }}>Providus Bank</Text>
                        </View>
                        <View>
                          <Text style={{ color: '#A3A3A3', fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Account number
                          </Text>
                          <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500', marginTop: 6 }}>2048830197</Text>
                        </View>
                        <View>
                          <Text style={{ color: '#A3A3A3', fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Amount due
                          </Text>
                          <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500', marginTop: 6 }}>{formatCurrency(total)}</Text>
                        </View>
                        <View>
                          <Text style={{ color: '#A3A3A3', fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Payment reference
                          </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                            <Text style={{ color: '#111111', fontSize: 16, fontWeight: '500' }}>{orderReference}</Text>
                            <Pressable
                              style={({ hovered }) => ({
                                height: 34,
                                borderRadius: 999,
                                paddingHorizontal: 12,
                                backgroundColor: hovered ? '#F0F1F4' : '#FFFFFF',
                                borderWidth: 1,
                                borderColor: 'rgba(15, 23, 42, 0.08)',
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                              })}
                            >
                              <Copy size={13} color="#111111" strokeWidth={2.2} />
                              <Text style={{ color: '#111111', fontSize: 12, fontWeight: '500', marginLeft: 6 }}>Copy</Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>

                      <Pressable
                        onPress={pickPaymentReceipt}
                        style={({ hovered }) => ({
                          marginTop: 16,
                          height: 46,
                          borderRadius: 999,
                          paddingHorizontal: 16,
                          alignSelf: 'flex-start',
                          backgroundColor: paymentExpired ? '#E5E7EB' : hovered ? '#F4F4F5' : '#FFFFFF',
                          borderWidth: 1,
                          borderColor: 'rgba(15, 23, 42, 0.08)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        })}
                      >
                        <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>
                          {uploadedReceipt ? 'Replace payment receipt' : 'Upload payment receipt'}
                        </Text>
                      </Pressable>

                      {uploadedReceipt ? (
                        <View style={{ marginTop: 10, gap: 4 }}>
                          <Text style={{ color: '#525252', fontSize: 13, fontWeight: '400' }}>
                            Attached: {uploadedReceipt.name}
                          </Text>
                          {uploadedReceipt.size ? (
                            <Text style={{ color: '#A3A3A3', fontSize: 12, fontWeight: '400' }}>
                              {(uploadedReceipt.size / 1024 / 1024).toFixed(2)} MB
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      <Pressable
                        onPress={() => {
                          if (paymentExpired) {
                            return;
                          }
                          setPaymentMarkedSent((current) => !current);
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginTop: 16,
                          opacity: paymentExpired ? 0.55 : 1,
                        }}
                      >
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: paymentMarkedSent ? '#111111' : 'rgba(15, 23, 42, 0.16)',
                            backgroundColor: paymentMarkedSent ? '#111111' : '#FFFFFF',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {paymentMarkedSent ? <Check size={12} color="#FFFFFF" strokeWidth={2.8} /> : null}
                        </View>
                        <Text style={{ color: '#111111', fontSize: 14, fontWeight: '400', marginLeft: 10, flex: 1 }}>
                          I have made this transfer and uploaded my receipt within 5 minutes.
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}

                <View
                  style={{
                    flexDirection: isMobile ? 'column-reverse' : 'row',
                    alignItems: isMobile ? 'stretch' : 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginTop: 26,
                  }}
                >
                  {currentStep !== 'contact' ? (
                    <Pressable
                      onPress={() =>
                        setCurrentStep(currentStep === 'review' ? 'shipping' : 'contact')
                      }
                      style={({ hovered }) => ({
                        height: 48,
                        borderRadius: 999,
                        paddingHorizontal: 18,
                        backgroundColor: hovered ? '#F4F4F5' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: 'rgba(15, 23, 42, 0.08)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      })}
                    >
                      <Text style={{ color: '#111111', fontSize: 14, fontWeight: '500' }}>Back</Text>
                    </Pressable>
                  ) : (
                    <View />
                  )}

                  <Pressable
                    onPress={() => {
                      if (currentStep === 'review') {
                        if (paymentExpired) {
                          restartCheckout();
                          return;
                        }
                        if (!paymentReady) {
                          return;
                        }
                        submitPendingOrder({
                          id: pendingOrderId,
                          reference: orderReference,
                          status: 'payment_pending_verification',
                          createdAt: new Date().toISOString(),
                          expiresAt: new Date((paymentWindowStartedAt ?? Date.now()) + 300000).toISOString(),
                          subtotal,
                          shippingCost,
                          total,
                          shippingOptionId: selectedShipping.id,
                          shippingOptionName: selectedShipping.name,
                          customer: form,
                          receipt: uploadedReceipt!,
                          items: cartProducts.map(({ item, product, lineTotal }) => ({
                            productId: product.id,
                            productName: product.name,
                            image: product.images[0],
                            quantity: item.quantity,
                            selectedSize: item.selectedSize,
                            unitPrice: product.priceValue,
                            lineTotal,
                          })),
                        });
                        router.push({
                          pathname: '/storefront-thank-you',
                          params: {
                            orderId: pendingOrderId,
                            total: String(total),
                            reference: orderReference,
                          },
                        } as any);
                        return;
                      }
                      goToNextStep();
                    }}
                    style={({ hovered }) => ({
                      height: 50,
                      borderRadius: 999,
                      paddingHorizontal: 24,
                      minWidth: isMobile ? undefined : 220,
                      backgroundColor:
                        currentStep === 'review' && !paymentReady
                          ? '#D4D4D8'
                          : hovered
                            ? '#242424'
                            : '#111111',
                      alignItems: 'center',
                      justifyContent: 'center',
                    })}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '500' }}>{stepButtonLabel}</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {!isMobile ? renderOrderSummary(false) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
