import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, addMonths, addWeeks, addYears, eachDayOfInterval, endOfMonth, endOfWeek, format, isPast, isSameDay, isSameMonth, isToday, isTomorrow, isYesterday, parseISO, startOfMonth, startOfToday, startOfWeek, subMonths } from 'date-fns';
import { useRouter } from 'expo-router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ArrowLeft, ArrowUpDown, Calendar, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, Clock3, Flag, Funnel, Layers, MessageSquare, MoreHorizontal, MoreVertical, Pencil, Plus, Repeat, Search, Send, Share2, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { collaborationData, type CollaborationComment, type CollaborationThreadSummary } from '@/lib/supabase/collaboration';
import { useResolvedThemeMode, useThemeColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { DESKTOP_PAGE_HEADER_GUTTER, DESKTOP_PAGE_HEADER_MIN_HEIGHT, getStandardPageHeadingStyle } from '@/lib/page-heading';
import useAuthStore, { type TeamMember, type TeamRole } from '@/lib/state/auth-store';
import { supabase } from '@/lib/supabase';
import { taskData, type CreateTaskInput, type Task, type TaskItemType, type TaskPriority, type TaskRecurrenceFrequency, type UpdateTaskInput, type CompleteTaskResult } from '@/lib/supabase/tasks';
import { sendTaskAssignmentNotification, sendTaskCompletionNotification, triggerTaskDueReminders, triggerTaskEventReminders } from '@/hooks/useWebPushNotifications';
import { getTeamThreadDisplayNameFromEntityId, getTeamThreadSubtitleFromEntityId, isTeamThreadEntityId } from '@/lib/team-threads';

type TaskFilter = 'all' | 'pending' | 'done';
type TaskKpiScope = 'all' | 'due_today' | 'overdue' | 'completed_today';
type TaskScope = 'all' | 'mine' | 'team';
type TaskViewMode = 'list' | 'calendar';

interface TaskFormState {
  itemType: TaskItemType;
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: Date | null;
  startTime: string;
  endTime: string;
  eventTimezone: string;
  location: string;
  meetingLink: string;
  assigneeUserIds: string[];
  recurrenceFrequency: TaskRecurrenceFrequency | null;
  recurrenceInterval: number;
  shareToThread: boolean;
  shareThreadEntityId: string | null;
}

interface TaskShareThreadOption {
  entityId: string;
  name: string;
  subtitle: string;
}

interface TaskActivityFeedProps {
  businessId: string;
  taskId: string;
  task: Task;
  teamMembers: TeamMember[];
  compact?: boolean;
  scrollable?: boolean;
}

interface TaskWorkspaceProps {
  mode: 'list' | 'detail';
  taskId?: string;
}

interface TaskCalendarViewProps {
  tasks: Task[];
  selectedDate: Date;
  displayedMonth: Date;
  selectedTaskId: string | null;
  teamMap: Map<string, TeamMember>;
  unreadCounts: Record<string, number>;
  commentCounts: Record<string, number>;
  isDesktopLayout: boolean;
  onSelectDate: (date: Date) => void;
  onChangeMonth: (direction: -1 | 1) => void;
  onJumpToToday: () => void;
  onOpenTask: (task: Task) => void;
  onToggleDone: (task: Task) => void;
}

interface TaskPeopleBadgesProps {
  overdue: number;
  completed: number;
  upcoming: number;
}

interface TaskToastState {
  title: string;
  message: string | null;
  icon: 'check' | 'repeat';
  accent: string;
  accentSoft: string;
}

interface TaskToastConfettiPieceDefinition {
  x: number;
  y: number;
  rotate: number;
  width: number;
  height: number;
  color: string;
}

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'done', label: 'Done' },
];

const RECURRENCE_OPTIONS: Array<{ id: TaskRecurrenceFrequency | null; label: string }> = [
  { id: null, label: 'One-off' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekday', label: 'Weekdays' },
  { id: 'weekend', label: 'Weekends' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'bi_weekly', label: 'Bi-weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' },
];

const DEFAULT_EVENT_TIMEZONE = 'UTC';
const COMMON_EVENT_TIMEZONES = [
  'Africa/Lagos',
  'Europe/London',
  'UTC',
  'Africa/Accra',
  'Africa/Johannesburg',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
] as const;

const CALENDAR_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const PRIORITY_META: Record<TaskPriority, { label: string; color: string; soft: string }> = {
  low: { label: 'Low', color: '#64748B', soft: 'rgba(100,116,139,0.08)' },
  medium: { label: 'Medium', color: '#2563EB', soft: 'rgba(37,99,235,0.08)' },
  high: { label: 'High', color: '#EF4444', soft: 'rgba(239,68,68,0.09)' },
  urgent: { label: 'Urgent', color: '#B91C1C', soft: 'rgba(185,28,28,0.10)' },
};

const OVERVIEW_CARD_VISIBLE_ROWS = 5;
const OVERVIEW_CARD_ROW_HEIGHT = 56;
const OVERVIEW_CARD_LIST_MAX_HEIGHT = OVERVIEW_CARD_VISIBLE_ROWS * OVERVIEW_CARD_ROW_HEIGHT;
const TASK_MODAL_MAX_WIDTH = 560;
const TASK_MODAL_MAX_HEIGHT = '92%' as const;
const TASK_MODAL_RADIUS = 24;
const TASK_MODAL_HEADER_HORIZONTAL_PADDING = 20;
const TASK_MODAL_HEADER_VERTICAL_PADDING = 16;
const TASK_MODAL_BODY_PADDING = 18;
const TASK_MODAL_BODY_GAP = 14;
const TASK_MODAL_FOOTER_HORIZONTAL_PADDING = 18;
const TASK_MODAL_FOOTER_BOTTOM_PADDING = 18;
const TASK_MODAL_FOOTER_GAP = 8;
const MOBILE_TASK_SECTION_GAP = 16;
const EVERYONE_ASSIGNEE_ID = '__everyone__';
const DEFAULT_TASK_SHARE_THREAD_ENTITY_ID = null;
const EVERYONE_ASSIGNEE_ROLE: TeamRole = 'staff';
const TASK_TOAST_CONFETTI_PIECES: TaskToastConfettiPieceDefinition[] = [
  { x: -22, y: -18, rotate: -32, width: 5, height: 11, color: '#F97316' },
  { x: -11, y: -26, rotate: -14, width: 4, height: 10, color: '#2563EB' },
  { x: 4, y: -28, rotate: 12, width: 5, height: 11, color: '#FACC15' },
  { x: 18, y: -18, rotate: 28, width: 4, height: 10, color: '#EC4899' },
  { x: -19, y: -4, rotate: -18, width: 4, height: 9, color: '#10B981' },
  { x: 22, y: -2, rotate: 18, width: 4, height: 9, color: '#8B5CF6' },
];

const statusLabel = (status: Task['status']) => {
  if (status === 'in_progress') return 'In Progress';
  if (status === 'done') return 'Completed';
  return 'Pending';
};

const recurrenceLabel = (frequency?: string | null) => {
  if (!frequency) return 'One-off';
  const normalized = frequency.trim().toLowerCase().replace('-', '_');
  if (normalized === 'daily') return 'Daily';
  if (normalized === 'weekday') return 'Weekdays';
  if (normalized === 'weekend') return 'Weekends';
  if (normalized === 'weekly') return 'Weekly';
  if (normalized === 'bi_weekly') return 'Bi-weekly';
  if (normalized === 'monthly') return 'Monthly';
  if (normalized === 'quarterly') return 'Quarterly';
  if (normalized === 'yearly') return 'Yearly';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const itemTypeLabel = (value?: TaskItemType | null) => (
  value === 'event' ? 'Event' : 'Task'
);

const isEventItem = (task: Pick<Task, 'item_type'>) => task.item_type === 'event';

const timeInputPattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const getDeviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_EVENT_TIMEZONE;
  } catch {
    return DEFAULT_EVENT_TIMEZONE;
  }
};

const getTimeZoneParts = (date: Date, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

    const getPart = (type: Intl.DateTimeFormatPartTypes) => Number.parseInt(parts.find((part) => part.type === type)?.value ?? '', 10);
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');

    if ([year, month, day, hour, minute, second].some((value) => !Number.isFinite(value))) return null;
    return { year, month, day, hour, minute, second };
  } catch {
    return null;
  }
};

const formatTimeZoneOptionLabel = (timeZone?: string | null) => {
  const normalized = String(timeZone ?? '').trim();
  if (!normalized) return 'Local time';
  if (normalized === 'UTC') return 'UTC';

  const city = normalized.split('/').slice(-1)[0]?.replace(/_/g, ' ') || normalized;
  try {
    const shortName = new Intl.DateTimeFormat('en-US', {
      timeZone: normalized,
      timeZoneName: 'short',
    }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value;
    return shortName ? `${city} (${shortName})` : city;
  } catch {
    return city;
  }
};

const EVENT_TIMEZONE_OPTIONS = Array.from(
  new Set([getDeviceTimeZone(), ...COMMON_EVENT_TIMEZONES])
).map((timeZone) => ({
  id: timeZone,
  label: formatTimeZoneOptionLabel(timeZone),
}));

const formatIsoTimeForEventTimeZone = (value?: string | null, timeZone?: string | null) => {
  if (!value) return '';
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const normalizedTimeZone = String(timeZone ?? '').trim();
  if (!normalizedTimeZone) return format(parsed, 'HH:mm');
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: normalizedTimeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(parsed);
  } catch {
    return format(parsed, 'HH:mm');
  }
};

const addOneHourToTimeValue = (timeValue: string) => {
  const match = timeValue.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return timeValue;
  const hours = Number.parseInt(match[1] ?? '0', 10);
  const minutes = Number.parseInt(match[2] ?? '0', 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return timeValue;
  return `${String((hours + 1) % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const resolveNextEndTime = (nextStartTime: string, currentStartTime: string, currentEndTime: string) => {
  if (!nextStartTime) return currentEndTime;
  const previousAutoEndTime = currentStartTime ? addOneHourToTimeValue(currentStartTime) : '';
  if (!currentEndTime || currentEndTime === previousAutoEndTime) {
    return addOneHourToTimeValue(nextStartTime);
  }
  return currentEndTime;
};

const combineDateAndTime = (date: Date | null, timeValue: string, timeZone?: string | null) => {
  if (!date || !timeInputPattern.test(timeValue)) return null;
  const [hoursRaw, minutesRaw] = timeValue.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const normalizedTimeZone = String(timeZone ?? '').trim();

  if (!normalizedTimeZone) {
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined.toISOString();
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const desiredWallTime = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  let utcGuess = desiredWallTime;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zonedParts = getTimeZoneParts(new Date(utcGuess), normalizedTimeZone);
    if (!zonedParts) break;
    const actualWallTime = Date.UTC(
      zonedParts.year,
      zonedParts.month - 1,
      zonedParts.day,
      zonedParts.hour,
      zonedParts.minute,
      zonedParts.second,
      0,
    );
    const diff = desiredWallTime - actualWallTime;
    if (diff === 0) break;
    utcGuess += diff;
  }

  return new Date(utcGuess).toISOString();
};

const normalizeExternalUrl = (value?: string | null) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const getTaskCalendarAnchorDate = (task: Pick<Task, 'due_date' | 'starts_at'>) => {
  if (task.due_date) {
    const parsedDueDate = parseISO(`${task.due_date}T00:00:00`);
    if (!Number.isNaN(parsedDueDate.getTime())) return parsedDueDate;
  }
  if (task.starts_at) {
    const parsedStart = parseISO(task.starts_at);
    if (!Number.isNaN(parsedStart.getTime())) return parsedStart;
  }
  return null;
};

const formatCalendarAgendaTime = (task: Pick<Task, 'item_type' | 'starts_at' | 'status' | 'event_timezone'>) => {
  if (task.item_type === 'event') {
    if (!task.starts_at) return 'All day';
    const parsedStart = parseISO(task.starts_at);
    if (Number.isNaN(parsedStart.getTime())) return 'All day';
    const normalizedTimeZone = String(task.event_timezone ?? '').trim();
    if (normalizedTimeZone) {
      try {
        return new Intl.DateTimeFormat('en-US', {
          timeZone: normalizedTimeZone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(parsedStart);
      } catch {
        return format(parsedStart, 'h:mm a');
      }
    }
    return format(parsedStart, 'h:mm a');
  }
  return null;
};

const getCalendarDayIndicators = (tasks: Task[]) => {
  const hasOverdue = tasks.some((task) => task.status !== 'done' && isTaskOverdue(task));
  const hasCompleted = tasks.some((task) => task.status === 'done');
  const hasEvent = tasks.some((task) => task.item_type === 'event' && task.status !== 'done');
  const hasTask = tasks.some((task) => task.item_type !== 'event' && task.status !== 'done' && !isTaskOverdue(task));

  return [
    hasOverdue ? '#DC2626' : null,
    hasCompleted ? '#16A34A' : null,
    hasEvent ? '#2563EB' : null,
    hasTask ? '#D97706' : null,
  ].filter((value): value is string => Boolean(value));
};

const getCalendarStatusChip = (task: Task) => {
  if (task.status === 'done') {
    return {
      label: 'Completed',
      text: '#16A34A',
      background: 'rgba(22,163,74,0.12)',
    };
  }
  if (isTaskOverdue(task)) {
    return {
      label: 'Overdue',
      text: '#DC2626',
      background: 'rgba(220,38,38,0.12)',
    };
  }
  return null;
};

const compareCalendarTasks = (left: Task, right: Task) => {
  if (left.item_type !== right.item_type) {
    return left.item_type === 'event' ? -1 : 1;
  }

  const leftTime = left.starts_at ? parseISO(left.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
  const rightTime = right.starts_at ? parseISO(right.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;

  if (left.status !== right.status) {
    if (left.status === 'done') return 1;
    if (right.status === 'done') return -1;
  }

  return left.title.localeCompare(right.title);
};

const formatTaskScheduleLabel = (
  task: Pick<Task, 'item_type' | 'due_date' | 'starts_at' | 'ends_at' | 'event_timezone' | 'recurrence_frequency' | 'recurrence_interval'>
) => {
  if (task.item_type === 'event') {
    const dateLabel = task.due_date ? format(parseISO(`${task.due_date}T00:00:00`), 'MMM d') : 'No date';
    const startLabel = task.starts_at ? formatIsoTimeForEventTimeZone(task.starts_at, task.event_timezone) : '';
    const endLabel = task.ends_at ? formatIsoTimeForEventTimeZone(task.ends_at, task.event_timezone) : '';
    if (startLabel && endLabel) return `${dateLabel} • ${startLabel} - ${endLabel}`;
    if (startLabel) return `${dateLabel} • ${startLabel}`;
    return dateLabel;
  }
  const effectiveDueDate = getEffectiveTaskDueDate(task);
  return effectiveDueDate ? format(effectiveDueDate, 'MMM d') : 'No due date';
};

const expandAssigneeSelection = (selectedUserIds: string[], teamMembers: TeamMember[]) => {
  if (!selectedUserIds.includes(EVERYONE_ASSIGNEE_ID)) {
    return Array.from(new Set(selectedUserIds.map((value) => value.trim()).filter(Boolean)));
  }
  return Array.from(new Set(teamMembers.map((member) => member.id).filter(Boolean)));
};

const isEveryoneAssignment = (selectedUserIds: string[], teamMembers: TeamMember[]) => {
  const normalizedSelectedIds = Array.from(new Set(selectedUserIds.map((value) => value.trim()).filter(Boolean)));
  const teamMemberIds = Array.from(new Set(teamMembers.map((member) => member.id).filter(Boolean)));
  if (teamMemberIds.length === 0) return false;
  return normalizedSelectedIds.length === teamMemberIds.length
    && teamMemberIds.every((memberId) => normalizedSelectedIds.includes(memberId));
};

const buildTaskShareMessage = (
  task: Task,
  assigneeNames: string[],
  threadName: string,
  verb: 'New' | 'Updated' | 'Shared' = 'New',
) => {
  const lines = [
    `${verb} ${itemTypeLabel(task.item_type ?? 'task').toLowerCase()}: ${task.title.trim() || 'Untitled'}`,
  ];

  if (task.item_type === 'event') {
    if (task.due_date) {
      lines.push(`Date: ${format(parseISO(`${task.due_date}T00:00:00`), 'EEE, MMM d, yyyy')}`);
    }
    const startLabel = task.starts_at ? formatIsoTimeForEventTimeZone(task.starts_at, task.event_timezone) : '';
    const endLabel = task.ends_at ? formatIsoTimeForEventTimeZone(task.ends_at, task.event_timezone) : '';
    if (startLabel && endLabel) {
      lines.push(`Time: ${startLabel} - ${endLabel}`);
    } else if (startLabel) {
      lines.push(`Time: ${startLabel}`);
    }
    if (task.event_timezone?.trim()) {
      lines.push(`Time zone: ${formatTimeZoneOptionLabel(task.event_timezone)}`);
    }
  } else if (task.due_date) {
    lines.push(`Due: ${format(parseISO(`${task.due_date}T00:00:00`), 'EEE, MMM d, yyyy')}`);
  }

  if (assigneeNames.length > 0) {
    lines.push(`${task.item_type === 'event' ? 'Attendees' : 'Assigned to'}: ${assigneeNames.join(', ')}`);
  }
  if (task.location?.trim()) {
    lines.push(`Location: ${task.location.trim()}`);
  }
  if (task.meeting_link?.trim()) {
    lines.push(`Link: ${task.meeting_link.trim()}`);
  }
  if (task.description?.trim()) {
    lines.push(task.description.trim());
  }
  lines.push(`Shared to ${threadName}`);
  return lines.join('\n');
};

const recurrenceTone = (frequency?: string | null) => {
  const normalized = frequency?.trim().toLowerCase().replace('-', '_') ?? '';
  if (normalized === 'daily') {
    return { text: '#1D4ED8', background: 'rgba(29,78,216,0.10)' };
  }
  if (normalized === 'weekday') {
    return { text: '#0891B2', background: 'rgba(8,145,178,0.10)' };
  }
  if (normalized === 'weekend') {
    return { text: '#D97706', background: 'rgba(217,119,6,0.10)' };
  }
  if (normalized === 'weekly') {
    return { text: '#7C3AED', background: 'rgba(124,58,237,0.10)' };
  }
  if (normalized === 'bi_weekly') {
    return { text: '#4338CA', background: 'rgba(67,56,202,0.10)' };
  }
  if (normalized === 'monthly') {
    return { text: '#0F766E', background: 'rgba(15,118,110,0.10)' };
  }
  if (normalized === 'quarterly') {
    return { text: '#0369A1', background: 'rgba(3,105,161,0.10)' };
  }
  if (normalized === 'yearly') {
    return { text: '#B45309', background: 'rgba(180,83,9,0.10)' };
  }
  return { text: '#64748B', background: 'rgba(100,116,139,0.10)' };
};

const formatDueDate = (value?: string | null) => {
  if (!value) return 'No due date';
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return 'No due date';
  return format(parsed, 'EEE, MMM d');
};

const normalizeRecurrenceFrequency = (value?: string | null) => {
  if (!value) return null;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/^every_/, '');
};

const getNextRecurringDueDate = (
  task: Pick<Task, 'due_date' | 'recurrence_frequency' | 'recurrence_interval'>
) => {
  if (!task.due_date || !task.recurrence_frequency) return null;
  const parsed = parseISO(task.due_date);
  if (Number.isNaN(parsed.getTime())) return null;
  const normalized = normalizeRecurrenceFrequency(task.recurrence_frequency);
  if (!normalized) return null;
  const interval = task.recurrence_interval ?? 1;
  const today = startOfToday();
  let next = parsed;
  let guard = 0;
  const advanceDaily = () => addDays(next, Math.max(1, interval));
  while (next <= today && guard < 400) {
    if (normalized === 'daily') {
      next = advanceDaily();
    } else if (normalized === 'weekly') {
      next = addWeeks(next, interval);
    } else if (normalized === 'bi_weekly') {
      next = addDays(next, 14 * interval);
    } else if (normalized === 'monthly') {
      next = addMonths(next, interval);
    } else if (normalized === 'quarterly') {
      next = addMonths(next, 3 * interval);
    } else if (normalized === 'yearly') {
      next = addYears(next, interval);
    } else if (normalized === 'weekday') {
      next = addDays(next, 1);
      while (next < today || [0, 6].includes(next.getDay())) {
        next = addDays(next, 1);
      }
    } else if (normalized === 'weekend') {
      next = addDays(next, 1);
      while (next < today || ![0, 6].includes(next.getDay())) {
        next = addDays(next, 1);
      }
    } else {
      next = addMonths(next, interval);
    }
    guard += 1;
  }
  return next;
};

const getEffectiveTaskDueDate = (
  task: Pick<Task, 'due_date' | 'recurrence_frequency' | 'recurrence_interval'>
) => {
  if (!task.due_date) return null;
  const parsed = parseISO(`${task.due_date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (task.recurrence_frequency && parsed < startOfToday()) {
    return getNextRecurringDueDate(task) ?? parsed;
  }
  return parsed;
};

const formatDueDateLong = (task: Pick<Task, 'due_date' | 'recurrence_frequency' | 'recurrence_interval'>) => {
  const effectiveDueDate = getEffectiveTaskDueDate(task);
  return effectiveDueDate ? format(effectiveDueDate, 'EEEE, MMM d') : 'No due date';
};

const formatTaskDueDateRelative = (task: Pick<Task, 'due_date' | 'recurrence_frequency' | 'recurrence_interval'>) => {
  const effectiveDueDate = getEffectiveTaskDueDate(task);
  if (!effectiveDueDate) return 'No date';
  if (isYesterday(effectiveDueDate)) return 'Yesterday';
  if (isToday(effectiveDueDate)) return 'Today';
  if (isTomorrow(effectiveDueDate)) return 'Tomorrow';
  return format(effectiveDueDate, 'EEEE');
};

const toSentenceCase = (value?: string | null) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1).toLowerCase()}`;
};

const normalizeMentionToken = (value: string) =>
  value.replace(/^@/, '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');

const mentionHandleFromMember = (member: TeamMember) => {
  const emailLocalPart = member.email.split('@')[0] ?? '';
  const base = emailLocalPart || member.name || member.id;
  return normalizeMentionToken(base.replace(/\s+/g, '')) || normalizeMentionToken(member.id);
};

const getCommentTextSegments = (
  body: string,
  mentionAliasMap: Map<string, string>,
) => {
  const segments: Array<{ text: string; isMention: boolean }> = [];
  const mentionRegex = /@([A-Za-z0-9_.-]+)/g;
  let cursor = 0;

  for (const match of body.matchAll(mentionRegex)) {
    const matchText = match[0];
    const mentionToken = normalizeMentionToken(match[1] ?? '');
    const matchIndex = match.index ?? 0;

    if (matchIndex > cursor) {
      segments.push({ text: body.slice(cursor, matchIndex), isMention: false });
    }

    segments.push({
      text: matchText,
      isMention: mentionToken === 'everyone' || mentionAliasMap.has(mentionToken),
    });
    cursor = matchIndex + matchText.length;
  }

  if (cursor < body.length) {
    segments.push({ text: body.slice(cursor), isMention: false });
  }

  return segments.length > 0 ? segments : [{ text: body, isMention: false }];
};

const formatBadgeCount = (count: number) => (count > 99 ? '99+' : String(count));

function TaskPeopleBadges({ overdue, completed, upcoming }: TaskPeopleBadgesProps) {
  const colors = useThemeColors();
  const badges = [
    {
      key: 'overdue',
      count: overdue,
      bg: 'rgba(239,68,68,0.10)',
      border: 'rgba(185,28,28,0.18)',
      text: '#B91C1C',
    },
    {
      key: 'completed',
      count: completed,
      bg: 'rgba(16,185,129,0.10)',
      border: 'rgba(5,150,105,0.18)',
      text: '#059669',
    },
    {
      key: 'upcoming',
      count: upcoming,
      bg: colors.bg.secondary,
      border: colors.border.light,
      text: colors.text.tertiary,
    },
  ].filter((badge) => badge.count > 0);

  if (badges.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      {badges.map((badge) => (
        <View
          key={badge.key}
          style={{
            minWidth: 22,
            height: 22,
            borderRadius: 999,
            paddingHorizontal: badge.count > 9 ? 7 : 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: badge.bg,
            borderWidth: 1,
            borderColor: badge.border,
          }}
        >
          <Text style={{ color: badge.text, fontSize: 11, fontWeight: '700' }}>
            {formatBadgeCount(badge.count)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function TaskToastConfettiPiece({
  progress,
  piece,
}: {
  progress: Animated.SharedValue<number>;
  piece: TaskToastConfettiPieceDefinition;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: piece.x * progress.value },
      { translateY: piece.y * progress.value + (8 * progress.value) },
      { rotate: `${piece.rotate * progress.value}deg` },
      { scale: 1 - (0.35 * progress.value) },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 23,
          top: 23,
          width: piece.width,
          height: piece.height,
          borderRadius: 999,
          backgroundColor: piece.color,
        },
        animatedStyle,
      ]}
    />
  );
}

function TaskToastConfetti() {
  const progress = useSharedValue<number>(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -8,
        left: -8,
        width: 58,
        height: 58,
      }}
    >
      {TASK_TOAST_CONFETTI_PIECES.map((piece, index) => (
        <TaskToastConfettiPiece key={`${piece.color}-${index}`} progress={progress} piece={piece} />
      ))}
    </View>
  );
}

const buildMentionAliasMap = (teamMembers: TeamMember[]) => {
  const aliasMap = new Map<string, string>();
  teamMembers.forEach((member) => {
    const userId = member.id;
    const aliases = new Set<string>();

    aliases.add(normalizeMentionToken(member.id));
    aliases.add(normalizeMentionToken(member.name.replace(/\s+/g, '')));
    aliases.add(normalizeMentionToken(member.name.split(' ')[0] ?? ''));
    aliases.add(normalizeMentionToken(mentionHandleFromMember(member)));
    aliases.add(normalizeMentionToken(member.email.split('@')[0] ?? ''));

    aliases.forEach((alias) => {
      if (alias && !aliasMap.has(alias)) aliasMap.set(alias, userId);
    });
  });

  return aliasMap;
};

const isTaskOverdue = (task: Task) => {
  if (!task.due_date || task.status === 'done') return false;
  const effectiveDueDate = getEffectiveTaskDueDate(task);
  if (!effectiveDueDate) return false;
  const due = new Date(effectiveDueDate);
  due.setHours(23, 59, 59, 999);
  return isPast(due) && !isToday(due);
};

const isTaskDueToday = (task: Task) => {
  if (!task.due_date || task.status === 'done') return false;
  const effectiveDueDate = getEffectiveTaskDueDate(task);
  return Boolean(effectiveDueDate && isToday(effectiveDueDate));
};

const isTaskCompletedToday = (task: Task) => {
  if (task.status !== 'done' || !task.completed_at) return false;
  const completedAt = parseISO(task.completed_at);
  if (Number.isNaN(completedAt.getTime())) return false;
  return isToday(completedAt);
};

const formatMessageTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const toTaskFormState = (
  task: Task,
  teamMembers: TeamMember[] = [],
  allowEveryone = false,
): TaskFormState => {
  const normalizedAssigneeIds = task.assignee_user_ids ?? [];
  const everyoneSelected = allowEveryone && isEveryoneAssignment(normalizedAssigneeIds, teamMembers);

  return {
    itemType: task.item_type === 'event' ? 'event' : 'task',
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    dueDate: task.due_date ? parseISO(`${task.due_date}T00:00:00`) : (task.starts_at ? parseISO(task.starts_at) : null),
    startTime: formatIsoTimeForEventTimeZone(task.starts_at, task.event_timezone ?? getDeviceTimeZone()),
    endTime: formatIsoTimeForEventTimeZone(task.ends_at, task.event_timezone ?? getDeviceTimeZone()),
    eventTimezone: task.event_timezone?.trim() || getDeviceTimeZone(),
    location: task.location ?? '',
    meetingLink: task.meeting_link ?? '',
    assigneeUserIds: everyoneSelected ? [EVERYONE_ASSIGNEE_ID] : normalizedAssigneeIds,
    recurrenceFrequency: task.recurrence_frequency ?? null,
    recurrenceInterval: task.recurrence_interval ?? 1,
    shareToThread: false,
    shareThreadEntityId: DEFAULT_TASK_SHARE_THREAD_ENTITY_ID,
  };
};

const blankTaskForm = (): TaskFormState => ({
  itemType: 'task',
  title: '',
  description: '',
  priority: 'medium',
  dueDate: startOfToday(),
  startTime: '09:00',
  endTime: '10:00',
  eventTimezone: getDeviceTimeZone(),
  location: '',
  meetingLink: '',
  assigneeUserIds: [],
  recurrenceFrequency: null,
  recurrenceInterval: 1,
  shareToThread: false,
  shareThreadEntityId: DEFAULT_TASK_SHARE_THREAD_ENTITY_ID,
});

function UserAvatar({ member, name, size = 26 }: { member?: TeamMember; name?: string; size?: number }) {
  const resolvedName = member?.name?.trim() || name?.trim() || 'Member';
  const initial = resolvedName.charAt(0).toUpperCase();
  const palette = ['#111827', '#2563EB', '#0F766E', '#9333EA', '#C2410C'];
  let hash = 0;
  for (let i = 0; i < resolvedName.length; i += 1) {
    hash = (hash + resolvedName.charCodeAt(i) * (i + 1)) % 10000;
  }
  const color = palette[hash % palette.length];

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: size <= 20 ? 9 : 11, fontWeight: '700' }}>
        {initial}
      </Text>
    </View>
  );
}

function AssigneePicker({
  teamMembers,
  selectedUserIds,
  currentUserId,
  onToggleAssignee,
  allowEveryone = false,
  placeholder,
}: {
  teamMembers: TeamMember[];
  selectedUserIds: string[];
  currentUserId?: string | null;
  onToggleAssignee: (userId: string) => void;
  allowEveryone?: boolean;
  placeholder: string;
}) {
  const colors = useThemeColors();
  const themeMode = useResolvedThemeMode();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fieldBorder = colors.border.light;
  const fieldActiveBorder = themeMode === 'light' ? '#94A3B8' : colors.border.medium;
  const fieldBg = colors.bg.card;

  useEffect(() => {
    if (!isOpen) setSearchQuery('');
  }, [isOpen]);

  const everyoneSelected = selectedUserIds.includes(EVERYONE_ASSIGNEE_ID);
  const selectedMembers = useMemo(
    () => everyoneSelected
      ? teamMembers
      : teamMembers.filter((member) => selectedUserIds.includes(member.id)),
    [everyoneSelected, selectedUserIds, teamMembers]
  );

  const summaryLabel = useMemo(() => {
    if (everyoneSelected) return 'Everyone';
    if (selectedMembers.length === 0) return placeholder;
    const first = selectedMembers[0];
    const firstLabel = first?.id === currentUserId ? 'Myself' : first?.name ?? 'Assignee';
    if (selectedMembers.length === 1) return firstLabel;
    return `${firstLabel} +${selectedMembers.length - 1}`;
  }, [currentUserId, everyoneSelected, placeholder, selectedMembers]);

  const filteredMembers = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    const memberResults = !normalized ? teamMembers : teamMembers.filter((member) => {
      const label = member.id === currentUserId ? 'myself' : member.name.toLowerCase();
      return label.includes(normalized) || member.email.toLowerCase().includes(normalized);
    });
    if (!allowEveryone) return memberResults;
    if (!normalized || 'everyone'.includes(normalized)) {
      return [
        {
          id: EVERYONE_ASSIGNEE_ID,
          email: 'All active team members',
          name: 'Everyone',
          role: EVERYONE_ASSIGNEE_ROLE,
          createdAt: '',
        },
        ...memberResults,
      ];
    }
    return memberResults;
  }, [allowEveryone, currentUserId, searchQuery, teamMembers]);

  return (
    <View style={{ zIndex: isOpen ? 40 : 1 }}>
      <Pressable
        onPress={() => setIsOpen((current) => !current)}
        style={{
          height: 46,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomLeftRadius: isOpen ? 0 : 12,
          borderBottomRightRadius: isOpen ? 0 : 12,
          borderWidth: 1,
          borderColor: isOpen ? fieldActiveBorder : fieldBorder,
          backgroundColor: fieldBg,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: selectedMembers.length > 0 ? colors.text.primary : colors.text.tertiary, fontSize: 14, fontWeight: '400' }}>
          {summaryLabel}
        </Text>
        <ArrowUpDown size={14} color={isOpen ? fieldActiveBorder : colors.text.tertiary} strokeWidth={2.2} />
      </Pressable>

      {isOpen ? (
        <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: fieldActiveBorder, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: fieldBg, overflow: 'hidden', maxHeight: 250 }}>
          <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: fieldBorder }}>
            <View style={{ height: 38, borderRadius: 10, borderWidth: 1, borderColor: fieldBorder, backgroundColor: fieldBg, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }}>
              <Search size={14} color={colors.text.tertiary} strokeWidth={2.2} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search assignee..."
                placeholderTextColor={colors.input.placeholder}
                style={{ flex: 1, marginLeft: 8, color: colors.text.primary, fontSize: 13, fontWeight: '400' }}
                selectionColor={colors.text.primary}
              />
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filteredMembers.map((member) => {
              const selected = selectedUserIds.includes(member.id);
              const assigneeLabel = member.id === EVERYONE_ASSIGNEE_ID
                ? 'Everyone'
                : member.id === currentUserId
                  ? 'Myself'
                  : member.name;
              return (
                <Pressable
                  key={member.id}
                  onPress={() => onToggleAssignee(member.id)}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: fieldBorder,
                    backgroundColor: selected ? 'rgba(37,99,235,0.08)' : fieldBg,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    {member.id === EVERYONE_ASSIGNEE_ID ? (
                      <View style={{ width: 22, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text.primary }}>
                        <Text style={{ color: colors.bg.primary, fontSize: 9, fontWeight: '700' }}>All</Text>
                      </View>
                    ) : (
                      <UserAvatar member={member} size={22} />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{assigneeLabel}</Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 11 }} numberOfLines={1}>
                        {member.id === EVERYONE_ASSIGNEE_ID ? 'Assign this to the whole team' : member.email}
                      </Text>
                    </View>
                  </View>
                  {selected ? <Check size={14} color="#2563EB" strokeWidth={2.6} /> : null}
                </Pressable>
              );
            })}
            {filteredMembers.length === 0 ? (
              <View style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>No assignees found.</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function PriorityDropdown({
  value,
  onChange,
}: {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
}) {
  const colors = useThemeColors();
  const themeMode = useResolvedThemeMode();
  const [isOpen, setIsOpen] = useState(false);
  const fieldBorder = colors.border.light;
  const fieldActiveBorder = themeMode === 'light' ? '#94A3B8' : colors.border.medium;
  const selectedMeta = PRIORITY_META[value];

  return (
    <View style={{ zIndex: isOpen ? 35 : 1 }}>
      <Pressable
        onPress={() => setIsOpen((current) => !current)}
        style={{
          height: 46,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomLeftRadius: isOpen ? 0 : 12,
          borderBottomRightRadius: isOpen ? 0 : 12,
          borderWidth: 1,
          borderColor: isOpen ? fieldActiveBorder : fieldBorder,
          backgroundColor: colors.bg.card,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: selectedMeta.color, fontSize: 14, fontWeight: '500' }}>
          {selectedMeta.label}
        </Text>
        <ArrowUpDown size={14} color={isOpen ? fieldActiveBorder : colors.text.tertiary} strokeWidth={2.2} />
      </Pressable>
      {isOpen ? (
        <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: fieldActiveBorder, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
          {(Object.keys(PRIORITY_META) as TaskPriority[]).map((priority) => {
            const meta = PRIORITY_META[priority];
            const selected = priority === value;
            return (
              <Pressable
                key={priority}
                onPress={() => {
                  onChange(priority);
                  setIsOpen(false);
                }}
                style={{
                  minHeight: 42,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: fieldBorder,
                  backgroundColor: selected ? meta.soft : colors.bg.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ color: meta.color, fontSize: 13, fontWeight: '500' }}>{meta.label}</Text>
                {selected ? <Check size={14} color={meta.color} strokeWidth={2.6} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function RecurrenceDropdown({
  value,
  onChange,
}: {
  value: TaskRecurrenceFrequency | null;
  onChange: (frequency: TaskRecurrenceFrequency | null) => void;
}) {
  const colors = useThemeColors();
  const themeMode = useResolvedThemeMode();
  const [isOpen, setIsOpen] = useState(false);
  const fieldBorder = colors.border.light;
  const fieldActiveBorder = themeMode === 'light' ? '#94A3B8' : colors.border.medium;
  const selectedOption = RECURRENCE_OPTIONS.find((option) => option.id === value) ?? RECURRENCE_OPTIONS[0];

  return (
    <View style={{ zIndex: isOpen ? 34 : 1 }}>
      <Pressable
        onPress={() => setIsOpen((current) => !current)}
        style={{
          height: 46,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomLeftRadius: isOpen ? 0 : 12,
          borderBottomRightRadius: isOpen ? 0 : 12,
          borderWidth: 1,
          borderColor: isOpen ? fieldActiveBorder : fieldBorder,
          backgroundColor: colors.bg.card,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '400' }}>
          {selectedOption.label}
        </Text>
        <ArrowUpDown size={14} color={isOpen ? fieldActiveBorder : colors.text.tertiary} strokeWidth={2.2} />
      </Pressable>
      {isOpen ? (
        <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: fieldActiveBorder, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
          {RECURRENCE_OPTIONS.map((option) => {
            const selected = option.id === value;
            return (
              <Pressable
                key={option.label}
                onPress={() => {
                  onChange(option.id);
                  setIsOpen(false);
                }}
                style={{
                  minHeight: 42,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: fieldBorder,
                  backgroundColor: selected ? 'rgba(37,99,235,0.10)' : colors.bg.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ color: selected ? '#1D4ED8' : colors.text.secondary, fontSize: 13, fontWeight: '400' }}>
                  {option.label}
                </Text>
                {selected ? <Check size={14} color="#1D4ED8" strokeWidth={2.6} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function EventTimezoneDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (timeZone: string) => void;
}) {
  const colors = useThemeColors();
  const themeMode = useResolvedThemeMode();
  const [isOpen, setIsOpen] = useState(false);
  const fieldBorder = colors.border.light;
  const fieldActiveBorder = themeMode === 'light' ? '#94A3B8' : colors.border.medium;
  const normalizedValue = value.trim() || getDeviceTimeZone();
  const options = useMemo(() => {
    if (EVENT_TIMEZONE_OPTIONS.some((option) => option.id === normalizedValue)) return EVENT_TIMEZONE_OPTIONS;
    return [
      { id: normalizedValue, label: formatTimeZoneOptionLabel(normalizedValue) },
      ...EVENT_TIMEZONE_OPTIONS,
    ];
  }, [normalizedValue]);
  const selectedOption = options.find((option) => option.id === normalizedValue) ?? options[0];

  return (
    <View style={{ zIndex: isOpen ? 33 : 1 }}>
      <Pressable
        onPress={() => setIsOpen((current) => !current)}
        style={{
          height: 46,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomLeftRadius: isOpen ? 0 : 12,
          borderBottomRightRadius: isOpen ? 0 : 12,
          borderWidth: 1,
          borderColor: isOpen ? fieldActiveBorder : fieldBorder,
          backgroundColor: colors.bg.card,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '400' }} numberOfLines={1}>
          {selectedOption?.label ?? formatTimeZoneOptionLabel(normalizedValue)}
        </Text>
        <ArrowUpDown size={14} color={isOpen ? fieldActiveBorder : colors.text.tertiary} strokeWidth={2.2} />
      </Pressable>
      {isOpen ? (
        <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: fieldActiveBorder, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
          {options.map((option) => {
            const selected = option.id === normalizedValue;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  onChange(option.id);
                  setIsOpen(false);
                }}
                style={{
                  minHeight: 42,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: fieldBorder,
                  backgroundColor: selected ? 'rgba(37,99,235,0.10)' : colors.bg.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ color: selected ? '#1D4ED8' : colors.text.secondary, fontSize: 13, fontWeight: '400' }}>
                  {option.label}
                </Text>
                {selected ? <Check size={14} color="#1D4ED8" strokeWidth={2.6} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function TaskViewToggle({
  value,
  onChange,
}: {
  value: TaskViewMode;
  onChange: (next: TaskViewMode) => void;
}) {
  const colors = useThemeColors();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {([
        { id: 'list' as TaskViewMode, label: 'List', icon: ArrowUpDown },
        { id: 'calendar' as TaskViewMode, label: 'Calendar', icon: Calendar },
      ]).map((option) => {
        const active = value === option.id;
        const Icon = option.icon;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            style={{
              borderRadius: 999,
              backgroundColor: active ? colors.text.primary : colors.bg.card,
              borderWidth: 1,
              borderColor: active ? colors.text.primary : colors.border.light,
              paddingHorizontal: 14,
              minWidth: 110,
              height: 38,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Icon size={14} color={active ? colors.bg.primary : colors.text.secondary} strokeWidth={2.2} />
            <Text style={{ color: active ? colors.bg.primary : colors.text.secondary, fontSize: 13, fontWeight: '600' }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PriorityPills({
  value,
  onChange,
}: {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
}) {
  const colors = useThemeColors();

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {(Object.keys(PRIORITY_META) as TaskPriority[]).map((priority) => {
        const meta = PRIORITY_META[priority];
        const selected = priority === value;
        const selectedBackground = priority === 'low' ? 'rgba(245,158,11,0.16)' : meta.soft;
        const selectedTextColor = priority === 'low' ? '#B45309' : meta.color;
        return (
          <Pressable
            key={priority}
            onPress={() => onChange(priority)}
            style={{
              flex: 1,
              minWidth: 0,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              minHeight: 38,
              paddingHorizontal: 10,
              paddingVertical: 8,
              backgroundColor: selected ? selectedBackground : colors.bg.secondary,
            }}
          >
            <Text style={{ color: selected ? selectedTextColor : colors.text.secondary, fontSize: 12, fontWeight: '500' }}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TaskCreateModal({
  visible,
  form,
  teamMembers,
  currentUserId,
  allowEveryone = false,
  shareThreadOptions,
  onChange,
  onToggleAssignee,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  visible: boolean;
  form: TaskFormState;
  teamMembers: TeamMember[];
  currentUserId?: string | null;
  allowEveryone?: boolean;
  shareThreadOptions: TaskShareThreadOption[];
  onChange: (patch: Partial<TaskFormState>) => void;
  onToggleAssignee: (userId: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const colors = useThemeColors();
  const themeMode = useResolvedThemeMode();
  const { isDesktop } = useBreakpoint();
  const isMobileModal = !isDesktop;
  const [showDatePicker, setShowDatePicker] = useState(false);
  const fieldBorder = colors.border.light;
  const fieldBg = colors.bg.card;
  const isEventForm = form.itemType === 'event';

  return (
    <Modal
      visible={visible}
      transparent={!isMobileModal}
      animationType={isMobileModal ? 'slide' : 'fade'}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: isMobileModal ? colors.bg.card : 'rgba(15,23,42,0.45)',
          alignItems: isMobileModal ? 'stretch' : 'center',
          justifyContent: isMobileModal ? 'flex-start' : 'center',
          padding: isMobileModal ? 0 : 18,
        }}
      >
        <View
          style={{
            width: '100%',
            flex: isMobileModal ? 1 : undefined,
            maxWidth: isMobileModal ? undefined : TASK_MODAL_MAX_WIDTH,
            maxHeight: isMobileModal ? undefined : TASK_MODAL_MAX_HEIGHT,
            backgroundColor: colors.bg.card,
            borderRadius: isMobileModal ? 0 : TASK_MODAL_RADIUS,
            borderWidth: isMobileModal ? 0 : 1,
            borderColor: colors.border.light,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              paddingHorizontal: TASK_MODAL_HEADER_HORIZONTAL_PADDING,
              paddingVertical: TASK_MODAL_HEADER_VERTICAL_PADDING,
              borderBottomWidth: 1,
              borderBottomColor: colors.border.light,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: '600' }}>Create {itemTypeLabel(form.itemType)}</Text>
            <Pressable onPress={onClose} style={{ width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary }}>
              <X size={18} color={colors.text.secondary} strokeWidth={2.2} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: TASK_MODAL_BODY_PADDING, gap: TASK_MODAL_BODY_GAP }}
            showsVerticalScrollIndicator={false}
          >
            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Type</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([
                  { id: 'task' as TaskItemType, label: 'Task' },
                  { id: 'event' as TaskItemType, label: 'Event' },
                ]).map((option) => {
                  const active = form.itemType === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => onChange({
                        itemType: option.id,
                        eventTimezone: option.id === 'event'
                          ? (form.eventTimezone.trim() || getDeviceTimeZone())
                          : form.eventTimezone,
                      })}
                      style={{
                        flex: 1,
                        minHeight: 40,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? colors.text.primary : fieldBorder,
                        backgroundColor: active ? colors.text.primary : fieldBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: active ? colors.bg.primary : colors.text.secondary, fontSize: 13, fontWeight: '600' }}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>
                {isEventForm ? 'Event title' : 'Task title'}
              </Text>
              <TextInput
                value={form.title}
                onChangeText={(value) => onChange({ title: value })}
                placeholder={isEventForm ? 'What is happening?' : 'What needs to be done?'}
                placeholderTextColor={colors.input.placeholder}
                style={{
                  backgroundColor: fieldBg,
                  borderWidth: 1,
                  borderColor: fieldBorder,
                  color: colors.input.text,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 14,
                  fontWeight: '400',
                }}
                selectionColor={colors.text.primary}
              />
            </View>

            {isMobileModal ? (
              <View>
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>
                  {isEventForm ? 'Event date' : 'Due date'}
                </Text>
                {Platform.OS === 'web' ? (
                  <View
                    style={{
                      minHeight: 46,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: fieldBorder,
                      backgroundColor: fieldBg,
                      paddingHorizontal: 12,
                      alignItems: 'center',
                      flexDirection: 'row',
                    }}
                  >
                    <Calendar size={15} color={colors.text.tertiary} strokeWidth={2} />
                    <input
                      type="date"
                      value={form.dueDate ? format(form.dueDate, 'yyyy-MM-dd') : ''}
                      onChange={(event: any) => {
                        const next = String(event?.target?.value ?? '');
                        if (!next) {
                          onChange({ dueDate: null });
                          return;
                        }
                        const parsed = parseISO(`${next}T00:00:00`);
                        if (!Number.isNaN(parsed.getTime())) {
                          onChange({ dueDate: parsed });
                        }
                      }}
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: colors.input.text,
                        marginLeft: 10,
                        fontSize: 13,
                        fontWeight: 400,
                        fontFamily: 'inherit',
                        colorScheme: themeMode === 'dark' ? 'dark' : 'light',
                      }}
                    />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setShowDatePicker((current) => !current)}
                    style={{
                      minHeight: 46,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: fieldBorder,
                      backgroundColor: fieldBg,
                      paddingHorizontal: 12,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text style={{ color: colors.input.text, fontSize: 13, fontWeight: '400' }}>
                      {form.dueDate ? format(form.dueDate, 'yyyy-MM-dd') : 'Set date'}
                    </Text>
                    <Calendar size={15} color={colors.text.tertiary} strokeWidth={2} />
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>
                    {isEventForm ? 'Event date' : 'Due date'}
                  </Text>
                  {Platform.OS === 'web' ? (
                    <View
                      style={{
                        minHeight: 46,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: fieldBorder,
                        backgroundColor: fieldBg,
                        paddingHorizontal: 12,
                        alignItems: 'center',
                        flexDirection: 'row',
                      }}
                    >
                      <Calendar size={15} color={colors.text.tertiary} strokeWidth={2} />
                      <input
                        type="date"
                        value={form.dueDate ? format(form.dueDate, 'yyyy-MM-dd') : ''}
                        onChange={(event: any) => {
                          const next = String(event?.target?.value ?? '');
                          if (!next) {
                            onChange({ dueDate: null });
                            return;
                          }
                          const parsed = parseISO(`${next}T00:00:00`);
                          if (!Number.isNaN(parsed.getTime())) {
                            onChange({ dueDate: parsed });
                          }
                        }}
                        style={{
                          flex: 1,
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          color: colors.input.text,
                          marginLeft: 10,
                          fontSize: 13,
                          fontWeight: 400,
                          fontFamily: 'inherit',
                          colorScheme: themeMode === 'dark' ? 'dark' : 'light',
                        }}
                      />
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setShowDatePicker((current) => !current)}
                      style={{
                        minHeight: 46,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: fieldBorder,
                        backgroundColor: fieldBg,
                        paddingHorizontal: 12,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text style={{ color: colors.input.text, fontSize: 13, fontWeight: '400' }}>
                        {form.dueDate ? format(form.dueDate, 'yyyy-MM-dd') : 'Set date'}
                      </Text>
                      <Calendar size={15} color={colors.text.tertiary} strokeWidth={2} />
                    </Pressable>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Priority</Text>
                  <PriorityDropdown value={form.priority} onChange={(priority) => onChange({ priority })} />
                </View>
              </View>
            )}

            {isEventForm ? (
              <>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Start time</Text>
                    {Platform.OS === 'web' ? (
                      <View style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: fieldBorder, backgroundColor: fieldBg, paddingHorizontal: 12, alignItems: 'center', flexDirection: 'row' }}>
                        <Clock3 size={15} color={colors.text.tertiary} strokeWidth={2} />
                        <input
                          type="time"
                          value={form.startTime}
                          onChange={(event: any) => {
                            const nextStartTime = String(event?.target?.value ?? '');
                            onChange({
                              startTime: nextStartTime,
                              endTime: resolveNextEndTime(nextStartTime, form.startTime, form.endTime),
                            });
                          }}
                          style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            color: colors.input.text,
                            marginLeft: 10,
                            fontSize: 13,
                            fontWeight: 400,
                            fontFamily: 'inherit',
                            colorScheme: themeMode === 'dark' ? 'dark' : 'light',
                          }}
                        />
                      </View>
                    ) : (
                      <TextInput
                        value={form.startTime}
                        onChangeText={(value) => onChange({
                          startTime: value,
                          endTime: resolveNextEndTime(value, form.startTime, form.endTime),
                        })}
                        placeholder="09:00"
                        placeholderTextColor={colors.input.placeholder}
                        style={{
                          minHeight: 46,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: fieldBorder,
                          backgroundColor: fieldBg,
                          color: colors.input.text,
                          paddingHorizontal: 12,
                          fontSize: 13,
                          fontWeight: '400',
                        }}
                        selectionColor={colors.text.primary}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>End time</Text>
                    {Platform.OS === 'web' ? (
                      <View style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: fieldBorder, backgroundColor: fieldBg, paddingHorizontal: 12, alignItems: 'center', flexDirection: 'row' }}>
                        <Clock3 size={15} color={colors.text.tertiary} strokeWidth={2} />
                        <input
                          type="time"
                          value={form.endTime}
                          onChange={(event: any) => onChange({ endTime: String(event?.target?.value ?? '') })}
                          style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            color: colors.input.text,
                            marginLeft: 10,
                            fontSize: 13,
                            fontWeight: 400,
                            fontFamily: 'inherit',
                            colorScheme: themeMode === 'dark' ? 'dark' : 'light',
                          }}
                        />
                      </View>
                    ) : (
                      <TextInput
                        value={form.endTime}
                        onChangeText={(value) => onChange({ endTime: value })}
                        placeholder="10:00"
                        placeholderTextColor={colors.input.placeholder}
                        style={{
                          minHeight: 46,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: fieldBorder,
                          backgroundColor: fieldBg,
                          color: colors.input.text,
                          paddingHorizontal: 12,
                          fontSize: 13,
                          fontWeight: '400',
                        }}
                        selectionColor={colors.text.primary}
                      />
                    )}
                  </View>
                </View>
                <View>
                  <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Time zone</Text>
                  <EventTimezoneDropdown
                    value={form.eventTimezone}
                    onChange={(eventTimezone) => onChange({ eventTimezone })}
                  />
                </View>
              </>
            ) : null}

            {showDatePicker && Platform.OS !== 'web' ? (
              <DateTimePicker
                value={form.dueDate ?? startOfToday()}
                mode="date"
                minimumDate={startOfToday()}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                  if (event.type === 'dismissed') return;
                  if (selectedDate) onChange({ dueDate: selectedDate });
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                }}
              />
            ) : null}

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>
                {isEventForm ? 'Attendees' : 'Assignee'}
              </Text>
              <AssigneePicker
                teamMembers={teamMembers}
                selectedUserIds={form.assigneeUserIds}
                currentUserId={currentUserId}
                onToggleAssignee={onToggleAssignee}
                allowEveryone={allowEveryone}
                placeholder={isEventForm ? 'Select attendees' : 'Select assignees'}
              />
            </View>

            {isMobileModal ? (
              <View>
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>
                  {isEventForm ? 'Schedule' : 'Recurring'}
                </Text>
                <RecurrenceDropdown
                  value={form.recurrenceFrequency}
                  onChange={(recurrenceFrequency) => onChange({ recurrenceFrequency })}
                />
              </View>
            ) : (
              <View>
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>
                  {isEventForm ? 'Schedule' : 'Recurring'}
                </Text>
                <RecurrenceDropdown
                  value={form.recurrenceFrequency}
                  onChange={(recurrenceFrequency) => onChange({ recurrenceFrequency })}
                />
              </View>
            )}

            {isMobileModal ? (
              <View>
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Priority</Text>
                <PriorityPills value={form.priority} onChange={(priority) => onChange({ priority })} />
              </View>
            ) : null}

            {isEventForm ? (
              <>
                <View>
                  <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Location (optional)</Text>
                  <TextInput
                    value={form.location}
                    onChangeText={(value) => onChange({ location: value })}
                    placeholder="Office, showroom, or meeting room"
                    placeholderTextColor={colors.input.placeholder}
                    style={{
                      minHeight: 46,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: fieldBorder,
                      backgroundColor: fieldBg,
                      color: colors.input.text,
                      paddingHorizontal: 12,
                      fontSize: 13,
                      fontWeight: '400',
                    }}
                    selectionColor={colors.text.primary}
                  />
                </View>
                <View>
                  <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Meeting link (optional)</Text>
                  <TextInput
                    value={form.meetingLink}
                    onChangeText={(value) => onChange({ meetingLink: value })}
                    placeholder="https://meet.google.com/..."
                    placeholderTextColor={colors.input.placeholder}
                    autoCapitalize="none"
                    style={{
                      minHeight: 46,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: fieldBorder,
                      backgroundColor: fieldBg,
                      color: colors.input.text,
                      paddingHorizontal: 12,
                      fontSize: 13,
                      fontWeight: '400',
                    }}
                    selectionColor={colors.text.primary}
                  />
                </View>
              </>
            ) : null}

            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: fieldBorder, backgroundColor: fieldBg, padding: 12, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>Share to thread</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }}>
                    Post this {itemTypeLabel(form.itemType).toLowerCase()} to an existing team thread after saving.
                  </Text>
                </View>
                <Pressable
                  onPress={() => onChange({ shareToThread: !form.shareToThread })}
                  style={{
                    minWidth: 58,
                    height: 32,
                    borderRadius: 999,
                    backgroundColor: form.shareToThread
                      ? colors.text.primary
                      : (themeMode === 'dark' ? 'rgba(148,163,184,0.24)' : '#D7DCE3'),
                    borderWidth: 1,
                    borderColor: form.shareToThread ? colors.text.primary : colors.border.light,
                    paddingHorizontal: 4,
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: form.shareToThread
                        ? colors.bg.primary
                        : (themeMode === 'dark' ? '#F8FAFC' : '#111827'),
                      borderWidth: themeMode === 'dark' && !form.shareToThread ? 1 : 0,
                      borderColor: themeMode === 'dark' ? 'rgba(15,23,42,0.14)' : 'transparent',
                      alignSelf: form.shareToThread ? 'flex-end' : 'flex-start',
                    }}
                  />
                </Pressable>
              </View>

              {form.shareToThread ? (
                shareThreadOptions.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {shareThreadOptions.map((threadOption) => {
                      const active = form.shareThreadEntityId === threadOption.entityId;
                      return (
                        <Pressable
                          key={threadOption.entityId}
                          onPress={() => onChange({ shareThreadEntityId: threadOption.entityId })}
                          style={{
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: active ? colors.text.primary : fieldBorder,
                            backgroundColor: active ? colors.text.primary : colors.bg.secondary,
                            paddingHorizontal: 12,
                            height: 34,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: active ? colors.bg.primary : colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
                            {threadOption.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                    No team threads found yet. Create a team thread first, then come back and share this item there.
                  </Text>
                )
              ) : null}
            </View>

            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Details (optional)</Text>
              <TextInput
                value={form.description}
                onChangeText={(value) => onChange({ description: value })}
                multiline
                placeholder={isEventForm ? 'Add notes or agenda' : 'Add any instructions for the assignee'}
                placeholderTextColor={colors.input.placeholder}
                style={{
                  minHeight: 92,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: fieldBorder,
                  backgroundColor: fieldBg,
                  color: colors.input.text,
                  paddingHorizontal: 12,
                  paddingTop: 10,
                  textAlignVertical: 'top',
                  fontWeight: '400',
                }}
                selectionColor={colors.text.primary}
              />
            </View>
          </ScrollView>

          <View
            style={{
              paddingHorizontal: TASK_MODAL_FOOTER_HORIZONTAL_PADDING,
              paddingBottom: TASK_MODAL_FOOTER_BOTTOM_PADDING,
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: TASK_MODAL_FOOTER_GAP,
            }}
          >
            <Pressable onPress={onClose} style={{ paddingHorizontal: 16, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary }}>
              <Text style={{ color: colors.text.secondary, fontWeight: '500' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onSubmit}
              disabled={isSubmitting || form.title.trim().length === 0 || form.assigneeUserIds.length === 0}
              style={{
                paddingHorizontal: 18,
                height: 42,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isSubmitting || form.title.trim().length === 0 || form.assigneeUserIds.length === 0
                  ? colors.border.medium
                  : colors.text.primary,
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.bg.primary} />
              ) : (
                <Text style={{ color: colors.bg.primary, fontWeight: '500' }}>Create {itemTypeLabel(form.itemType)}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TaskActivityFeed({ businessId, taskId, task, teamMembers, compact = false, scrollable = true }: TaskActivityFeedProps) {
  const colors = useThemeColors();
  const themeMode = useResolvedThemeMode();
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.currentUser?.id ?? null);
  const teamMap = useMemo(() => new Map(teamMembers.map((member) => [member.id, member])), [teamMembers]);
  const mentionAliasMap = useMemo(() => buildMentionAliasMap(teamMembers), [teamMembers]);
  const [messageText, setMessageText] = useState('');
  const [replyTarget, setReplyTarget] = useState<CollaborationComment | null>(null);
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');
  const lastTapTimeRef = useRef<Record<string, number>>({});
  const uiLabelTextStyle = { fontSize: 12, fontWeight: '600' as const };
  const metaTextStyle = { fontSize: 12, fontWeight: '500' as const };
  const bodyTextStyle = { fontSize: 14, fontWeight: '500' as const, lineHeight: 20 };
  const activeMentionQuery = useMemo(() => {
    const match = messageText.match(/(^|\s)@([A-Za-z0-9_.-]*)$/);
    return match ? match[2].toLowerCase() : null;
  }, [messageText]);
  const filteredMentionMembers = useMemo(() => {
    if (activeMentionQuery === null) return [];
    return teamMembers
      .filter((member) => {
        const handle = mentionHandleFromMember(member);
        return (
          member.name.toLowerCase().includes(activeMentionQuery)
          || member.email.toLowerCase().includes(activeMentionQuery)
          || member.id.toLowerCase().includes(activeMentionQuery)
          || handle.includes(activeMentionQuery)
        );
      })
      .slice(0, 5);
  }, [activeMentionQuery, teamMembers]);

  const threadQuery = useQuery({
    queryKey: ['task-thread', businessId, taskId],
    enabled: Boolean(businessId) && Boolean(taskId),
    queryFn: () => collaborationData.getOrCreateThread(businessId, 'task', taskId),
    retry: 0,
  });

  const threadId = threadQuery.data?.id ?? null;

  const commentsQuery = useQuery({
    queryKey: ['task-thread-comments', businessId, threadId],
    enabled: Boolean(businessId) && Boolean(threadId),
    queryFn: () => collaborationData.listThreadComments(businessId, threadId as string),
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 15_000,
  });

  const commentIds = useMemo(
    () => (commentsQuery.data ?? []).map((comment) => comment.id),
    [commentsQuery.data]
  );

  const reactionsQuery = useQuery({
    queryKey: ['task-thread-comment-reactions', businessId, threadId, commentIds],
    enabled: Boolean(businessId) && Boolean(threadId) && commentIds.length > 0,
    queryFn: () => collaborationData.listCommentReactions(businessId, commentIds),
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!businessId || !threadId) return;

    const channel: RealtimeChannel = supabase
      .channel(`task-activity-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'collaboration_comments',
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['task-thread-comments', businessId, threadId] });
          void queryClient.invalidateQueries({ queryKey: ['collaboration-thread-counts', businessId, 'task'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'collaboration_comment_reactions',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['task-thread-comment-reactions', businessId, threadId] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, queryClient, threadId]);

  const markSeenMutation = useMutation({
    mutationFn: async () => {
      if (!threadId) return;
      await collaborationData.markThreadAsSeen(businessId, threadId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['collaboration-thread-counts', businessId, 'task'] });
      await queryClient.invalidateQueries({ queryKey: ['collaboration-notifications-unread', businessId] });
    },
  });
  const markThreadSeen = markSeenMutation.mutate;

  useEffect(() => {
    if (!threadId) return;
    markThreadSeen();
  }, [markThreadSeen, threadId]);

  const createCommentMutation = useMutation({
    mutationFn: async ({ body, parentCommentId }: { body: string; parentCommentId?: string | null }) => {
      if (!threadId) return;
      const mentionIds = Array.from(new Set(
        (body.match(/@([A-Za-z0-9_.-]+)/g) ?? [])
          .map((token) => normalizeMentionToken(token))
          .map((token) => mentionAliasMap.get(token))
          .filter((id): id is string => Boolean(id))
      ));

      await collaborationData.createComment({
        businessId,
        threadId,
        body,
        parentCommentId: parentCommentId ?? null,
        mentionUserIds: mentionIds,
      });
    },
    onSuccess: async () => {
      setMessageText('');
      setReplyTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['task-thread-comments', businessId, threadId] });
      await queryClient.invalidateQueries({ queryKey: ['collaboration-thread-counts', businessId, 'task'] });
      await queryClient.invalidateQueries({ queryKey: ['collaboration-notifications-unread', businessId] });
      markSeenMutation.mutate();
    },
  });

  const reactionState = useMemo(() => {
    const counts: Record<string, number> = {};
    const mine: Record<string, boolean> = {};
    (reactionsQuery.data ?? []).forEach((row) => {
      if (row.reaction !== 'thumbs_up') return;
      counts[row.comment_id] = (counts[row.comment_id] ?? 0) + 1;
      if (row.user_id === currentUserId) {
        mine[row.comment_id] = true;
      }
    });
    return { counts, mine };
  }, [currentUserId, reactionsQuery.data]);

  const reactionMutation = useMutation({
    mutationFn: async ({ commentId, liked }: { commentId: string; liked: boolean }) => {
      if (liked) {
        await collaborationData.removeCommentReaction(businessId, commentId);
      } else {
        await collaborationData.addCommentReaction(businessId, commentId);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['task-thread-comment-reactions', businessId, threadId] });
    },
  });

  const handleCommentTap = (commentId: string, liked: boolean) => {
    const now = Date.now();
    const lastTap = lastTapTimeRef.current[commentId] ?? 0;
    if (now - lastTap < 300) {
      lastTapTimeRef.current[commentId] = 0;
      reactionMutation.mutate({ commentId, liked });
    } else {
      lastTapTimeRef.current[commentId] = now;
    }
  };

  const comments = commentsQuery.data ?? [];
  const activityEntries = useMemo(() => {
    const entries: Array<{ id: string; label: string; at: string; tone?: 'neutral' | 'success' }> = [];
    const createdByName = teamMap.get(task.created_by)?.name?.trim();
    const updatedByName = task.last_updated_by ? teamMap.get(task.last_updated_by)?.name?.trim() : '';
    const completedByUserId = task.completed_by ?? task.last_updated_by ?? null;
    const completedByName = completedByUserId ? teamMap.get(completedByUserId)?.name?.trim() : '';

    entries.push({
      id: `created-${task.id}`,
      label: createdByName ? `${createdByName} created this task` : 'Task created',
      at: task.created_at,
      tone: 'neutral',
    });

    const shouldShowUpdatedEntry = Boolean(
      task.updated_at
      && task.updated_at !== task.created_at
      && (!task.completed_at || task.updated_at !== task.completed_at)
    );
    if (shouldShowUpdatedEntry) {
      entries.push({
        id: `updated-${task.id}`,
        label: updatedByName ? `${updatedByName} updated this task` : 'Task updated',
        at: task.updated_at,
        tone: 'neutral',
      });
    }
    if (task.completed_at) {
      entries.push({
        id: `completed-${task.id}`,
        label: completedByName ? `${completedByName} marked this task complete` : 'Task marked complete',
        at: task.completed_at,
        tone: 'success',
      });
    }
    comments.forEach((comment) => {
      const member = teamMap.get(comment.author_user_id);
      entries.push({
        id: `comment-${comment.id}`,
        label: `${member?.name?.split(' ')[0] ?? 'Team member'} commented`,
        at: comment.created_at,
        tone: 'neutral',
      });
    });

    return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [
    comments,
    task.completed_at,
    task.completed_by,
    task.created_at,
    task.created_by,
    task.id,
    task.last_updated_by,
    task.updated_at,
    teamMap,
  ]);

  const activitySurface = themeMode === 'light' ? '#FFFFFF' : colors.bg.secondary;
  const composerBorderColor = themeMode === 'light' ? '#D1D5DB' : colors.input.border;
  const sectionHorizontalPadding = compact ? 18 : 0;
  const contentColumnHorizontalPadding = compact ? 0 : 14;
  const hasMessage = messageText.trim().length > 0;
  const hasComments = comments.length > 0;
  const activeSendButtonBg = themeMode === 'dark' ? '#FFFFFF' : '#111827';
  const activeSendIconColor = themeMode === 'dark' ? '#111827' : '#FFFFFF';
  const disabledSendIconColor = themeMode === 'dark' ? '#0F172A' : '#FFFFFF';
  const sendIconColor = hasMessage ? activeSendIconColor : disabledSendIconColor;
  const sendSpinnerColor = sendIconColor;
  const mentionBg = themeMode === 'light' ? 'rgba(37, 99, 235, 0.10)' : 'rgba(37, 99, 235, 0.18)';
  const mentionText = themeMode === 'light' ? '#1D4ED8' : '#93C5FD';
  const shouldScrollFeed = scrollable || activeTab === 'activity' || (activeTab === 'comments' && hasComments);
  const feedContentStyle = {
    paddingHorizontal: sectionHorizontalPadding,
    paddingTop: 22,
    paddingBottom: activeTab === 'comments' && !hasComments ? 0 : 16,
    gap: 14,
  };

  return (
    <View
      style={shouldScrollFeed ? {
        flex: 1,
        flexShrink: 1,
        minHeight: compact ? 0 : 180,
        borderTopWidth: 0.5,
        borderTopColor: colors.border.light,
        backgroundColor: activitySurface,
      } : {
        borderTopWidth: 0.5,
        borderTopColor: colors.border.light,
        backgroundColor: activitySurface,
      }}
    >
      <View style={{ paddingHorizontal: sectionHorizontalPadding, paddingTop: 12, backgroundColor: activitySurface }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border.light, paddingHorizontal: contentColumnHorizontalPadding }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 18 }}>
            <Pressable
              onPress={() => setActiveTab('comments')}
              style={{ paddingBottom: 10, marginBottom: -1, borderBottomWidth: activeTab === 'comments' ? 3 : 0, borderBottomColor: colors.text.secondary }}
            >
              <Text style={{ color: activeTab === 'comments' ? colors.text.primary : colors.text.tertiary, fontSize: 12, fontWeight: activeTab === 'comments' ? '600' : '500' }}>
                Comments
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('activity')}
              style={{ paddingBottom: 10, marginBottom: -1, borderBottomWidth: activeTab === 'activity' ? 3 : 0, borderBottomColor: colors.text.secondary }}
            >
              <Text style={{ color: activeTab === 'activity' ? colors.text.primary : colors.text.tertiary, fontSize: 12, fontWeight: activeTab === 'activity' ? '600' : '500' }}>
                All activity
              </Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 10 }}>
            <ArrowUpDown size={14} color={colors.text.tertiary} strokeWidth={2.2} />
            <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600' }}>
              Oldest
            </Text>
          </View>
        </View>
      </View>

      {shouldScrollFeed ? (
        <ScrollView
          scrollEnabled
          style={{ flex: 1, backgroundColor: activitySurface }}
          contentContainerStyle={{ ...feedContentStyle, flexGrow: 1 }}
        >
          {activeTab === 'comments' && (threadQuery.isPending || commentsQuery.isPending) ? (
            <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600', textAlign: 'center', paddingVertical: 24, paddingHorizontal: contentColumnHorizontalPadding }}>
              Loading activity...
            </Text>
          ) : null}
          {activeTab === 'comments' && (threadQuery.isError || commentsQuery.isError) ? (
            <Text style={{ color: '#B91C1C', fontSize: 12, fontWeight: '600', textAlign: 'center', paddingVertical: 12, paddingHorizontal: contentColumnHorizontalPadding }}>
              Could not load activity right now.
            </Text>
          ) : null}
          {activeTab === 'comments' && comments.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 44, paddingHorizontal: contentColumnHorizontalPadding }}>
              <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '600' }}>No updates yet</Text>
              <Text style={{ color: colors.text.tertiary, marginTop: 4, ...metaTextStyle }}>
                Add an update, ask for status, or mention someone.
              </Text>
            </View>
          ) : null}
          {activeTab === 'comments' ? (
            comments.map((comment, index) => {
              const author = teamMap.get(comment.author_user_id);
              const replyTo = comment.parent_comment_id
                ? comments.find((item) => item.id === comment.parent_comment_id)
                : null;
              const isOwn = comment.author_user_id === currentUserId;
              const showDivider = index < comments.length - 1;
              const commentSegments = getCommentTextSegments(comment.body, mentionAliasMap);
              const likeCount = reactionState.counts[comment.id] ?? 0;
              const liked = Boolean(reactionState.mine[comment.id]);

              return (
                <View
                  key={comment.id}
                  style={{
                    paddingHorizontal: contentColumnHorizontalPadding,
                    paddingBottom: showDivider ? 14 : 0,
                    marginBottom: showDivider ? 2 : 0,
                    borderBottomWidth: showDivider ? 1 : 0,
                    borderBottomColor: colors.border.light,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ paddingTop: 2 }}>
                      <UserAvatar member={author} size={26} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>
                          {author?.name ?? 'Member'}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, ...metaTextStyle }}>
                          {isOwn ? 'You' : null}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, ...metaTextStyle }}>
                          {formatMessageTime(comment.created_at)}
                        </Text>
                      </View>

                      {replyTo ? (
                        <Text style={{ color: colors.text.tertiary, ...metaTextStyle }} numberOfLines={1}>
                          Replying to {teamMap.get(replyTo.author_user_id)?.name ?? 'member'}: {replyTo.body}
                        </Text>
                      ) : null}

                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                        <Pressable
                          onPress={() => handleCommentTap(comment.id, liked)}
                          style={{ flex: 1 }}
                        >
                          <Text style={{ color: colors.text.secondary, ...bodyTextStyle }}>
                            {commentSegments.map((segment, segmentIndex) => (
                              <Text
                                key={`${comment.id}-segment-${segmentIndex}`}
                                style={segment.isMention ? {
                                  color: mentionText,
                                  backgroundColor: mentionBg,
                                  fontWeight: '600',
                                } : undefined}
                              >
                                {segment.text}
                              </Text>
                            ))}
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => reactionMutation.mutate({ commentId: comment.id, liked })}
                          style={{
                            minWidth: 34,
                            alignItems: 'center',
                            paddingTop: 2,
                          }}
                        >
                          <View
                            style={{
                              minWidth: 30,
                              height: 30,
                              borderRadius: 15,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: liked || likeCount > 0 ? 'rgba(245, 158, 11, 0.16)' : colors.bg.secondary,
                              borderWidth: 1,
                              borderColor: liked || likeCount > 0 ? 'rgba(245, 158, 11, 0.32)' : colors.border.light,
                            }}
                          >
                            <Text style={{ fontSize: 14, opacity: liked || likeCount > 0 ? 1 : 0.7 }}>👍</Text>
                          </View>
                          {likeCount > 0 ? (
                            <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '700', marginTop: 4 }}>
                              {likeCount}
                            </Text>
                          ) : null}
                        </Pressable>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                        <Pressable onPress={() => setReplyTarget(comment)}>
                          <Text style={{ color: colors.text.tertiary, ...uiLabelTextStyle }}>Reply</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          ) : null}

          {activeTab === 'activity' ? (
            activityEntries.length > 0 ? (
              activityEntries.map((entry) => {
                const isSuccess = entry.tone === 'success';
                return (
                  <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border.light, paddingBottom: 10, paddingHorizontal: contentColumnHorizontalPadding }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isSuccess ? '#10B981' : colors.text.muted }} />
                      <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>
                        {entry.label}
                      </Text>
                    </View>
                    <Text style={{ color: colors.text.muted, ...metaTextStyle }}>
                      {formatMessageTime(entry.at)}
                    </Text>
                  </View>
                );
              })
            ) : (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 44, paddingHorizontal: contentColumnHorizontalPadding }}>
                <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '600' }}>No activity yet</Text>
              </View>
            )
          ) : null}
        </ScrollView>
      ) : (
        <View style={feedContentStyle}>
          {activeTab === 'comments' && (threadQuery.isPending || commentsQuery.isPending) ? (
            <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600', textAlign: 'center', paddingVertical: 24, paddingHorizontal: contentColumnHorizontalPadding }}>
              Loading activity...
            </Text>
          ) : null}
          {activeTab === 'comments' && (threadQuery.isError || commentsQuery.isError) ? (
            <Text style={{ color: '#B91C1C', fontSize: 12, fontWeight: '600', textAlign: 'center', paddingVertical: 12, paddingHorizontal: contentColumnHorizontalPadding }}>
              Could not load activity right now.
            </Text>
          ) : null}
          {activeTab === 'comments' && comments.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 44, paddingHorizontal: contentColumnHorizontalPadding }}>
              <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '600' }}>No updates yet</Text>
              <Text style={{ color: colors.text.tertiary, marginTop: 4, ...metaTextStyle }}>
                Add an update, ask for status, or mention someone.
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {activeTab === 'comments' ? (
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border.light, paddingHorizontal: sectionHorizontalPadding, paddingTop: 8, paddingBottom: 8, backgroundColor: activitySurface }}>
        <View style={{ paddingHorizontal: contentColumnHorizontalPadding }}>
          {activeMentionQuery !== null ? (
            <View
              style={{
                marginBottom: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.secondary,
                overflow: 'hidden',
              }}
            >
              {filteredMentionMembers.length === 0 ? (
                <View style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
                  <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '500' }}>
                    No team member match.
                  </Text>
                </View>
              ) : (
                filteredMentionMembers.map((member) => {
                  const handle = mentionHandleFromMember(member);
                  return (
                    <Pressable
                      key={`task-mention-match-${member.id}`}
                      onPress={() => {
                        setMessageText((current) =>
                          current.replace(/(^|\s)@([A-Za-z0-9_.-]*)$/, (_full, prefix) => `${prefix}@${handle} `)
                        );
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <UserAvatar member={member} size={20} />
                      <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                        @{handle}
                      </Text>
                      <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                        {member.name}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          ) : null}
          {replyTarget ? (
            <View style={{ marginBottom: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.bg.secondary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.text.secondary, flex: 1, ...uiLabelTextStyle }} numberOfLines={1}>
                Replying to {teamMap.get(replyTarget.author_user_id)?.name ?? 'member'}
              </Text>
              <Pressable onPress={() => setReplyTarget(null)}>
                <X size={13} color={colors.text.tertiary} strokeWidth={2.3} />
              </Pressable>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Type an update or reply..."
              placeholderTextColor={colors.input.placeholder}
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 110,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: composerBorderColor,
                backgroundColor: colors.input.bg,
                color: colors.input.text,
                paddingHorizontal: 14,
                paddingVertical: 10,
                fontSize: 14,
                fontWeight: '500',
              }}
              multiline
              selectionColor={colors.text.primary}
            />
            <Pressable
              onPress={() => {
                const trimmed = messageText.trim();
                if (!trimmed || createCommentMutation.isPending) return;
                createCommentMutation.mutate({
                  body: trimmed,
                  parentCommentId: replyTarget?.id ?? null,
                });
              }}
              disabled={!hasMessage || createCommentMutation.isPending}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: hasMessage ? activeSendButtonBg : colors.border.medium,
              }}
            >
              {createCommentMutation.isPending ? (
                <ActivityIndicator color={sendSpinnerColor} size="small" />
              ) : (
                <Send size={15} color={sendIconColor} strokeWidth={2.6} />
              )}
            </Pressable>
          </View>
        </View>
      </View>
      ) : null}
    </View>
  );
}

function TaskCard({
  task,
  selected,
  unreadCount,
  commentCount,
  assignees,
  onSelect,
  onToggleDone,
}: {
  task: Task;
  selected: boolean;
  unreadCount: number;
  commentCount: number;
  assignees: TeamMember[];
  onSelect: () => void;
  onToggleDone: () => void;
}) {
  const colors = useThemeColors();
  const themeMode = useResolvedThemeMode();
  const isCompleted = task.status === 'done';
  const overdue = isTaskOverdue(task);
  const displayTitle = toSentenceCase(task.title);
  const recurrenceText = recurrenceLabel(task.recurrence_frequency as unknown as string | null);
  const recurrenceBaseTone = recurrenceTone(task.recurrence_frequency as unknown as string | null);
  const recurrenceChipTone = isCompleted
    ? { text: colors.text.muted, background: colors.bg.secondary }
    : recurrenceBaseTone;
  const visibleAssignees = assignees.slice(0, 2);
  const additionalAssigneeCount = assignees.length > visibleAssignees.length ? assignees.length - visibleAssignees.length : 0;
  const assigneeLine = assignees.length > 0
    ? visibleAssignees.map((member) => member.name.split(' ')[0] ?? member.name).join(', ')
    : 'Unassigned';
  const dueText = formatTaskScheduleLabel(task);
  const itemTypeText = itemTypeLabel(task.item_type ?? 'task');
  const cardBackgroundColor = isCompleted ? colors.bg.secondary : colors.bg.card;
  const cardBorderColor = isCompleted ? 'rgba(148,163,184,0.18)' : colors.border.light;
  const cardBorderWidth = isCompleted ? 0.6 : 1;
  const completedCheckColor = colors.text.muted;
  const pendingCheckOutlineColor = themeMode === 'light' ? 'rgba(100,116,139,0.42)' : 'rgba(148,163,184,0.52)';
  const assigneeChipBg = isCompleted ? colors.bg.primary : colors.bg.secondary;
  const assigneeChipTextColor = isCompleted ? colors.text.muted : colors.text.secondary;
  const assigneeChipTextStyle = { color: assigneeChipTextColor, fontSize: 11, fontWeight: '500' as const };
  const priorityFlagColor = (() => {
    if (isCompleted) return colors.text.muted;
    if (task.priority === 'urgent' || task.priority === 'high') return '#DC2626';
    if (task.priority === 'medium') return '#D97706';
    return '#2563EB';
  })();
  const selectedBorderColor = selected ? '#BFDBFE' : cardBorderColor;

  return (
    <Pressable
      onPress={onSelect}
      style={{
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 14,
        backgroundColor: cardBackgroundColor,
        borderWidth: cardBorderWidth,
        borderColor: selectedBorderColor,
        shadowColor: selected ? '#1D4ED8' : '#000000',
        shadowOpacity: selected ? 0.08 : 0,
        shadowRadius: selected ? 8 : 0,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={onToggleDone}
          hitSlop={8}
          style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}
        >
          {isCompleted ? (
            <CheckCircle2 size={22} color={completedCheckColor} strokeWidth={2.1} />
          ) : (
            <Circle size={22} color={pendingCheckOutlineColor} strokeWidth={2.1} />
          )}
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: task.status === 'done' ? colors.text.muted : colors.text.primary,
              fontSize: 15,
              fontWeight: '500',
              textDecorationLine: task.status === 'done' ? 'line-through' : 'none',
            }}
            numberOfLines={2}
          >
            {displayTitle}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <View
              style={{
                maxWidth: '72%',
                flexShrink: 1,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 4,
                backgroundColor: assigneeChipBg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 2 }}>
                {visibleAssignees.length > 0 ? (
                  visibleAssignees.map((member, index) => (
                    <View
                      key={`${task.id}-${member.id}`}
                      style={{
                        marginLeft: index === 0 ? 0 : -6,
                        borderWidth: 1,
                        borderColor: assigneeChipBg,
                        borderRadius: 999,
                      }}
                    >
                      <UserAvatar member={member} size={16} />
                    </View>
                  ))
                ) : (
                  <UserAvatar name="Unassigned" size={16} />
                )}
              </View>
              <Text style={{ ...assigneeChipTextStyle, flexShrink: 1 }} numberOfLines={1}>
                {assigneeLine}
              </Text>
              {additionalAssigneeCount > 0 ? (
                <Text style={assigneeChipTextStyle}>
                  +{additionalAssigneeCount}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '500' }}>•</Text>
            <Text style={{ color: isCompleted ? colors.text.muted : (overdue ? '#B91C1C' : colors.text.tertiary), fontSize: 11, fontWeight: '500' }} numberOfLines={1}>
              {dueText}
            </Text>
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 4,
              backgroundColor: task.item_type === 'event' ? 'rgba(37,99,235,0.10)' : recurrenceChipTone.background,
            }}
          >
            <Text style={{ color: task.item_type === 'event' ? '#2563EB' : recurrenceChipTone.text, fontSize: 11, fontWeight: '600' }}>
              {task.item_type === 'event' && recurrenceText !== 'One-off' ? recurrenceText : itemTypeText}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {commentCount > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <MessageSquare size={11} color={colors.text.muted} strokeWidth={2.1} />
                <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600' }}>
                  {commentCount > 99 ? '99+' : commentCount}
                </Text>
              </View>
            ) : null}
            <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
              <Flag size={13} color={priorityFlagColor} strokeWidth={2.3} />
            </View>
          </View>
        </View>
      </View>

      {unreadCount > 0 ? (
        <View style={{ position: 'absolute', right: 8, top: 8, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DC2626', paddingHorizontal: 4 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function TaskTableRow({
  task,
  selected,
  unreadCount,
  commentCount,
  assignees,
  showActivityColumn,
  onSelect,
  onToggleDone,
}: {
  task: Task;
  selected: boolean;
  unreadCount: number;
  commentCount: number;
  assignees: TeamMember[];
  showActivityColumn: boolean;
  onSelect: () => void;
  onToggleDone: () => void;
}) {
  const colors = useThemeColors();
  const themeMode = useResolvedThemeMode();
  const isCompleted = task.status === 'done';
  const priority = PRIORITY_META[task.priority];
  const overdue = isTaskOverdue(task);
  const effectiveDueDate = getEffectiveTaskDueDate(task);
  const dueLabel = task.item_type === 'event'
    ? formatTaskScheduleLabel(task)
    : (effectiveDueDate ? format(effectiveDueDate, 'MMM d, yyyy') : 'No due date');
  const displayTitle = task.title.length > 0
    ? `${task.title.charAt(0).toUpperCase()}${task.title.slice(1)}`
    : task.title;
  const frequencyText = recurrenceLabel(task.recurrence_frequency as unknown as string | null);
  const frequencyTone = recurrenceTone(task.recurrence_frequency as unknown as string | null);

  const rowBackgroundColor = isCompleted
    ? (selected ? 'rgba(148,163,184,0.20)' : colors.bg.secondary)
    : (selected ? 'rgba(59,130,246,0.08)' : colors.bg.card);
  const completedCheckColor = colors.text.primary;
  const pendingCheckOutlineColor = themeMode === 'light' ? 'rgba(100,116,139,0.42)' : 'rgba(148,163,184,0.52)';
  const firstAssignee = assignees[0];
  const additionalAssigneeCount = assignees.length > 1 ? assignees.length - 1 : 0;
  const isCompactTable = !showActivityColumn;
  const nameColumnFlex = isCompactTable ? 5 : 1.9;
  const priorityColumnWidth = isCompactTable ? 82 : 110;
  const assigneeColumnWidth = isCompactTable ? 116 : 170;
  const dueColumnWidth = isCompactTable ? 92 : 126;
  const frequencyColumnWidth = isCompactTable ? 96 : 126;
  const assigneeDisplayName = firstAssignee
    ? (isCompactTable ? (firstAssignee.name.split(' ')[0] ?? firstAssignee.name) : firstAssignee.name)
    : '';

  return (
    <Pressable
      onPress={onSelect}
      style={{
        minHeight: 62,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
        backgroundColor: rowBackgroundColor,
      }}
    >
      <View style={{ flex: nameColumnFlex, minWidth: 0, paddingLeft: 12, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={onToggleDone} hitSlop={6}>
          {task.status === 'done' ? (
            <CheckCircle2 size={18} color={completedCheckColor} strokeWidth={2.3} />
          ) : (
            <Circle size={18} color={pendingCheckOutlineColor} strokeWidth={2.1} />
          )}
        </Pressable>
        <Text
          numberOfLines={1}
          style={{
            color: task.status === 'done' ? colors.text.muted : colors.text.primary,
            fontSize: 12,
            fontWeight: '400',
            textDecorationLine: task.status === 'done' ? 'line-through' : 'none',
            flex: 1,
          }}
        >
          {displayTitle}
        </Text>
        {isCompactTable && unreadCount > 0 ? (
          <View style={{ minWidth: 18, height: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DC2626', paddingHorizontal: 4, flexShrink: 0 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        ) : isCompactTable && commentCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <MessageSquare size={11} color={colors.text.muted} strokeWidth={2} />
            <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '400' }}>{commentCount}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ width: priorityColumnWidth, paddingRight: 8 }}>
        <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: priority.soft, alignSelf: 'flex-start' }}>
          <Text style={{ color: priority.color, fontSize: 11, fontWeight: '500' }}>{priority.label}</Text>
        </View>
      </View>

      <View style={{ width: assigneeColumnWidth, paddingRight: 8 }}>
        {firstAssignee ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <UserAvatar member={firstAssignee} size={18} />
            <Text style={{ color: colors.text.secondary, fontSize: isCompactTable ? 13 : 14, fontWeight: '400', flexShrink: 1 }} numberOfLines={1}>
              {assigneeDisplayName}
            </Text>
            {additionalAssigneeCount > 0 ? (
              <Text style={{ color: colors.text.tertiary, fontSize: isCompactTable ? 11 : 12, fontWeight: '500' }}>
                +{additionalAssigneeCount}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '400' }} numberOfLines={1}>
            Unassigned
          </Text>
        )}
      </View>

      <View style={{ width: dueColumnWidth, paddingRight: 8 }}>
        <Text style={{ color: overdue ? '#B91C1C' : colors.text.secondary, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>
          {dueLabel}
        </Text>
      </View>

      <View style={{ width: frequencyColumnWidth, paddingRight: 8 }}>
        {task.item_type === 'event' ? (
          <View style={{ borderRadius: 999, backgroundColor: 'rgba(37,99,235,0.10)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: '#2563EB', fontSize: 11, fontWeight: '500' }}>
              {frequencyText === 'One-off' ? 'Event' : frequencyText}
            </Text>
          </View>
        ) : (
          <View style={{ borderRadius: 999, backgroundColor: frequencyTone.background, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: frequencyTone.text, fontSize: 11, fontWeight: '500' }}>
              {frequencyText}
            </Text>
          </View>
        )}
      </View>

      {showActivityColumn ? (
        <View style={{ width: 104, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 6, paddingRight: 10 }}>
          <MessageSquare size={12} color={colors.text.muted} strokeWidth={2} />
          <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '400' }}>
            {commentCount}
          </Text>
          {unreadCount > 0 ? (
            <View style={{ minWidth: 18, height: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DC2626', paddingHorizontal: 4 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function TaskCalendarView({
  tasks,
  selectedDate,
  displayedMonth,
  selectedTaskId,
  teamMap,
  unreadCounts,
  commentCounts,
  isDesktopLayout,
  onSelectDate,
  onChangeMonth,
  onJumpToToday,
  onOpenTask,
  onToggleDone,
}: TaskCalendarViewProps) {
  const colors = useThemeColors();
  const monthStart = startOfMonth(displayedMonth);
  const monthEnd = endOfMonth(displayedMonth);
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
  });

  const tasksByDateKey = useMemo(() => {
    const nextMap = new Map<string, Task[]>();
    tasks.forEach((task) => {
      const anchorDate = getTaskCalendarAnchorDate(task);
      if (!anchorDate) return;
      const key = format(anchorDate, 'yyyy-MM-dd');
      nextMap.set(key, [...(nextMap.get(key) ?? []), task]);
    });
    nextMap.forEach((value, key) => {
      nextMap.set(key, [...value].sort(compareCalendarTasks));
    });
    return nextMap;
  }, [tasks]);

  const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');
  const selectedDateTasks = tasksByDateKey.get(selectedDateKey) ?? [];

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border.light,
        backgroundColor: colors.bg.card,
        overflow: 'hidden',
        flexDirection: isDesktopLayout ? 'row' : 'column',
      }}
    >
      <View
        style={{
          flex: isDesktopLayout ? 1.1 : undefined,
          borderRightWidth: isDesktopLayout ? 1 : 0,
          borderBottomWidth: isDesktopLayout ? 0 : 1,
          borderColor: colors.border.light,
          padding: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <View>
            <Text style={{ color: colors.text.primary, fontSize: isDesktopLayout ? 18 : 16, fontWeight: '700' }}>
              {format(displayedMonth, 'MMMM yyyy')}
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 2 }}>
              {tasks.length} scheduled item{tasks.length === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={() => onChangeMonth(-1)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                borderWidth: 1,
                borderColor: colors.border.light,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.bg.secondary,
              }}
            >
              <ChevronLeft size={16} color={colors.text.secondary} strokeWidth={2.4} />
            </Pressable>
            <Pressable
              onPress={onJumpToToday}
              style={{
                height: 34,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border.light,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.bg.secondary,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>Today</Text>
            </Pressable>
            <Pressable
              onPress={() => onChangeMonth(1)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                borderWidth: 1,
                borderColor: colors.border.light,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.bg.secondary,
              }}
            >
              <ChevronRight size={16} color={colors.text.secondary} strokeWidth={2.4} />
            </Pressable>
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          {CALENDAR_WEEKDAY_LABELS.map((label) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '600' }}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          {Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, rowIndex) => {
            const rowDays = calendarDays.slice(rowIndex * 7, rowIndex * 7 + 7);
            return (
              <View key={`calendar-row-${rowIndex}`} style={{ flexDirection: 'row', gap: 8 }}>
                {rowDays.map((day) => {
                  const dayKey = format(day, 'yyyy-MM-dd');
                  const dayTasks = tasksByDateKey.get(dayKey) ?? [];
                  const totalCount = dayTasks.length;
                  const dayIndicators = getCalendarDayIndicators(dayTasks);
                  const isSelected = isSameDay(day, selectedDate);
                  const isCurrentMonth = isSameMonth(day, displayedMonth);
                  const isTodayDate = isToday(day);

                  return (
                    <Pressable
                      key={dayKey}
                      onPress={() => onSelectDate(day)}
                      style={{
                        flex: 1,
                        minHeight: isDesktopLayout ? 82 : 64,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.text.primary : colors.border.light,
                        backgroundColor: isSelected ? colors.bg.secondary : colors.bg.card,
                        paddingHorizontal: 8,
                        paddingTop: 8,
                        paddingBottom: 7,
                        opacity: isCurrentMonth ? 1 : 0.42,
                        justifyContent: 'space-between',
                        overflow: 'visible',
                      }}
                    >
                      {totalCount > 0 ? (
                        <View style={{
                          position: 'absolute',
                          top: -7,
                          right: -7,
                          minWidth: isDesktopLayout ? 18 : 16,
                          height: isDesktopLayout ? 18 : 16,
                          borderRadius: 999,
                          backgroundColor: isSelected ? colors.text.primary : colors.text.secondary,
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingHorizontal: 3,
                          zIndex: 10,
                        }}>
                          <Text style={{ color: isSelected ? colors.bg.primary : colors.bg.card, fontSize: isDesktopLayout ? 10 : 9, fontWeight: '700' }}>
                            {totalCount > 9 ? '9+' : totalCount}
                          </Text>
                        </View>
                      ) : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text
                          style={{
                            color: isSelected ? colors.text.primary : (isTodayDate ? '#2563EB' : colors.text.secondary),
                            fontSize: 13,
                            fontWeight: isSelected || isTodayDate ? '700' : '500',
                          }}
                        >
                          {format(day, 'd')}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 10, flexWrap: 'wrap' }}>
                        {dayIndicators.map((indicatorColor, indicatorIndex) => (
                          <View
                            key={`${dayKey}-indicator-${indicatorIndex}`}
                            style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: indicatorColor }}
                          />
                        ))}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </View>
      </View>

      <View style={{ flex: 1, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, fontSize: isDesktopLayout ? 18 : 16, fontWeight: '700' }}>
              {format(selectedDate, 'EEEE, MMMM d')}
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 2 }}>
              {selectedDateTasks.length === 0
                ? 'No items scheduled'
                : `${selectedDateTasks.length} item${selectedDateTasks.length === 1 ? '' : 's'} scheduled`}
            </Text>
          </View>
        </View>

        {selectedDateTasks.length === 0 ? (
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 16, paddingVertical: 18 }}>
            <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '500' }}>
              Nothing is scheduled for this day yet.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {selectedDateTasks.map((task) => {
              const assignees = (task.assignee_user_ids ?? []).map((id) => teamMap.get(id)).filter(Boolean) as TeamMember[];
              const firstAssignee = assignees[0]?.name ?? (task.item_type === 'event' ? 'No attendees' : 'Unassigned');
              const additionalAssigneeCount = assignees.length > 1 ? assignees.length - 1 : 0;
              const isSelectedTask = task.id === selectedTaskId;
              const isCompletedTask = task.status === 'done';
              const isOverdueTask = task.status !== 'done' && isTaskOverdue(task);
              const statusChip = getCalendarStatusChip(task);
              const visibleAssignees = assignees.slice(0, 2);
              const agendaTimeLabel = isOverdueTask ? null : formatCalendarAgendaTime(task);

              return (
                <Pressable
                  key={task.id}
                  onPress={() => onOpenTask(task)}
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: isSelectedTask ? '#BFDBFE' : colors.border.light,
                    backgroundColor: isSelectedTask ? colors.bg.secondary : colors.bg.card,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    gap: 10,
                    opacity: isCompletedTask ? 0.72 : 1,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          onToggleDone(task);
                        }}
                        hitSlop={8}
                        style={{ paddingTop: 1 }}
                      >
                        {isCompletedTask ? (
                          <CheckCircle2 size={19} color={colors.text.muted} strokeWidth={2.1} />
                        ) : (
                          <Circle size={19} color={colors.text.muted} strokeWidth={2} />
                        )}
                      </Pressable>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 5 }}>
                          <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: task.item_type === 'event' ? 'rgba(37,99,235,0.10)' : 'rgba(217,119,6,0.12)' }}>
                            <Text style={{ color: task.item_type === 'event' ? '#2563EB' : '#D97706', fontSize: 11, fontWeight: '600' }}>
                              {task.item_type === 'event' ? 'Event' : 'Task'}
                            </Text>
                          </View>
                          {statusChip ? (
                            <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: statusChip.background }}>
                              <Text style={{ color: statusChip.text, fontSize: 11, fontWeight: '600' }}>
                                {statusChip.label}
                              </Text>
                            </View>
                          ) : null}
                          {agendaTimeLabel ? (
                            <Text style={{ color: isOverdueTask ? '#DC2626' : colors.text.tertiary, fontSize: 12, fontWeight: '500' }}>
                              {agendaTimeLabel}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }} numberOfLines={2}>
                          {toSentenceCase(task.title)}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, minWidth: 0 }}>
                          {visibleAssignees.length > 0 ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 2 }}>
                              {visibleAssignees.map((member, index) => (
                                <View
                                  key={`${task.id}-calendar-assignee-${member.id}`}
                                  style={{
                                    marginLeft: index === 0 ? 0 : -6,
                                    borderWidth: 1,
                                    borderColor: colors.bg.card,
                                    borderRadius: 999,
                                  }}
                                >
                                  <UserAvatar member={member} size={18} />
                                </View>
                              ))}
                            </View>
                          ) : (
                            <UserAvatar name={task.item_type === 'event' ? 'Attendees' : 'Unassigned'} size={18} />
                          )}
                          <Text style={{ color: colors.text.tertiary, fontSize: 12, flex: 1 }} numberOfLines={1}>
                            {firstAssignee}{additionalAssigneeCount > 0 ? ` +${additionalAssigneeCount}` : ''}
                          </Text>
                        </View>
                        {task.item_type === 'event' && task.location?.trim() ? (
                          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                            {task.location.trim()}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      {commentCounts[task.id] ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <MessageSquare size={12} color={colors.text.muted} strokeWidth={2} />
                          <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '500' }}>
                            {commentCounts[task.id] > 99 ? '99+' : commentCounts[task.id]}
                          </Text>
                        </View>
                      ) : null}
                      {unreadCounts[task.id] ? (
                        <View style={{ minWidth: 20, height: 20, borderRadius: 999, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
                            {unreadCounts[task.id] > 99 ? '99+' : unreadCounts[task.id]}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

function TaskDetailPanel({
  task,
  businessId,
  teamMembers,
  shareThreadOptions,
  currentUserId,
  commentCount = 0,
  onSaved,
  onDeleted,
  onStatusChange,
  onClose,
}: {
  task: Task;
  businessId: string;
  teamMembers: TeamMember[];
  shareThreadOptions: TaskShareThreadOption[];
  currentUserId?: string | null;
  commentCount?: number;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onStatusChange: (next: 'todo' | 'in_progress' | 'done') => Promise<void>;
  onClose?: () => void;
}) {
  const colors = useThemeColors();
  const themeMode = useResolvedThemeMode();
  const { isDesktop } = useBreakpoint();
  const canUseEveryone = useAuthStore((s) => (s.currentUser?.role === 'admin' || s.currentUser?.role === 'manager'));
  const isMobileDetail = !isDesktop;
  const showBackButton = isMobileDetail && Boolean(onClose);
  const showCloseButton = isDesktop && Boolean(onClose);
  const handleToggleDone = async () => {
    await onStatusChange(task.status === 'done' ? 'todo' : 'done');
  };
  const [isEditing, setIsEditing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [showDetailActionMenu, setShowDetailActionMenu] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [form, setForm] = useState<TaskFormState>(toTaskFormState(task, teamMembers, canUseEveryone));
  const formFieldBorder = colors.border.light;
  const formFieldBg = colors.bg.card;

  useEffect(() => {
    setForm(toTaskFormState(task, teamMembers, canUseEveryone));
    setIsEditing(false);
    setShowEditModal(false);
    setShowEditDatePicker(false);
    setShowDetailActionMenu(false);
    setShowShareMenu(false);
  }, [canUseEveryone, task, teamMembers]);

  useEffect(() => {
    if (!showEditModal || !form.shareToThread || shareThreadOptions.length === 0) return;
    if (form.shareThreadEntityId && shareThreadOptions.some((option) => option.entityId === form.shareThreadEntityId)) return;
    setForm((current) => ({ ...current, shareThreadEntityId: shareThreadOptions[0]?.entityId ?? null }));
  }, [form.shareThreadEntityId, form.shareToThread, shareThreadOptions, showEditModal]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const previousAssignees = new Set((task.assignee_user_ids ?? []).map((value) => value.trim()).filter(Boolean));
      const normalizedNextAssignees = expandAssigneeSelection(form.assigneeUserIds, teamMembers);
      const newlyAssignedUserIds = normalizedNextAssignees.filter((userId) => !previousAssignees.has(userId));
      const payload: UpdateTaskInput = {
        itemType: form.itemType,
        title: form.title,
        description: form.description,
        priority: form.priority,
        dueDate: form.dueDate ? format(form.dueDate, 'yyyy-MM-dd') : null,
        startsAt: form.itemType === 'event' ? combineDateAndTime(form.dueDate, form.startTime, form.eventTimezone) : null,
        endsAt: form.itemType === 'event' ? combineDateAndTime(form.dueDate, form.endTime, form.eventTimezone) : null,
        eventTimezone: form.itemType === 'event' ? form.eventTimezone : null,
        location: form.itemType === 'event' ? form.location : null,
        meetingLink: form.itemType === 'event' ? form.meetingLink : null,
        assigneeUserIds: normalizedNextAssignees,
        recurrenceFrequency: form.recurrenceFrequency,
        recurrenceInterval: form.recurrenceInterval,
      };
      await taskData.updateTask(businessId, task.id, payload);
      const updatedTaskForShare: Task = {
        ...task,
        item_type: form.itemType,
        title: form.title,
        description: form.description,
        priority: form.priority,
        due_date: form.dueDate ? format(form.dueDate, 'yyyy-MM-dd') : null,
        starts_at: form.itemType === 'event' ? combineDateAndTime(form.dueDate, form.startTime, form.eventTimezone) : null,
        ends_at: form.itemType === 'event' ? combineDateAndTime(form.dueDate, form.endTime, form.eventTimezone) : null,
        event_timezone: form.itemType === 'event' ? form.eventTimezone : null,
        location: form.itemType === 'event' ? form.location : null,
        meeting_link: form.itemType === 'event' ? form.meetingLink : null,
        assignee_user_ids: normalizedNextAssignees,
        recurrence_frequency: form.recurrenceFrequency,
        recurrence_interval: form.recurrenceInterval,
      };
      const assigneeNames = isEveryoneAssignment(normalizedNextAssignees, teamMembers)
        ? ['Everybody']
        : normalizedNextAssignees
          .map((userId) => teamMembers.find((member) => member.id === userId)?.name)
          .filter((value): value is string => Boolean(value?.trim()));
      return {
        newlyAssignedUserIds,
        updatedTitle: form.title.trim(),
        updatedDueDate: form.dueDate ? format(form.dueDate, 'yyyy-MM-dd') : null,
        updatedTaskForShare,
        shareToThread: form.shareToThread && shareThreadOptions.length > 0,
        shareThreadEntityId: form.shareThreadEntityId ?? shareThreadOptions[0]?.entityId ?? null,
        assigneeNames,
      };
    },
    onSuccess: async (result) => {
      if (result.newlyAssignedUserIds.length > 0) {
        void sendTaskAssignmentNotification({
          businessId,
          recipientUserIds: result.newlyAssignedUserIds,
          senderUserId: currentUserId ?? null,
          assignerName: teamMembers.find((member) => member.id === currentUserId)?.name ?? null,
          taskId: task.id,
          taskTitle: result.updatedTitle || task.title,
          dueDate: result.updatedDueDate,
          isReassignment: true,
        });
      }
      if (result.shareToThread && result.shareThreadEntityId) {
        try {
          const thread = await collaborationData.getOrCreateThread(businessId, 'case', result.shareThreadEntityId);
          await collaborationData.createComment({
            businessId,
            threadId: thread.id,
            body: buildTaskShareMessage(
              result.updatedTaskForShare,
              result.assigneeNames.length > 0 ? result.assigneeNames : ['Unassigned'],
              getTeamThreadDisplayNameFromEntityId(result.shareThreadEntityId),
              'Updated'
            ),
          });
        } catch (shareError) {
          console.warn('Could not share updated task item to thread:', shareError);
        }
      }
      setIsEditing(false);
      setShowEditModal(false);
      await onSaved();
    },
    onError: (error) => {
      console.warn('Task update failed:', error);
      const message = error instanceof Error && error.message
        ? error.message
        : 'Please try again.';
      Alert.alert('Could not save task', message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await taskData.deleteTask(businessId, task.id);
    },
    onSuccess: async () => {
      await onDeleted();
    },
  });

  const assigneeMap = new Map(teamMembers.map((member) => [member.id, member]));
  const taskAssignees = (task.assignee_user_ids ?? [])
    .map((id) => assigneeMap.get(id))
    .filter(Boolean) as TeamMember[];
  const everybodyAssigned = isEveryoneAssignment(task.assignee_user_ids ?? [], teamMembers);
  const taskShareAssigneeNames = everybodyAssigned
    ? ['Everybody']
    : taskAssignees.map((member) => member.name);
  const shareMutation = useMutation({
    mutationFn: async (threadEntityId: string) => {
      const thread = await collaborationData.getOrCreateThread(businessId, 'case', threadEntityId);
      await collaborationData.createComment({
        businessId,
        threadId: thread.id,
        body: buildTaskShareMessage(
          task,
          taskShareAssigneeNames.length > 0 ? taskShareAssigneeNames : ['Unassigned'],
          getTeamThreadDisplayNameFromEntityId(threadEntityId),
          'Shared'
        ),
      });
    },
    onSuccess: () => {
      setShowShareMenu(false);
    },
    onError: (error) => {
      console.warn('Could not share task item to thread:', error);
    },
  });
  const taskPriorityMeta = PRIORITY_META[task.priority];
  const taskStatusTone = (() => {
    if (task.status === 'done') {
      return { text: '#10B981', background: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.20)' };
    }
    if (task.status === 'in_progress') {
      return { text: '#2563EB', background: 'rgba(37,99,235,0.10)', border: 'rgba(37,99,235,0.20)' };
    }
    return { text: '#F59E0B', background: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)' };
  })();
  const taskFrequencyTone = recurrenceTone(task.recurrence_frequency as unknown as string | null);
  const taskFrequencyLabel = recurrenceLabel(task.recurrence_frequency as unknown as string | null);
  const taskItemType = task.item_type === 'event' ? 'event' : 'task';
  const displayTaskTitle = task.title.length > 0
    ? `${task.title.charAt(0).toUpperCase()}${task.title.slice(1)}`
    : task.title;
  const displayTaskDescription = task.description.length > 0
    ? `${task.description.charAt(0).toUpperCase()}${task.description.slice(1)}`
    : task.description;
  const infoSurface = themeMode === 'light' ? '#FFFFFF' : colors.bg.card;
  const detailCardStyle = {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: formFieldBorder,
    backgroundColor: formFieldBg,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  } as const;
  const detailLabelStyle = {
    color: colors.text.muted,
    fontSize: isMobileDetail ? 13 : 11,
    fontWeight: '400' as const,
  };
  const detailValueStyle = {
    color: colors.text.primary,
    fontSize: 13,
    fontWeight: isMobileDetail ? '500' as const : '400' as const,
  };
  const detailValuePrimaryStyle = {
    color: colors.text.primary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: isMobileDetail ? '500' as const : '400' as const,
  };
  const detailHintStyle = {
    color: colors.text.tertiary,
    fontSize: isMobileDetail ? 13 : 11,
    fontWeight: '400' as const,
  };
  const detailChipTextStyle = {
    fontSize: isMobileDetail ? 13 : 11,
    fontWeight: isMobileDetail ? '500' as const : '400' as const,
  };
  const taskTitlePendingOutlineColor = themeMode === 'light' ? 'rgba(100,116,139,0.46)' : 'rgba(148,163,184,0.56)';
  const taskTitleCheckColor = task.status === 'done' ? colors.text.primary : taskTitlePendingOutlineColor;
  const detailHeaderHorizontalPadding = isMobileDetail ? 16 : 0;
  const detailBodyHorizontalPadding = isMobileDetail ? 20 : 0;
  const renderEditForm = (onCancel: () => void, options?: { stretch?: boolean }) => (
    <>
      <ScrollView
        style={options?.stretch ? { flex: 1 } : undefined}
        contentContainerStyle={{ padding: TASK_MODAL_BODY_PADDING, gap: TASK_MODAL_BODY_GAP }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Type</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              { id: 'task' as TaskItemType, label: 'Task' },
              { id: 'event' as TaskItemType, label: 'Event' },
            ]).map((option) => {
              const active = form.itemType === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setForm((current) => ({
                    ...current,
                    itemType: option.id,
                    eventTimezone: option.id === 'event'
                      ? (current.eventTimezone.trim() || getDeviceTimeZone())
                      : current.eventTimezone,
                  }))}
                  style={{
                    flex: 1,
                    minHeight: 40,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? colors.text.primary : formFieldBorder,
                    backgroundColor: active ? colors.text.primary : formFieldBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: active ? colors.bg.primary : colors.text.secondary, fontSize: 13, fontWeight: '600' }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>
            {form.itemType === 'event' ? 'Event title' : 'Task title'}
          </Text>
          <TextInput
            value={form.title}
            onChangeText={(value) => setForm((current) => ({ ...current, title: value }))}
            placeholder={form.itemType === 'event' ? 'What is happening?' : 'What needs to be done?'}
            placeholderTextColor={colors.input.placeholder}
            style={{
              backgroundColor: formFieldBg,
              borderWidth: 1,
              borderColor: formFieldBorder,
              color: colors.input.text,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 14,
              fontWeight: '400',
            }}
            selectionColor={colors.text.primary}
          />
        </View>

        {isMobileDetail ? (
          <View>
            <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>
              {form.itemType === 'event' ? 'Event date' : 'Due date'}
            </Text>
            {Platform.OS === 'web' ? (
              <View
                style={{
                  minHeight: 46,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: formFieldBorder,
                  backgroundColor: formFieldBg,
                  paddingHorizontal: 12,
                  alignItems: 'center',
                  flexDirection: 'row',
                }}
              >
                <Calendar size={15} color={colors.text.tertiary} strokeWidth={2} />
                <input
                  type="date"
                  value={form.dueDate ? format(form.dueDate, 'yyyy-MM-dd') : ''}
                  onChange={(event: any) => {
                    const next = String(event?.target?.value ?? '');
                    if (!next) {
                      setForm((current) => ({ ...current, dueDate: null }));
                      return;
                    }
                    const parsed = parseISO(`${next}T00:00:00`);
                    if (!Number.isNaN(parsed.getTime())) {
                      setForm((current) => ({ ...current, dueDate: parsed }));
                    }
                  }}
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: colors.input.text,
                    marginLeft: 10,
                    fontSize: 13,
                    fontWeight: 400,
                    fontFamily: 'inherit',
                    colorScheme: themeMode === 'dark' ? 'dark' : 'light',
                  }}
                />
              </View>
            ) : (
              <Pressable
                onPress={() => setShowEditDatePicker((current) => !current)}
                style={{
                  minHeight: 46,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: formFieldBorder,
                  backgroundColor: formFieldBg,
                  paddingHorizontal: 12,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ color: colors.input.text, fontSize: 13, fontWeight: '400' }}>
                  {form.dueDate ? format(form.dueDate, 'yyyy-MM-dd') : 'Set date'}
                </Text>
                <Calendar size={15} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            )}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>
                {form.itemType === 'event' ? 'Event date' : 'Due date'}
              </Text>
              {Platform.OS === 'web' ? (
                <View
                  style={{
                    minHeight: 46,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: formFieldBorder,
                    backgroundColor: formFieldBg,
                    paddingHorizontal: 12,
                    alignItems: 'center',
                    flexDirection: 'row',
                  }}
                >
                  <Calendar size={15} color={colors.text.tertiary} strokeWidth={2} />
                  <input
                    type="date"
                    value={form.dueDate ? format(form.dueDate, 'yyyy-MM-dd') : ''}
                    onChange={(event: any) => {
                      const next = String(event?.target?.value ?? '');
                      if (!next) {
                        setForm((current) => ({ ...current, dueDate: null }));
                        return;
                      }
                      const parsed = parseISO(`${next}T00:00:00`);
                      if (!Number.isNaN(parsed.getTime())) {
                        setForm((current) => ({ ...current, dueDate: parsed }));
                      }
                    }}
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: colors.input.text,
                      marginLeft: 10,
                      fontSize: 13,
                      fontWeight: 400,
                      fontFamily: 'inherit',
                      colorScheme: themeMode === 'dark' ? 'dark' : 'light',
                    }}
                  />
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowEditDatePicker((current) => !current)}
                  style={{
                    minHeight: 46,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: formFieldBorder,
                    backgroundColor: formFieldBg,
                    paddingHorizontal: 12,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ color: colors.input.text, fontSize: 13, fontWeight: '400' }}>
                    {form.dueDate ? format(form.dueDate, 'yyyy-MM-dd') : 'Set date'}
                  </Text>
                  <Calendar size={15} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Priority</Text>
              <PriorityDropdown value={form.priority} onChange={(priority) => setForm((current) => ({ ...current, priority }))} />
            </View>
          </View>
        )}

        {form.itemType === 'event' ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Start time</Text>
                {Platform.OS === 'web' ? (
                  <View style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: formFieldBorder, backgroundColor: formFieldBg, paddingHorizontal: 12, alignItems: 'center', flexDirection: 'row' }}>
                    <Clock3 size={15} color={colors.text.tertiary} strokeWidth={2} />
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(event: any) => {
                        const nextStartTime = String(event?.target?.value ?? '');
                        setForm((current) => ({
                          ...current,
                          startTime: nextStartTime,
                          endTime: resolveNextEndTime(nextStartTime, current.startTime, current.endTime),
                        }));
                      }}
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: colors.input.text,
                        marginLeft: 10,
                        fontSize: 13,
                        fontWeight: 400,
                        fontFamily: 'inherit',
                        colorScheme: themeMode === 'dark' ? 'dark' : 'light',
                      }}
                    />
                  </View>
                ) : (
                  <TextInput
                    value={form.startTime}
                    onChangeText={(value) => setForm((current) => ({
                      ...current,
                      startTime: value,
                      endTime: resolveNextEndTime(value, current.startTime, current.endTime),
                    }))}
                    placeholder="09:00"
                    placeholderTextColor={colors.input.placeholder}
                    style={{
                      minHeight: 46,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: formFieldBorder,
                      backgroundColor: formFieldBg,
                      color: colors.input.text,
                      paddingHorizontal: 12,
                      fontSize: 13,
                      fontWeight: '400',
                    }}
                    selectionColor={colors.text.primary}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>End time</Text>
                {Platform.OS === 'web' ? (
                  <View style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: formFieldBorder, backgroundColor: formFieldBg, paddingHorizontal: 12, alignItems: 'center', flexDirection: 'row' }}>
                    <Clock3 size={15} color={colors.text.tertiary} strokeWidth={2} />
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(event: any) => setForm((current) => ({ ...current, endTime: String(event?.target?.value ?? '') }))}
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: colors.input.text,
                        marginLeft: 10,
                        fontSize: 13,
                        fontWeight: 400,
                        fontFamily: 'inherit',
                        colorScheme: themeMode === 'dark' ? 'dark' : 'light',
                      }}
                    />
                  </View>
                ) : (
                  <TextInput
                    value={form.endTime}
                    onChangeText={(value) => setForm((current) => ({ ...current, endTime: value }))}
                    placeholder="10:00"
                    placeholderTextColor={colors.input.placeholder}
                    style={{
                      minHeight: 46,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: formFieldBorder,
                      backgroundColor: formFieldBg,
                      color: colors.input.text,
                      paddingHorizontal: 12,
                      fontSize: 13,
                      fontWeight: '400',
                    }}
                    selectionColor={colors.text.primary}
                  />
                )}
              </View>
            </View>
            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Time zone</Text>
              <EventTimezoneDropdown
                value={form.eventTimezone}
                onChange={(eventTimezone) => setForm((current) => ({ ...current, eventTimezone }))}
              />
            </View>
          </>
        ) : null}

        {showEditDatePicker && Platform.OS !== 'web' ? (
          <DateTimePicker
            value={form.dueDate ?? startOfToday()}
            mode="date"
            minimumDate={startOfToday()}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(event: DateTimePickerEvent, value?: Date) => {
              if (event.type === 'dismissed') return;
              if (value) setForm((current) => ({ ...current, dueDate: value }));
              if (Platform.OS !== 'ios') setShowEditDatePicker(false);
            }}
          />
        ) : null}

        <View>
          <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>
            {form.itemType === 'event' ? 'Attendees' : 'Assignee'}
          </Text>
          <AssigneePicker
            teamMembers={teamMembers}
            selectedUserIds={form.assigneeUserIds}
            currentUserId={currentUserId}
            allowEveryone={canUseEveryone}
            onToggleAssignee={(userId) =>
              setForm((current) => ({
                ...current,
                assigneeUserIds: userId === EVERYONE_ASSIGNEE_ID
                  ? (current.assigneeUserIds.includes(EVERYONE_ASSIGNEE_ID) ? [] : [EVERYONE_ASSIGNEE_ID])
                  : (() => {
                    const withoutEveryone = current.assigneeUserIds.filter((id) => id !== EVERYONE_ASSIGNEE_ID);
                    return withoutEveryone.includes(userId)
                      ? withoutEveryone.filter((id) => id !== userId)
                      : [...withoutEveryone, userId];
                  })(),
              }))
            }
            placeholder={form.itemType === 'event' ? 'Select attendees' : 'Select assignees'}
          />
        </View>

        {isMobileDetail ? (
          <View>
            <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>
              {form.itemType === 'event' ? 'Schedule' : 'Recurring'}
            </Text>
            <RecurrenceDropdown
              value={form.recurrenceFrequency}
              onChange={(recurrenceFrequency) => setForm((current) => ({ ...current, recurrenceFrequency }))}
            />
          </View>
        ) : (
          <View>
            <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>
              {form.itemType === 'event' ? 'Schedule' : 'Recurring'}
            </Text>
            <RecurrenceDropdown
              value={form.recurrenceFrequency}
              onChange={(recurrenceFrequency) => setForm((current) => ({ ...current, recurrenceFrequency }))}
            />
          </View>
        )}

        {isMobileDetail ? (
          <View>
            <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Priority</Text>
            <PriorityPills
              value={form.priority}
              onChange={(priority) => setForm((current) => ({ ...current, priority }))}
            />
          </View>
        ) : null}

        {form.itemType === 'event' ? (
          <>
            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Location (optional)</Text>
              <TextInput
                value={form.location}
                onChangeText={(value) => setForm((current) => ({ ...current, location: value }))}
                placeholder="Office, showroom, or meeting room"
                placeholderTextColor={colors.input.placeholder}
                style={{
                  minHeight: 46,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: formFieldBorder,
                  backgroundColor: formFieldBg,
                  color: colors.input.text,
                  paddingHorizontal: 12,
                  fontSize: 13,
                  fontWeight: '400',
                }}
                selectionColor={colors.text.primary}
              />
            </View>
            <View>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Meeting link (optional)</Text>
              <TextInput
                value={form.meetingLink}
                onChangeText={(value) => setForm((current) => ({ ...current, meetingLink: value }))}
                placeholder="https://meet.google.com/..."
                placeholderTextColor={colors.input.placeholder}
                autoCapitalize="none"
                style={{
                  minHeight: 46,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: formFieldBorder,
                  backgroundColor: formFieldBg,
                  color: colors.input.text,
                  paddingHorizontal: 12,
                  fontSize: 13,
                  fontWeight: '400',
                }}
                selectionColor={colors.text.primary}
              />
            </View>
          </>
        ) : null}

        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: formFieldBorder, backgroundColor: formFieldBg, padding: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>Share to thread</Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }}>
                Post this {itemTypeLabel(form.itemType).toLowerCase()} to an existing team thread after saving.
              </Text>
            </View>
            <Pressable
              onPress={() => setForm((current) => ({ ...current, shareToThread: !current.shareToThread }))}
              style={{
                minWidth: 58,
                height: 32,
                borderRadius: 999,
                backgroundColor: form.shareToThread
                  ? colors.text.primary
                  : (themeMode === 'dark' ? 'rgba(148,163,184,0.24)' : '#D7DCE3'),
                borderWidth: 1,
                borderColor: form.shareToThread ? colors.text.primary : colors.border.light,
                paddingHorizontal: 4,
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: form.shareToThread
                    ? colors.bg.primary
                    : (themeMode === 'dark' ? '#F8FAFC' : '#111827'),
                  borderWidth: themeMode === 'dark' && !form.shareToThread ? 1 : 0,
                  borderColor: themeMode === 'dark' ? 'rgba(15,23,42,0.14)' : 'transparent',
                  alignSelf: form.shareToThread ? 'flex-end' : 'flex-start',
                }}
              />
            </Pressable>
          </View>

          {form.shareToThread ? (
            shareThreadOptions.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {shareThreadOptions.map((threadOption) => {
                  const active = form.shareThreadEntityId === threadOption.entityId;
                  return (
                    <Pressable
                      key={threadOption.entityId}
                      onPress={() => setForm((current) => ({ ...current, shareThreadEntityId: threadOption.entityId }))}
                      style={{
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? colors.text.primary : formFieldBorder,
                        backgroundColor: active ? colors.text.primary : colors.bg.secondary,
                        paddingHorizontal: 12,
                        height: 34,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: active ? colors.bg.primary : colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
                        {threadOption.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                No team threads found yet. Create a team thread first, then come back and share this item there.
              </Text>
            )
          ) : null}
        </View>

        <View>
          <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500', marginBottom: 6 }}>Details (optional)</Text>
          <TextInput
            value={form.description}
            onChangeText={(value) => setForm((current) => ({ ...current, description: value }))}
            multiline
            placeholder={form.itemType === 'event' ? 'Add notes or agenda' : 'Add any instructions for the assignee'}
            placeholderTextColor={colors.input.placeholder}
            style={{
              minHeight: 92,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: formFieldBorder,
              backgroundColor: formFieldBg,
              color: colors.input.text,
              paddingHorizontal: 12,
              paddingTop: 10,
              textAlignVertical: 'top',
              fontWeight: '400',
            }}
            selectionColor={colors.text.primary}
          />
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: TASK_MODAL_FOOTER_HORIZONTAL_PADDING,
          paddingBottom: TASK_MODAL_FOOTER_BOTTOM_PADDING,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: TASK_MODAL_FOOTER_GAP,
        }}
      >
        <Pressable onPress={onCancel} style={{ paddingHorizontal: 16, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary }}>
          <Text style={{ color: colors.text.secondary, fontWeight: '500' }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || form.title.trim().length === 0 || form.assigneeUserIds.length === 0}
          style={{
            paddingHorizontal: 18,
            height: 42,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: saveMutation.isPending || form.title.trim().length === 0 || form.assigneeUserIds.length === 0
              ? colors.border.medium
              : colors.text.primary,
          }}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color={colors.bg.primary} />
          ) : (
            <Text style={{ color: colors.bg.primary, fontWeight: '500' }}>Save Changes</Text>
          )}
        </Pressable>
      </View>
    </>
  );

  const openTaskEditor = () => {
    setShowDetailActionMenu(false);
    if (isMobileDetail || Platform.OS === 'web') {
      setShowEditModal(true);
      return;
    }
    setIsEditing(true);
  };

  const OuterContainer = isMobileDetail ? ScrollView : View;
  const outerContainerProps = isMobileDetail
    ? { style: { flex: 1, backgroundColor: colors.bg.card }, keyboardShouldPersistTaps: 'handled' as const, contentContainerStyle: { flexGrow: 1, paddingBottom: 0 } }
    : { style: { flex: 1, backgroundColor: colors.bg.card, overflow: 'hidden' as const, position: 'relative' as const } };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={isMobileDetail}
    >
    <OuterContainer {...outerContainerProps}>
      <View
        style={{
          paddingHorizontal: isMobileDetail ? 0 : 18,
          paddingTop: 18,
          paddingBottom: 16,
          backgroundColor: colors.bg.primary,
          position: 'relative',
          zIndex: 120,
          elevation: 20,
        }}
      >
        {!isEditing ? (
          <View style={{ gap: 0 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                paddingHorizontal: detailHeaderHorizontalPadding,
                paddingBottom: 12,
                borderBottomWidth: 0.5,
                borderBottomColor: colors.border.light,
              }}
            >
              <View style={{ flex: 1, minWidth: 0, paddingTop: 2, paddingRight: 16 }}>
                {showBackButton ? (
                  <Pressable
                    onPress={() => {
                      setShowDetailActionMenu(false);
                      onClose?.();
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}
                  >
                    <ArrowLeft size={22} color={colors.text.primary} strokeWidth={2} />
                    <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700', lineHeight: 22, flex: 1 }} numberOfLines={1}>
                      Task Details
                    </Text>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <Pressable onPress={handleToggleDone} hitSlop={8}>
                      {task.status === 'done' ? (
                        <CheckCircle2 size={18} color={taskTitleCheckColor} strokeWidth={2.2} />
                      ) : (
                        <Circle size={18} color={taskTitleCheckColor} strokeWidth={2.1} />
                      )}
                    </Pressable>
                    <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '500', lineHeight: 22, flex: 1 }} numberOfLines={1}>
                      {displayTaskTitle}
                    </Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, position: 'relative', zIndex: 130 }}>
                {!isMobileDetail && commentCount > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bg.secondary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <MessageSquare size={12} color={colors.text.muted} strokeWidth={2} />
                    <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '600' }}>{commentCount}</Text>
                  </View>
                ) : null}
                {isMobileDetail ? (
                  <Pressable
                    onPress={openTaskEditor}
                    style={{
                      height: 38,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      backgroundColor: colors.bg.card,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Pencil size={14} color={colors.text.secondary} strokeWidth={2.1} />
                    <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>Edit</Text>
                  </Pressable>
                ) : null}
                <View style={{ position: 'relative', zIndex: 140 }}>
                  <Pressable
                    onPress={() => {
                      setShowDetailActionMenu(false);
                      setShowShareMenu((current) => !current);
                    }}
                    disabled={shareThreadOptions.length === 0 || shareMutation.isPending}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      backgroundColor: colors.bg.card,
                      opacity: shareThreadOptions.length === 0 ? 0.45 : 1,
                    }}
                  >
                    <Share2 size={16} color={colors.text.secondary} strokeWidth={2} />
                  </Pressable>
                </View>
                <View style={{ position: 'relative', zIndex: 140 }}>
                  <Pressable
                    onPress={() => {
                      setShowShareMenu(false);
                      setShowDetailActionMenu((current) => !current);
                    }}
                    style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card }}
                  >
                    <MoreVertical size={18} color={colors.text.secondary} strokeWidth={2} />
                  </Pressable>
                </View>
                {showCloseButton ? (
                  <Pressable
                    onPress={() => {
                      setShowDetailActionMenu(false);
                      onClose?.();
                    }}
                    style={{ width: 34, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary }}
                  >
                    <X size={16} color={colors.text.secondary} strokeWidth={2.3} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={{ paddingHorizontal: detailBodyHorizontalPadding, paddingTop: 12, paddingBottom: 10, gap: 8 }}>
              {isMobileDetail ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable onPress={handleToggleDone} hitSlop={8}>
                    {task.status === 'done' ? (
                      <CheckCircle2 size={20} color={taskTitleCheckColor} strokeWidth={2.2} />
                    ) : (
                      <Circle size={20} color={taskTitleCheckColor} strokeWidth={2.1} />
                    )}
                  </Pressable>
                  <Text style={{ color: colors.text.primary, fontSize: 20, lineHeight: 25, fontWeight: '600', flex: 1 }}>
                    {displayTaskTitle}
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Clock3 size={13} color={colors.text.tertiary} strokeWidth={2.2} />
                  <Text style={{ color: colors.text.tertiary, fontSize: isMobileDetail ? 13 : 12, fontWeight: '400' }}>
                    Updated {format(parseISO(task.updated_at), 'MMM d, yyyy')}
                  </Text>
                </View>
                {isTaskOverdue(task) ? (
                  <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(185,28,28,0.10)' }}>
                    <Text style={{ color: '#B91C1C', ...detailChipTextStyle }}>Overdue</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ marginTop: isMobileDetail ? 6 : 2, marginHorizontal: detailBodyHorizontalPadding, borderRadius: 8, borderWidth: 1, borderColor: colors.border.light, backgroundColor: infoSurface, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
              <View style={{ minHeight: isMobileDetail ? 44 : 50, paddingHorizontal: 14, paddingVertical: isMobileDetail ? 8 : 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={[detailLabelStyle, { width: 92 }]}>Type</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: taskItemType === 'event' ? 'rgba(37,99,235,0.10)' : colors.bg.secondary }}>
                    <Text style={{ color: taskItemType === 'event' ? '#2563EB' : colors.text.secondary, ...detailChipTextStyle }}>
                      {itemTypeLabel(taskItemType)}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={{ minHeight: isMobileDetail ? 44 : 50, paddingHorizontal: 14, paddingVertical: isMobileDetail ? 8 : 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={[detailLabelStyle, { width: 92 }]}>{taskItemType === 'event' ? 'Attendees' : 'Assignee'}</Text>
                <View style={{ flex: 1, alignItems: 'flex-end', minWidth: 0 }}>
                  {everybodyAssigned ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        borderRadius: 999,
                        backgroundColor: colors.bg.secondary,
                        paddingHorizontal: 7,
                        paddingVertical: 4,
                      }}
                    >
                      <UserAvatar name="Everybody" size={16} />
                      <Text style={{ color: colors.text.primary, fontSize: isMobileDetail ? 13 : 11, fontWeight: '500' }}>
                        Everybody
                      </Text>
                    </View>
                  ) : taskAssignees.length > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6 }}>
                      {taskAssignees.map((member) => (
                        <View
                          key={member.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 5,
                            borderRadius: 999,
                            backgroundColor: colors.bg.secondary,
                            paddingHorizontal: 7,
                            paddingVertical: 4,
                          }}
                        >
                          <UserAvatar member={member} size={16} />
                          <Text style={{ color: colors.text.primary, fontSize: isMobileDetail ? 13 : 11, fontWeight: '500' }}>
                            {member.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={detailValuePrimaryStyle}>Unassigned</Text>
                  )}
                </View>
              </View>

              <View style={{ minHeight: isMobileDetail ? 44 : 50, paddingHorizontal: 14, paddingVertical: isMobileDetail ? 8 : 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={[detailLabelStyle, { width: 92 }]}>{taskItemType === 'event' ? 'Date' : 'Due date'}</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={detailValuePrimaryStyle}>
                    {formatDueDateLong(task)}
                  </Text>
                </View>
              </View>

              {taskItemType === 'event' ? (
                <View style={{ minHeight: isMobileDetail ? 44 : 50, paddingHorizontal: 14, paddingVertical: isMobileDetail ? 8 : 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                  <Text style={[detailLabelStyle, { width: 92 }]}>Time</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={detailValuePrimaryStyle}>
                      {task.starts_at && task.ends_at
                        ? `${formatIsoTimeForEventTimeZone(task.starts_at, task.event_timezone)} - ${formatIsoTimeForEventTimeZone(task.ends_at, task.event_timezone)}`
                        : task.starts_at
                          ? formatIsoTimeForEventTimeZone(task.starts_at, task.event_timezone)
                          : 'Not set'}
                    </Text>
                  </View>
                </View>
              ) : null}

              {taskItemType === 'event' ? (
                <View style={{ minHeight: isMobileDetail ? 44 : 50, paddingHorizontal: 14, paddingVertical: isMobileDetail ? 8 : 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                  <Text style={[detailLabelStyle, { width: 92 }]}>Time zone</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={detailValuePrimaryStyle}>
                      {formatTimeZoneOptionLabel(task.event_timezone)}
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={{ minHeight: isMobileDetail ? 44 : 50, paddingHorizontal: 14, paddingVertical: isMobileDetail ? 8 : 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={[detailLabelStyle, { width: 92 }]}>Status</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Pressable
                    onPress={() => onStatusChange(task.status === 'done' ? 'todo' : 'done')}
                    style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: taskStatusTone.background, borderWidth: 1, borderColor: taskStatusTone.border }}
                  >
                    <Text style={{ color: taskStatusTone.text, ...detailChipTextStyle }}>
                      {statusLabel(task.status)}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ minHeight: isMobileDetail ? 44 : 50, paddingHorizontal: 14, paddingVertical: isMobileDetail ? 8 : 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={[detailLabelStyle, { width: 92 }]}>Priority</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: taskPriorityMeta.soft }}>
                    <Text style={{ color: taskPriorityMeta.color, ...detailChipTextStyle }}>
                      {taskPriorityMeta.label}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={{ minHeight: isMobileDetail ? 44 : 50, paddingHorizontal: 14, paddingVertical: isMobileDetail ? 8 : 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={[detailLabelStyle, { width: 92 }]}>{taskItemType === 'event' ? 'Schedule' : 'Frequency'}</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: taskFrequencyTone.background }}>
                    <Text style={{ color: taskFrequencyTone.text, ...detailChipTextStyle }}>
                      {taskFrequencyLabel}
                    </Text>
                  </View>
                </View>
              </View>

              {taskItemType === 'event' && task.location?.trim() ? (
                <View style={{ minHeight: isMobileDetail ? 44 : 50, paddingHorizontal: 14, paddingVertical: isMobileDetail ? 8 : 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                  <Text style={[detailLabelStyle, { width: 92 }]}>Location</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={detailValuePrimaryStyle}>{task.location.trim()}</Text>
                  </View>
                </View>
              ) : null}

              {taskItemType === 'event' && task.meeting_link?.trim() ? (
                <View style={{ minHeight: isMobileDetail ? 44 : 50, paddingHorizontal: 14, paddingVertical: isMobileDetail ? 8 : 10, flexDirection: 'row', alignItems: isMobileDetail ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                  <Text style={[detailLabelStyle, { width: 92, flexShrink: 0 }]}>Meeting link</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end', minWidth: 0 }}>
                    <Pressable
                      onPress={() => { void Linking.openURL(normalizeExternalUrl(task.meeting_link) ?? task.meeting_link!.trim()); }}
                      style={{ maxWidth: '100%' }}
                    >
                      <Text
                        style={[
                          detailValuePrimaryStyle,
                          {
                            color: '#2563EB',
                            textAlign: 'right',
                            flexShrink: 1,
                            maxWidth: '100%',
                          },
                        ]}
                        numberOfLines={isMobileDetail ? undefined : 2}
                      >
                        {task.meeting_link.trim()}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={{ minHeight: isMobileDetail ? 44 : 50, paddingHorizontal: 14, paddingVertical: isMobileDetail ? 8 : 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={[detailLabelStyle, { width: 92 }]}>Created by</Text>
                <View style={{ flex: 1, alignItems: 'flex-end', minWidth: 0 }}>
                  {(() => {
                    const creator = teamMembers.find((m) => m.id === task.created_by);
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {creator ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: colors.bg.secondary, paddingHorizontal: 7, paddingVertical: 4 }}>
                            <UserAvatar member={creator} size={16} />
                            <Text style={{ color: colors.text.primary, fontSize: isMobileDetail ? 13 : 11, fontWeight: '500' }}>
                              {creator.name}
                            </Text>
                          </View>
                        ) : (
                          <Text style={detailValuePrimaryStyle}>Unknown</Text>
                        )}
                      </View>
                    );
                  })()}
                </View>
              </View>

              <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: isMobileDetail ? 20 : 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <Text style={[detailLabelStyle, { width: 92, paddingTop: 2 }]}>Description</Text>
                <Text style={[displayTaskDescription ? detailValuePrimaryStyle : detailHintStyle, { flex: 1, textAlign: 'right' }]}>
                  {displayTaskDescription || 'No additional context has been added yet.'}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          renderEditForm(() => setIsEditing(false))
        )}
      </View>

      <Modal
        visible={showShareMenu}
        transparent
        animationType="none"
        onRequestClose={() => setShowShareMenu(false)}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={() => setShowShareMenu(false)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <View
            style={{
              position: 'absolute',
              top: Platform.OS === 'web' ? 76 : 64,
              right: showCloseButton ? 104 : 62,
              minWidth: 212,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: colors.bg.card,
              overflow: 'hidden',
              shadowColor: '#000000',
              shadowOpacity: 0.14,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 30,
            }}
          >
            {shareThreadOptions.length > 0 ? (
              <>
                <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>Share to thread</Text>
                </View>
                {shareThreadOptions.map((threadOption, index) => (
                  <Pressable
                    key={threadOption.entityId}
                    onPress={() => shareMutation.mutate(threadOption.entityId)}
                    disabled={shareMutation.isPending}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderBottomWidth: index === shareThreadOptions.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border.light,
                      opacity: shareMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>
                      {threadOption.name}
                    </Text>
                    {threadOption.subtitle ? (
                      <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }}>
                        {threadOption.subtitle}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </>
            ) : (
              <View style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                  No team threads available yet.
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDetailActionMenu}
        transparent
        animationType="none"
        onRequestClose={() => setShowDetailActionMenu(false)}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={() => setShowDetailActionMenu(false)}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <View
            style={{
              position: 'absolute',
              top: Platform.OS === 'web' ? 76 : 64,
              right: showCloseButton ? 60 : 18,
              minWidth: 170,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: colors.bg.card,
              overflow: 'hidden',
              shadowColor: '#000000',
              shadowOpacity: 0.14,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 30,
            }}
          >
            <Pressable
              onPress={openTaskEditor}
              style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border.light }}
            >
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '500' }}>Edit task</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowDetailActionMenu(false);
                deleteMutation.mutate();
              }}
              style={{ paddingHorizontal: 12, paddingVertical: 10 }}
            >
              <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '500' }}>
                {deleteMutation.isPending ? 'Deleting...' : 'Delete task'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEditModal}
        transparent={!isMobileDetail}
        animationType={isMobileDetail ? 'slide' : 'fade'}
        onRequestClose={() => setShowEditModal(false)}
      >
        {isMobileDetail ? (
          <View style={{ flex: 1, backgroundColor: colors.bg.card }}>
            <View
              style={{
                paddingHorizontal: TASK_MODAL_HEADER_HORIZONTAL_PADDING,
                paddingVertical: TASK_MODAL_HEADER_VERTICAL_PADDING,
                borderBottomWidth: 1,
                borderBottomColor: colors.border.light,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: '600' }}>Edit Task</Text>
              <Pressable
                onPress={() => setShowEditModal(false)}
                style={{ width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary }}
              >
                <X size={18} color={colors.text.secondary} strokeWidth={2.2} />
              </Pressable>
            </View>
            {renderEditForm(() => setShowEditModal(false), { stretch: true })}
          </View>
        ) : (
          <Pressable
            onPress={() => setShowEditModal(false)}
            style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 18 }}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: TASK_MODAL_MAX_WIDTH,
                maxHeight: TASK_MODAL_MAX_HEIGHT,
                borderRadius: TASK_MODAL_RADIUS,
                borderWidth: 1,
                borderColor: colors.border.light,
                backgroundColor: colors.bg.card,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  paddingHorizontal: TASK_MODAL_HEADER_HORIZONTAL_PADDING,
                  paddingVertical: TASK_MODAL_HEADER_VERTICAL_PADDING,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border.light,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: '600' }}>Edit Task</Text>
                <Pressable
                  onPress={() => setShowEditModal(false)}
                  style={{ width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary }}
                >
                  <X size={18} color={colors.text.secondary} strokeWidth={2.2} />
                </Pressable>
              </View>
              {renderEditForm(() => setShowEditModal(false))}
            </Pressable>
          </Pressable>
        )}
      </Modal>

      <View style={{ height: isDesktop ? 28 : 4 }} />
      <TaskActivityFeed businessId={businessId} taskId={task.id} task={task} teamMembers={teamMembers} compact={isDesktop} scrollable={!isMobileDetail} />
    </OuterContainer>
  </KeyboardAvoidingView>
  );
}

export function TaskWorkspace({ mode, taskId }: TaskWorkspaceProps) {
  const colors = useThemeColors();
  const themeMode = useResolvedThemeMode();
  const router = useRouter();
  const goToTasksHome = () => {
    router.replace('/(tabs)/tasks' as any);
  };
  const queryClient = useQueryClient();
  const { isDesktop, isMobile, width } = useBreakpoint();
  const pageHeadingStyle = getStandardPageHeadingStyle(isMobile);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserId = useAuthStore((s) => s.currentUser?.id ?? null);
  const currentUser = useAuthStore((s) => s.currentUser);
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);
  const teamMembers = useAuthStore((s) => s.teamMembers);
  const refreshTeamData = useAuthStore((s) => s.refreshTeamData);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [kpiScope, setKpiScope] = useState<TaskKpiScope>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMobileFilterModal, setShowMobileFilterModal] = useState(false);
  const [showMobileScopeModal, setShowMobileScopeModal] = useState(false);
  const [showMobileViewModal, setShowMobileViewModal] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [isMobileCompletedCollapsed, setIsMobileCompletedCollapsed] = useState(true);
  const [isDesktopCompletedCollapsed, setIsDesktopCompletedCollapsed] = useState(true);
  const [taskScope, setTaskScope] = useState<TaskScope>('all');
  const [showDesktopScopeMenu, setShowDesktopScopeMenu] = useState(false);
  const [showTabletSearch, setShowTabletSearch] = useState(false);
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>('list');
  const [calendarMonthDate, setCalendarMonthDate] = useState<Date>(startOfToday());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(startOfToday());
  const [openCardMenu, setOpenCardMenu] = useState<'people' | 'assigned' | null>(null);
  const [createForm, setCreateForm] = useState<TaskFormState>(blankTaskForm());
  const [searchQuery, setSearchQuery] = useState('');
  const [taskToast, setTaskToast] = useState<TaskToastState | null>(null);
  const dueReminderTriggerKeyRef = useRef<string | null>(null);
  const eventReminderTriggerKeyRef = useRef<string | null>(null);
  const taskToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    refreshTeamData().catch(() => undefined);
  }, [refreshTeamData]);

  useEffect(() => () => {
    if (taskToastTimerRef.current) clearTimeout(taskToastTimerRef.current);
  }, []);

  useEffect(() => {
    if (!businessId || isOfflineMode) return;
    const reminderKey = `${businessId}:${new Date().toISOString().slice(0, 10)}`;
    if (dueReminderTriggerKeyRef.current === reminderKey) return;
    dueReminderTriggerKeyRef.current = reminderKey;
    void triggerTaskDueReminders({ businessId }).catch((error) => {
      console.warn('Could not trigger task due reminders:', error);
    });
  }, [businessId, isOfflineMode]);

  useEffect(() => {
    if (!businessId || isOfflineMode) return;
    const reminderKey = `${businessId}:${Math.floor(Date.now() / (5 * 60 * 1000))}`;
    if (eventReminderTriggerKeyRef.current === reminderKey) return;
    eventReminderTriggerKeyRef.current = reminderKey;
    void triggerTaskEventReminders({ businessId, reminderIso: new Date().toISOString() }).catch((error) => {
      console.warn('Could not trigger task event reminders:', error);
    });
  }, [businessId, isOfflineMode]);

  const tasksQuery = useQuery({
    queryKey: ['tasks', businessId],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => taskData.listTasks(businessId as string),
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 30_000,
  });

  const unreadQuery = useQuery({
    queryKey: ['collaboration-thread-counts', businessId, 'task'],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.getUnreadNotificationCountsByEntity(businessId as string, 'task'),
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 20_000,
  });

  const commentCountsQuery = useQuery({
    queryKey: ['collaboration-thread-comment-counts', businessId, 'task'],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.getThreadCommentCountsByEntity(businessId as string, 'task'),
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 20_000,
  });

  const teamThreadsQuery = useQuery({
    queryKey: ['collaboration-team-threads', businessId],
    enabled: Boolean(businessId) && !isOfflineMode,
    queryFn: () => collaborationData.listThreadsByEntityType(businessId as string, 'case'),
    retry: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 20_000,
  });

  const tasks = tasksQuery.data ?? [];
  const unreadCounts = unreadQuery.data ?? {};
  const commentCounts = commentCountsQuery.data ?? {};
  const shareThreadOptions = useMemo<TaskShareThreadOption[]>(() => {
    const seen = new Set<string>();
    return (teamThreadsQuery.data ?? [])
      .filter((summary: CollaborationThreadSummary) => isTeamThreadEntityId(summary.thread.entity_id))
      .map((summary: CollaborationThreadSummary) => ({
        entityId: summary.thread.entity_id,
        name: getTeamThreadDisplayNameFromEntityId(summary.thread.entity_id),
        subtitle: getTeamThreadSubtitleFromEntityId(summary.thread.entity_id),
      }))
      .filter((option) => {
        if (seen.has(option.entityId)) return false;
        seen.add(option.entityId);
        return true;
      });
  }, [teamThreadsQuery.data]);
  const canViewTeamTasks = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const membersWithCurrentUser = useMemo(() => {
    if (!currentUser?.id) return teamMembers;
    if (teamMembers.some((member) => member.id === currentUser.id)) return teamMembers;
    return [
      {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name || 'Myself',
        role: currentUser.role,
        createdAt: new Date().toISOString(),
      },
      ...teamMembers,
    ];
  }, [currentUser, teamMembers]);
  useEffect(() => {
    if (!canViewTeamTasks && taskScope !== 'mine') {
      setTaskScope('mine');
    }
  }, [canViewTeamTasks, taskScope]);
  useEffect(() => {
    if (!canViewTeamTasks) {
      setShowDesktopScopeMenu(false);
    }
  }, [canViewTeamTasks]);
  useEffect(() => {
    if (!showCreateModal || shareThreadOptions.length === 0) return;
    if (createForm.shareThreadEntityId && shareThreadOptions.some((option) => option.entityId === createForm.shareThreadEntityId)) return;
    setCreateForm((current) => ({ ...current, shareThreadEntityId: shareThreadOptions[0]?.entityId ?? null }));
  }, [createForm.shareThreadEntityId, shareThreadOptions, showCreateModal]);
  const teamMap = useMemo(
    () => new Map(membersWithCurrentUser.map((member) => [member.id, member])),
    [membersWithCurrentUser]
  );
  const tasksErrorMessage = useMemo(() => {
    const value = tasksQuery.error;
    if (!value) return 'Could not load tasks right now.';
    if (value instanceof Error && value.message) return value.message;
    return 'Could not load tasks right now.';
  }, [tasksQuery.error]);
  const visibleTasks = useMemo(() => {
    if (canViewTeamTasks && (taskScope === 'team' || taskScope === 'all')) return tasks;
    if (!currentUserId) return [];
    return tasks.filter((task) => (
      task.created_by === currentUserId
      || (task.assignee_user_ids ?? []).includes(currentUserId)
    ));
  }, [canViewTeamTasks, currentUserId, taskScope, tasks]);
  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const nextTasks = visibleTasks.filter((task) => {
      const matchesSearch = normalizedSearch.length === 0
        ? true
        : (() => {
          const assigneeNames = (task.assignee_user_ids ?? [])
            .map((id) => teamMap.get(id)?.name?.toLowerCase() ?? '')
            .join(' ');
          const haystack = `${task.title} ${task.description ?? ''} ${statusLabel(task.status)} ${itemTypeLabel(task.item_type ?? 'task')} ${PRIORITY_META[task.priority].label} ${task.location ?? ''} ${task.meeting_link ?? ''} ${task.event_timezone ?? ''} ${assigneeNames}`.toLowerCase();
          return haystack.includes(normalizedSearch);
        })();
      if (!matchesSearch) return false;
      if (kpiScope === 'due_today' && !isTaskDueToday(task)) return false;
      if (kpiScope === 'overdue' && !isTaskOverdue(task)) return false;
      if (kpiScope === 'completed_today' && !isTaskCompletedToday(task)) return false;
      if (filter === 'pending') return task.status !== 'done';
      if (filter === 'done') return task.status === 'done';
      return true;
    });
    return [...nextTasks].sort((left, right) => {
      if (left.status !== right.status) {
        if (left.status === 'done') return 1;
        if (right.status === 'done') return -1;
      }
      const leftDue = getEffectiveTaskDueDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDue = getEffectiveTaskDueDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftDue !== rightDue) return leftDue - rightDue;
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
  }, [filter, kpiScope, searchQuery, teamMap, visibleTasks]);

  useEffect(() => {
    if (mode === 'detail') return;
    if (!isDesktop) return;
    if (filteredTasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    if (selectedTaskId && !filteredTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [filteredTasks, isDesktop, mode, selectedTaskId]);

  const selectedTask = useMemo(() => {
    if (mode === 'detail') {
      return tasks.find((task) => task.id === taskId) ?? null;
    }
    return filteredTasks.find((task) => task.id === selectedTaskId) ?? null;
  }, [filteredTasks, mode, selectedTaskId, taskId, tasks]);

  const invalidateTaskQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks', businessId] }),
      queryClient.invalidateQueries({ queryKey: ['collaboration-thread-counts', businessId, 'task'] }),
      queryClient.invalidateQueries({ queryKey: ['collaboration-thread-comment-counts', businessId, 'task'] }),
      queryClient.invalidateQueries({ queryKey: ['task-thread', businessId] }),
      queryClient.invalidateQueries({ queryKey: ['task-thread-comments', businessId] }),
    ]);
  };

  const showTaskToast = (toast: TaskToastState) => {
    if (taskToastTimerRef.current) clearTimeout(taskToastTimerRef.current);
    setTaskToast(toast);
    taskToastTimerRef.current = setTimeout(() => setTaskToast(null), 3600);
  };

  const createMutation = useMutation({
    mutationFn: async (payload: {
      input: CreateTaskInput;
      shareToThread: boolean;
      shareThreadEntityId: string | null;
      assigneeNames: string[];
    }) => {
      const createdTask = await taskData.createTask(payload.input);
      return {
        createdTask,
        shareToThread: payload.shareToThread,
        shareThreadEntityId: payload.shareThreadEntityId,
        assigneeNames: payload.assigneeNames,
      };
    },
    onSuccess: async ({ createdTask, shareToThread, shareThreadEntityId, assigneeNames }) => {
      if ((createdTask.assignee_user_ids ?? []).length > 0) {
        void sendTaskAssignmentNotification({
          businessId: createdTask.business_id,
          recipientUserIds: createdTask.assignee_user_ids,
          senderUserId: currentUserId ?? null,
          assignerName: currentUser?.name ?? null,
          taskId: createdTask.id,
          taskTitle: createdTask.title,
          dueDate: createdTask.due_date ?? null,
          isReassignment: false,
        });
      }
      if (shareToThread && shareThreadEntityId) {
        try {
          const thread = await collaborationData.getOrCreateThread(createdTask.business_id, 'case', shareThreadEntityId);
          await collaborationData.createComment({
            businessId: createdTask.business_id,
            threadId: thread.id,
            body: buildTaskShareMessage(
              createdTask,
              assigneeNames.length > 0 ? assigneeNames : ['Unassigned'],
              getTeamThreadDisplayNameFromEntityId(shareThreadEntityId)
            ),
          });
        } catch (shareError) {
          console.warn('Could not share task item to thread:', shareError);
        }
      }
      setShowCreateModal(false);
      setCreateForm(blankTaskForm());
      await invalidateTaskQueries();
      if (isDesktop) {
        setSelectedTaskId(createdTask.id);
      } else {
        router.push(`/(tabs)/task/${createdTask.id}` as any);
      }
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onError: (error) => {
      console.warn('Task create failed:', error);
    },
  });

  const quickStatusMutation = useMutation({
    mutationFn: async ({ task, next }: { task: Task; next: 'todo' | 'done' | 'in_progress' }): Promise<CompleteTaskResult | undefined> => {
      if (!businessId) return;
      if (next === 'done') {
        return await taskData.completeTask(businessId, task);
      } else if (next === 'todo') {
        await taskData.reopenTask(businessId, task.id);
      } else {
        await taskData.updateTask(businessId, task.id, { status: 'in_progress' });
      }
    },
    onSuccess: async (result, variables) => {
      if (variables.next === 'done' && businessId) {
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        const recipientUserIds = Array.from(
          new Set(
            [
              ...(variables.task.assignee_user_ids ?? []),
              variables.task.created_by,
            ].filter(Boolean)
          )
        );

        void sendTaskCompletionNotification({
          businessId,
          recipientUserIds,
          senderUserId: currentUserId ?? null,
          completedByName: currentUser?.name ?? null,
          taskId: variables.task.id,
          taskTitle: variables.task.title,
          completedAt: new Date().toISOString(),
        });

        // Recurring task: show next-date toast and notify assignees
        const recurringFreq = variables.task.recurrence_frequency;
        const notAlreadyGenerated = !variables.task.recurrence_generated_at;
        if (recurringFreq && notAlreadyGenerated) {
          const nextDueDateObj = getNextRecurringDueDate({
            due_date: variables.task.due_date ?? null,
            recurrence_frequency: recurringFreq,
            recurrence_interval: variables.task.recurrence_interval ?? 1,
          });
          if (!nextDueDateObj) return;
          const nextDueDate = nextDueDateObj.toISOString().slice(0, 10);
          const formatted = nextDueDateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
          showTaskToast({
            title: 'Task complete',
            message: `Next one lands ${formatted}`,
            icon: 'repeat',
            accent: '#2563EB',
            accentSoft: 'rgba(37,99,235,0.14)',
          });

          const assignees = (variables.task.assignee_user_ids ?? []).filter(Boolean);
          const nextTaskId = result?.nextTaskId;
          if (assignees.length > 0 && nextTaskId) {
            void sendTaskAssignmentNotification({
              businessId,
              recipientUserIds: assignees,
              senderUserId: currentUserId ?? null,
              assignerName: currentUser?.name ?? null,
              taskId: nextTaskId,
              taskTitle: variables.task.title,
              dueDate: nextDueDate,
              isReassignment: false,
            });
          }
        } else {
          showTaskToast({
            title: 'Task complete',
            message: variables.task.title,
            icon: 'check',
            accent: '#10B981',
            accentSoft: 'rgba(16,185,129,0.15)',
          });
        }
      }
      await invalidateTaskQueries();
    },
  });

  const dueTodayCount = visibleTasks.filter(isTaskDueToday).length;
  const completedTodayCount = visibleTasks.filter(isTaskCompletedToday).length;
  const pendingCount = visibleTasks.filter((task) => task.status !== 'done').length;
  const completedCount = visibleTasks.filter((task) => task.status === 'done').length;
  const overdueCount = visibleTasks.filter((task) => task.status !== 'done' && isTaskOverdue(task)).length;
  const activeKpiScopeLabel = kpiScope === 'due_today'
    ? 'Due today'
    : kpiScope === 'overdue'
      ? 'Overdue'
      : kpiScope === 'completed_today'
        ? 'Completed today'
        : null;
  const applyKpiScope = (nextScope: Exclude<TaskKpiScope, 'all'>) => {
    setKpiScope((current) => {
      const shouldActivate = current !== nextScope;
      if (shouldActivate) {
        setFilter(nextScope === 'completed_today' ? 'done' : 'pending');
      }
      return shouldActivate ? nextScope : 'all';
    });
  };
  const mobileOpenTasks = useMemo(
    () => filteredTasks.filter((task) => task.status !== 'done'),
    [filteredTasks]
  );
  const mobileCompletedTasks = useMemo(
    () => filteredTasks
      .filter((task) => task.status === 'done')
      .sort((left, right) => {
        const leftCompleted = left.completed_at ? parseISO(left.completed_at).getTime() : 0;
        const rightCompleted = right.completed_at ? parseISO(right.completed_at).getTime() : 0;
        if (leftCompleted !== rightCompleted) return rightCompleted - leftCompleted;
        return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
      }),
    [filteredTasks]
  );
  const desktopOpenTasks = useMemo(
    () => filteredTasks.filter((task) => task.status !== 'done'),
    [filteredTasks]
  );
  const desktopCompletedTasks = useMemo(
    () => filteredTasks
      .filter((task) => task.status === 'done')
      .sort((left, right) => {
        const leftCompleted = left.completed_at ? parseISO(left.completed_at).getTime() : 0;
        const rightCompleted = right.completed_at ? parseISO(right.completed_at).getTime() : 0;
        if (leftCompleted !== rightCompleted) return rightCompleted - leftCompleted;
        return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
      }),
    [filteredTasks]
  );
  const peopleRows = useMemo(() => {
    return [...teamMembers]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((member) => {
        let overdue = 0;
        let completed = 0;
        let upcoming = 0;

        visibleTasks.forEach((task) => {
          if (!(task.assignee_user_ids ?? []).includes(member.id)) return;
          if (task.status === 'done') {
            completed += 1;
            return;
          }
          if (isTaskOverdue(task)) {
            overdue += 1;
            return;
          }
          upcoming += 1;
        });

        return {
          member,
          overdue,
          completed,
          upcoming,
        };
      });
  }, [teamMembers, visibleTasks]);
  const assignedTaskRows = useMemo(() => {
    if (!currentUserId) return [];
    return [...visibleTasks]
      .filter((task) => {
        if (task.created_by !== currentUserId) return false;
        const assigneeIds = task.assignee_user_ids ?? [];
        return assigneeIds.some((id) => id !== currentUserId);
      })
      .sort((left, right) => {
        if (left.status !== right.status) {
          if (left.status === 'done') return 1;
          if (right.status === 'done') return -1;
        }
        const leftDue = left.due_date ? parseISO(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDue = right.due_date ? parseISO(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        if (leftDue !== rightDue) return leftDue - rightDue;
        return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
      })
      .map((task) => ({
        task,
        primaryAssignee: (task.assignee_user_ids?.[0] ? teamMap.get(task.assignee_user_ids[0]) : undefined),
      }));
  }, [currentUserId, teamMap, visibleTasks]);
  const isDetailOpen = isDesktop && Boolean(selectedTask);
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const desktopHeaderMinHeight = DESKTOP_PAGE_HEADER_MIN_HEIGHT;
  const webDesktopHeaderGutter = isWebDesktop ? DESKTOP_PAGE_HEADER_GUTTER : 0;
  const shouldUseDesktopCardsAndTable = isDesktop;
  const isWebMobileTableView = Platform.OS === 'web' && !isDesktop;
  const isIpadProView = isDesktop && width <= 1366;
  const showActivityColumn = !isIpadProView && !isWebMobileTableView;
  const taskDetailPanelWidth = useMemo(() => {
    if (!isDesktop) return 0;
    if (isIpadProView) {
      return Math.min(390, Math.max(320, Math.round(width * 0.305)));
    }
    return Math.min(520, Math.max(360, Math.round(width * 0.32)));
  }, [isDesktop, isIpadProView, width]);
  const taskDetailPanelMinWidth = isIpadProView ? 320 : 360;
  const taskDetailPanelMaxWidth = isIpadProView ? 390 : 520;
  const peopleCardSubtitle = isIpadProView
    ? 'Track who is on track and who needs support.'
    : 'See who is on track and who needs support at a glance.';
  const assignedCardSubtitle = isIpadProView
    ? 'Track delegated work that needs prioritizing.'
    : 'Track work you\'ve delegated so you can see what needs prioritizing.';
  const assignedTaskCardRows = useMemo(
    () => (isIpadProView ? assignedTaskRows.slice(0, OVERVIEW_CARD_VISIBLE_ROWS) : assignedTaskRows),
    [assignedTaskRows, isIpadProView]
  );
  const splitDividerColor = themeMode === 'light' ? 'rgba(15,23,42,0.10)' : colors.border.light;
  const splitDividerWidth = Platform.OS === 'web' ? 0.5 : 1;
  const forceDesktopCompletedOpen = filter === 'done' || kpiScope === 'completed_today';
  const desktopCompletedCollapsed = forceDesktopCompletedOpen ? false : isDesktopCompletedCollapsed;
  const activeTaskScopeLabel = taskScope === 'all'
    ? 'All tasks'
    : taskScope === 'team'
      ? 'Team tasks'
      : 'My tasks';
  const isTabletSplitView = isIpadProView && isDetailOpen;
  const mobileScopeOptions = [
    { id: 'all' as TaskScope, label: 'All tasks', icon: Layers },
    { id: 'mine' as TaskScope, label: 'My tasks', icon: CheckCircle2 },
    { id: 'team' as TaskScope, label: 'Team tasks', icon: Funnel },
  ];
  const mobileViewOptions = [
    { id: 'list' as TaskViewMode, label: 'List', icon: ArrowUpDown },
    { id: 'calendar' as TaskViewMode, label: 'Calendar', icon: Calendar },
  ];
  const activeTaskStatusLabel = filter === 'all'
    ? 'All statuses'
    : filter === 'pending'
      ? 'Pending only'
      : 'Completed only';
  const openTaskFromCalendar = (task: Task) => {
    if (!isDesktop) {
      router.push(`/(tabs)/task/${task.id}` as any);
      return;
    }
    setSelectedTaskId((current) => (current === task.id ? null : task.id));
  };
  const handleCalendarDateSelect = (date: Date) => {
    setSelectedCalendarDate(date);
    if (!isSameMonth(date, calendarMonthDate)) {
      setCalendarMonthDate(startOfMonth(date));
    }
  };
  const handleCalendarMonthChange = (direction: -1 | 1) => {
    const nextSelectedDate = direction === 1 ? addMonths(selectedCalendarDate, 1) : subMonths(selectedCalendarDate, 1);
    setSelectedCalendarDate(nextSelectedDate);
    setCalendarMonthDate(startOfMonth(nextSelectedDate));
  };
  const handleCalendarJumpToToday = () => {
    const today = startOfToday();
    setSelectedCalendarDate(today);
    setCalendarMonthDate(today);
  };
  const renderTaskTable = (rows: Task[], emptyMessage: string) => (
    <View style={{ borderWidth: 1, borderColor: colors.border.light, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.bg.card }}>
      <View style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
        <Text style={{ flex: showActivityColumn ? 1.9 : 5, paddingLeft: 12, paddingRight: 10, color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase' }}>Name</Text>
        <Text style={{ width: showActivityColumn ? 110 : 82, paddingRight: 8, color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase' }}>Priority</Text>
        <Text style={{ width: showActivityColumn ? 170 : 116, paddingRight: 8, color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase' }}>Assignee</Text>
        <Text style={{ width: showActivityColumn ? 126 : 92, paddingRight: 8, color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase' }}>Due</Text>
        <Text style={{ width: showActivityColumn ? 126 : 96, paddingRight: 8, color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase' }}>Frequency</Text>
        {showActivityColumn ? (
          <Text style={{ width: 104, paddingRight: 10, color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase' }}>Activity</Text>
        ) : null}
      </View>

      {tasksQuery.isPending ? (
        <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '400', textAlign: 'center', paddingVertical: 18 }}>
          Loading tasks...
        </Text>
      ) : null}
      {tasksQuery.isError ? (
        <Text style={{ color: '#B91C1C', fontSize: 12, fontWeight: '400', textAlign: 'center', paddingVertical: 12 }}>
          {tasksErrorMessage}
        </Text>
      ) : null}
      {rows.length === 0 ? (
        <View style={{ paddingVertical: 34, alignItems: 'center' }}>
          <Text style={{ color: colors.text.tertiary, fontWeight: '400' }}>{emptyMessage}</Text>
        </View>
      ) : (
        rows.map((task) => (
          <TaskTableRow
            key={task.id}
            task={task}
            selected={task.id === selectedTaskId}
            unreadCount={unreadCounts[task.id] ?? 0}
            commentCount={commentCounts[task.id] ?? 0}
            assignees={(task.assignee_user_ids ?? []).map((id) => teamMap.get(id)).filter(Boolean) as TeamMember[]}
            showActivityColumn={showActivityColumn}
            onSelect={() => {
              if (!isDesktop) {
                router.push(`/(tabs)/task/${task.id}` as any);
                return;
              }
              setSelectedTaskId((current) => (current === task.id ? null : task.id));
            }}
            onToggleDone={() => quickStatusMutation.mutate({ task, next: task.status === 'done' ? 'todo' : 'done' })}
          />
        ))
      )}
    </View>
  );
  const renderTaskToast = () => {
    if (!taskToast) return null;

    return (
      <View
        style={{
          position: 'absolute',
          top: isDesktop ? 24 : 16,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 9999,
          pointerEvents: 'none',
          paddingHorizontal: 16,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: colors.bg.card,
            borderRadius: 22,
            paddingHorizontal: 16,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderWidth: 1,
            borderColor: taskToast.accentSoft,
            shadowColor: '#000',
            shadowOpacity: themeMode === 'dark' ? 0.22 : 0.14,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 8,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: taskToast.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {taskToast.icon === 'check' ? <TaskToastConfetti /> : null}
            {taskToast.icon === 'repeat' ? (
              <Repeat size={18} color={taskToast.accent} />
            ) : (
              <CheckCircle2 size={20} color={taskToast.accent} />
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '800' }}>
              {taskToast.title}
            </Text>
            {taskToast.message ? (
              <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                {taskToast.message}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: taskToast.accentSoft,
            }}
          >
            <Text style={{ color: taskToast.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 }}>
              Done
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (!businessId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.primary }}>
        <Text style={{ color: colors.text.secondary, fontWeight: '700' }}>Tasks unavailable</Text>
      </View>
    );
  }

  if (mode === 'detail') {
    return (
      <View
        style={{
          flex: 1,
          paddingHorizontal: isDesktop ? 12 : 0,
          paddingVertical: isDesktop ? 12 : 0,
          backgroundColor: colors.bg.primary,
        }}
      >
        {tasksQuery.isPending ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }}>
            <Text style={{ color: colors.text.tertiary, fontWeight: '600' }}>Loading task...</Text>
          </View>
        ) : null}
        {tasksQuery.isError ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }}>
            <Text style={{ color: '#B91C1C', fontWeight: '700', textAlign: 'center' }}>{tasksErrorMessage}</Text>
          </View>
        ) : null}
        {selectedTask ? (
          <TaskDetailPanel
            task={selectedTask}
            businessId={businessId}
            teamMembers={membersWithCurrentUser}
            shareThreadOptions={shareThreadOptions}
            currentUserId={currentUserId}
            commentCount={commentCounts[selectedTask.id] ?? 0}
            onClose={goToTasksHome}
            onSaved={invalidateTaskQueries}
            onDeleted={async () => {
              await invalidateTaskQueries();
              goToTasksHome();
            }}
            onStatusChange={async (next) => {
              await quickStatusMutation.mutateAsync({ task: selectedTask, next });
            }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.text.secondary, fontWeight: '700' }}>Task not found</Text>
          </View>
        )}
        {renderTaskToast()}
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg.primary,
        ...(Platform.OS === 'web' ? { alignItems: 'flex-start' } : null),
      }}
    >
      <View
        style={{
          flex: 1,
          width: '100%',
          flexDirection: isDesktop ? 'row' : 'column',
          backgroundColor: colors.bg.primary,
        }}
      >
        <View
          style={{
            width: isDesktop ? undefined : '100%',
            flex: 1,
            minWidth: shouldUseDesktopCardsAndTable && isDesktop ? (isTabletSplitView ? 560 : (isDetailOpen ? undefined : 680)) : undefined,
            borderRightWidth: 0,
            borderRightColor: splitDividerColor,
            backgroundColor: colors.bg.primary,
          }}
        >
          {shouldUseDesktopCardsAndTable ? (
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light, paddingHorizontal: webDesktopHeaderGutter }}>
              <View
                style={{
                  width: '100%',
                  maxWidth: isWebDesktop ? 1400 : undefined,
                  alignSelf: isWebDesktop ? 'flex-start' : undefined,
                  paddingLeft: 20,
                  paddingRight: 20,
                  paddingTop: isWebDesktop ? 20 : 18,
                  paddingBottom: 16,
                  minHeight: isTabletSplitView ? undefined : (isWebDesktop ? desktopHeaderMinHeight : undefined),
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <View style={{ minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.text.primary, ...(isTabletSplitView ? { fontSize: 32, lineHeight: 36, fontWeight: '700' as const } : pageHeadingStyle) }}
                  >
                    Tasks
                  </Text>
                  {!isTabletSplitView ? (
                    <Text style={{ color: colors.text.tertiary, fontSize: 13, fontWeight: '500', marginTop: 2 }}>Operations</Text>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <TaskViewToggle value={taskViewMode} onChange={setTaskViewMode} />
                  <Pressable
                    onPress={() => setShowCreateModal(true)}
                    style={{
                      height: 38,
                      borderRadius: 999,
                      backgroundColor: themeMode === 'dark' ? '#FFFFFF' : colors.bg.card,
                      borderWidth: 1,
                      borderColor: themeMode === 'dark' ? '#FFFFFF' : colors.border.light,
                      paddingHorizontal: 14,
                      minWidth: 110,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    <Plus size={14} color={themeMode === 'dark' ? '#111111' : colors.text.primary} strokeWidth={2.8} />
                    <Text style={{ color: themeMode === 'dark' ? '#111111' : colors.text.primary, fontSize: 13, fontWeight: '600' }}>Add Task</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={shouldUseDesktopCardsAndTable
              ? {
                paddingLeft: 20,
                paddingRight: 20,
                paddingTop: isTabletSplitView ? 18 : 24,
                paddingBottom: 24,
                width: '100%',
                maxWidth: isWebDesktop ? 1400 : undefined,
                alignSelf: isWebDesktop ? 'flex-start' : undefined,
              }
              : { padding: 12, gap: 8 }}
          >
            {shouldUseDesktopCardsAndTable ? (
              <>
                <>
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
                    <Pressable
                      onPress={() => applyKpiScope('due_today')}
                      style={{
                        flex: 1,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: kpiScope === 'due_today' ? colors.text.primary : colors.border.light,
                        backgroundColor: kpiScope === 'due_today' ? colors.bg.secondary : colors.bg.card,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                      }}
                    >
                      <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Due today</Text>
                      <Text style={{ color: colors.text.primary, fontSize: 30, lineHeight: 34, fontWeight: '700', marginTop: 4 }}>{dueTodayCount}</Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 1 }}>{pendingCount} pending</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => applyKpiScope('overdue')}
                      style={{
                        flex: 1,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: kpiScope === 'overdue' ? colors.text.primary : colors.border.light,
                        backgroundColor: kpiScope === 'overdue' ? colors.bg.secondary : colors.bg.card,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                      }}
                    >
                      <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Overdue</Text>
                      <Text style={{ color: colors.text.primary, fontSize: 30, lineHeight: 34, fontWeight: '700', marginTop: 4 }}>{overdueCount}</Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 1 }}>Needs immediate action</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => applyKpiScope('completed_today')}
                      style={{
                        flex: 1,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: kpiScope === 'completed_today' ? colors.text.primary : colors.border.light,
                        backgroundColor: kpiScope === 'completed_today' ? colors.bg.secondary : colors.bg.card,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                      }}
                    >
                      <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Completed today</Text>
                      <Text style={{ color: colors.text.primary, fontSize: 30, lineHeight: 34, fontWeight: '700', marginTop: 4 }}>{completedTodayCount}</Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 1 }}>{completedCount} total completed</Text>
                    </Pressable>
                  </View>
                  {activeKpiScopeLabel ? (
                    <View style={{ marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                        KPI focus: {activeKpiScopeLabel}
                      </Text>
                      <Pressable
                        onPress={() => setKpiScope('all')}
                        style={{
                          height: 28,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          backgroundColor: colors.bg.card,
                          paddingHorizontal: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: '600' }}>Clear KPI focus</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>

                <View style={{ flexDirection: isTabletSplitView ? 'column' : (isDesktop ? 'row' : 'column'), gap: 12, marginTop: 10, marginBottom: 14 }}>
                  {canViewTeamTasks ? (
                    <View style={{ flex: isTabletSplitView ? undefined : (isDesktop ? 1 : undefined), width: isTabletSplitView ? '100%' : undefined, borderRadius: 14, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 }}>
                    {openCardMenu === 'people' ? (
                      <>
                        <Pressable
                          onPress={() => setOpenCardMenu(null)}
                          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10 }}
                        />
                        <View
                          style={{
                            position: 'absolute',
                            top: 46,
                            right: 12,
                            width: 188,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            backgroundColor: colors.bg.card,
                            padding: 6,
                            shadowColor: '#000000',
                            shadowOpacity: 0.12,
                            shadowRadius: 12,
                            shadowOffset: { width: 0, height: 6 },
                            zIndex: 20,
                          }}
                        >
                          <Pressable
                            onPress={() => {
                              setOpenCardMenu(null);
                              router.push('/add-team-member' as any);
                            }}
                            style={{
                              height: 34,
                              borderRadius: 8,
                              paddingHorizontal: 10,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                              Invite a teammate
                            </Text>
                            <Plus size={13} color={colors.text.secondary} strokeWidth={2.4} />
                          </Pressable>
                        </View>
                      </>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '700' }}>People</Text>
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={{ color: colors.text.tertiary, fontSize: isIpadProView ? 10 : 12, marginTop: 2 }}
                        >
                          {peopleCardSubtitle}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setOpenCardMenu('people')}
                        style={{ width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <MoreHorizontal size={18} color={colors.text.tertiary} strokeWidth={2.1} />
                      </Pressable>
                    </View>

                    <View style={{ marginTop: 8 }}>
                      {peopleRows.length === 0 ? (
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, paddingVertical: 12 }}>No team members yet.</Text>
                      ) : (
                        <ScrollView
                          style={{ maxHeight: OVERVIEW_CARD_LIST_MAX_HEIGHT, flexGrow: 0 }}
                          contentContainerStyle={{ paddingRight: 2 }}
                          nestedScrollEnabled
                          showsVerticalScrollIndicator={peopleRows.length > OVERVIEW_CARD_VISIBLE_ROWS}
                        >
                          {peopleRows.map((row, index) => {
                            return (
                              <View
                                key={row.member.id}
                                style={{
                                  minHeight: OVERVIEW_CARD_ROW_HEIGHT,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 10,
                                  borderTopWidth: index === 0 ? 0 : 1,
                                  borderTopColor: colors.border.light,
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                  <UserAvatar member={row.member} size={24} />
                                  <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                                    {row.member.name}
                                  </Text>
                                </View>
                                <TaskPeopleBadges overdue={row.overdue} completed={row.completed} upcoming={row.upcoming} />
                              </View>
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                    </View>
                  ) : null}

                  <View style={{ flex: isTabletSplitView ? undefined : (isDesktop ? 1 : undefined), width: isTabletSplitView ? '100%' : undefined, borderRadius: 14, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 }}>
                    {openCardMenu === 'assigned' ? (
                      <>
                        <Pressable
                          onPress={() => setOpenCardMenu(null)}
                          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10 }}
                        />
                        <View
                          style={{
                            position: 'absolute',
                            top: 46,
                            right: 12,
                            width: 188,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            backgroundColor: colors.bg.card,
                            padding: 6,
                            shadowColor: '#000000',
                            shadowOpacity: 0.12,
                            shadowRadius: 12,
                            shadowOffset: { width: 0, height: 6 },
                            zIndex: 20,
                          }}
                        >
                          <Pressable
                            onPress={() => {
                              setOpenCardMenu(null);
                              router.push('/add-team-member' as any);
                            }}
                            style={{
                              height: 34,
                              borderRadius: 8,
                              paddingHorizontal: 10,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                              Invite a teammate
                            </Text>
                            <Plus size={13} color={colors.text.secondary} strokeWidth={2.4} />
                          </Pressable>
                        </View>
                      </>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '700' }}>Tasks I&apos;ve assigned</Text>
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={{ color: colors.text.tertiary, fontSize: isIpadProView ? 10 : 12, marginTop: 2 }}
                        >
                          {assignedCardSubtitle}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setOpenCardMenu('assigned')}
                        style={{ width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <MoreHorizontal size={18} color={colors.text.tertiary} strokeWidth={2.1} />
                      </Pressable>
                    </View>

                    <View style={{ marginTop: 8 }}>
                      {assignedTaskCardRows.length === 0 ? (
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, paddingVertical: 12 }}>No assigned tasks yet.</Text>
                      ) : (
                        <ScrollView
                          style={{ maxHeight: OVERVIEW_CARD_LIST_MAX_HEIGHT, flexGrow: 0 }}
                          contentContainerStyle={{ paddingRight: 2 }}
                          nestedScrollEnabled
                          showsVerticalScrollIndicator={assignedTaskRows.length > OVERVIEW_CARD_VISIBLE_ROWS}
                        >
                          {assignedTaskCardRows.map((row, index) => {
                            const dueLabel = formatTaskDueDateRelative(row.task);
                            const dueColor = row.task.status === 'done'
                              ? colors.text.muted
                              : isTaskOverdue(row.task)
                                ? '#B91C1C'
                                : (dueLabel === 'Today' || dueLabel === 'Tomorrow')
                                  ? '#059669'
                                  : colors.text.tertiary;
                            const isCompleted = row.task.status === 'done';

                            return (
                              <View
                                key={row.task.id}
                                style={{
                                  minHeight: OVERVIEW_CARD_ROW_HEIGHT,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 10,
                                  borderTopWidth: index === 0 ? 0 : 1,
                                  borderTopColor: colors.border.light,
                                  opacity: isCompleted ? 0.58 : 1,
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                  {row.task.status === 'done' ? (
                                    <CheckCircle2 size={18} color={colors.text.muted} strokeWidth={2.2} />
                                  ) : (
                                    <Circle size={18} color={colors.text.muted} strokeWidth={2.0} />
                                  )}
                                  <Text
                                    style={{
                                      color: row.task.status === 'done' ? colors.text.muted : colors.text.primary,
                                      fontSize: 13,
                                      fontWeight: '500',
                                      textDecorationLine: row.task.status === 'done' ? 'underline line-through' : 'none',
                                    }}
                                    numberOfLines={1}
                                  >
                                    {toSentenceCase(row.task.title)}
                                  </Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                  <Text style={{ color: dueColor, fontSize: 12, fontWeight: '500', textDecorationLine: isCompleted ? 'underline line-through' : 'none' }}>{dueLabel}</Text>
                                  <UserAvatar member={row.primaryAssignee} size={24} />
                                </View>
                              </View>
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                  </View>
                </View>

                <View style={{ paddingTop: 10 }}>
                {isWebMobileTableView ? (
                  <View style={{ marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1, height: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}>
                      <Search size={16} color={colors.text.tertiary} strokeWidth={2.2} />
                      <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search tasks"
                        placeholderTextColor={colors.input.placeholder}
                        style={{ flex: 1, marginLeft: 8, color: colors.text.primary, fontSize: 14 }}
                        selectionColor={colors.text.primary}
                      />
                    </View>
                    <Pressable
                      onPress={() => setShowMobileFilterModal(true)}
                      style={{
                        height: 44,
                        width: 44,
                        borderRadius: 22,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        backgroundColor: colors.bg.card,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Funnel size={16} color={colors.text.secondary} strokeWidth={2.2} />
                    </Pressable>
                  </View>
                ) : (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: isTabletSplitView ? 12 : 18,
                      marginBottom: 14,
                      position: 'relative',
                      zIndex: showDesktopScopeMenu ? 40 : 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: isTabletSplitView ? 8 : 12, flex: 1, minWidth: 0 }}>
                      {!isTabletSplitView ? (
                        isIpadProView ? (
                          showTabletSearch ? (
                            <View style={{ width: 240, height: 40, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
                              <Search size={15} color={colors.text.tertiary} strokeWidth={2.2} />
                              <TextInput
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Search tasks"
                                placeholderTextColor={colors.input.placeholder}
                                style={{ flex: 1, marginLeft: 8, color: colors.text.primary, fontSize: 13 }}
                                selectionColor={colors.text.primary}
                                autoFocus
                              />
                              <Pressable
                                onPress={() => {
                                  setShowTabletSearch(false);
                                  setSearchQuery('');
                                }}
                                style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}
                              >
                                <X size={14} color={colors.text.secondary} strokeWidth={2.2} />
                              </Pressable>
                            </View>
                          ) : (
                          <Pressable
                            onPress={() => setShowTabletSearch(true)}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              backgroundColor: colors.bg.card,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Search size={16} color={colors.text.tertiary} strokeWidth={2.2} />
                          </Pressable>
                          )
                        ) : (
                          <View style={{ width: 340, height: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}>
                            <Search size={16} color={colors.text.tertiary} strokeWidth={2.2} />
                            <TextInput
                              value={searchQuery}
                              onChangeText={setSearchQuery}
                              placeholder="Search tasks"
                              placeholderTextColor={colors.input.placeholder}
                              style={{ flex: 1, marginLeft: 8, color: colors.text.primary, fontSize: 14 }}
                              selectionColor={colors.text.primary}
                            />
                          </View>
                        )
                      ) : null}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap',
                          flex: 1,
                          minHeight: isTabletSplitView ? 40 : 44,
                          paddingVertical: 4,
                        }}
                      >
                        {canViewTeamTasks ? (
                          <>
                            <View style={{ position: 'relative', zIndex: showDesktopScopeMenu ? 50 : 1 }}>
                              <Pressable
                                onPress={() => setShowDesktopScopeMenu((current) => !current)}
                                style={{
                                  borderRadius: 999,
                                  backgroundColor: colors.bg.secondary,
                                  paddingHorizontal: 14,
                                  height: 32,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                }}
                              >
                                {taskScope === 'team' ? (
                                  <Funnel size={13} color={colors.text.secondary} strokeWidth={2.2} />
                                ) : taskScope === 'all' ? (
                                  <Layers size={13} color={colors.text.secondary} strokeWidth={2.2} />
                                ) : (
                                  <CheckCircle2 size={13} color={colors.text.secondary} strokeWidth={2.2} />
                                )}
                                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
                                  {activeTaskScopeLabel}
                                </Text>
                                <ChevronDown size={13} color={colors.text.tertiary} strokeWidth={2.2} />
                              </Pressable>

                              {showDesktopScopeMenu ? (
                                <View
                                  style={{
                                    position: 'absolute',
                                    top: 38,
                                    left: 0,
                                    minWidth: 168,
                                    borderRadius: 14,
                                    borderWidth: 1,
                                    borderColor: colors.border.light,
                                    backgroundColor: colors.bg.card,
                                    padding: 6,
                                    shadowColor: '#000000',
                                    shadowOpacity: 0.12,
                                    shadowRadius: 12,
                                    shadowOffset: { width: 0, height: 6 },
                                    zIndex: 30,
                                  }}
                                >
                                  {([
                                    { id: 'all' as TaskScope, label: 'All tasks', icon: Layers },
                                    { id: 'mine' as TaskScope, label: 'My tasks', icon: CheckCircle2 },
                                    { id: 'team' as TaskScope, label: 'Team tasks', icon: Funnel },
                                  ]).map((item) => {
                                    const active = taskScope === item.id;
                                    const Icon = item.icon;
                                    return (
                                      <Pressable
                                        key={item.id}
                                        onPress={() => {
                                          setTaskScope(item.id);
                                          setShowDesktopScopeMenu(false);
                                        }}
                                        style={{
                                          height: 34,
                                          borderRadius: 10,
                                          paddingHorizontal: 10,
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          backgroundColor: active ? colors.bg.secondary : 'transparent',
                                        }}
                                      >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                          <Icon size={13} color={active ? colors.text.primary : colors.text.secondary} strokeWidth={2.2} />
                                          <Text style={{ color: active ? colors.text.primary : colors.text.secondary, fontSize: 12, fontWeight: active ? '600' : '500' }}>
                                            {item.label}
                                          </Text>
                                        </View>
                                        {active ? <Check size={13} color={colors.text.primary} strokeWidth={2.6} /> : null}
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              ) : null}
                            </View>
                            <View
                              style={{
                                width: 1,
                                height: 18,
                                backgroundColor: colors.border.light,
                                marginHorizontal: 2,
                              }}
                            />
                          </>
                        ) : null}
                        {!isIpadProView ? (
                          FILTERS.map((item) => {
                            const active = filter === item.id;
                            const label = item.id === 'all' ? 'All' : item.label;
                            return (
                              <Pressable
                                key={item.id}
                                onPress={() => {
                                  setKpiScope('all');
                                  setFilter(item.id);
                                }}
                                style={{
                                  borderRadius: 999,
                                  backgroundColor: active ? colors.text.primary : colors.bg.secondary,
                                  paddingHorizontal: 14,
                                  height: 32,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Text style={{ color: active ? colors.bg.primary : colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
                                  {label}
                                </Text>
                              </Pressable>
                            );
                          })
                        ) : null}
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: isTabletSplitView ? 8 : 16 }}>
                      <View style={{ alignItems: 'flex-end', gap: 1 }}>
                        <Text style={{ color: colors.text.primary, fontSize: isTabletSplitView ? 18 : 20, lineHeight: isTabletSplitView ? 22 : 24, fontWeight: '700' }}>
                          {filteredTasks.length}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '500' }} numberOfLines={1}>
                          Showing {activeTaskScopeLabel} • {activeTaskStatusLabel}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setShowMobileFilterModal(true)}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: colors.bg.card,
                        }}
                      >
                        <Funnel size={16} color={colors.text.tertiary} strokeWidth={2.2} />
                      </Pressable>
                    </View>
                  </View>
                )}

                {taskViewMode === 'calendar' ? (
                  <TaskCalendarView
                    tasks={filteredTasks}
                    selectedDate={selectedCalendarDate}
                    displayedMonth={calendarMonthDate}
                    selectedTaskId={selectedTaskId}
                    teamMap={teamMap}
                    unreadCounts={unreadCounts}
                    commentCounts={commentCounts}
                    isDesktopLayout={true}
                    onSelectDate={handleCalendarDateSelect}
                    onChangeMonth={handleCalendarMonthChange}
                    onJumpToToday={handleCalendarJumpToToday}
                    onOpenTask={openTaskFromCalendar}
                    onToggleDone={(task) => quickStatusMutation.mutate({ task, next: task.status === 'done' ? 'todo' : 'done' })}
                  />
                ) : (
                  <>
                    {forceDesktopCompletedOpen ? null : renderTaskTable(
                      desktopOpenTasks,
                      filteredTasks.length === 0 ? 'No tasks found.' : 'No open tasks found.'
                    )}

                    {desktopCompletedTasks.length > 0 || forceDesktopCompletedOpen ? (
                      <View style={{ marginTop: forceDesktopCompletedOpen ? 0 : 12 }}>
                        <Pressable
                          onPress={() => {
                            if (forceDesktopCompletedOpen) return;
                            setIsDesktopCompletedCollapsed((current) => !current);
                          }}
                          style={{
                            borderRadius: desktopCompletedCollapsed ? 14 : 14,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            backgroundColor: colors.bg.card,
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View
                              style={{
                                transform: [{ rotate: desktopCompletedCollapsed ? '-90deg' : '0deg' }],
                              }}
                            >
                              <ChevronDown size={16} color={colors.text.primary} strokeWidth={2.2} />
                            </View>
                            <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                              Completed
                            </Text>
                          </View>
                          <View
                            style={{
                              minWidth: 28,
                              height: 28,
                              borderRadius: 999,
                              backgroundColor: colors.bg.secondary,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              alignItems: 'center',
                              justifyContent: 'center',
                              paddingHorizontal: 8,
                            }}
                          >
                            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '700' }}>
                              {desktopCompletedTasks.length}
                            </Text>
                          </View>
                        </Pressable>

                        {!desktopCompletedCollapsed ? (
                          <View style={{ marginTop: 10 }}>
                            {renderTaskTable(desktopCompletedTasks, 'No completed tasks found.')}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </>
                )}
                </View>
              </>
            ) : (
              <>
                <View style={{ paddingHorizontal: 6, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: colors.text.primary, ...pageHeadingStyle }}>Tasks</Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }}>{pendingCount} pending</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable
                      onPress={() => setShowMobileSearch((current) => !current)}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.bg.card,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                      }}
                    >
                      <Search size={15} color={colors.text.secondary} strokeWidth={2.2} />
                    </Pressable>
                    <Pressable
                      onPress={() => setShowCreateModal(true)}
                      style={{
                        height: 38,
                        borderRadius: 999,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: themeMode === 'dark' ? '#FFFFFF' : '#111111',
                        paddingHorizontal: 14,
                        flexDirection: 'row',
                        gap: 6,
                      }}
                    >
                      <Plus size={15} color={themeMode === 'dark' ? '#111111' : '#FFFFFF'} strokeWidth={2.8} />
                      <Text style={{ color: themeMode === 'dark' ? '#111111' : '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                        Create Task
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {showMobileSearch ? (
                  <View style={{ marginHorizontal: 6, marginBottom: MOBILE_TASK_SECTION_GAP, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1, height: 40, borderRadius: 999, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
                      <Search size={14} color={colors.text.tertiary} strokeWidth={2.2} />
                      <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search tasks"
                        placeholderTextColor={colors.input.placeholder}
                        style={{ flex: 1, marginLeft: 8, color: colors.text.primary, fontSize: 13 }}
                        selectionColor={colors.text.primary}
                        autoFocus
                      />
                    </View>
                    <Pressable
                      onPress={() => setShowMobileSearch(false)}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.bg.card,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                      }}
                    >
                      <X size={16} color={colors.text.secondary} strokeWidth={2.2} />
                    </Pressable>
                  </View>
                ) : null}

                <View style={{ marginHorizontal: 6, marginTop: 6, marginBottom: MOBILE_TASK_SECTION_GAP, flexDirection: 'row', gap: 12 }}>
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 16,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      backgroundColor: colors.bg.card,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                    }}
                  >
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', marginBottom: 6 }}>
                      Pending
                    </Text>
                    <Text style={{ color: colors.text.primary, fontSize: 19, lineHeight: 22, fontWeight: '700' }}>
                      {pendingCount.toLocaleString()}
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 6 }}>
                      Open tasks
                    </Text>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      borderRadius: 16,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      backgroundColor: colors.bg.card,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                    }}
                  >
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', marginBottom: 6 }}>
                      Completed
                    </Text>
                    <Text style={{ color: colors.text.primary, fontSize: 19, lineHeight: 22, fontWeight: '700' }}>
                      {completedCount.toLocaleString()}
                    </Text>
                    <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 6 }}>
                      {overdueCount} overdue
                    </Text>
                  </View>
                </View>

                <View
                  style={{ marginHorizontal: 6, marginBottom: MOBILE_TASK_SECTION_GAP, gap: MOBILE_TASK_SECTION_GAP }}
                >
                  {canViewTeamTasks ? (
                    <View
                      style={{
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: colors.border.light,
                        backgroundColor: colors.bg.card,
                        paddingHorizontal: 14,
                        paddingTop: 12,
                        paddingBottom: 12,
                      }}
                    >
                      <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '700' }}>People</Text>
                      <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }}>
                        {peopleCardSubtitle}
                      </Text>

                      <View style={{ marginTop: 8 }}>
                        {peopleRows.length === 0 ? (
                          <Text style={{ color: colors.text.tertiary, fontSize: 12, paddingVertical: 12 }}>No team members yet.</Text>
                        ) : (
                          <ScrollView
                            style={{ maxHeight: OVERVIEW_CARD_LIST_MAX_HEIGHT, flexGrow: 0 }}
                            contentContainerStyle={{ paddingRight: 2 }}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator={peopleRows.length > OVERVIEW_CARD_VISIBLE_ROWS}
                          >
                            {peopleRows.map((row, index) => {
                              return (
                                <View
                                  key={row.member.id}
                                  style={{
                                    minHeight: OVERVIEW_CARD_ROW_HEIGHT,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 10,
                                    borderTopWidth: index === 0 ? 0 : 1,
                                    borderTopColor: colors.border.light,
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                    <UserAvatar member={row.member} size={24} />
                                    <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                                      {row.member.name}
                                    </Text>
                                  </View>
                                  <TaskPeopleBadges overdue={row.overdue} completed={row.completed} upcoming={row.upcoming} />
                                </View>
                              );
                            })}
                          </ScrollView>
                        )}
                      </View>
                    </View>
                  ) : null}

                  <View
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      backgroundColor: colors.bg.card,
                      paddingHorizontal: 14,
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                  >
                    <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 18, fontWeight: '700' }}>Tasks I&apos;ve assigned</Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }}>
                      {assignedCardSubtitle}
                    </Text>

                    <View style={{ marginTop: 8 }}>
                      {assignedTaskCardRows.length === 0 ? (
                        <Text style={{ color: colors.text.tertiary, fontSize: 12, paddingVertical: 12 }}>No assigned tasks yet.</Text>
                      ) : (
                        <ScrollView
                          style={{ maxHeight: OVERVIEW_CARD_LIST_MAX_HEIGHT, flexGrow: 0 }}
                          contentContainerStyle={{ paddingRight: 2 }}
                          nestedScrollEnabled
                          showsVerticalScrollIndicator={assignedTaskRows.length > OVERVIEW_CARD_VISIBLE_ROWS}
                        >
                          {assignedTaskCardRows.map((row, index) => {
                            const dueLabel = formatTaskDueDateRelative(row.task);
                            const dueColor = row.task.status === 'done'
                              ? colors.text.muted
                              : isTaskOverdue(row.task)
                                ? '#B91C1C'
                                : (dueLabel === 'Today' || dueLabel === 'Tomorrow')
                                  ? '#059669'
                                  : colors.text.tertiary;
                            const isCompleted = row.task.status === 'done';

                            return (
                              <View
                                key={row.task.id}
                                style={{
                                  minHeight: OVERVIEW_CARD_ROW_HEIGHT,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 10,
                                  borderTopWidth: index === 0 ? 0 : 1,
                                  borderTopColor: colors.border.light,
                                  opacity: isCompleted ? 0.58 : 1,
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                  {row.task.status === 'done' ? (
                                    <CheckCircle2 size={18} color={colors.text.muted} strokeWidth={2.2} />
                                  ) : (
                                    <Circle size={18} color={colors.text.muted} strokeWidth={2.0} />
                                  )}
                                  <Text
                                    style={{
                                      color: row.task.status === 'done' ? colors.text.muted : colors.text.primary,
                                      fontSize: 13,
                                      fontWeight: '500',
                                      textDecorationLine: row.task.status === 'done' ? 'underline line-through' : 'none',
                                    }}
                                    numberOfLines={1}
                                  >
                                    {toSentenceCase(row.task.title)}
                                  </Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                  <Text style={{ color: dueColor, fontSize: 12, fontWeight: '500', textDecorationLine: isCompleted ? 'underline line-through' : 'none' }}>{dueLabel}</Text>
                                  <UserAvatar member={row.primaryAssignee} size={24} />
                                </View>
                              </View>
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                  </View>
                </View>
                <View
                  style={{
                    marginHorizontal: 6,
                    marginBottom: MOBILE_TASK_SECTION_GAP,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    zIndex: showMobileScopeModal || showMobileViewModal ? 40 : 1,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <View style={{ position: 'relative', zIndex: showMobileViewModal ? 50 : 1 }}>
                      <Pressable
                        onPress={() => {
                          setShowMobileViewModal((current) => !current);
                          setShowMobileScopeModal(false);
                        }}
                        style={{
                          borderRadius: 999,
                          backgroundColor: colors.bg.card,
                          borderWidth: 1,
                          borderColor: colors.border.light,
                          paddingHorizontal: 14,
                          height: 34,
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'row',
                          gap: 6,
                        }}
                      >
                        {taskViewMode === 'calendar' ? (
                          <Calendar size={13} color={colors.text.secondary} strokeWidth={2.2} />
                        ) : (
                          <ArrowUpDown size={13} color={colors.text.secondary} strokeWidth={2.2} />
                        )}
                        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
                          {taskViewMode === 'calendar' ? 'Calendar' : 'List'}
                        </Text>
                        <ChevronDown size={13} color={colors.text.tertiary} strokeWidth={2.2} />
                      </Pressable>

                      {showMobileViewModal ? (
                        <View
                          style={{
                            position: 'absolute',
                            top: 40,
                            left: 0,
                            minWidth: 156,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            backgroundColor: colors.bg.card,
                            padding: 6,
                            shadowColor: '#000000',
                            shadowOpacity: 0.14,
                            shadowRadius: 16,
                            shadowOffset: { width: 0, height: 8 },
                            elevation: 10,
                          }}
                        >
                          {mobileViewOptions.map((option) => {
                            const active = taskViewMode === option.id;
                            const Icon = option.icon;
                            return (
                              <Pressable
                                key={option.id}
                                onPress={() => {
                                  setTaskViewMode(option.id);
                                  setShowMobileViewModal(false);
                                }}
                                style={{
                                  height: 36,
                                  borderRadius: 10,
                                  paddingHorizontal: 10,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  backgroundColor: active ? colors.bg.secondary : 'transparent',
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Icon size={13} color={active ? colors.text.primary : colors.text.secondary} strokeWidth={2.2} />
                                  <Text style={{ color: active ? colors.text.primary : colors.text.secondary, fontSize: 12, fontWeight: active ? '600' : '500' }}>
                                    {option.label}
                                  </Text>
                                </View>
                                {active ? <Check size={13} color={colors.text.primary} strokeWidth={2.6} /> : null}
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>

                    {canViewTeamTasks ? (
                      <View style={{ position: 'relative', zIndex: showMobileScopeModal ? 50 : 1 }}>
                        <Pressable
                          onPress={() => {
                            setShowMobileScopeModal((current) => !current);
                            setShowMobileViewModal(false);
                          }}
                          style={{
                            borderRadius: 999,
                            backgroundColor: colors.bg.card,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            paddingHorizontal: 14,
                            height: 34,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            gap: 6,
                          }}
                        >
                          <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
                            {activeTaskScopeLabel}
                          </Text>
                          <ChevronDown size={13} color={colors.text.tertiary} strokeWidth={2.2} />
                        </Pressable>

                        {showMobileScopeModal ? (
                          <View
                            style={{
                              position: 'absolute',
                              top: 40,
                              left: 0,
                              minWidth: 168,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              backgroundColor: colors.bg.card,
                              padding: 6,
                              shadowColor: '#000000',
                              shadowOpacity: 0.14,
                              shadowRadius: 16,
                              shadowOffset: { width: 0, height: 8 },
                              elevation: 10,
                            }}
                          >
                            {mobileScopeOptions.map((option) => {
                              const active = taskScope === option.id;
                              const Icon = option.icon;
                              return (
                                <Pressable
                                  key={option.id}
                                  onPress={() => {
                                    setTaskScope(option.id);
                                    setShowMobileScopeModal(false);
                                  }}
                                  style={{
                                    height: 36,
                                    borderRadius: 10,
                                    paddingHorizontal: 10,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    backgroundColor: active ? colors.bg.secondary : 'transparent',
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Icon size={13} color={active ? colors.text.primary : colors.text.secondary} strokeWidth={2.2} />
                                    <Text style={{ color: active ? colors.text.primary : colors.text.secondary, fontSize: 12, fontWeight: active ? '600' : '500' }}>
                                      {option.label}
                                    </Text>
                                  </View>
                                  {active ? <Check size={13} color={colors.text.primary} strokeWidth={2.6} /> : null}
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                        {activeTaskStatusLabel}
                      </Text>
                    )}
                  </View>

                  <Pressable
                    onPress={() => {
                      setShowMobileScopeModal(false);
                      setShowMobileViewModal(false);
                      setShowMobileFilterModal(true);
                    }}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                      backgroundColor: colors.bg.card,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Funnel size={14} color={colors.text.secondary} strokeWidth={2.2} />
                  </Pressable>
                </View>
                {taskViewMode === 'calendar' ? (
                  <TaskCalendarView
                    tasks={filteredTasks}
                    selectedDate={selectedCalendarDate}
                    displayedMonth={calendarMonthDate}
                    selectedTaskId={null}
                    teamMap={teamMap}
                    unreadCounts={unreadCounts}
                    commentCounts={commentCounts}
                    isDesktopLayout={false}
                    onSelectDate={handleCalendarDateSelect}
                    onChangeMonth={handleCalendarMonthChange}
                    onJumpToToday={handleCalendarJumpToToday}
                    onOpenTask={openTaskFromCalendar}
                    onToggleDone={(task) => quickStatusMutation.mutate({ task, next: task.status === 'done' ? 'todo' : 'done' })}
                  />
                ) : filteredTasks.length === 0 ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <Text style={{ color: colors.text.tertiary, fontWeight: '700' }}>No tasks found.</Text>
                  </View>
                ) : (
                  <>
                    {mobileOpenTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        selected={false}
                        unreadCount={unreadCounts[task.id] ?? 0}
                        commentCount={commentCounts[task.id] ?? 0}
                        assignees={(task.assignee_user_ids ?? []).map((id) => teamMap.get(id)).filter(Boolean) as TeamMember[]}
                        onSelect={() => router.push(`/(tabs)/task/${task.id}` as any)}
                        onToggleDone={() => quickStatusMutation.mutate({ task, next: task.status === 'done' ? 'todo' : 'done' })}
                      />
                    ))}

                    {mobileCompletedTasks.length > 0 ? (
                      <View style={{ marginTop: 8 }}>
                        <Pressable
                          onPress={() => setIsMobileCompletedCollapsed((current) => !current)}
                          style={{
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.border.light,
                            backgroundColor: colors.bg.secondary,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View
                              style={{
                                transform: [{ rotate: isMobileCompletedCollapsed ? '-90deg' : '0deg' }],
                              }}
                            >
                              <ChevronDown size={14} color={colors.text.primary} strokeWidth={2.2} />
                            </View>
                            <Text
                              style={{
                                color: colors.text.primary,
                                fontSize: 11,
                                fontWeight: '700',
                                letterSpacing: 0.8,
                                textTransform: 'uppercase',
                              }}
                            >
                              Completed
                            </Text>
                          </View>
                          <View
                            style={{
                              minWidth: 24,
                              height: 24,
                              borderRadius: 999,
                              backgroundColor: colors.bg.card,
                              borderWidth: 1,
                              borderColor: colors.border.light,
                              alignItems: 'center',
                              justifyContent: 'center',
                              paddingHorizontal: 6,
                            }}
                          >
                            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '700' }}>
                              {mobileCompletedTasks.length}
                            </Text>
                          </View>
                        </Pressable>
                      </View>
                    ) : null}

                    {!isMobileCompletedCollapsed ? mobileCompletedTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        selected={false}
                        unreadCount={unreadCounts[task.id] ?? 0}
                        commentCount={commentCounts[task.id] ?? 0}
                        assignees={(task.assignee_user_ids ?? []).map((id) => teamMap.get(id)).filter(Boolean) as TeamMember[]}
                        onSelect={() => router.push(`/(tabs)/task/${task.id}` as any)}
                        onToggleDone={() => quickStatusMutation.mutate({ task, next: task.status === 'done' ? 'todo' : 'done' })}
                      />
                    )) : null}
                  </>
                )}
              </>
            )}
          </ScrollView>
        </View>

        {isDetailOpen ? (
          <View
            style={{
              width: taskDetailPanelWidth,
              minWidth: taskDetailPanelMinWidth,
              maxWidth: taskDetailPanelMaxWidth,
              flexShrink: 0,
              borderLeftWidth: splitDividerWidth,
              borderLeftColor: splitDividerColor,
              backgroundColor: colors.bg.card,
            }}
          >
            <TaskDetailPanel
              task={selectedTask as Task}
              businessId={businessId}
              teamMembers={membersWithCurrentUser}
              shareThreadOptions={shareThreadOptions}
              currentUserId={currentUserId}
              commentCount={commentCounts[(selectedTask as Task).id] ?? 0}
              onClose={() => setSelectedTaskId(null)}
              onSaved={invalidateTaskQueries}
              onDeleted={async () => {
                await invalidateTaskQueries();
                setSelectedTaskId(null);
              }}
              onStatusChange={async (next) => {
                await quickStatusMutation.mutateAsync({ task: selectedTask as Task, next });
              }}
            />
          </View>
        ) : null}
      </View>

      <TaskCreateModal
        visible={showCreateModal}
        form={createForm}
        teamMembers={membersWithCurrentUser}
        currentUserId={currentUserId}
        allowEveryone={canViewTeamTasks}
        onChange={(patch) => setCreateForm((current) => ({ ...current, ...patch }))}
        onToggleAssignee={(userId) => {
          setCreateForm((current) => ({
            ...current,
            assigneeUserIds: userId === EVERYONE_ASSIGNEE_ID
              ? (current.assigneeUserIds.includes(EVERYONE_ASSIGNEE_ID) ? [] : [EVERYONE_ASSIGNEE_ID])
              : (() => {
                const withoutEveryone = current.assigneeUserIds.filter((id) => id !== EVERYONE_ASSIGNEE_ID);
                return withoutEveryone.includes(userId)
                  ? withoutEveryone.filter((id) => id !== userId)
                  : [...withoutEveryone, userId];
              })(),
          }));
        }}
        onClose={() => setShowCreateModal(false)}
        isSubmitting={createMutation.isPending}
        onSubmit={() => {
          const expandedAssigneeIds = expandAssigneeSelection(createForm.assigneeUserIds, membersWithCurrentUser);
          const startsAt = createForm.itemType === 'event'
            ? combineDateAndTime(createForm.dueDate, createForm.startTime, createForm.eventTimezone)
            : null;
          const endsAt = createForm.itemType === 'event'
            ? combineDateAndTime(createForm.dueDate, createForm.endTime, createForm.eventTimezone)
            : null;
          const assigneeNames = createForm.assigneeUserIds.includes(EVERYONE_ASSIGNEE_ID)
            ? ['Everyone']
            : expandedAssigneeIds
              .map((id) => teamMap.get(id)?.name?.trim())
              .filter((value): value is string => Boolean(value));

          createMutation.mutate({
            input: {
              businessId,
              itemType: createForm.itemType,
              title: createForm.title.trim(),
              description: createForm.description.trim(),
              priority: createForm.priority,
              dueDate: createForm.dueDate ? format(createForm.dueDate, 'yyyy-MM-dd') : null,
              startsAt,
              endsAt,
              eventTimezone: createForm.itemType === 'event' ? createForm.eventTimezone : null,
              location: createForm.itemType === 'event' ? createForm.location.trim() : null,
              meetingLink: createForm.itemType === 'event' ? createForm.meetingLink.trim() : null,
              assigneeUserIds: expandedAssigneeIds,
              recurrenceFrequency: createForm.recurrenceFrequency,
              recurrenceInterval: createForm.recurrenceInterval,
            },
            shareToThread: createForm.shareToThread && shareThreadOptions.length > 0,
            shareThreadEntityId: createForm.shareThreadEntityId ?? shareThreadOptions[0]?.entityId ?? null,
            assigneeNames,
          });
        }}
        shareThreadOptions={shareThreadOptions}
      />

      <Modal
        visible={showMobileFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMobileFilterModal(false)}
      >
        <Pressable
          onPress={() => setShowMobileFilterModal(false)}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '72%',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              backgroundColor: colors.bg.primary,
              overflow: 'hidden',
            }}
          >
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: colors.border.light }} />
            </View>

            <View
              style={{
                paddingHorizontal: 20,
                paddingBottom: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottomWidth: 1,
                borderBottomColor: colors.border.light,
              }}
            >
              <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '700' }}>
                Filters
              </Text>
              <Pressable
                onPress={() => setShowMobileFilterModal(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.bg.secondary,
                }}
              >
                <X size={18} color={colors.text.tertiary} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 }}>
                <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Filter
                </Text>

                {[
                  { id: 'all' as TaskFilter, label: 'All tasks', description: 'Show all task statuses', icon: Funnel },
                  { id: 'pending' as TaskFilter, label: 'Pending only', description: 'Todo and in progress', icon: Clock3 },
                  { id: 'done' as TaskFilter, label: 'Completed only', description: 'Finished tasks only', icon: CheckCircle2 },
                ].map((option) => {
                  const Icon = option.icon;
                  const active = filter === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => {
                        setKpiScope('all');
                        setFilter(option.id);
                      }}
                      style={{
                        minHeight: 54,
                        paddingVertical: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                      }}
                    >
                      <Icon size={18} color={active ? colors.text.primary : colors.text.muted} strokeWidth={2} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>
                          {option.label}
                        </Text>
                        <Text style={{ color: colors.text.muted, fontSize: 12, marginTop: 1 }}>
                          {option.description}
                        </Text>
                      </View>
                      {active ? (
                        <View style={{ width: 20, height: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text.primary }}>
                          <Check size={12} color={colors.bg.primary} strokeWidth={2.8} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, gap: 10 }}>
                <Pressable
                  onPress={() => {
                    setKpiScope('all');
                    setFilter('all');
                  }}
                  style={{
                    height: 42,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border.light,
                    backgroundColor: colors.bg.secondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>
                    Clear filters
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowMobileFilterModal(false)}
                  style={{
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: colors.text.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: colors.bg.primary, fontSize: 14, fontWeight: '700' }}>
                    Apply
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {renderTaskToast()}

    </View>
  );
}
