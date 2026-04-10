// R009 Evensong III — Collab Hub Service
import { randomUUID } from 'crypto';
import { AppError, NotFoundError, ValidationError, ConflictError, AuthorizationError } from '../../../shared/errors.ts';
import { createLogger, Logger } from '../../../shared/logger.ts';
import { EventBus, DomainEvent, eventBus } from '../../../shared/events.ts';
import { createToken, verifyToken, hasPermission, requirePermission, createUser, Role } from '../../../shared/auth.ts';
import { InMemoryStore, createPool } from '../../../shared/db.ts';

// ─── Domain Types ────────────────────────────────────────────────────────────

export type TeamRole = 'owner' | 'admin' | 'member';
export type NotificationType = 'mention' | 'assignment' | 'update' | 'reminder';
export type ActivityType = 'message' | 'member_joined' | 'member_left' | 'channel_created' | 'team_created' | 'file_shared' | 'mention' | 'assignment';

export interface Team {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  settings: TeamSettings;
}

export interface TeamSettings {
  isPublic: boolean;
  allowGuestAccess: boolean;
  notificationsEnabled: boolean;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: string;
  addedBy: string;
}

export interface Notification {
  id: string;
  userId: string;
  teamId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  seq: number;
  metadata?: Record<string, unknown>;
}

export interface ActivityEntry {
  id: string;
  feedId: string;
  teamId: string;
  userId: string;
  type: ActivityType;
  content: string;
  createdAt: string;
  seq: number;
  metadata?: Record<string, unknown>;
}

export interface ActivityFeed {
  id: string;
  teamId: string;
  name: string;
  createdAt: string;
}

export interface Channel {
  id: string;
  teamId: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  isArchived: boolean;
  messageCount: number;
}

export interface Message {
  id: string;
  channelId: string;
  teamId: string;
  authorId: string;
  content: string;
  createdAt: string;
  seq: number;
  editedAt?: string;
  mentions: string[];
}

// ─── Stores ──────────────────────────────────────────────────────────────────

const teams = new InMemoryStore<Team>();
const members = new InMemoryStore<TeamMember & { id: string }>();
const notifications = new InMemoryStore<Notification>();
const feeds = new InMemoryStore<ActivityFeed>();
const activities = new InMemoryStore<ActivityEntry>();
const channels = new InMemoryStore<Channel>();
const messages = new InMemoryStore<Message>();

const logger = createLogger('collab-hub');

// Monotonic sequence for stable insertion-order sorting
let _seq = 0;
function nextSeq(): number { return ++_seq; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function memberId(teamId: string, userId: string): string {
  return `${teamId}::${userId}`;
}

function extractMentions(content: string): string[] {
  const matches = content.match(/@([a-zA-Z0-9_-]+)/g);
  return matches ? matches.map(m => m.slice(1)) : [];
}

async function assertTeamMember(teamId: string, userId: string): Promise<TeamMember & { id: string }> {
  const mid = memberId(teamId, userId);
  const m = await members.findById(mid);
  if (!m) throw new AuthorizationError(`User '${userId}' is not a member of team '${teamId}'`);
  return m;
}

async function assertTeamExists(teamId: string): Promise<Team> {
  const team = await teams.findById(teamId);
  if (!team) throw new NotFoundError('Team', teamId);
  return team;
}

// ─── Team Operations ─────────────────────────────────────────────────────────

export async function createTeam(params: {
  name: string;
  description?: string;
  organizationId: string;
  createdBy: string;
  settings?: Partial<TeamSettings>;
}): Promise<Team> {
  if (!params.name || params.name.trim().length === 0) {
    throw new ValidationError('Team name is required');
  }
  if (params.name.trim().length > 100) {
    throw new ValidationError('Team name must be 100 characters or fewer');
  }

  const existing = await teams.findAll(t => t.name === params.name.trim() && t.organizationId === params.organizationId);
  if (existing.length > 0) {
    throw new ConflictError(`Team '${params.name}' already exists in this organization`);
  }

  const team: Team = {
    id: randomUUID(),
    name: params.name.trim(),
    description: params.description?.trim() || '',
    organizationId: params.organizationId,
    createdBy: params.createdBy,
    createdAt: now(),
    updatedAt: now(),
    memberCount: 1,
    settings: {
      isPublic: params.settings?.isPublic ?? false,
      allowGuestAccess: params.settings?.allowGuestAccess ?? false,
      notificationsEnabled: params.settings?.notificationsEnabled ?? true,
    },
  };

  await teams.insert(team);

  // Auto-add creator as owner
  const ownerMember: TeamMember & { id: string } = {
    id: memberId(team.id, params.createdBy),
    teamId: team.id,
    userId: params.createdBy,
    role: 'owner',
    joinedAt: now(),
    addedBy: params.createdBy,
  };
  await members.insert(ownerMember);

  await eventBus.publish({
    id: randomUUID(),
    type: 'team.created',
    source: 'collab-hub',
    timestamp: now(),
    correlationId: randomUUID(),
    payload: { teamId: team.id, createdBy: params.createdBy },
  });

  logger.info('Team created', { teamId: team.id, name: team.name });
  return team;
}

export async function getTeam(teamId: string): Promise<Team> {
  return assertTeamExists(teamId);
}

export async function addMember(params: {
  teamId: string;
  userId: string;
  role?: TeamRole;
  addedBy: string;
}): Promise<TeamMember> {
  const team = await assertTeamExists(params.teamId);

  // Check requester is admin/owner
  const requester = await members.findById(memberId(params.teamId, params.addedBy));
  if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
    throw new AuthorizationError('Only team owners or admins can add members');
  }

  const mid = memberId(params.teamId, params.userId);
  const existing = await members.findById(mid);
  if (existing) {
    throw new ConflictError(`User '${params.userId}' is already a member of team '${params.teamId}'`);
  }

  const member: TeamMember & { id: string } = {
    id: mid,
    teamId: params.teamId,
    userId: params.userId,
    role: params.role || 'member',
    joinedAt: now(),
    addedBy: params.addedBy,
  };
  await members.insert(member);

  // Update member count
  await teams.update(params.teamId, { memberCount: team.memberCount + 1, updatedAt: now() });

  await eventBus.publish({
    id: randomUUID(),
    type: 'team.member_added',
    source: 'collab-hub',
    timestamp: now(),
    correlationId: randomUUID(),
    payload: { teamId: params.teamId, userId: params.userId, role: member.role },
  });

  const { id: _id, ...rest } = member;
  return rest;
}

export async function removeMember(params: {
  teamId: string;
  userId: string;
  removedBy: string;
}): Promise<void> {
  await assertTeamExists(params.teamId);

  const target = await members.findById(memberId(params.teamId, params.userId));
  if (!target) throw new NotFoundError('TeamMember', params.userId);

  // Can remove self, or admin/owner can remove others
  if (params.removedBy !== params.userId) {
    const requester = await members.findById(memberId(params.teamId, params.removedBy));
    if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
      throw new AuthorizationError('Only team owners or admins can remove members');
    }
    // Cannot remove owner
    if (target.role === 'owner') {
      throw new AuthorizationError('Cannot remove the team owner');
    }
  }

  await members.delete(memberId(params.teamId, params.userId));

  const team = await teams.findById(params.teamId);
  if (team) {
    await teams.update(params.teamId, { memberCount: Math.max(0, team.memberCount - 1), updatedAt: now() });
  }

  await eventBus.publish({
    id: randomUUID(),
    type: 'team.member_removed',
    source: 'collab-hub',
    timestamp: now(),
    correlationId: randomUUID(),
    payload: { teamId: params.teamId, userId: params.userId },
  });
}

export async function listMembers(teamId: string): Promise<TeamMember[]> {
  await assertTeamExists(teamId);
  const result = await members.findAll(m => m.teamId === teamId);
  return result.map(({ id: _id, ...rest }) => rest);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function sendNotification(params: {
  userId: string;
  teamId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<Notification> {
  if (!params.title || params.title.trim().length === 0) {
    throw new ValidationError('Notification title is required');
  }
  if (!params.body || params.body.trim().length === 0) {
    throw new ValidationError('Notification body is required');
  }

  const validTypes: NotificationType[] = ['mention', 'assignment', 'update', 'reminder'];
  if (!validTypes.includes(params.type)) {
    throw new ValidationError(`Invalid notification type: ${params.type}`);
  }

  const notification: Notification = {
    id: randomUUID(),
    userId: params.userId,
    teamId: params.teamId,
    type: params.type,
    title: params.title.trim(),
    body: params.body.trim(),
    read: false,
    createdAt: now(),
    seq: nextSeq(),
    metadata: params.metadata,
  };

  await notifications.insert(notification);

  await eventBus.publish({
    id: randomUUID(),
    type: 'notification.sent',
    source: 'collab-hub',
    timestamp: now(),
    correlationId: randomUUID(),
    payload: { notificationId: notification.id, userId: params.userId, type: params.type },
  });

  return notification;
}

export async function getNotifications(params: {
  userId: string;
  teamId?: string;
  type?: NotificationType;
  unreadOnly?: boolean;
}): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const all = await notifications.findAll(n => {
    if (n.userId !== params.userId) return false;
    if (params.teamId && n.teamId !== params.teamId) return false;
    if (params.type && n.type !== params.type) return false;
    if (params.unreadOnly && n.read) return false;
    return true;
  });

  const sorted = all.sort((a, b) => b.seq - a.seq);
  const unreadCount = all.filter(n => !n.read).length;

  return { notifications: sorted, unreadCount };
}

export async function markAsRead(params: {
  notificationId: string;
  userId: string;
}): Promise<Notification> {
  const notification = await notifications.findById(params.notificationId);
  if (!notification) throw new NotFoundError('Notification', params.notificationId);
  if (notification.userId !== params.userId) {
    throw new AuthorizationError('Cannot mark another user\'s notification as read');
  }

  const updated = await notifications.update(params.notificationId, { read: true });
  return updated!;
}

export async function markAllAsRead(userId: string, teamId?: string): Promise<number> {
  const unread = await notifications.findAll(n =>
    n.userId === userId && !n.read && (!teamId || n.teamId === teamId)
  );
  for (const n of unread) {
    await notifications.update(n.id, { read: true });
  }
  return unread.length;
}

// ─── Activity Feeds ──────────────────────────────────────────────────────────

export async function createActivityFeed(params: {
  teamId: string;
  name: string;
}): Promise<ActivityFeed> {
  await assertTeamExists(params.teamId);

  if (!params.name || params.name.trim().length === 0) {
    throw new ValidationError('Feed name is required');
  }

  const existing = await feeds.findAll(f => f.teamId === params.teamId && f.name === params.name.trim());
  if (existing.length > 0) {
    throw new ConflictError(`Feed '${params.name}' already exists for this team`);
  }

  const feed: ActivityFeed = {
    id: randomUUID(),
    teamId: params.teamId,
    name: params.name.trim(),
    createdAt: now(),
  };

  await feeds.insert(feed);
  return feed;
}

export async function postActivity(params: {
  feedId: string;
  userId: string;
  type: ActivityType;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<ActivityEntry> {
  const feed = await feeds.findById(params.feedId);
  if (!feed) throw new NotFoundError('ActivityFeed', params.feedId);

  if (!params.content || params.content.trim().length === 0) {
    throw new ValidationError('Activity content is required');
  }

  const entry: ActivityEntry = {
    id: randomUUID(),
    feedId: params.feedId,
    teamId: feed.teamId,
    userId: params.userId,
    type: params.type,
    content: params.content.trim(),
    createdAt: now(),
    seq: nextSeq(),
    metadata: params.metadata,
  };

  await activities.insert(entry);

  await eventBus.publish({
    id: randomUUID(),
    type: 'activity.posted',
    source: 'collab-hub',
    timestamp: now(),
    correlationId: randomUUID(),
    payload: { activityId: entry.id, feedId: params.feedId, type: params.type },
  });

  return entry;
}

export async function getFeed(params: {
  feedId: string;
  type?: ActivityType;
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: ActivityEntry[]; total: number }> {
  const feed = await feeds.findById(params.feedId);
  if (!feed) throw new NotFoundError('ActivityFeed', params.feedId);

  const all = await activities.findAll(a => {
    if (a.feedId !== params.feedId) return false;
    if (params.type && a.type !== params.type) return false;
    if (params.userId && a.userId !== params.userId) return false;
    return true;
  });

  const sorted = all.sort((a, b) => b.seq - a.seq);
  const total = sorted.length;
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 50;
  const entries = sorted.slice(offset, offset + limit);

  return { entries, total };
}

// ─── Channels ─────────────────────────────────────────────────────────────────

export async function createChannel(params: {
  teamId: string;
  name: string;
  description?: string;
  createdBy: string;
}): Promise<Channel> {
  await assertTeamExists(params.teamId);
  await assertTeamMember(params.teamId, params.createdBy);

  if (!params.name || params.name.trim().length === 0) {
    throw new ValidationError('Channel name is required');
  }
  if (!/^[a-z0-9_-]+$/.test(params.name.trim())) {
    throw new ValidationError('Channel name may only contain lowercase letters, numbers, hyphens, and underscores');
  }

  const existing = await channels.findAll(c => c.teamId === params.teamId && c.name === params.name.trim() && !c.isArchived);
  if (existing.length > 0) {
    throw new ConflictError(`Channel '${params.name}' already exists in this team`);
  }

  const channel: Channel = {
    id: randomUUID(),
    teamId: params.teamId,
    name: params.name.trim(),
    description: params.description?.trim() || '',
    createdBy: params.createdBy,
    createdAt: now(),
    isArchived: false,
    messageCount: 0,
  };

  await channels.insert(channel);

  await eventBus.publish({
    id: randomUUID(),
    type: 'channel.created',
    source: 'collab-hub',
    timestamp: now(),
    correlationId: randomUUID(),
    payload: { channelId: channel.id, teamId: params.teamId, createdBy: params.createdBy },
  });

  return channel;
}

export async function sendMessage(params: {
  channelId: string;
  authorId: string;
  content: string;
}): Promise<Message> {
  const channel = await channels.findById(params.channelId);
  if (!channel) throw new NotFoundError('Channel', params.channelId);
  if (channel.isArchived) throw new ValidationError('Cannot send messages to an archived channel');

  await assertTeamMember(channel.teamId, params.authorId);

  if (!params.content || params.content.trim().length === 0) {
    throw new ValidationError('Message content is required');
  }
  if (params.content.trim().length > 4000) {
    throw new ValidationError('Message content must be 4000 characters or fewer');
  }

  const mentions = extractMentions(params.content);

  const message: Message = {
    id: randomUUID(),
    channelId: params.channelId,
    teamId: channel.teamId,
    authorId: params.authorId,
    content: params.content.trim(),
    createdAt: now(),
    seq: nextSeq(),
    mentions,
  };

  await messages.insert(message);
  await channels.update(params.channelId, { messageCount: channel.messageCount + 1 });

  // Auto-send mention notifications
  for (const mentionedUserId of mentions) {
    const isMember = await members.findById(memberId(channel.teamId, mentionedUserId));
    if (isMember) {
      await sendNotification({
        userId: mentionedUserId,
        teamId: channel.teamId,
        type: 'mention',
        title: 'You were mentioned',
        body: `${params.authorId} mentioned you in #${channel.name}`,
        metadata: { channelId: params.channelId, messageId: message.id },
      });
    }
  }

  await eventBus.publish({
    id: randomUUID(),
    type: 'message.sent',
    source: 'collab-hub',
    timestamp: now(),
    correlationId: randomUUID(),
    payload: { messageId: message.id, channelId: params.channelId, authorId: params.authorId },
  });

  return message;
}

export async function getMessages(params: {
  channelId: string;
  limit?: number;
  before?: string;
  after?: string;
}): Promise<{ messages: Message[]; total: number }> {
  const channel = await channels.findById(params.channelId);
  if (!channel) throw new NotFoundError('Channel', params.channelId);

  const all = await messages.findAll(m => {
    if (m.channelId !== params.channelId) return false;
    if (params.before && m.createdAt >= params.before) return false;
    if (params.after && m.createdAt <= params.after) return false;
    return true;
  });

  const sorted = all.sort((a, b) => b.seq - a.seq);
  const limit = params.limit ?? 50;
  return { messages: sorted.slice(0, limit), total: sorted.length };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getTeamStats(teamId: string): Promise<{
  teamId: string;
  memberCount: number;
  channelCount: number;
  messageCount: number;
  notificationCount: number;
  unreadNotificationCount: number;
  activityCount: number;
  feedCount: number;
}> {
  const team = await assertTeamExists(teamId);

  const [channelList, messageList, notificationList, activityList, feedList] = await Promise.all([
    channels.findAll(c => c.teamId === teamId && !c.isArchived),
    messages.findAll(m => m.teamId === teamId),
    notifications.findAll(n => n.teamId === teamId),
    activities.findAll(a => a.teamId === teamId),
    feeds.findAll(f => f.teamId === teamId),
  ]);

  return {
    teamId,
    memberCount: team.memberCount,
    channelCount: channelList.length,
    messageCount: messageList.length,
    notificationCount: notificationList.length,
    unreadNotificationCount: notificationList.filter(n => !n.read).length,
    activityCount: activityList.length,
    feedCount: feedList.length,
  };
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function health(): Promise<{
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  stores: Record<string, number>;
}> {
  const [teamCount, memberCount, notifCount, channelCount, messageCount, feedCount, activityCount] = await Promise.all([
    teams.count(),
    members.count(),
    notifications.count(),
    channels.count(),
    messages.count(),
    feeds.count(),
    activities.count(),
  ]);

  return {
    status: 'ok',
    service: 'collab-hub',
    timestamp: now(),
    stores: {
      teams: teamCount,
      members: memberCount,
      notifications: notifCount,
      channels: channelCount,
      messages: messageCount,
      feeds: feedCount,
      activities: activityCount,
    },
  };
}

// ─── Reset (for tests) ────────────────────────────────────────────────────────

export function _resetForTesting(): void {
  teams.clear();
  members.clear();
  notifications.clear();
  feeds.clear();
  activities.clear();
  channels.clear();
  messages.clear();
  eventBus.reset();
  _seq = 0;
}

export { CollabHubService };

class CollabHubService {
  createTeam = createTeam;
  getTeam = getTeam;
  addMember = addMember;
  removeMember = removeMember;
  listMembers = listMembers;
  sendNotification = sendNotification;
  getNotifications = getNotifications;
  markAsRead = markAsRead;
  markAllAsRead = markAllAsRead;
  createActivityFeed = createActivityFeed;
  postActivity = postActivity;
  getFeed = getFeed;
  createChannel = createChannel;
  sendMessage = sendMessage;
  getMessages = getMessages;
  getTeamStats = getTeamStats;
  health = health;
  _resetForTesting = _resetForTesting;
}
