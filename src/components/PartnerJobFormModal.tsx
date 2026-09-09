import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, Camera, Check, ChevronDown, FileText, Image as ImageIcon, Paperclip, X } from 'lucide-react-native';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { pickImageSimple } from '@/hooks/useImagePicker';
import { uploadBusinessAttachment } from '@/lib/storage-attachments';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { type PartnerJob } from '@/lib/state/fyll-store';
import { getPartnerJobTaxonomy } from '@/lib/supabase/partner-job-types';
import { notifyPartnerJobDispatched } from '@/lib/notify-partner';

const generateId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface PartnerJobFormPrefill {
  partnerId?: string;
  orderId?: string | null;
  customerName?: string;
  itemLabel?: string;
  jobType?: string;
  imageUri?: string | null;
}

interface PartnerJobFormModalProps {
  visible: boolean;
  onClose: () => void;
  editingJob?: PartnerJob | null;
  prefill?: PartnerJobFormPrefill;
  /** When true, a newly created job is dispatched to the partner immediately instead of left as "awaiting dispatch". */
  autoDispatch?: boolean;
  onSaved?: (job: PartnerJob) => void;
  title?: string;
  subtitle?: string;
}

export function PartnerJobFormModal({
  visible,
  onClose,
  editingJob,
  prefill,
  autoDispatch,
  onSaved,
  title,
  subtitle,
}: PartnerJobFormModalProps) {
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const tabBarHeight = useTabBarHeight();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? '');
  const partners = useFyllStore((s) => s.partners);
  const orders = useFyllStore((s) => s.orders);
  const addPartnerJob = useFyllStore((s) => s.addPartnerJob);
  const updatePartnerJob = useFyllStore((s) => s.updatePartnerJob);

  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p] as const)), [partners]);
  const jobPlaceholderColor = colors.bg.primary === '#111111' ? 'rgba(255,255,255,0.26)' : 'rgba(17,17,17,0.26)';

  const [jobCategoryOptions, setJobCategoryOptions] = useState<string[]>([]);
  const [jobServiceOptions, setJobServiceOptions] = useState<string[]>([]);
  const [jobPartnerId, setJobPartnerId] = useState('');
  const [showJobPartnerDropdown, setShowJobPartnerDropdown] = useState(false);
  const [jobCustomerName, setJobCustomerName] = useState('');
  const [jobDate, setJobDate] = useState(new Date());
  const [showJobDatePicker, setShowJobDatePicker] = useState(false);
  const [jobOrderId, setJobOrderId] = useState<string | null>(null);
  const [jobItemLabel, setJobItemLabel] = useState('');
  const [jobType, setJobType] = useState('');
  const [showJobTypeDropdown, setShowJobTypeDropdown] = useState(false);
  const [jobService, setJobService] = useState('');
  const [showJobServiceDropdown, setShowJobServiceDropdown] = useState(false);
  const [jobImageUri, setJobImageUri] = useState<string | null>(null);
  const [jobImageUploading, setJobImageUploading] = useState(false);
  const [jobNotes, setJobNotes] = useState('');
  const [jobDocument, setJobDocument] = useState<{ url: string; name: string; mimeType?: string } | null>(null);
  const [jobDocumentUploading, setJobDocumentUploading] = useState(false);
  const [isSavingJob, setIsSavingJob] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    getPartnerJobTaxonomy(businessId)
      .then(({ categories, services }) => {
        setJobCategoryOptions(categories);
        setJobServiceOptions(services);
      })
      .catch(() => {});
  }, [businessId]);

  useEffect(() => {
    if (!visible) return;
    if (editingJob) {
      setJobPartnerId(editingJob.partnerId);
      setJobCustomerName(editingJob.customerName);
      setJobDate(new Date(editingJob.dispatchedAt ?? editingJob.createdAt ?? Date.now()));
      setJobOrderId(editingJob.orderId ?? null);
      setJobItemLabel(editingJob.itemLabel ?? '');
      setJobType(editingJob.jobType ?? '');
      setJobService(editingJob.jobService ?? '');
      setJobImageUri(editingJob.imageUrl ?? null);
      setJobNotes(editingJob.notes ?? '');
      setJobDocument(editingJob.documentUrl ? { url: editingJob.documentUrl, name: editingJob.documentName ?? 'Document', mimeType: editingJob.documentMimeType } : null);
    } else {
      setJobPartnerId(prefill?.partnerId ?? '');
      setJobCustomerName(prefill?.customerName ?? '');
      setJobDate(new Date());
      setJobOrderId(prefill?.orderId ?? null);
      setJobItemLabel(prefill?.itemLabel ?? '');
      setJobType(prefill?.jobType ?? '');
      setJobService('');
      setJobImageUri(prefill?.imageUri ?? null);
      setJobNotes('');
      setJobDocument(null);
    }
    setShowJobPartnerDropdown(false);
    setShowJobTypeDropdown(false);
    setShowJobServiceDropdown(false);
    setShowJobDatePicker(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const selectedJobOrder = useMemo(() => {
    if (!jobOrderId) return null;
    return orders.find((order) => order.id === jobOrderId) ?? null;
  }, [jobOrderId, orders]);

  const orderSearchResults = useMemo(() => {
    const query = jobCustomerName.trim().toLowerCase();
    if (query.length < 2 || selectedJobOrder?.customerName === jobCustomerName.trim()) return [];

    return orders
      .filter((order) => {
        const searchable = [
          order.customerName,
          order.orderNumber,
          order.websiteOrderReference,
          order.customerTrackingCode,
          order.id,
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(query);
      })
      .sort((a, b) => new Date(b.orderDate ?? b.createdAt).getTime() - new Date(a.orderDate ?? a.createdAt).getTime())
      .slice(0, 5);
  }, [jobCustomerName, orders, selectedJobOrder]);

  const handleJobCustomerSearchChange = (value: string) => {
    setJobCustomerName(value);
    setJobOrderId(null);
  };

  const handleSelectOrderForJob = (orderId: string, customerName: string) => {
    setJobOrderId(orderId);
    setJobCustomerName(customerName);
  };

  const handlePickJobImage = async () => {
    const uri = await pickImageSimple();
    if (!uri) return;
    setJobImageUploading(true);
    try {
      if (businessId) {
        const uploaded = await uploadBusinessAttachment({
          businessId,
          folder: 'partners/jobs',
          uri,
          fileName: `job-${Date.now()}.jpg`,
        });
        setJobImageUri(uploaded.storagePath);
      } else {
        setJobImageUri(uri);
      }
    } catch (error) {
      console.warn('Partner job image upload failed:', error);
      setJobImageUri(uri);
    } finally {
      setJobImageUploading(false);
    }
  };

  const handlePickJobDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setJobDocumentUploading(true);
    try {
      if (businessId) {
        const uploaded = await uploadBusinessAttachment({
          businessId,
          folder: 'partners/jobs',
          uri: asset.uri,
          fileName: asset.name,
          mimeType: asset.mimeType ?? null,
        });
        setJobDocument({ url: uploaded.storagePath, name: asset.name, mimeType: uploaded.mimeType ?? asset.mimeType ?? undefined });
      } else {
        setJobDocument({ url: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined });
      }
    } catch (error) {
      console.warn('Partner job document upload failed:', error);
    } finally {
      setJobDocumentUploading(false);
    }
  };

  const handleSave = async () => {
    if (!jobPartnerId || !jobCustomerName.trim() || isSavingJob) return;
    setIsSavingJob(true);
    try {
      const sharedFields = {
        partnerId: jobPartnerId,
        orderId: jobOrderId ?? undefined,
        customerName: jobCustomerName.trim(),
        imageUrl: jobImageUri ?? undefined,
        itemLabel: jobItemLabel.trim() || undefined,
        jobType: jobType.trim() || undefined,
        jobService: jobService.trim() || undefined,
        notes: jobNotes.trim() || undefined,
        documentUrl: jobDocument?.url,
        documentName: jobDocument?.name,
        documentMimeType: jobDocument?.mimeType,
      };
      const jobDateIso = jobDate.toISOString();
      let savedJob: PartnerJob;
      if (editingJob) {
        const dateFields = editingJob.dispatchedAt
          ? { createdAt: jobDateIso, dispatchedAt: jobDateIso }
          : { createdAt: jobDateIso };
        updatePartnerJob(editingJob.id, { ...sharedFields, ...dateFields }, businessId);
        savedJob = { ...editingJob, ...sharedFields, ...dateFields };
      } else {
        const partner = partnerById.get(jobPartnerId);
        const dispatchNow = autoDispatch && partner;
        savedJob = {
          id: generateId('pjob'),
          ...sharedFields,
          status: dispatchNow ? (partner.businessJobStatuses?.[0] || partner.allowedJobStatuses?.[0] || 'sent') : 'awaiting_dispatch',
          dispatchedAt: dispatchNow ? jobDateIso : undefined,
          createdAt: jobDateIso,
          createdBy: currentUserName || undefined,
        };
        addPartnerJob(savedJob, businessId);
        if (dispatchNow && businessId) {
          notifyPartnerJobDispatched({
            businessId,
            partnerId: savedJob.partnerId,
            jobId: savedJob.id,
            customerName: savedJob.customerName,
            itemLabel: savedJob.itemLabel || savedJob.jobType,
          });
        }
      }
      onSaved?.(savedJob);
      onClose();
    } finally {
      setIsSavingJob(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={!isMobile}
      animationType="none"
      presentationStyle={isMobile ? 'fullScreen' : 'overFullScreen'}
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: isMobile ? colors.bg.primary : 'rgba(0,0,0,0.4)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile ? 0 : 18,
        }}
        disabled={isMobile}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            height: isMobile ? '100%' : undefined,
            maxWidth: isMobile ? undefined : 460,
            maxHeight: isMobile ? undefined : '86%',
            borderRadius: isMobile ? 0 : 18,
            backgroundColor: colors.bg.card,
            borderWidth: isMobile ? 0 : 1,
            borderColor: colors.border.light,
            overflow: 'hidden',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600' }}>
                {title ?? (editingJob ? 'Edit partner job' : 'New partner job')}
              </Text>
              {subtitle ? (
                <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>{subtitle}</Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} style={{ padding: 4 }}>
              <X size={18} color={colors.text.tertiary} strokeWidth={2} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: isMobile ? tabBarHeight + 24 : 18, gap: 12 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={{ position: 'relative', zIndex: 10 }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>Partner</Text>
              <Pressable
                onPress={() => setShowJobPartnerDropdown((v) => !v)}
                style={{ height: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Text style={{ color: jobPartnerId ? colors.text.primary : jobPlaceholderColor, fontSize: 13.5 }}>
                  {jobPartnerId ? partnerById.get(jobPartnerId)?.name : 'Select a partner'}
                </Text>
                <ChevronDown size={16} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
              {showJobPartnerDropdown ? (
                <View style={{ marginTop: 4, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
                  {partners.map((partner) => (
                    <Pressable
                      key={partner.id}
                      onPress={() => { setJobPartnerId(partner.id); setShowJobPartnerDropdown(false); }}
                      style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <Text style={{ color: colors.text.primary, fontSize: 13 }}>{partner.name}</Text>
                      {jobPartnerId === partner.id ? <Check size={14} color={colors.text.primary} strokeWidth={2.5} /> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>Customer name or order ID</Text>
              <TextInput
                value={jobCustomerName}
                onChangeText={handleJobCustomerSearchChange}
                placeholder="Type customer name or order ID"
                placeholderTextColor={jobPlaceholderColor}
                style={{ height: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, color: colors.text.primary, fontSize: 14 }}
              />
              {selectedJobOrder ? (
                <Text style={{ color: colors.text.tertiary, fontSize: 11.5, marginTop: 6 }}>
                  Linked to {selectedJobOrder.orderNumber}
                </Text>
              ) : null}
              {orderSearchResults.length > 0 ? (
                <View style={{ marginTop: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
                  {orderSearchResults.map((order, index) => (
                    <Pressable
                      key={order.id}
                      onPress={() => handleSelectOrderForJob(order.id, order.customerName)}
                      style={{ paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border.light }}
                    >
                      <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                        {order.customerName}
                      </Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 11.5, marginTop: 3 }} numberOfLines={1}>
                        {[order.orderNumber, order.websiteOrderReference, order.customerTrackingCode].filter(Boolean).join(' · ')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>Job date</Text>
              {Platform.OS === 'web' ? (
                <View
                  style={{ height: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}
                >
                  <input
                    type="date"
                    value={jobDate.toISOString().split('T')[0]}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => {
                      const dateValue = e.target.value;
                      if (!dateValue) return;
                      const [year, month, day] = dateValue.split('-').map(Number);
                      setJobDate(new Date(year, month - 1, day, 12, 0, 0));
                    }}
                    style={{
                      width: '100%',
                      height: '100%',
                      fontSize: 14,
                      color: colors.text.primary,
                      backgroundColor: 'transparent',
                      border: 'none',
                      outline: 'none',
                      colorScheme: colors.bg.primary === '#111111' ? 'dark' : 'light',
                    } as any}
                  />
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowJobDatePicker(true)}
                  style={{ height: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: colors.text.primary, fontSize: 13.5 }}>
                    {jobDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                  <Calendar size={16} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              )}
              <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 6 }}>
                Backdate this if the job already happened — it updates the date shown here and on the partner's side.
              </Text>
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>Reference photo (optional)</Text>
              <Pressable
                onPress={handlePickJobImage}
                disabled={jobImageUploading}
                style={{ height: 90, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
              >
                {jobImageUri ? (
                  <ResolvedAttachmentImage imageUrl={jobImageUri} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <>
                    <Camera size={18} color={colors.text.tertiary} strokeWidth={1.8} />
                    <Text style={{ color: colors.text.tertiary, fontSize: 11.5, marginTop: 6 }}>
                      {jobImageUploading ? 'Uploading…' : 'Tap to add a photo'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>

            <View style={{ gap: 10 }}>
              <View>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>Item / product (optional)</Text>
                <TextInput
                  value={jobItemLabel}
                  onChangeText={setJobItemLabel}
                  placeholder="e.g. Ruth Pink frame"
                  placeholderTextColor={jobPlaceholderColor}
                  style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, color: colors.text.primary, fontSize: 13.5 }}
                />
              </View>
              <View style={{ position: 'relative', zIndex: 6 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>Job category (optional)</Text>
                <Pressable
                  onPress={() => setShowJobTypeDropdown((v) => !v)}
                  style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: jobType ? colors.text.primary : jobPlaceholderColor, fontSize: 13.5 }} numberOfLines={1}>
                    {jobType || 'Select a category'}
                  </Text>
                  <ChevronDown size={16} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
                {showJobTypeDropdown ? (
                  <View style={{ marginTop: 4, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
                    {jobCategoryOptions.length === 0 ? (
                      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                          No categories yet — add some in this partner's settings.
                        </Text>
                      </View>
                    ) : (
                      jobCategoryOptions.map((category, index) => (
                        <Pressable
                          key={category}
                          onPress={() => { setJobType(category); setShowJobTypeDropdown(false); }}
                          style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border.light }}
                        >
                          <Text style={{ color: colors.text.primary, fontSize: 13 }}>{category}</Text>
                          {jobType === category ? <Check size={14} color={colors.text.primary} strokeWidth={2.5} /> : null}
                        </Pressable>
                      ))
                    )}
                    {jobType ? (
                      <Pressable
                        onPress={() => { setJobType(''); setShowJobTypeDropdown(false); }}
                        style={{ paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border.light }}
                      >
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>Clear</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <View style={{ position: 'relative', zIndex: 5 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>Service (optional)</Text>
                <Pressable
                  onPress={() => setShowJobServiceDropdown((v) => !v)}
                  style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: jobService ? colors.text.primary : jobPlaceholderColor, fontSize: 13.5 }} numberOfLines={1}>
                    {jobService || 'Select a service'}
                  </Text>
                  <ChevronDown size={16} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
                {showJobServiceDropdown ? (
                  <View style={{ marginTop: 4, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
                    {jobServiceOptions.length === 0 ? (
                      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                          No services yet — add some in this partner's settings.
                        </Text>
                      </View>
                    ) : (
                      jobServiceOptions.map((service, index) => (
                        <Pressable
                          key={service}
                          onPress={() => { setJobService(service); setShowJobServiceDropdown(false); }}
                          style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border.light }}
                        >
                          <Text style={{ color: colors.text.primary, fontSize: 13 }}>{service}</Text>
                          {jobService === service ? <Check size={14} color={colors.text.primary} strokeWidth={2.5} /> : null}
                        </Pressable>
                      ))
                    )}
                    {jobService ? (
                      <Pressable
                        onPress={() => { setJobService(''); setShowJobServiceDropdown(false); }}
                        style={{ paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border.light }}
                      >
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>Clear</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>Notes / specification</Text>
              <TextInput
                value={jobNotes}
                onChangeText={setJobNotes}
                placeholder="Paste or type any details the partner needs — e.g. a prescription, measurements, or job instructions"
                placeholderTextColor={jobPlaceholderColor}
                multiline
                numberOfLines={4}
                style={{ minHeight: 90, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, paddingVertical: 10, color: colors.text.primary, fontSize: 13.5, textAlignVertical: 'top' }}
              />
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>Attach a copy (image or PDF)</Text>
              {jobDocument ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12 }}>
                  {jobDocument.mimeType?.startsWith('image/') ? (
                    <ImageIcon size={16} color={colors.text.tertiary} strokeWidth={1.8} />
                  ) : (
                    <FileText size={16} color={colors.text.tertiary} strokeWidth={1.8} />
                  )}
                  <Text style={{ flex: 1, color: colors.text.primary, fontSize: 12.5 }} numberOfLines={1}>{jobDocument.name}</Text>
                  <Pressable onPress={() => setJobDocument(null)} style={{ padding: 4 }}>
                    <X size={15} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => { void handlePickJobDocument(); }}
                  disabled={jobDocumentUploading}
                  style={{ height: 52, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                >
                  <Paperclip size={15} color={colors.text.tertiary} strokeWidth={2} />
                  <Text style={{ color: colors.text.tertiary, fontSize: 12.5 }}>
                    {jobDocumentUploading ? 'Uploading…' : 'Attach file'}
                  </Text>
                </Pressable>
              )}
            </View>

            <Pressable
              onPress={() => { void handleSave(); }}
              disabled={!jobPartnerId || !jobCustomerName.trim() || isSavingJob}
              style={{
                height: 48,
                borderRadius: 999,
                backgroundColor: (jobPartnerId && jobCustomerName.trim()) ? colors.text.primary : colors.bg.secondary,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 4,
              }}
            >
              <Text style={{ color: (jobPartnerId && jobCustomerName.trim()) ? colors.bg.primary : colors.text.tertiary, fontSize: 13.5, fontWeight: '600' }}>
                {isSavingJob ? 'Saving…' : editingJob ? 'Save changes' : autoDispatch ? 'Send to partner' : 'Create job'}
              </Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>

      {Platform.OS !== 'web' && showJobDatePicker && (
        <Modal
          visible={showJobDatePicker}
          animationType="fade"
          transparent
          onRequestClose={() => setShowJobDatePicker(false)}
        >
          <Pressable
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}
            onPress={() => setShowJobDatePicker(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{ width: '90%', maxWidth: 400, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bg.card }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700' }}>Select job date</Text>
                <Pressable onPress={() => setShowJobDatePicker(false)} style={{ padding: 4 }}>
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>
              <View style={{ padding: 16, alignItems: 'center' }}>
                <DateTimePicker
                  value={jobDate}
                  mode="date"
                  maximumDate={new Date()}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    if (Platform.OS === 'android') {
                      setShowJobDatePicker(false);
                    }
                    if (date) {
                      setJobDate(date);
                    }
                  }}
                  style={{ width: '100%' }}
                  themeVariant={colors.bg.primary === '#111111' ? 'dark' : 'light'}
                />
                {Platform.OS === 'ios' && (
                  <Pressable
                    onPress={() => setShowJobDatePicker(false)}
                    style={{ marginTop: 12, height: 44, width: '100%', borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.bg.primary, fontSize: 13.5, fontWeight: '600' }}>Done</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Modal>
  );
}
