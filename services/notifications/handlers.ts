// Notifications service — request handler (pure function, no Bun.serve)

import {
  success,
  error,
  notFound,
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
  sendNotification,
  filterNotifications,
  getUnreadCount,
  createTemplate,
  getTemplate,
  getAllTemplates,
  applyTemplate,
} from "./store";

export async function handleRequest(req: Request): Promise<Response> {
  const method = req.method.toUpperCase();
  const segments = getPathSegments(req.url);
  const params = getQueryParams(req.url);

  // All routes start with /notifications
  if (segments[0] !== "notifications") {
    return notFound("Route not found");
  }

  // --- Template routes (must match before :id to avoid collision) ---

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
      body.channel as string,
      body.subject as string,
      body.body as string,
    );
    return success(template, 201);
  }

  // GET /notifications/templates
  if (method === "GET" && segments[1] === "templates" && segments.length === 2) {
    return success(getAllTemplates());
  }

  // POST /notifications/from-template
  if (method === "POST" && segments[1] === "from-template" && segments.length === 2) {
    const body = await parseBody<{
      templateId: unknown;
      userId: unknown;
      variables: unknown;
    }>(req);
    if (!body) return error("Invalid or missing request body");

    const errors = validate([
      { field: "templateId", valid: isNonEmptyString(body.templateId), message: "templateId is required" },
      { field: "userId", valid: isNonEmptyString(body.userId), message: "userId is required" },
    ]);
    if (errors.length > 0) return error(formatValidationErrors(errors));

    const template = getTemplate(body.templateId as string);
    if (!template) return notFound("Template not found");

    const variables = isObject(body.variables)
      ? (body.variables as Record<string, string>)
      : {};

    const { subject, body: resolvedBody } = applyTemplate(template, variables);

    const notification = createNotification(
      body.userId as string,
      template.channel as Notification["type"],
      template.channel as NotificationChannel,
      subject,
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

  // GET /notifications/unread-count?userId=
  if (method === "GET" && segments[1] === "unread-count" && segments.length === 2) {
    const userId = params.get("userId");
    if (!userId || !userId.trim()) {
      return error("userId query parameter is required");
    }
    return success({ userId, count: getUnreadCount(userId) });
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

  // POST /notifications/:id/read
  if (method === "POST" && segments.length === 3 && segments[2] === "read") {
    const id = segments[1];
    const existing = getNotification(id);
    if (!existing) return notFound("Notification not found");
    const updated = markAsRead(id);
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

    // Accept any non-empty string for type (flexible per contract)
    const errors = validate([
      { field: "userId", valid: isNonEmptyString(body.userId), message: "userId is required" },
      { field: "type", valid: isNonEmptyString(body.type), message: "type is required" },
      { field: "channel", valid: isNonEmptyString(body.channel), message: "channel is required" },
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

  // GET /notifications — list all with optional filters
  if (method === "GET" && segments.length === 1) {
    const userId = params.get("userId") || undefined;
    const type = params.get("type") || undefined;
    const readParam = params.get("read");

    let readFilter: boolean | undefined;
    if (readParam === "true") readFilter = true;
    else if (readParam === "false") readFilter = false;

    if (userId || type || readFilter !== undefined) {
      const filtered = filterNotifications({
        userId,
        type: type as Notification["type"],
        read: readFilter,
      });
      return success(filtered);
    }
    return success(getAllNotifications());
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
