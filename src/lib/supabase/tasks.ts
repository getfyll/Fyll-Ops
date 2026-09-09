import { addDays, addMonths, addWeeks, addYears, startOfToday } from 'date-fns';
import { supabase } from '@/lib/supabase';

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskRecurrenceFrequency = 'daily' | 'weekday' | 'weekend' | 'weekly' | 'bi_weekly' | 'monthly' | 'quarterly' | 'yearly';
export type TaskItemType = 'task' | 'event';

export interface Task {
  id: string;
  business_id: string;
  item_type?: TaskItemType | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  event_timezone?: string | null;
  location?: string | null;
  meeting_link?: string | null;
  created_by: string;
  completed_at?: string | null;
  completed_by?: string | null;
  last_updated_by?: string | null;
  recurrence_frequency?: TaskRecurrenceFrequency | null;
  recurrence_interval: number;
  recurrence_group_id?: string | null;
  recurrence_generated_at?: string | null;
  source_task_id?: string | null;
  created_at: string;
  updated_at: string;
  assignee_user_ids: string[];
}

export interface CreateTaskInput {
  businessId: string;
  itemType?: TaskItemType;
  title: string;
  description?: string;
  priority: TaskPriority;
  dueDate?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  eventTimezone?: string | null;
  location?: string | null;
  meetingLink?: string | null;
  assigneeUserIds: string[];
  recurrenceFrequency?: TaskRecurrenceFrequency | null;
  recurrenceInterval?: number;
  createdBy?: string | null;
}

export interface UpdateTaskInput {
  itemType?: TaskItemType;
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  eventTimezone?: string | null;
  location?: string | null;
  meetingLink?: string | null;
  status?: TaskStatus;
  recurrenceFrequency?: TaskRecurrenceFrequency | null;
  recurrenceInterval?: number;
  assigneeUserIds?: string[];
}

type TaskRow = Omit<Task, 'assignee_user_ids'>;

const MAX_RECURRENCE_INTERVAL = 12;
const normalizeTaskItemType = (value?: TaskItemType | string | null): TaskItemType => {
  const normalized = String(value ?? 'task').trim().toLowerCase();
  return normalized === 'event' ? 'event' : 'task';
};

const normalizeRecurrenceInterval = (value?: number | null) => {
  const parsed = Number.isFinite(value) ? Number(value) : 1;
  const asInt = Math.floor(parsed);
  return Math.min(MAX_RECURRENCE_INTERVAL, Math.max(1, asInt));
};

const normalizeRecurrenceFrequency = (
  value?: TaskRecurrenceFrequency | string | null
): TaskRecurrenceFrequency | null => {
  if (!value) return null;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/^every_/, '');

  if (!normalized || normalized === 'none' || normalized === 'no' || normalized === 'null') {
    return null;
  }
  if (normalized === 'biweekly') return 'bi_weekly';
  if (normalized === 'quarterly' || normalized === 'quarter') return 'quarterly';
  if (normalized === 'daily') return 'daily';
  if (normalized === 'weekday') return 'weekday';
  if (normalized === 'weekend') return 'weekend';
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'bi_weekly') return 'bi_weekly';
  if (normalized === 'monthly') return 'monthly';
  if (normalized === 'quarterly') return 'quarterly';
  if (normalized === 'yearly') return 'yearly';
  return null;
};

const hasExplicitRecurrenceValue = (value?: TaskRecurrenceFrequency | string | null) => {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim().toLowerCase();
  return Boolean(normalized) && normalized !== 'none' && normalized !== 'no' && normalized !== 'null';
};

const resolveNextRecurringDueDate = (task: Task): Date | null => {
  if (!task.recurrence_frequency) return null;
  const normalized = normalizeRecurrenceFrequency(task.recurrence_frequency);
  if (!normalized) return null;
  const interval = normalizeRecurrenceInterval(task.recurrence_interval);
  const today = startOfToday();
  let next = task.due_date ? new Date(task.due_date) : new Date();
  let guard = 0;
  const advanceWeekday = (base: Date) => {
    let candidate = addDays(base, 1);
    while ([0, 6].includes(candidate.getDay())) {
      candidate = addDays(candidate, 1);
    }
    return candidate;
  };
  const advanceWeekend = (base: Date) => {
    let candidate = addDays(base, 1);
    while (![0, 6].includes(candidate.getDay())) {
      candidate = addDays(candidate, 1);
    }
    return candidate;
  };
  const advanceOnce = (base: Date) => {
    if (normalized === 'daily') return addDays(base, interval);
    if (normalized === 'weekday') return advanceWeekday(base);
    if (normalized === 'weekend') return advanceWeekend(base);
    if (normalized === 'weekly') return addWeeks(base, interval);
    if (normalized === 'bi_weekly') return addDays(base, 14 * interval);
    if (normalized === 'quarterly') return addMonths(base, 3 * interval);
    if (normalized === 'yearly') return addYears(base, interval);
    return addMonths(base, interval);
  };
  do {
    next = advanceOnce(next);
    guard += 1;
  } while (next <= today && guard < 400);
  return next;
};

const isRecurrenceConstraintError = (error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null | undefined) => {
  if (error?.code !== '23514') return false;
  const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  return message.includes('tasks_recurrence_frequency_check') || message.includes('recurrence_frequency');
};

const isMissingTasksTableError = (error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) => {
  const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  return message.includes('relation "tasks" does not exist')
    || message.includes("table 'public.tasks' not found")
    || message.includes('public.tasks')
    || message.includes('tasks not found');
};

const tasksSetupError = () => new Error(
  'Tasks backend is not set up yet. Run supabase/tasks_mvp.sql in Supabase SQL Editor, then refresh.'
);

const taskEventTimezoneSetupError = () => new Error(
  'Event timezone support is not set up yet. Run supabase/tasks_event_timezone_mvp.sql in Supabase SQL Editor, then refresh.'
);

const isMissingTaskEventTimezoneColumnError = (
  error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined,
) => {
  const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  return message.includes('event_timezone') && message.includes('column');
};

const normalizeAssigneeIds = (assigneeUserIds: string[]) => Array.from(
  new Set(
    assigneeUserIds
      .map((value) => value.trim())
      .filter(Boolean)
  )
);

const shiftDatePortionOfIso = (value: string | null | undefined, nextDate: Date) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const shifted = new Date(nextDate);
  shifted.setHours(parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), parsed.getMilliseconds());
  return shifted.toISOString();
};

const listTaskAssigneeIds = async (businessId: string, taskIds: string[]) => {
  if (taskIds.length === 0) return new Map<string, string[]>();

  const { data, error } = await supabase
    .from('task_assignees')
    .select('task_id, user_id')
    .eq('business_id', businessId)
    .in('task_id', taskIds);

  if (error) throw error;

  const assigneeMap = new Map<string, string[]>();
  (data ?? []).forEach((row) => {
    const taskId = row.task_id as string;
    const userId = row.user_id as string;
    assigneeMap.set(taskId, [...(assigneeMap.get(taskId) ?? []), userId]);
  });
  return assigneeMap;
};

const attachAssignees = async (businessId: string, rows: TaskRow[]): Promise<Task[]> => {
  const assigneeMap = await listTaskAssigneeIds(businessId, rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    assignee_user_ids: assigneeMap.get(row.id) ?? [],
  }));
};

const listTasks = async (businessId: string): Promise<Task[]> => {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('business_id', businessId)
    .order('status', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false });

  if (error) {
    if (isMissingTasksTableError(error)) throw tasksSetupError();
    throw error;
  }
  return attachAssignees(businessId, (data ?? []) as TaskRow[]);
};

const getTask = async (businessId: string, taskId: string): Promise<Task | null> => {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('business_id', businessId)
    .eq('id', taskId)
    .maybeSingle();

  if (error) {
    if (isMissingTasksTableError(error)) throw tasksSetupError();
    throw error;
  }
  if (!data) return null;
  const [task] = await attachAssignees(businessId, [data as TaskRow]);
  return task ?? null;
};

const createTask = async (input: CreateTaskInput): Promise<Task> => {
  const {
    businessId,
    itemType = 'task',
    title,
    description = '',
    priority,
    dueDate = null,
    startsAt = null,
    endsAt = null,
    eventTimezone = null,
    location = null,
    meetingLink = null,
    assigneeUserIds,
    recurrenceFrequency = null,
    recurrenceInterval = 1,
    createdBy = null,
  } = input;

  const normalizedBusinessId = String(businessId ?? '').trim();
  if (!normalizedBusinessId) {
    throw new Error('Missing business ID. Refresh and try again.');
  }

  const normalizedRecurrenceFrequency = normalizeRecurrenceFrequency(recurrenceFrequency);
  if (hasExplicitRecurrenceValue(recurrenceFrequency) && !normalizedRecurrenceFrequency) {
    throw new Error('Invalid recurrence option. Use Daily, Weekdays, Weekends, Weekly, Bi-weekly, Monthly, Quarterly, or Yearly.');
  }
  const normalizedItemType = normalizeTaskItemType(itemType);
  const normalizedRecurrenceInterval = normalizeRecurrenceInterval(recurrenceInterval);
  const normalizedAssigneeIds = normalizeAssigneeIds(assigneeUserIds);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const currentUserId = authData.user?.id;
  const resolvedCreatorId = createdBy || currentUserId;
  if (!resolvedCreatorId) throw new Error('No authenticated user.');

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      business_id: normalizedBusinessId,
      item_type: normalizedItemType,
      title: title.trim(),
      description: description.trim(),
      priority,
      due_date: dueDate,
      starts_at: startsAt,
      ends_at: endsAt,
      event_timezone: eventTimezone?.trim() || null,
      location: location?.trim() || null,
      meeting_link: meetingLink?.trim() || null,
      created_by: resolvedCreatorId,
      recurrence_frequency: normalizedRecurrenceFrequency,
      recurrence_interval: normalizedRecurrenceInterval,
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingTasksTableError(error)) throw tasksSetupError();
    if (isMissingTaskEventTimezoneColumnError(error)) throw taskEventTimezoneSetupError();
    if (isRecurrenceConstraintError(error)) {
      throw new Error('Recurring tasks are blocked by an outdated database constraint. Re-run supabase/tasks_mvp.sql and try again.');
    }
    throw error;
  }

  if (normalizedAssigneeIds.length > 0) {
    const assigneeRows = normalizedAssigneeIds.map((userId) => ({
      business_id: normalizedBusinessId,
      task_id: (data as TaskRow).id,
      user_id: userId,
      assigned_by: currentUserId,
    }));

    const { error: assigneeError } = await supabase
      .from('task_assignees')
      .insert(assigneeRows);

    if (assigneeError) throw assigneeError;
  }

  return {
    ...(data as TaskRow),
    assignee_user_ids: normalizedAssigneeIds,
  };
};

const updateTask = async (businessId: string, taskId: string, input: UpdateTaskInput): Promise<void> => {
  const normalizedBusinessId = String(businessId ?? '').trim();
  if (!normalizedBusinessId) {
    throw new Error('Missing business ID. Refresh and try again.');
  }

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) updates.description = input.description.trim();
  if (input.itemType !== undefined) updates.item_type = normalizeTaskItemType(input.itemType);
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.dueDate !== undefined) updates.due_date = input.dueDate;
  if (input.startsAt !== undefined) updates.starts_at = input.startsAt;
  if (input.endsAt !== undefined) updates.ends_at = input.endsAt;
  if (input.eventTimezone !== undefined) updates.event_timezone = input.eventTimezone?.trim() || null;
  if (input.location !== undefined) updates.location = input.location?.trim() || null;
  if (input.meetingLink !== undefined) updates.meeting_link = input.meetingLink?.trim() || null;
  if (input.status !== undefined) updates.status = input.status;
  if (input.recurrenceFrequency !== undefined) {
    const normalizedRecurrenceFrequency = normalizeRecurrenceFrequency(input.recurrenceFrequency);
    if (hasExplicitRecurrenceValue(input.recurrenceFrequency) && !normalizedRecurrenceFrequency) {
      throw new Error('Invalid recurrence option. Use Daily, Weekdays, Weekends, Weekly, Bi-weekly, Monthly, Quarterly, or Yearly.');
    }
    updates.recurrence_frequency = normalizedRecurrenceFrequency;
    if (!normalizedRecurrenceFrequency) {
      updates.recurrence_interval = 1;
      updates.recurrence_group_id = null;
      updates.recurrence_generated_at = null;
    }
  }
  if (input.recurrenceInterval !== undefined) {
    updates.recurrence_interval = normalizeRecurrenceInterval(input.recurrenceInterval);
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('business_id', normalizedBusinessId)
      .eq('id', taskId);

    if (error) {
      if (isMissingTaskEventTimezoneColumnError(error)) throw taskEventTimezoneSetupError();
      throw error;
    }
  }

  if (input.assigneeUserIds !== undefined) {
    const normalizedAssigneeIds = normalizeAssigneeIds(input.assigneeUserIds);
    const { error: deleteError } = await supabase
      .from('task_assignees')
      .delete()
      .eq('business_id', normalizedBusinessId)
      .eq('task_id', taskId);

    if (deleteError) throw deleteError;

    if (normalizedAssigneeIds.length > 0) {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const currentUserId = authData.user?.id;
      if (!currentUserId) throw new Error('No authenticated user.');

      const rows = normalizedAssigneeIds.map((userId) => ({
        business_id: normalizedBusinessId,
        task_id: taskId,
        user_id: userId,
        assigned_by: currentUserId,
      }));

      const { error: insertError } = await supabase
        .from('task_assignees')
        .insert(rows);

      if (insertError) throw insertError;
    }
  }
};

export interface CompleteTaskResult {
  nextDueDate?: string;
  nextTaskId?: string;
  nextAssigneeUserIds?: string[];
}

const completeTask = async (businessId: string, task: Task): Promise<CompleteTaskResult> => {
  if (task.item_type !== 'event') {
    const { error } = await supabase.rpc('complete_task_and_spawn_next', {
      p_task_id: task.id,
    });

    if (!error) return {};
    if (!error.message?.toLowerCase().includes('function')) {
      throw error;
    }
  }

    const updates: Record<string, unknown> = {
      status: 'done',
      completed_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabase
      .from('tasks')
      .update(updates)
      .eq('business_id', businessId)
      .eq('id', task.id);
    if (updateError) throw updateError;

    if (!task.recurrence_frequency || task.recurrence_generated_at) return {};

    const nextDueDateObj = resolveNextRecurringDueDate(task);
    if (!nextDueDateObj) return {};
    const nextDueDate = nextDueDateObj.toISOString().slice(0, 10);

    const nextTask = await createTask({
      businessId,
      itemType: task.item_type === 'event' ? 'event' : 'task',
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: nextDueDate,
      startsAt: shiftDatePortionOfIso(task.starts_at, nextDueDateObj),
      endsAt: shiftDatePortionOfIso(task.ends_at, nextDueDateObj),
      eventTimezone: task.event_timezone ?? null,
      location: task.location ?? null,
      meetingLink: task.meeting_link ?? null,
      assigneeUserIds: task.assignee_user_ids,
      recurrenceFrequency: task.recurrence_frequency,
      recurrenceInterval: task.recurrence_interval,
      createdBy: task.created_by,
    });

    await supabase
      .from('tasks')
      .update({
        recurrence_generated_at: new Date().toISOString(),
        source_task_id: task.source_task_id ?? null,
      })
      .eq('id', task.id);

    return {
      nextDueDate,
      nextTaskId: nextTask?.id,
      nextAssigneeUserIds: task.assignee_user_ids ?? [],
    };
};

const reopenTask = async (businessId: string, taskId: string): Promise<void> => {
  const { error } = await supabase
    .from('tasks')
    .update({
      status: 'todo',
      completed_at: null,
    })
    .eq('business_id', businessId)
    .eq('id', taskId);

  if (error) throw error;
};

const deleteTask = async (businessId: string, taskId: string): Promise<void> => {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('business_id', businessId)
    .eq('id', taskId);

  if (error) throw error;
};

export const taskData = {
  listTasks,
  getTask,
  createTask,
  updateTask,
  completeTask,
  reopenTask,
  deleteTask,
};
