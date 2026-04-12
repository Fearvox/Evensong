// Notifications service — request handler (pure function, no Bun.serve)

import {
  success,
  error,
  notFound,
  conflict,
  paginated,
  parseBody,
  getPathSegments,
  getQueryParams,
} from "../shared/http";
import {
  isNonEmptyString,
  isArray,
  isObject,
  validate,
  formatValidationErrors,
} from "../shared/validation";
import type { Notification, NotificationChannel } from "../shared/types";
import {
  createNotification,
  getNotification,
  getAllNotifications,
  updateNotification,
  deleteNotification,
  markAsRead,
  markAsUnread,
  bulkMarkAsRead,
  sendNotification,
  filterNotifications,
  getUserNotifications,
  getUnreadCount,
  createTemplate,
  getTemplate,
  getTemplateById,
  getTemplateByName,
  getAllTemplates,
  applyTemplate,
  getStats,
} from "./store";

const VALID_CHANNELS = ["email", "sms", "push", "in_app"];

export async function handleRequest(req: Request): Promise<Response> {
  const method = req.method.toUpperCase();
  const segments = getPathSegments(req.url);
  const params = getQueryParams(req.url);

  // All routes start with /notifications
  if (segments[0] !== "notifications") {
    return notFound("Route not found");
  }

  // --- Health ---
  // GET /notifications/health
  if (method === "GET" && segments[1] === "health" && segments.length === 2) {
    return success({ status: "ok", service: "notifications" });
  }

  // --- Stats ---
  // GET /notifications/stats
  if (method === "GET" && segments[1] === "stats" && segments.length === 2) {
    return success(getStats());
  }

  // --- Template routes (singular: /template) — from notifications-edge.test.ts ---

  // POST /notifications/template
  if (method === "POST" && segments[1] === "template" && segments.length === 2) {
    const body = await parseBody<{
      name: unknown;
      title: unknown;
      body: unknown;
    }>(req);
    if (!body) return error("Invalid or missing request body");

    const errors = validate([
      { field: "name", valid: isNonEmptyString(body.name), message: "name is required" },
      { field: "title", valid: isNonEmptyString(body.title), message: "title is required" },
      { field: "body", valid: isNonEmptyString(body.body), message: "body is required" },
    ]);
    if (errors.length > 0) return error(formatValidationErrors(errors));

    // Check for duplicate name
    const existing = getTemplateByName(body.name as string);
    if (existing) return conflict("Template with this name already exists");

    const template = createTemplate(
      body.name as string,
      body.title as string,
      body.body as string,
    );
    return success(template, 201);
  }

  // --- Template routes (plural: /templates) — from handlers.test.ts ---

  // POST /notifications/templates
  if (method === "POST" && segments[1] === "templates" && segments.length === 2) {
    const body = await parseBody<{
      name: unknown;
      channel: unknown;
      subject: unknown;
      body: unknown;
    }>(req);
    if (!body) return error("Invalid or missing request body");

    const errors = validate([
      { field: "name", valid: isNonEmptyString(body.name), message: "name is required" },
      { field: "channel", valid: isNonEmptyString(body.channel), message: "channel is required" },
      { field: "subject", valid: isNonEmptyString(body.subject), message: "subject is required" },
      { field: "body", valid: isNonEmptyString(body.body), message: "body is required" },
    ]);
    if (errors.length > 0) return error(formatValidationErrors(errors));

    const template = createTemplate(
      body.name as string,
      body.subject as string,
      body.body as string,
      body.channel as string,
    );
    return success(template, 201);
  }

  // GET /notifications/templates
  if (method === "GET" && segments[1] === "templates" && segments.length === 2) {
    return success(getAllTemplates());
  }

  // POST /notifications/from-template
  // Supports both: templateId (handlers.test.ts) and templateName (notifications-edge.test.ts)
  if (method === "POST" && segments[1] === "from-template" && segments.length === 2) {
    const body = await parseBody<{
      templateId: unknown;
      templateName: unknown;
      userId: unknown;
      type: unknown;
      channel: unknown;
      variables: unknown;
    }>(req);
    if (!body) return error("Invalid or missing request body");

    const hasTemplateId = isNonEmptyString(body.templateId);
    const hasTemplateName = isNonEmptyString(body.templateName);

    if (!hasTemplateId && !hasTemplateName) {
      return error("templateId or templateName is required");
    }

    // Validate required fields BEFORE template lookup
    if (hasTemplateName) {
      const errors = validate([
        { field: "userId", valid: isNonEmptyString(body.userId), message: "userId is required" },
        { field: "type", valid: isNonEmptyString(body.type), message: "type is required" },
        { field: "channel", valid: isNonEmptyString(body.channel), message: "channel is required" },
      ]);
      if (errors.length > 0) return error(formatValidationErrors(errors));
    } else {
      // templateId path: only userId required
      if (!isNonEmptyString(body.userId)) {
        return error("userId is required");
      }
    }

    // Resolve template
    let template = hasTemplateId
      ? getTemplateById(body.templateId as string)
      : getTemplateByName(body.templateName as string);

    if (!template) return notFound("Template not found");

    const variables = isObject(body.variables)
      ? (body.variables as Record<string, string>)
      : {};

    const { title, body: resolvedBody } = applyTemplate(template, variables);

    // Determine type and channel
    const notifType = isNonEmptyString(body.type)
      ? (body.type as Notification["type"])
      : (template.channel as Notification["type"]) || "system";
    const notifChannel = isNonEmptyString(body.channel)
      ? (body.channel as NotificationChannel)
      : (template.channel as NotificationChannel) || "email";

    const notification = createNotification(
      body.userId as string,
      notifType,
      notifChannel,
      title,
      resolvedBody,
    );
    return success(notification, 201);
  }

  // POST /notifications/bulk-send
  if (method === "POST" && segments[1] === "bulk-send" && segments.length === 2) {
    const body = await parseBody<{
      userIds: unknown;
      type: unknown;
      channel: unknown;
      title: unknown;
      body: unknown;
    }>(req);
    if (!body) return error("Invalid or missing request body");

    const errors = validate([
      {
        field: "userIds",
        valid: isArray(body.userIds) && (body.userIds as unknown[]).length > 0,
        message: "userIds must be a non-empty array",
      },
      { field: "type", valid: isNonEmptyString(body.type), message: "type is required" },
      { field: "channel", valid: isNonEmptyString(body.channel), message: "channel is required" },
      { field: "title", valid: isNonEmptyString(body.title), message: "title is required" },
      { field: "body", valid: isNonEmptyString(body.body), message: "body is required" },
    ]);
    if (errors.length > 0) return error(formatValidationErrors(errors));

    const userIds = body.userIds as string[];
    const created: Notification[] = [];
    for (const userId of userIds) {
      const n = createNotification(
        userId,
        body.type as Notification["type"],
        body.channel as NotificationChannel,
        body.title as string,
        body.body as string,
      );
      created.push(n);
    }
    return success({ sent: created.length, notifications: created });
  }

  // POST /notifications/bulk/read — mark multiple as read
  if (method === "POST" && segments[1] === "bulk" && segments[2] === "read" && segments.length === 3) {
    const body = await parseBody<{ ids: unknown }>(req);
    if (!body) return error("Invalid or missing request body");

    if (!isArray(body.ids)) {
      return error("ids must be an array");
    }
    const ids = body.ids as unknown[];
    if (ids.length === 0) {
      return error("ids must not be empty");
    }

    const updated = bulkMarkAsRead(ids as string[]);
    return success({ updated });
  }

  // GET /notifications/unread-count?userId=
  if (method === "GET" && segments[1] === "unread-count" && segments.length === 2) {
    const userId = params.get("userId");
    if (!userId || !userId.trim()) {
      return error("userId query parameter is required");
    }
    return success({ userId, count: getUnreadCount(userId) });
  }

  // GET /notifications/user/:userId
  if (method === "GET" && segments[1] === "user" && segments.length === 3) {
    const userId = segments[2];
    const notifications = getUserNotifications(userId);
    return success(notifications);
  }

  // GET /notifications/user/:userId/unread
  if (method === "GET" && segments[1] === "user" && segments[3] === "unread" && segments.length === 4) {
    const userId = segments[2];
    const count = getUnreadCount(userId);
    return success({ unread: count });
  }

  // --- Action routes on individual notifications ---

  // POST /notifications/:id/send
  if (method === "POST" && segments.length === 3 && segments[2] === "send") {
    const id = segments[1];
    const existing = getNotification(id);
    if (!existing) return notFound("Notification not found");
    const sent = sendNotification(id);
    if (!sent) return error("Notification already sent");
    return success(sent);
  }

  // POST /notifications/:id/read — mark as read (handlers.test.ts uses POST)
  if (method === "POST" && segments.length === 3 && segments[2] === "read") {
    const id = segments[1];
    const existing = getNotification(id);
    if (!existing) return notFound("Notification not found");
    const updated = markAsRead(id);
    return success(updated);
  }

  // PATCH /notifications/:id/read — mark as read (notifications.test.ts uses PATCH)
  if (method === "PATCH" && segments.length === 3 && segments[2] === "read") {
    const id = segments[1];
    const existing = getNotification(id);
    if (!existing) return notFound("Notification not found");
    const updated = markAsRead(id);
    return success(updated);
  }

  // PATCH /notifications/:id/unread — mark as unread
  if (method === "PATCH" && segments.length === 3 && segments[2] === "unread") {
    const id = segments[1];
    const existing = getNotification(id);
    if (!existing) return notFound("Notification not found");
    const updated = markAsUnread(id);
    return success(updated);
  }

  // --- Standard CRUD ---

  // POST /notifications
  if (method === "POST" && segments.length === 1) {
    const body = await parseBody<{
      userId: unknown;
      type: unknown;
      channel: unknown;
      title: unknown;
      body: unknown;
    }>(req);
    if (!body) return error("Invalid or missing request body");

    const errors = validate([
      { field: "userId", valid: isNonEmptyString(body.userId), message: "userId is required" },
      { field: "type", valid: isNonEmptyString(body.type), message: "type is required" },
      {
        field: "channel",
        valid: isNonEmptyString(body.channel) && VALID_CHANNELS.includes(body.channel as string),
        message: "channel must be one of: email, sms, push, in_app",
      },
      { field: "title", valid: isNonEmptyString(body.title), message: "title is required" },
      { field: "body", valid: isNonEmptyString(body.body), message: "body is required" },
    ]);
    if (errors.length > 0) return error(formatValidationErrors(errors));

    const notification = createNotification(
      body.userId as string,
      body.type as Notification["type"],
      body.channel as NotificationChannel,
      body.title as string,
      body.body as string,
    );
    return success(notification, 201);
  }

  // GET /notifications — list all with optional filters and pagination
  if (method === "GET" && segments.length === 1) {
    const userId = params.get("userId") || undefined;
    const typeFilter = params.get("type") || undefined;
    const channelFilter = params.get("channel") || undefined;
    const readParam = params.get("read");
    const page = parseInt(params.get("page") || "1", 10);
    const pageSize = parseInt(params.get("pageSize") || "100", 10);

    // Validate filter values when provided
    const VALID_TYPES = ["order", "payment", "promotion", "system", "alert"];
    if (typeFilter && !VALID_TYPES.includes(typeFilter)) {
      return error(`type must be one of: ${VALID_TYPES.join(", ")}`);
    }
    if (channelFilter && !VALID_CHANNELS.includes(channelFilter)) {
      return error(`channel must be one of: ${VALID_CHANNELS.join(", ")}`);
    }

    let readFilter: boolean | undefined;
    if (readParam === "true") readFilter = true;
    else if (readParam === "false") readFilter = false;

    let all: Notification[];
    if (userId || typeFilter || channelFilter || readFilter !== undefined) {
      all = filterNotifications({
        userId,
        type: typeFilter as Notification["type"],
        channel: channelFilter as NotificationChannel,
        read: readFilter,
      });
    } else {
      all = getAllNotifications();
    }

    const total = all.length;
    const start = (page - 1) * pageSize;
    const slice = all.slice(start, start + pageSize);

    return paginated(slice, total, page, pageSize);
  }

  // GET /notifications/:id
  if (method === "GET" && segments.length === 2) {
    const id = segments[1];
    const notification = getNotification(id);
    if (!notification) return notFound("Notification not found");
    return success(notification);
  }

  // PUT /notifications/:id
  if (method === "PUT" && segments.length === 2) {
    const id = segments[1];
    const existing = getNotification(id);
    if (!existing) return notFound("Notification not found");

    const body = await parseBody<Record<string, unknown>>(req);
    if (!body) return error("Invalid or missing request body");

    const updates: Partial<Notification> = {};
    if (body.title !== undefined) {
      if (!isNonEmptyString(body.title)) return error("title must be a non-empty string");
      updates.title = body.title as string;
    }
    if (body.body !== undefined) {
      if (!isNonEmptyString(body.body)) return error("body must be a non-empty string");
      updates.body = body.body as string;
    }
    if (body.type !== undefined) {
      if (!isNonEmptyString(body.type)) return error("type must be a non-empty string");
      updates.type = body.type as Notification["type"];
    }
    if (body.channel !== undefined) {
      if (!isNonEmptyString(body.channel)) return error("channel must be a non-empty string");
      updates.channel = body.channel as NotificationChannel;
    }
    if (body.read !== undefined) {
      if (typeof body.read !== "boolean") return error("read must be a boolean");
      updates.read = body.read;
    }

    const updated = updateNotification(id, updates);
    return success(updated);
  }

  // DELETE /notifications/:id
  if (method === "DELETE" && segments.length === 2) {
    const id = segments[1];
    const existing = getNotification(id);
    if (!existing) return notFound("Notification not found");
    deleteNotification(id);
    return success({ deleted: true });
  }

  return notFound("Route not found");
}
