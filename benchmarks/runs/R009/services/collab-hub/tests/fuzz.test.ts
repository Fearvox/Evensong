import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createTeam, addMember, listMembers, sendNotification, getNotifications,
  createChannel, sendMessage, getMessages, createActivityFeed, postActivity,
  getFeed, getTeamStats, _resetForTesting,
} from '../src/index.ts';

beforeEach(() => _resetForTesting());

// ─── Fuzz helpers ─────────────────────────────────────────────────────────────

function randomString(len: number): string {
  return Math.random().toString(36).repeat(Math.ceil(len / 10)).slice(0, len);
}

function randomSlug(len: number): string {
  return randomString(len).replace(/[^a-z0-9]/g, 'x').slice(0, len) || 'x';
}

function randomNotifType(): 'mention' | 'assignment' | 'update' | 'reminder' {
  const types = ['mention', 'assignment', 'update', 'reminder'] as const;
  return types[Math.floor(Math.random() * types.length)];
}

function randomActivityType(): 'message' | 'member_joined' | 'file_shared' | 'assignment' {
  const types = ['message', 'member_joined', 'file_shared', 'assignment'] as const;
  return types[Math.floor(Math.random() * types.length)];
}

// ─── Fuzz: Team creation with random names ────────────────────────────────────

describe('fuzz: create teams with random valid names', () => {
  it('creates 15 teams with random names without error', async () => {
    const results: string[] = [];
    for (let i = 0; i < 15; i++) {
      const name = `team-${randomString(8)}-${i}`;
      const t = await createTeam({ name, organizationId: `org-${i % 3}`, createdBy: `user-${i}` });
      expect(t.id).toBeTruthy();
      expect(t.name).toBe(name.trim());
      results.push(t.id);
    }
    expect(results.length).toBe(15);
  });
});

// ─── Fuzz: Notification flooding ──────────────────────────────────────────────

describe('fuzz: send many notifications to one user', () => {
  it('handles 20 random notifications and tracks unread correctly', async () => {
    const userId = 'fuzz-user';
    const teamId = 'fuzz-team';
    const sent: string[] = [];

    for (let i = 0; i < 20; i++) {
      const n = await sendNotification({
        userId,
        teamId,
        type: randomNotifType(),
        title: `Notif ${i}: ${randomString(20)}`,
        body: randomString(50),
      });
      sent.push(n.id);
    }

    const { notifications, unreadCount } = await getNotifications({ userId });
    expect(notifications.length).toBe(20);
    expect(unreadCount).toBe(20);

    // Mark a random half as read
    const toRead = sent.filter((_, i) => i % 2 === 0);
    for (const id of toRead) {
      await markAsRead(id, userId);
    }

    const { unreadCount: after } = await getNotifications({ userId });
    expect(after).toBe(10);
  });
});

async function markAsRead(notificationId: string, userId: string) {
  const { markAsRead: mark } = await import('../src/index.ts');
  return mark({ notificationId, userId });
}

// ─── Fuzz: Multiple members add/remove cycle ──────────────────────────────────

describe('fuzz: rapid member add/remove cycles', () => {
  it('maintains correct memberCount through 15 adds and partial removes', async () => {
    const t = await createTeam({ name: 'fuzz-team', organizationId: 'org-1', createdBy: 'owner' });

    const userIds = Array.from({ length: 14 }, (_, i) => `fuzz-user-${i}`);
    for (const uid of userIds) {
      await addMember({ teamId: t.id, userId: uid, addedBy: 'owner' });
    }

    // Remove half
    for (let i = 0; i < 7; i++) {
      await removeFromTeam(t.id, userIds[i], 'owner');
    }

    const memberList = await listMembers(t.id);
    // 1 owner + 14 added - 7 removed = 8
    expect(memberList.length).toBe(8);

    const team = await import('../src/index.ts').then(m => m.getTeam(t.id));
    expect(team.memberCount).toBe(8);
  });
});

async function removeFromTeam(teamId: string, userId: string, removedBy: string) {
  const { removeMember } = await import('../src/index.ts');
  return removeMember({ teamId, userId, removedBy });
}

// ─── Fuzz: Activity feed with random types and users ─────────────────────────

describe('fuzz: post many activities and filter', () => {
  it('correctly filters 20 activities by type', async () => {
    const t = await createTeam({ name: 'fuzz-t', organizationId: 'org-1', createdBy: 'u' });
    const feed = await createActivityFeed({ teamId: t.id, name: 'activity-log' });

    const types: ('message' | 'member_joined' | 'file_shared' | 'assignment')[] = [];
    for (let i = 0; i < 20; i++) {
      const type = randomActivityType();
      types.push(type);
      await postActivity({ feedId: feed.id, userId: `user-${i % 5}`, type, content: `Activity ${i}: ${randomString(30)}` });
    }

    const messageCount = types.filter(t => t === 'message').length;
    const { entries } = await getFeed({ feedId: feed.id, type: 'message' });
    expect(entries.length).toBe(messageCount);

    const { total } = await getFeed({ feedId: feed.id });
    expect(total).toBe(20);
  });
});

// ─── Fuzz: Message content with special characters ────────────────────────────

describe('fuzz: messages with unicode and special characters', () => {
  it('stores and retrieves messages with varied content', async () => {
    const t = await createTeam({ name: 'uni-team', organizationId: 'org-1', createdBy: 'owner' });
    const ch = await createChannel({ teamId: t.id, name: 'general', createdBy: 'owner' });

    const contents = [
      '你好世界 🌏',
      'Math: 2+2=4, π≈3.14',
      '<script>alert("xss")</script>',
      'Multi\nLine\nContent',
      '   Leading and trailing spaces   ',
      'a'.repeat(4000), // max length
      '@owner mentioned in message',
      '##markdown **bold** _italic_',
      'emoji 🎉🚀💻🔥',
      'null undefined NaN Infinity',
    ];

    const sent: string[] = [];
    for (const content of contents) {
      if (content.trim().length === 0 || content.trim().length > 4000) continue;
      const msg = await sendMessage({ channelId: ch.id, authorId: 'owner', content });
      expect(msg.id).toBeTruthy();
      sent.push(msg.id);
    }

    const { messages, total } = await getMessages({ channelId: ch.id, limit: 100 });
    expect(total).toBe(sent.length);
    expect(messages.length).toBe(sent.length);
  });
});

// ─── Fuzz: getTeamStats under heavy load ─────────────────────────────────────

describe('fuzz: team stats consistency under load', () => {
  it('reports consistent stats after many operations', async () => {
    const t = await createTeam({ name: 'stats-team', organizationId: 'org-1', createdBy: 'owner' });

    // Add 10 members
    for (let i = 1; i <= 10; i++) {
      await addMember({ teamId: t.id, userId: `member-${i}`, addedBy: 'owner' });
    }

    // Create 5 channels, keep reference to first
    const ch0 = await createChannel({ teamId: t.id, name: 'channel-0', createdBy: 'owner' });
    for (let i = 1; i < 5; i++) {
      await createChannel({ teamId: t.id, name: `channel-${i}`, createdBy: 'owner' });
    }

    // Send 12 messages to first channel
    for (let i = 0; i < 12; i++) {
      await sendMessage({ channelId: ch0.id, authorId: 'owner', content: `message-${i}` });
    }

    // Send 5 notifications
    for (let i = 0; i < 5; i++) {
      await sendNotification({ userId: `member-${i + 1}`, teamId: t.id, type: 'update', title: 'T', body: 'B' });
    }

    const stats = await getTeamStats(t.id);
    expect(stats.memberCount).toBe(11); // owner + 10
    expect(stats.channelCount).toBe(5);
    expect(stats.messageCount).toBe(12);
    expect(stats.notificationCount).toBe(5);
    expect(stats.unreadNotificationCount).toBe(5);
  });
});
