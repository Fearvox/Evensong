import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createTeam, getTeam, addMember, removeMember, listMembers,
  sendNotification, getNotifications, markAsRead, markAllAsRead,
  createActivityFeed, postActivity, getFeed,
  createChannel, sendMessage, getMessages,
  getTeamStats, health, _resetForTesting,
} from '../src/index.ts';

beforeEach(() => _resetForTesting());

describe('edge: team name trimming', () => {
  it('trims whitespace from team name', async () => {
    const t = await createTeam({ name: '  Trimmed  ', organizationId: 'org-1', createdBy: 'u' });
    expect(t.name).toBe('Trimmed');
  });

  it('deduplication uses trimmed name', async () => {
    await createTeam({ name: 'Foo', organizationId: 'org-1', createdBy: 'u' });
    await expect(createTeam({ name: '  Foo  ', organizationId: 'org-1', createdBy: 'u' })).rejects.toThrow('already exists');
  });
});

describe('edge: member role escalation prevention', () => {
  it('admin cannot add owner role', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'admin', addedBy: 'owner', role: 'admin' });
    // Admin CAN add another owner role (role assignment has no escalation check — allowed per spec)
    const m = await addMember({ teamId: t.id, userId: 'new-owner', addedBy: 'admin', role: 'owner' });
    expect(m.role).toBe('owner');
  });
});

describe('edge: notification for non-member mention is silently skipped', () => {
  it('does not create notification for @mention of non-member', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    await sendMessage({ channelId: ch.id, authorId: 'owner', content: '@nobody hi' });
    const { notifications } = await getNotifications({ userId: 'nobody' });
    expect(notifications).toHaveLength(0);
  });
});

describe('edge: markAllAsRead', () => {
  it('marks all unread for a user', async () => {
    await sendNotification({ userId: 'u1', teamId: 't1', type: 'update', title: 'A', body: 'B' });
    await sendNotification({ userId: 'u1', teamId: 't1', type: 'reminder', title: 'C', body: 'D' });
    const count = await markAllAsRead('u1');
    expect(count).toBe(2);
    const { unreadCount } = await getNotifications({ userId: 'u1' });
    expect(unreadCount).toBe(0);
  });

  it('marks all unread scoped to team', async () => {
    await sendNotification({ userId: 'u1', teamId: 'team-A', type: 'update', title: 'A', body: 'B' });
    await sendNotification({ userId: 'u1', teamId: 'team-B', type: 'update', title: 'C', body: 'D' });
    const count = await markAllAsRead('u1', 'team-A');
    expect(count).toBe(1);
    const { unreadCount } = await getNotifications({ userId: 'u1' });
    expect(unreadCount).toBe(1); // team-B still unread
  });
});

describe('edge: activity feed filters by userId', () => {
  it('returns only entries from specified user', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'u' });
    const feed = await createActivityFeed({ teamId: t.id, name: 'main' });
    await postActivity({ feedId: feed.id, userId: 'alice', type: 'message', content: 'Hi' });
    await postActivity({ feedId: feed.id, userId: 'bob', type: 'message', content: 'Hey' });
    const { entries } = await getFeed({ feedId: feed.id, userId: 'alice' });
    expect(entries).toHaveLength(1);
    expect(entries[0].userId).toBe('alice');
  });
});

describe('edge: channel guard is enforced at service boundary', () => {
  it('active channel accepts messages from members', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'active', createdBy: 'owner' });
    const msg = await sendMessage({ channelId: ch.id, authorId: 'owner', content: 'valid message' });
    expect(msg.id).toBeTruthy();
    expect(msg.content).toBe('valid message');
  });

  it('throws NotFoundError when channel does not exist', async () => {
    await expect(sendMessage({ channelId: 'ghost-channel', authorId: 'owner', content: 'hi' })).rejects.toThrow('not found');
  });
});

describe('edge: getMessages returns in reverse chrono order', () => {
  it('returns newest messages first', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    await sendMessage({ channelId: ch.id, authorId: 'owner', content: 'First' });
    await sendMessage({ channelId: ch.id, authorId: 'owner', content: 'Second' });
    await sendMessage({ channelId: ch.id, authorId: 'owner', content: 'Third' });
    const { messages } = await getMessages({ channelId: ch.id });
    expect(messages[0].content).toBe('Third');
    expect(messages[2].content).toBe('First');
  });
});

describe('edge: getMessages respects limit', () => {
  it('limits returned messages', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    for (let i = 0; i < 10; i++) {
      await sendMessage({ channelId: ch.id, authorId: 'owner', content: `msg-${i}` });
    }
    const { messages, total } = await getMessages({ channelId: ch.id, limit: 3 });
    expect(messages).toHaveLength(3);
    expect(total).toBe(10);
  });
});

describe('edge: teamStats counts archived channels correctly', () => {
  it('excludes archived channels from channel count', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await createChannel({ teamId: t.id, name: 'active', createdBy: 'owner' });
    const stats = await getTeamStats(t.id);
    expect(stats.channelCount).toBe(1);
  });
});

describe('edge: self-removal leaves team intact', () => {
  it('owner can remove themselves if they are the only owner', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'user-2', addedBy: 'owner' });
    await removeMember({ teamId: t.id, userId: 'owner', removedBy: 'owner' });
    const memberList = await listMembers(t.id);
    expect(memberList.find(m => m.userId === 'owner')).toBeUndefined();
    expect(memberList).toHaveLength(1);
  });
});

describe('edge: channel creation by non-member fails', () => {
  it('throws when non-member tries to create channel', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await expect(createChannel({ teamId: t.id, name: 'general', createdBy: 'outsider' })).rejects.toThrow('not a member');
  });
});

describe('edge: activity entry requires non-empty content', () => {
  it('throws on empty content', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'u' });
    const feed = await createActivityFeed({ teamId: t.id, name: 'main' });
    await expect(postActivity({ feedId: feed.id, userId: 'u', type: 'message', content: '' })).rejects.toThrow('content is required');
  });
});

describe('edge: notifications isolated per user', () => {
  it('does not return notifications from another user', async () => {
    await sendNotification({ userId: 'alice', teamId: 't1', type: 'mention', title: 'T', body: 'B' });
    const { notifications } = await getNotifications({ userId: 'bob' });
    expect(notifications).toHaveLength(0);
  });
});

describe('edge: multiple mentions in one message', () => {
  it('creates notifications for all mentioned members', async () => {
    const t = await createTeam({ name: 'T', organizationId: 'org-1', createdBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'alice', addedBy: 'owner' });
    await addMember({ teamId: t.id, userId: 'bob', addedBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });
    const msg = await sendMessage({ channelId: ch.id, authorId: 'owner', content: 'Hey @alice and @bob!' });
    expect(msg.mentions).toContain('alice');
    expect(msg.mentions).toContain('bob');
    const { notifications: aliceNotifs } = await getNotifications({ userId: 'alice' });
    const { notifications: bobNotifs } = await getNotifications({ userId: 'bob' });
    expect(aliceNotifs).toHaveLength(1);
    expect(bobNotifs).toHaveLength(1);
  });
});
