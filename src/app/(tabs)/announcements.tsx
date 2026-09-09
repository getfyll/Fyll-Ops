import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, Copy, Mail, Megaphone, Send, Settings, Users } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import useFyllStore, { type Customer, type Order } from '@/lib/state/fyll-store';
import { supabase } from '@/lib/supabase';
import { useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import { storage } from '@/lib/storage';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';

type AudienceType = 'all' | 'status' | 'source';
type AnnouncementSection = 'compose' | 'setup';
type AnnouncementTemplateMode = 'simple' | 'order' | 'delivery' | 'custom';
type TestEmailState = 'idle' | 'sending' | 'sent' | 'error';

type SentAnnouncement = {
  id: string;
  audienceLabel: string;
  subject: string;
  message: string;
  recipientCount: number;
  sentAt: string;
};

const AUDIENCE_OPTIONS: Array<{ key: AudienceType; label: string; helper: string }> = [
  { key: 'all', label: 'All customers', helper: 'Every customer with an email address.' },
  { key: 'status', label: 'By order status', helper: 'Customers with orders in a selected status.' },
  { key: 'source', label: 'By sale source', helper: 'Customers from a selected sales channel.' },
];

const ANNOUNCEMENT_SECTIONS: Array<{ key: AnnouncementSection; label: string }> = [
  { key: 'compose', label: 'Compose' },
  { key: 'setup', label: 'Setup' },
];

const TEMPLATE_MODES: Array<{ key: AnnouncementTemplateMode; label: string; helper: string }> = [
  { key: 'simple', label: 'Simple update', helper: 'General customer announcements.' },
  { key: 'order', label: 'Order update', helper: 'Messages tied to order progress.' },
  { key: 'delivery', label: 'Delivery update', helper: 'Dispatch and delivery notices.' },
  { key: 'custom', label: 'Custom', helper: 'Use your own structure.' },
];

const TEMPLATE_MODE_PREVIEW: Record<AnnouncementTemplateMode, {
  eyebrow: string;
  defaultTitle: string;
  defaultMessage: string;
  highlightLabel: string;
  highlightTag: string;
}> = {
  simple: {
    eyebrow: 'Customer update',
    defaultTitle: 'Customer update',
    defaultMessage: 'Hi {{first_name}},\n\nWe have an update from {{business_name}}.',
    highlightLabel: 'Audience',
    highlightTag: '{{customer_name}}',
  },
  order: {
    eyebrow: 'Order update',
    defaultTitle: 'Update about your order',
    defaultMessage: 'Hi {{first_name}},\n\nWe have an update about {{order_number}} from {{business_name}}.',
    highlightLabel: 'Order reference',
    highlightTag: '{{order_number}}',
  },
  delivery: {
    eyebrow: 'Delivery update',
    defaultTitle: 'Update about your delivery',
    defaultMessage: 'Hi {{first_name}},\n\nWe have a delivery update for {{order_number}}. Your tracking code is {{tracking_code}}.',
    highlightLabel: 'Tracking code',
    highlightTag: '{{tracking_code}}',
  },
  custom: {
    eyebrow: 'Announcement',
    defaultTitle: 'Custom announcement',
    defaultMessage: 'Hi {{first_name}},\n\n{{business_name}} has an update for you.',
    highlightLabel: 'Reference',
    highlightTag: '{{business_name}}',
  },
};

const MERGE_TAGS = [
  '{{customer_name}}',
  '{{first_name}}',
  '{{business_name}}',
  '{{order_number}}',
  '{{tracking_code}}',
  '{{delivery_state}}',
  '{{support_email}}',
];

const ANNOUNCEMENT_SETUP_STORAGE_KEY = 'fyll_announcement_setup';
const fyllWordmarkPng = require('../../../assets/fyllfyll wordmark.png');

const uniqueByEmail = (customers: Customer[]) => {
  const seen = new Set<string>();
  return customers.filter((customer) => {
    const email = customer.email?.trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
};

const getCustomerFromOrder = (order: Order): Customer => ({
  id: order.customerId || order.id,
  fullName: order.customerName,
  email: order.customerEmail,
  phone: order.customerPhone,
  defaultAddress: order.deliveryAddress,
  defaultState: order.deliveryState,
  createdAt: order.createdAt,
});

const getAnnouncementTestErrorMessage = async (error: unknown) => {
  const fallback = 'Test email failed to send.';
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;

  try {
    const payload = await context?.json?.();
    const detailsMessage = (payload as { details?: { message?: unknown }; error?: unknown } | null)?.details?.message;
    const topLevelMessage = (payload as { error?: unknown } | null)?.error;
    const message = typeof detailsMessage === 'string'
      ? detailsMessage
      : typeof topLevelMessage === 'string'
        ? topLevelMessage
        : '';

    if (message.toLowerCase().includes('domain is not verified')) {
      return 'Sender domain is not verified in Resend.';
    }
    return message || fallback;
  } catch {
    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === 'string' && message ? message : fallback;
  }
};

export default function AnnouncementsScreen() {
  const router = useRouter();
  const { announcementSection } = useLocalSearchParams<{ announcementSection?: string | string[] }>();
  const colors = useThemeColors();
  const { isDesktop, isMobile } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const pageHeadingStyle = getStandardPageHeadingStyle(isMobile);
  const desktopHeaderMinHeight = DESKTOP_PAGE_HEADER_MIN_HEIGHT;
  const isWebDesktop = Platform.OS === 'web' && isDesktop;

  const customers = useFyllStore((s) => s.customers);
  const orders = useFyllStore((s) => s.orders);
  const orderStatuses = useFyllStore((s) => s.orderStatuses);
  const saleSources = useFyllStore((s) => s.saleSources);
  const { businessName, companyName } = useBusinessSettings();
  const defaultSenderName = businessName.trim() || companyName.trim() || 'Fyll Team';

  const [activeSection, setActiveSection] = useState<AnnouncementSection>('compose');
  const [audienceType, setAudienceType] = useState<AudienceType>('all');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sentAnnouncements, setSentAnnouncements] = useState<SentAnnouncement[]>([]);
  const [showAudienceOptions, setShowAudienceOptions] = useState(false);
  const [showRecipientPreview, setShowRecipientPreview] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testEmailState, setTestEmailState] = useState<TestEmailState>('idle');
  const [testEmailMessage, setTestEmailMessage] = useState('');
  const [templateMode, setTemplateMode] = useState<AnnouncementTemplateMode>('simple');
  const [senderName, setSenderName] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('Customer update');
  const [supportEmail, setSupportEmail] = useState('support@fyll.com');
  const [footerNote, setFooterNote] = useState('You are receiving this because you placed an order with {{business_name}}.');
  const [announcementSetupHydrated, setAnnouncementSetupHydrated] = useState(false);

  const isDark = colors.bg.primary === '#111111';
  const pagePaddingBottom = isDesktop ? 32 : tabBarHeight + 24;
  const pageMaxWidth = isWebDesktop ? 1400 : isDesktop ? 980 : undefined;

  const statusOptions = useMemo(() => {
    const configured = orderStatuses.map((status) => status.name).filter(Boolean);
    const fromOrders = orders.map((order) => order.status).filter(Boolean);
    return Array.from(new Set([...configured, ...fromOrders]));
  }, [orderStatuses, orders]);

  const sourceOptions = useMemo(() => {
    const configured = saleSources.map((source) => source.name).filter(Boolean);
    const fromOrders = orders.map((order) => order.source).filter(Boolean);
    return Array.from(new Set([...configured, ...fromOrders]));
  }, [orders, saleSources]);

  useEffect(() => {
    const section = Array.isArray(announcementSection) ? announcementSection[0] : announcementSection;
    if (section === 'setup' || section === 'compose') {
      setActiveSection(section);
    }
  }, [announcementSection]);

  useEffect(() => {
    let active = true;

    storage.getItem(ANNOUNCEMENT_SETUP_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Partial<{
          templateMode: AnnouncementTemplateMode;
          senderName: string;
          announcementTitle: string;
          supportEmail: string;
          footerNote: string;
        }>;

        if (parsed.templateMode && TEMPLATE_MODES.some((mode) => mode.key === parsed.templateMode)) setTemplateMode(parsed.templateMode);
        if (typeof parsed.senderName === 'string') setSenderName(parsed.senderName);
        if (typeof parsed.announcementTitle === 'string') setAnnouncementTitle(parsed.announcementTitle);
        if (typeof parsed.supportEmail === 'string') setSupportEmail(parsed.supportEmail);
        if (typeof parsed.footerNote === 'string') setFooterNote(parsed.footerNote);
      })
      .catch((error) => {
        console.warn('Failed to load announcement setup:', error);
      })
      .finally(() => {
        if (active) setAnnouncementSetupHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!announcementSetupHydrated) return;
    const payload = {
      templateMode,
      senderName,
      announcementTitle,
      supportEmail,
      footerNote,
    };
    storage.setItem(ANNOUNCEMENT_SETUP_STORAGE_KEY, JSON.stringify(payload)).catch((error) => {
      console.warn('Failed to save announcement setup:', error);
    });
  }, [announcementSetupHydrated, announcementTitle, footerNote, senderName, supportEmail, templateMode]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(''), 1800);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (senderName.trim() || !defaultSenderName.trim()) return;
    setSenderName(defaultSenderName);
  }, [defaultSenderName, senderName]);

  const recipientCustomers = useMemo(() => {
    if (audienceType === 'status') {
      if (!selectedStatus) return [];
      return uniqueByEmail(
        orders
          .filter((order) => order.status === selectedStatus)
          .map(getCustomerFromOrder)
      );
    }

    if (audienceType === 'source') {
      if (!selectedSource) return [];
      return uniqueByEmail(
        orders
          .filter((order) => order.source === selectedSource)
          .map(getCustomerFromOrder)
      );
    }

    const customerRows = customers.length > 0
      ? customers
      : orders.map(getCustomerFromOrder);
    return uniqueByEmail(customerRows);
  }, [audienceType, customers, orders, selectedSource, selectedStatus]);

  const audienceLabel = useMemo(() => {
    if (audienceType === 'status') return selectedStatus ? `Orders in ${selectedStatus}` : 'Choose an order status';
    if (audienceType === 'source') return selectedSource ? `${selectedSource} customers` : 'Choose a sale source';
    return 'All customers';
  }, [audienceType, selectedSource, selectedStatus]);

  const sampleCustomer = recipientCustomers[0] ?? customers[0] ?? (orders[0] ? getCustomerFromOrder(orders[0]) : null);
  const sampleOrder = orders.find((order) => order.customerEmail?.trim().toLowerCase() === sampleCustomer?.email?.trim().toLowerCase()) ?? orders[0] ?? null;

  const mergeContext = useMemo(() => {
    const fullName = sampleCustomer?.fullName?.trim() || 'Customer';
    const firstName = fullName.split(' ')[0] || 'Customer';
    return {
      '{{customer_name}}': fullName,
      '{{first_name}}': firstName,
      '{{business_name}}': senderName.trim() || defaultSenderName,
      '{{order_number}}': sampleOrder?.orderNumber || 'ORD-000000',
      '{{tracking_code}}': sampleOrder?.customerTrackingCode || 'TRK000000',
      '{{delivery_state}}': sampleCustomer?.defaultState || sampleOrder?.deliveryState || 'Lagos',
      '{{support_email}}': supportEmail.trim() || 'support@fyll.com',
    };
  }, [defaultSenderName, sampleCustomer, sampleOrder, senderName, supportEmail]);

  const applyMergeTags = (value: string) => {
    return MERGE_TAGS.reduce((next, tag) => next.replaceAll(tag, mergeContext[tag as keyof typeof mergeContext]), value);
  };

  const templatePreview = TEMPLATE_MODE_PREVIEW[templateMode];
  const resolvedSubject = (subject.trim() || announcementTitle.trim()).trim();
  const resolvedTitle = announcementTitle.trim() || templatePreview.defaultTitle;
  const previewSubject = applyMergeTags(resolvedSubject);
  const previewTitle = applyMergeTags(resolvedTitle);
  const previewMessage = applyMergeTags(message.trim() || templatePreview.defaultMessage);
  const previewFooter = applyMergeTags(footerNote.trim());
  const canSend = resolvedSubject.length > 0 && message.trim().length > 0 && recipientCustomers.length > 0;

  const copyMergeTag = async (tag: string) => {
    try {
      await Clipboard.setStringAsync(tag);
      setToastMessage(`Copied ${tag}`);
    } catch {
      setToastMessage('Could not copy tag');
    }
  };

  const handleSendTestEmail = async () => {
    const normalizedEmail = testEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setTestEmailState('error');
      setTestEmailMessage('Enter a test email first.');
      return;
    }

    setTestEmailState('sending');
    setTestEmailMessage('');

    try {
      const { error } = await supabase.functions.invoke('send-announcement-test', {
        body: {
          email: normalizedEmail,
          subject: previewSubject,
          senderName: senderName.trim() || defaultSenderName,
          replyToEmail: supportEmail.trim(),
          title: previewTitle,
          message: previewMessage,
          footer: previewFooter,
        },
      });

      if (error) {
        const message = await getAnnouncementTestErrorMessage(error);
        setTestEmailState('error');
        setTestEmailMessage(message);
        setToastMessage('Test email failed');
        return;
      }
    } catch {
      setTestEmailState('error');
      setTestEmailMessage('Test email failed to send.');
      setToastMessage('Test email failed');
      return;
    }

    setTestEmailState('sent');
    setTestEmailMessage(`Sent test email to ${normalizedEmail}.`);
    setToastMessage('Test email sent');
  };

  const renderMergeTagTools = (helperText: string) => {
    return (
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border.light,
          borderRadius: 24,
          padding: 18,
          backgroundColor: colors.bg.primary,
        }}
      >
        <View style={{ marginBottom: 10 }}>
          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>Merge tags</Text>
        </View>
        <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 19, marginBottom: 12 }}>
          {helperText}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MERGE_TAGS.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => copyMergeTag(tag)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: colors.bg.secondary,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>{tag}</Text>
              <Copy size={12} color={colors.text.secondary} />
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const handleSend = () => {
    if (!canSend) {
      Alert.alert('Check announcement', 'Add a subject, message, and at least one recipient.');
      return;
    }

    const sent: SentAnnouncement = {
      id: `announcement-${Date.now()}`,
      audienceLabel,
      subject: resolvedSubject,
      message: message.trim(),
      recipientCount: recipientCustomers.length,
      sentAt: new Date().toISOString(),
    };

    setSentAnnouncements((previous) => [sent, ...previous]);
    setSubject('');
    setMessage('');
    Alert.alert('Announcement logged', 'Email sending can be connected next.');
  };

  const selectedAudience = AUDIENCE_OPTIONS.find((option) => option.key === audienceType) ?? AUDIENCE_OPTIONS[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={['top']}>
      <View style={{ flex: 1 }}>
        <View style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border.light }}>
          <View
            style={[
              {
                paddingHorizontal: isWebDesktop ? 0 : 20,
                paddingTop: isWebDesktop ? 0 : 16,
                paddingBottom: isWebDesktop ? 0 : 12,
              },
              isWebDesktop ? { width: '100%' } : undefined,
            ]}
          >
            <View
              style={isWebDesktop ? {
                width: '100%',
                maxWidth: 1400,
                alignSelf: 'flex-start',
                minHeight: desktopHeaderMinHeight,
                paddingLeft: 20,
                paddingRight: 20,
                paddingTop: 20,
                paddingBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              } : {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={isWebDesktop ? undefined : { flex: 1 }}>
                <Text style={[pageHeadingStyle, { color: colors.text.primary, fontWeight: '700' }]}>Announcements</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                  Send a simple customer update by audience.
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View
          style={[
            {
              paddingHorizontal: isWebDesktop ? 20 : isDesktop ? 32 : 20,
              paddingTop: 12,
              paddingBottom: 12,
              width: '100%',
              maxWidth: pageMaxWidth,
              alignSelf: isWebDesktop ? 'flex-start' : 'center',
            },
          ]}
        >
          <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'flex-start' }}>
            {ANNOUNCEMENT_SECTIONS.map((section) => {
              const active = activeSection === section.key;
              return (
                <Pressable
                  key={section.key}
                  onPress={() => {
                    setActiveSection(section.key);
                    router.setParams({ announcementSection: section.key });
                  }}
                  className="rounded-full active:opacity-70"
                  style={{
                    height: 40,
                    paddingHorizontal: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? colors.accent.primary : colors.bg.card,
                    borderWidth: active ? 0 : 1,
                    borderColor: colors.border.light,
                  }}
                >
                  <Text style={{ color: active ? (isDark ? '#000000' : '#FFFFFF') : colors.text.primary, fontSize: 13, fontWeight: '500' }}>
                    {section.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: isWebDesktop ? 20 : isDesktop ? 32 : 20,
            paddingTop: 4,
            paddingBottom: pagePaddingBottom,
            width: '100%',
            maxWidth: pageMaxWidth,
            alignSelf: isWebDesktop ? 'flex-start' : 'center',
          }}
          showsVerticalScrollIndicator={false}
        >
          {activeSection === 'compose' ? (
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16 }}>
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border.light,
                borderRadius: 24,
                padding: isMobile ? 16 : 22,
                backgroundColor: colors.bg.primary,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}>
                  <Megaphone size={18} color={colors.text.primary} />
                </View>
                <View>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>Create announcement</Text>
                  <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 2 }}>No template, no campaign builder.</Text>
                </View>
              </View>

              <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                Audience
              </Text>
              <Pressable
                onPress={() => setShowAudienceOptions((previous) => !previous)}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 16,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: colors.bg.secondary,
                }}
              >
                <View>
                  <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '500' }}>{selectedAudience.label}</Text>
                  <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }}>{selectedAudience.helper}</Text>
                </View>
                <ChevronDown size={18} color={colors.text.secondary} />
              </Pressable>

              {showAudienceOptions ? (
                <View style={{ marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, overflow: 'hidden' }}>
                  {AUDIENCE_OPTIONS.map((option) => {
                    const active = audienceType === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => {
                          setAudienceType(option.key);
                          setShowAudienceOptions(false);
                        }}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 13,
                          backgroundColor: active ? colors.text.primary : colors.bg.primary,
                          borderBottomWidth: option.key === 'source' ? 0 : 1,
                          borderBottomColor: colors.border.light,
                        }}
                      >
                        <Text style={{ color: active ? colors.bg.primary : colors.text.primary, fontSize: 14, fontWeight: '500' }}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {audienceType === 'status' ? (
                <View style={{ marginTop: 16 }}>
                  <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                    Order status
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {statusOptions.map((status) => {
                      const active = selectedStatus === status;
                      return (
                        <Pressable
                          key={status}
                          onPress={() => setSelectedStatus(status)}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 9,
                            borderRadius: 999,
                            backgroundColor: active ? colors.text.primary : colors.bg.secondary,
                            borderWidth: 1,
                            borderColor: active ? colors.text.primary : colors.border.light,
                          }}
                        >
                          <Text style={{ color: active ? colors.bg.primary : colors.text.primary, fontSize: 13, fontWeight: '500' }}>{status}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {audienceType === 'source' ? (
                <View style={{ marginTop: 16 }}>
                  <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                    Sale source
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {sourceOptions.map((source) => {
                      const active = selectedSource === source;
                      return (
                        <Pressable
                          key={source}
                          onPress={() => setSelectedSource(source)}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 9,
                            borderRadius: 999,
                            backgroundColor: active ? colors.text.primary : colors.bg.secondary,
                            borderWidth: 1,
                            borderColor: active ? colors.text.primary : colors.border.light,
                          }}
                        >
                          <Text style={{ color: active ? colors.bg.primary : colors.text.primary, fontSize: 13, fontWeight: '500' }}>{source}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <View style={{ marginTop: 18 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                  Subject
                </Text>
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="e.g. Delivery update"
                  placeholderTextColor={colors.text.secondary}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    paddingVertical: Platform.OS === 'web' ? 13 : 12,
                    color: colors.text.primary,
                    fontSize: 15,
                    backgroundColor: colors.bg.secondary,
                  }}
                />
              </View>

              <View style={{ marginTop: 16 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                  Email heading
                </Text>
                <TextInput
                  value={announcementTitle}
                  onChangeText={setAnnouncementTitle}
                  placeholder="e.g. Important update about your order"
                  placeholderTextColor={colors.text.secondary}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    paddingVertical: Platform.OS === 'web' ? 13 : 12,
                    color: colors.text.primary,
                    fontSize: 15,
                    backgroundColor: colors.bg.secondary,
                  }}
                />
              </View>

              <View style={{ marginTop: 16 }}>
                {renderMergeTagTools('Tap a tag to copy it to your keyboard or system clipboard, then paste it into any field.')}
              </View>

              <View style={{ marginTop: 16 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                  Message
                </Text>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Write the update customers should receive..."
                  placeholderTextColor={colors.text.secondary}
                  multiline
                  textAlignVertical="top"
                  style={{
                    minHeight: 180,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 18,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    color: colors.text.primary,
                    fontSize: 15,
                    lineHeight: 22,
                    backgroundColor: colors.bg.secondary,
                  }}
                />
              </View>

              <Pressable
                onPress={handleSend}
                disabled={!canSend}
                style={{
                  marginTop: 18,
                  height: 52,
                  borderRadius: 999,
                  backgroundColor: canSend ? colors.text.primary : colors.bg.secondary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  opacity: canSend ? 1 : 0.7,
                }}
              >
                <Send size={17} color={canSend ? colors.bg.primary : colors.text.secondary} />
                <Text style={{ color: canSend ? colors.bg.primary : colors.text.secondary, fontSize: 15, fontWeight: '600' }}>
                  Send announcement
                </Text>
              </Pressable>
            </View>

            <View style={{ width: isDesktop ? 390 : '100%', gap: 16 }}>
              <View
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  backgroundColor: colors.bg.primary,
                }}
              >
                <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Recipients
                </Text>
                <Text style={{ color: colors.text.primary, fontSize: 28, fontWeight: '500', marginTop: 4 }}>
                  {recipientCustomers.length}
                </Text>
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 24,
                  padding: 18,
                  backgroundColor: colors.bg.primary,
                }}
              >
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500', marginBottom: 10 }}>Send test email</Text>
                <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 19, marginBottom: 12 }}>
                  Send this preview to yourself before announcing it to customers.
                </Text>
                <TextInput
                  value={testEmail}
                  onChangeText={(value) => {
                    setTestEmail(value);
                    if (testEmailState !== 'idle') {
                      setTestEmailState('idle');
                      setTestEmailMessage('');
                    }
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.text.secondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: Platform.OS === 'web' ? 12 : 11,
                    color: colors.text.primary,
                    fontSize: 14,
                    backgroundColor: colors.bg.secondary,
                  }}
                />
                <Pressable
                  onPress={handleSendTestEmail}
                  disabled={testEmailState === 'sending'}
                  style={{
                    height: 44,
                    borderRadius: 999,
                    marginTop: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                    backgroundColor: testEmailState === 'sending' ? colors.bg.secondary : colors.text.primary,
                  }}
                >
                  <Mail size={15} color={testEmailState === 'sending' ? colors.text.secondary : colors.bg.primary} />
                  <Text style={{ color: testEmailState === 'sending' ? colors.text.secondary : colors.bg.primary, fontSize: 14, fontWeight: '600' }}>
                    {testEmailState === 'sending' ? 'Sending...' : 'Send test email'}
                  </Text>
                </Pressable>
                {testEmailMessage ? (
                  <Text
                    style={{
                      color: testEmailState === 'error' ? '#EF4444' : colors.text.secondary,
                      fontSize: 12,
                      lineHeight: 18,
                      marginTop: 10,
                    }}
                  >
                    {testEmailMessage}
                  </Text>
                ) : null}
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 24,
                  padding: 18,
                  backgroundColor: colors.bg.primary,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Users size={18} color={colors.text.primary} />
                    <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>Recipient preview</Text>
                  </View>
                  <Pressable
                    onPress={() => setShowRecipientPreview((previous) => !previous)}
                    style={{
                      height: 30,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      backgroundColor: colors.bg.secondary,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '500' }}>
                      {showRecipientPreview ? 'Hide' : 'Show'}
                    </Text>
                    {showRecipientPreview ? (
                      <ChevronUp size={14} color={colors.text.secondary} />
                    ) : (
                      <ChevronDown size={14} color={colors.text.secondary} />
                    )}
                  </Pressable>
                </View>
                <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 19, marginBottom: showRecipientPreview ? 12 : 0 }}>
                  {audienceLabel} · {recipientCustomers.length} recipient{recipientCustomers.length === 1 ? '' : 's'}
                </Text>
                {showRecipientPreview ? (
                  <View style={{ gap: 10 }}>
                    {recipientCustomers.slice(0, 6).map((customer) => (
                      <View key={`${customer.id}-${customer.email}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}>
                          <Mail size={15} color={colors.text.secondary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1} style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500' }}>{customer.fullName || 'Customer'}</Text>
                          <Text numberOfLines={1} style={{ color: colors.text.secondary, fontSize: 12 }}>{customer.email}</Text>
                        </View>
                      </View>
                    ))}
                    {recipientCustomers.length === 0 ? (
                      <Text style={{ color: colors.text.secondary, fontSize: 13 }}>No matching customers yet.</Text>
                    ) : null}
                    {recipientCustomers.length > 6 ? (
                      <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                        +{recipientCustomers.length - 6} more recipients
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 24,
                  padding: 18,
                  backgroundColor: colors.bg.primary,
                }}
              >
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500', marginBottom: 12 }}>Email preview</Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: colors.bg.secondary,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '500', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                    Subject
                  </Text>
                  <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500', lineHeight: 18 }}>
                    {previewSubject || 'Announcement subject'}
                  </Text>
                </View>
                <View
                  style={{
                    borderRadius: 18,
                    padding: 14,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F3F4F6',
                  }}
                >
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#E5E7EB',
                      borderRadius: 12,
                      padding: 24,
                      backgroundColor: isDark ? '#171717' : '#FFFFFF',
                    }}
                  >
                    <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600', textAlign: 'left' }}>
                      {senderName || defaultSenderName}
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'left', marginTop: 28 }}>
                      {templatePreview.eyebrow}
                    </Text>
                    <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600', lineHeight: 22, textAlign: 'left', marginTop: 14 }}>
                      {previewTitle}
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 14, lineHeight: 22, textAlign: 'left', marginTop: 14 }}>
                      {previewMessage}
                    </Text>
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB',
                        marginTop: 28,
                        paddingTop: 18,
                        alignItems: 'flex-start',
                      }}
                    >
                      {previewFooter ? (
                        <Text style={{ color: colors.text.muted, fontSize: 11, lineHeight: 17, textAlign: 'left' }}>
                          {previewFooter}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', justifyContent: 'space-between', marginTop: 12 }}>
                        <Text style={{ color: colors.text.muted, fontSize: 10 }}>
                          Powered by Fyll
                        </Text>
                        <Image
                          source={fyllWordmarkPng}
                          resizeMode="contain"
                          style={{
                            width: 22,
                            height: 8,
                            tintColor: '#000000',
                          }}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 24,
                  padding: 18,
                  backgroundColor: colors.bg.primary,
                }}
              >
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500', marginBottom: 12 }}>Recent announcements</Text>
                <View style={{ gap: 12 }}>
                  {sentAnnouncements.map((announcement) => (
                    <View
                      key={announcement.id}
                      style={{
                        borderRadius: 16,
                        padding: 14,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FAFAFA',
                        borderWidth: 1,
                        borderColor: colors.border.light,
                      }}
                    >
                      <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>{announcement.subject}</Text>
                      <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 4 }}>
                        {announcement.audienceLabel} · {announcement.recipientCount} recipients
                      </Text>
                    </View>
                  ))}
                  {sentAnnouncements.length === 0 ? (
                    <Text style={{ color: colors.text.secondary, fontSize: 13 }}>No announcements sent this session.</Text>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
          ) : (
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16 }}>
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border.light,
                borderRadius: 24,
                padding: isMobile ? 16 : 22,
                backgroundColor: colors.bg.primary,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}>
                  <Settings size={18} color={colors.text.primary} />
                </View>
                <View>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500' }}>Announcement setup</Text>
                  <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 2 }}>Simple email defaults and merge tags.</Text>
                </View>
              </View>

              <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                Template mode
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                {TEMPLATE_MODES.map((mode) => {
                  const active = templateMode === mode.key;
                  return (
                    <Pressable
                      key={mode.key}
                      onPress={() => {
                        setTemplateMode(mode.key);
                        if (!announcementTitle.trim() || announcementTitle === TEMPLATE_MODE_PREVIEW[templateMode].defaultTitle) {
                          setAnnouncementTitle(TEMPLATE_MODE_PREVIEW[mode.key].defaultTitle);
                        }
                        if (!subject.trim()) {
                          setSubject(TEMPLATE_MODE_PREVIEW[mode.key].defaultTitle);
                        }
                      }}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 999,
                        backgroundColor: active ? colors.text.primary : colors.bg.secondary,
                        borderWidth: 1,
                        borderColor: active ? colors.text.primary : colors.border.light,
                      }}
                    >
                      <Text style={{ color: active ? colors.bg.primary : colors.text.primary, fontSize: 13, fontWeight: '500' }}>{mode.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                  Sender name
                </Text>
                <TextInput
                  value={senderName}
                  onChangeText={setSenderName}
                  placeholder="Fyll Team"
                  placeholderTextColor={colors.text.secondary}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    paddingVertical: Platform.OS === 'web' ? 13 : 12,
                    color: colors.text.primary,
                    fontSize: 15,
                    backgroundColor: colors.bg.secondary,
                  }}
                />
              </View>

              <View style={{ marginTop: 16 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                  Announcement title
                </Text>
                <TextInput
                  value={announcementTitle}
                  onChangeText={setAnnouncementTitle}
                  placeholder="Customer update"
                  placeholderTextColor={colors.text.secondary}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    paddingVertical: Platform.OS === 'web' ? 13 : 12,
                    color: colors.text.primary,
                    fontSize: 15,
                    backgroundColor: colors.bg.secondary,
                  }}
                />
              </View>

              <View style={{ marginTop: 16 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                  Reply-to email
                </Text>
                <TextInput
                  value={supportEmail}
                  onChangeText={setSupportEmail}
                  placeholder="support@fyll.com"
                  placeholderTextColor={colors.text.secondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    paddingVertical: Platform.OS === 'web' ? 13 : 12,
                    color: colors.text.primary,
                    fontSize: 15,
                    backgroundColor: colors.bg.secondary,
                  }}
                />
                <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 18, marginTop: 8 }}>
                  Customer replies to announcement emails will go to this inbox.
                </Text>
              </View>

              <View style={{ marginTop: 16 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                  Footer note
                </Text>
                <TextInput
                  value={footerNote}
                  onChangeText={setFooterNote}
                  placeholder="You are receiving this because..."
                  placeholderTextColor={colors.text.secondary}
                  multiline
                  textAlignVertical="top"
                  style={{
                    minHeight: 96,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 18,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    color: colors.text.primary,
                    fontSize: 15,
                    lineHeight: 22,
                    backgroundColor: colors.bg.secondary,
                  }}
                />
              </View>
            </View>

            <View style={{ width: isDesktop ? 390 : '100%', gap: 16 }}>
              <View
                style={{}}
              >
                {renderMergeTagTools('Tap a tag to copy it to your keyboard or system clipboard, then paste it into any announcement field.')}
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  borderRadius: 24,
                  padding: 18,
                  backgroundColor: colors.bg.primary,
                }}
              >
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '500', marginBottom: 12 }}>Email preview</Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: colors.bg.secondary,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '500', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                    Subject
                  </Text>
                  <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500', lineHeight: 18 }}>
                    {previewSubject || 'Announcement subject'}
                  </Text>
                </View>
                <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
                  Uses the same clean transactional shell as delivery confirmation emails.
                </Text>
                <View
                  style={{
                    borderRadius: 18,
                    padding: 14,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F3F4F6',
                  }}
                >
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#E5E7EB',
                      borderRadius: 12,
                      padding: 24,
                      backgroundColor: isDark ? '#171717' : '#FFFFFF',
                    }}
                  >
                    <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600', textAlign: 'left' }}>
                    {senderName || defaultSenderName}
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'left', marginTop: 28 }}>
                      {templatePreview.eyebrow}
                    </Text>
                    <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600', lineHeight: 22, textAlign: 'left', marginTop: 14 }}>
                      {previewTitle}
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 14, lineHeight: 22, textAlign: 'left', marginTop: 14 }}>
                      {previewMessage}
                    </Text>
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB',
                        marginTop: 28,
                        paddingTop: 18,
                        alignItems: 'flex-start',
                      }}
                    >
                      {previewFooter ? (
                        <Text style={{ color: colors.text.muted, fontSize: 11, lineHeight: 17, textAlign: 'left' }}>
                          {previewFooter}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', justifyContent: 'space-between', marginTop: 12 }}>
                        <Text style={{ color: colors.text.muted, fontSize: 10 }}>
                          Powered by Fyll
                        </Text>
                        <Image
                          source={fyllWordmarkPng}
                          resizeMode="contain"
                          style={{
                            width: 22,
                            height: 8,
                            tintColor: '#000000',
                          }}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
          )}
        </ScrollView>
      </View>
      {toastMessage ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            bottom: isDesktop ? 24 : tabBarHeight + 18,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              maxWidth: 420,
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 10,
              backgroundColor: colors.text.primary,
              shadowColor: '#000000',
              shadowOpacity: 0.14,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
          >
            <Text style={{ color: colors.bg.primary, fontSize: 13, fontWeight: '500', textAlign: 'center' }}>
              {toastMessage}
            </Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
