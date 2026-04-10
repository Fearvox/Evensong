import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createTeam, getTeam, addMember, removeMember, listMembers,
  sendNotification, getNotifications, markAsRead, markAllAsRead,
  createActivityFeed, postActivity, getFeed,
  createChannel, sendMessage, getMessages,
  getTeamStats, health, _resetForTesting,
} from '../src/index.ts';

beforeEach(() => _resetForTesting());

// ─── Team CRUD ────────────────────────────────────────────────────────────────

describe('createTeam', () => {
  it('creates a team with required fields', async () => {
    const team = await createTeam({ name: 'Alpha', organizationId: 'org-1', createdBy: 'user-1' });
    expect(team.id).toBeTruthy();
    expect(team.name).toBe('Alpha');
    expect(team.organizationId).toBe('org-1');
    expect(team.memberCount).toBe(1);
    expect(team.settings.isPublic).toBe(false);
  });

  it('auto-adds creator as owner', async () => {
    const team = await createTeam({ name: 'Beta', organizationId: 'org-1', createdBy: 'user-1' });
    const memberList = await listMembers(team.id);
    expect(memberList).toHaveLength(1);
    expect(memberList[0].role).toBe('owner');
    expect(memberList[0].userId).toBe('user-1');
  });

  it('rejects empty name', async () => {
    await expect(createTeam({ name: '', organizationId: 'org-1', createdBy: 'u' })).rejects.toThrow('Team name is required');
  });

  it('rejects name over 100 chars', async () => {
    await expect(createTeam({ name: 'x'.repeat(101), organizationId: 'org-1', createdBy: 'u' })).rejects.toThrow('100 characters');
  });

  it('rejects duplicate name in same org', async () => {
    await createTeam({ name: 'Gamma', organizationId: 'org-1', createdBy: 'u' });
    await expect(createTeam({ name: 'Gamma', organizationId: 'org-1', createdBy: 'u' })).rejects.toThrow('already exists');
  });

  it('allows same name in different org', async () => {
    await createTeam({ name: 'Delta', organizationId: 'org-1', createdBy: 'u' });
    const t2 = await createTeam({ name: 'Delta', organizationId: 'org-2', createdBy: 'u' });
    expect(t2.name).toBe('Delta');
  });

  it('applies custom settings', async () => {
    const team = await createTeam({ name: 'Pub', organizationId: 'org-1', createdBy: 'u', settings: { isPublic: true } });
    expect(team.settings.isPublic).toBe(true);
    expect(team.settings.notificationsEnabled).toBe(true);
  });
});

describe('getTeam', () => {
  it('retrieves created team', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'u' });
    const fetched = await getTeam(t.id);
    expect(fetched.id).toBe(t.id);
  });

  it('throws NotFoundError for missing team', async () => {
    await expect(getTeam('no-such-team')).rejects.toThrow('not found');
  });
});

// ─── Members ──────────────────────────────────────────────────────────────────

describe('addMember', () => {
  it('adds a member to the team', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    const m = await addMember({ teamId: t.id, userId: 'user-2', addedBy: 'owner' });
    expect(m.role).toBe('member');
    expect(m.userId).toBe('user-2');
  });

  it('increments memberCount on add', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'user-2', addedBy: 'owner' });
    const updated = await getTeam(t.id);
    expect(updated.memberCount).toBe(2);
  });

  it('rejects duplicate member', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'user-2', addedBy: 'owner' });
    await expect(addMember({ teamId: t.id, userId: 'user-2', addedBy: 'owner' })).rejects.toThrow('already a member');
  });

  it('rejects add by non-admin', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'plain', addedBy: 'owner' });
    await expect(addMember({ teamId: t.id, userId: 'user-3', addedBy: 'plain' })).rejects.toThrow('Only team owners or admins');
  });

  it('accepts custom role', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    const m = await addMember({ teamId: t.id, userId: 'user-2', addedBy: 'owner', role: 'admin' });
    expect(m.role).toBe('admin');
  });
});

describe('removeMember', () => {
  it('removes a member', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'user-2', addedBy: 'owner' });
    await removeMember({ teamId: t.id, userId: 'user-2', removedBy: 'owner' });
    const memberList = await listMembers(t.id);
    expect(memberList.find(m => m.userId === 'user-2')).toBeUndefined();
  });

  it('decrements memberCount on remove', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'user-2', addedBy: 'owner' });
    await removeMember({ teamId: t.id, userId: 'user-2', removedBy: 'owner' });
    const updated = await getTeam(t.id);
    expect(updated.memberCount).toBe(1);
  });

  it('allows self-removal', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'user-2', addedBy: 'owner' });
    await expect(removeMember({ teamId: t.id, userId: 'user-2', removedBy: 'user-2' })).resolves.toBeUndefined();
  });

  it('prevents removing owner by admin', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'admin-user', addedBy: 'owner', role: 'admin' });
    await expect(removeMember({ teamId: t.id, userId: 'owner', removedBy: 'admin-user' })).rejects.toThrow('Cannot remove the team owner');
  });
});

// ─── Notifications ────────────────────────────────────────────────────────────

describe('sendNotification', () => {
  it('sends a notification', async () => {
    const n = await sendNotification({ userId: 'u1', teamId: 't1', type: 'mention', title: 'Hey', body: 'You were mentioned' });
    expect(n.id).toBeTruthy();
    expect(n.read).toBe(false);
    expect(n.type).toBe('mention');
  });

  it('rejects empty title', async () => {
    await expect(sendNotification({ userId: 'u', teamId: 't', type: 'update', title: '', body: 'body' })).rejects.toThrow('title is required');
  });

  it('rejects empty body', async () => {
    await expect(sendNotification({ userId: 'u', teamId: 't', type: 'update', title: 'T', body: '' })).rejects.toThrow('body is required');
  });
});

describe('getNotifications', () => {
  it('returns notifications for user', async () => {
    await sendNotification({ userId: 'u1', teamId: 't1', type: 'mention', title: 'T', body: 'B' });
    await sendNotification({ userId: 'u1', teamId: 't1', type: 'assignment', title: 'T2', body: 'B2' });
    const { notifications: list, unreadCount } = await getNotifications({ userId: 'u1' });
    expect(list).toHaveLength(2);
    expect(unreadCount).toBe(2);
  });

  it('filters by type', async () => {
    await sendNotification({ userId: 'u1', teamId: 't1', type: 'mention', title: 'M', body: 'B' });
    await sendNotification({ userId: 'u1', teamId: 't1', type: 'reminder', title: 'R', body: 'B' });
    const { notifications: list } = await getNotifications({ userId: 'u1', type: 'mention' });
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('mention');
  });

  it('filters unread only', async () => {
    const n = await sendNotification({ userId: 'u1', teamId: 't1', type: 'update', title: 'T', body: 'B' });
    await markAsRead({ notificationId: n.id, userId: 'u1' });
    await sendNotification({ userId: 'u1', teamId: 't1', type: 'update', title: 'T2', body: 'B2' });
    const { notifications: list, unreadCount } = await getNotifications({ userId: 'u1', unreadOnly: true });
    expect(list).toHaveLength(1);
    expect(unreadCount).toBe(1);
  });
});

describe('markAsRead', () => {
  it('marks notification as read', async () => {
    const n = await sendNotification({ userId: 'u1', teamId: 't1', type: 'update', title: 'T', body: 'B' });
    const updated = await markAsRead({ notificationId: n.id, userId: 'u1' });
    expect(updated.read).toBe(true);
  });

  it('rejects marking another user\'s notification', async () => {
    const n = await sendNotification({ userId: 'u1', teamId: 't1', type: 'update', title: 'T', body: 'B' });
    await expect(markAsRead({ notificationId: n.id, userId: 'u2' })).rejects.toThrow("Cannot mark another user");
  });
});

// ─── Activity Feed ────────────────────────────────────────────────────────────

describe('createActivityFeed + postActivity + getFeed', () => {
  it('creates a feed and posts activity', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'u' });
    const feed = await createActivityFeed({ teamId: t.id, name: 'main' });
    const entry = await postActivity({ feedId: feed.id, userId: 'u', type: 'message', content: 'Hello world' });
    expect(entry.id).toBeTruthy();
    expect(entry.content).toBe('Hello world');
  });

  it('retrieves feed entries in reverse chronological order', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'u' });
    const feed = await createActivityFeed({ teamId: t.id, name: 'main' });
    await postActivity({ feedId: feed.id, userId: 'u', type: 'message', content: 'First' });
    await postActivity({ feedId: feed.id, userId: 'u', type: 'message', content: 'Second' });
    const { entries } = await getFeed({ feedId: feed.id });
    expect(entries[0].content).toBe('Second');
    expect(entries[1].content).toBe('First');
  });

  it('filters by type', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'u' });
    const feed = await createActivityFeed({ teamId: t.id, name: 'main' });
    await postActivity({ feedId: feed.id, userId: 'u', type: 'message', content: 'msg' });
    await postActivity({ feedId: feed.id, userId: 'u', type: 'member_joined', content: 'joined' });
    const { entries } = await getFeed({ feedId: feed.id, type: 'message' });
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('message');
  });

  it('paginates entries', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'u' });
    const feed = await createActivityFeed({ teamId: t.id, name: 'main' });
    for (let i = 0; i < 10; i++) {
      await postActivity({ feedId: feed.id, userId: 'u', type: 'message', content: `msg-${i}` });
    }
    const { entries, total } = await getFeed({ feedId: feed.id, limit: 3, offset: 2 });
    expect(total).toBe(10);
    expect(entries).toHaveLength(3);
  });

  it('throws on duplicate feed name', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'u' });
    await createActivityFeed({ teamId: t.id, name: 'main' });
    await expect(createActivityFeed({ teamId: t.id, name: 'main' })).rejects.toThrow('already exists');
  });
});

// ─── Channels ─────────────────────────────────────────────────────────────────

describe('createChannel + sendMessage + getMessages', () => {
  it('creates a channel', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    expect(ch.name).toBe('general');
    expect(ch.isArchived).toBe(false);
    expect(ch.messageCount).toBe(0);
  });

  it('rejects invalid channel name characters', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await expect(createChannel({ teamId: t.id, name: 'Has Spaces', createdBy: 'owner' })).rejects.toThrow('lowercase letters');
  });

  it('rejects duplicate channel name', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    await expect(createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' })).rejects.toThrow('already exists');
  });

  it('sends a message', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    const msg = await sendMessage({ channelId: ch.id, authorId: 'owner', content: 'Hello!' });
    expect(msg.content).toBe('Hello!');
    expect(msg.authorId).toBe('owner');
  });

  it('increments channel messageCount on send', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    await sendMessage({ channelId: ch.id, authorId: 'owner', content: 'msg' });
    await sendMessage({ channelId: ch.id, authorId: 'owner', content: 'msg2' });
    const { messages: msgs } = await getMessages({ channelId: ch.id });
    expect(msgs).toHaveLength(2);
  });

  it('auto-creates mention notification for team members', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'alice', addedBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    await sendMessage({ channelId: ch.id, authorId: 'owner', content: 'Hey @alice !' });
    const { notifications: notifs } = await getNotifications({ userId: 'alice' });
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].type).toBe('mention');
  });

  it('rejects message from non-member', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    await expect(sendMessage({ channelId: ch.id, authorId: 'outsider', content: 'Hi' })).rejects.toThrow('not a member');
  });

  it('rejects empty message content', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    await expect(sendMessage({ channelId: ch.id, authorId: 'owner', content: '' })).rejects.toThrow('content is required');
  });

  it('rejects message over 4000 chars', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    await expect(sendMessage({ channelId: ch.id, authorId: 'owner', content: 'x'.repeat(4001) })).rejects.toThrow('4000 characters');
  });
});

// ─── Stats + Health ───────────────────────────────────────────────────────────

describe('getTeamStats', () => {
  it('returns accurate stats', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'user-2', addedBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    await sendMessage({ channelId: ch.id, authorId: 'owner', content: 'hi' });
    const stats = await getTeamStats(t.id);
    expect(stats.memberCount).toBe(2);
    expect(stats.channelCount).toBe(1);
    expect(stats.messageCount).toBe(1);
  });
});

describe('health', () => {
  it('returns ok status', async () => {
    const h = await health();
    expect(h.status).toBe('ok');
    expect(h.service).toBe('collab-hub');
    expect(typeof h.stores.teams).toBe('number');
  });
});
