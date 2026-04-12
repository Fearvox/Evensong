import { describe, test, expect, beforeEach } from "bun:test";

// Import handlers from each service
import { handleRequest as authHandler } from "../../auth/handlers";
import { handleRequest as usersHandler } from "../../users/handlers";
import { handleRequest as productsHandler } from "../../products/handlers";
import { handleRequest as ordersHandler } from "../../orders/handlers";
import { handleRequest as paymentsHandler } from "../../payments/handlers";
import { handleRequest as notificationsHandler } from "../../notifications/handlers";
import { handleRequest as analyticsHandler } from "../../analytics/handlers";
import { handleRequest as searchHandler } from "../../search/handlers";

// Import stores to reset between tests
import { authStore } from "../../auth/store";
import { userStore } from "../../users/store";
import { productStore } from "../../products/store";
import { orderStore } from "../../orders/store";
import { paymentStore } from "../../payments/store";
import { notificationStore } from "../../notifications/store";
import { analyticsStore } from "../../analytics/store";
import { searchStore } from "../../search/store";

function post(handler: Function, path: string, body: unknown) {
  return handler(new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function get(handler: Function, path: string) {
  return handler(new Request(`http://localhost${path}`));
}

function patch(handler: Function, path: string, body: unknown) {
  return handler(new Request(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("Cross-Service Workflow: User Registration → Order → Payment → Notification", () => {
  beforeEach(() => {
    authStore.clear();
    userStore.clear();
    productStore.clear();
    orderStore.clear();
    paymentStore.clear();
    notificationStore.clear();
    analyticsStore.clear();
    searchStore.clear();
  });

  test("full e-commerce lifecycle", async () => {
    // Step 1: Register user via auth service
    const registerRes = await post(authHandler, "/auth/register", {
      email: "buyer@test.com",
      name: "Test Buyer",
      password: "securePass123",
    });
    expect(registerRes.status).toBe(201);
    const registerData = await registerRes.json();
    expect(registerData.success).toBe(true);
    const userId = registerData.data.user.id;
    const token = registerData.data.token;

    // Step 2: Create user profile in users service
    const createUserRes = await post(usersHandler, "/users", {
      name: "Test Buyer",
      email: "buyer@test.com",
      role: "user",
    });
    expect(createUserRes.status).toBe(201);

    // Step 3: Create a product
    const createProductRes = await post(productsHandler, "/products", {
      name: "Wireless Mouse",
      description: "Ergonomic wireless mouse",
      price: 29.99,
      currency: "USD",
      category: "electronics",
      stock: 100,
      tags: ["mouse", "wireless"],
    });
    expect(createProductRes.status).toBe(201);
    const productData = await createProductRes.json();
    const productId = productData.data.id;

    // Step 4: Create an order
    const createOrderRes = await post(ordersHandler, "/orders", {
      userId,
      items: [{
        productId,
        name: "Wireless Mouse",
        quantity: 2,
        unitPrice: 29.99,
      }],
      currency: "USD",
      shippingAddress: "123 Main St",
    });
    expect(createOrderRes.status).toBe(201);
    const orderData = await createOrderRes.json();
    const orderId = orderData.data.id;
    expect(orderData.data.total).toBe(59.98);

    // Step 5: Process payment
    const createPaymentRes = await post(paymentsHandler, "/payments", {
      orderId,
      userId,
      amount: 59.98,
      currency: "USD",
      method: "credit_card",
    });
    expect(createPaymentRes.status).toBe(201);
    const paymentData = await createPaymentRes.json();
    const paymentId = paymentData.data.id;

    // Process the payment
    const processRes = await post(paymentsHandler, `/payments/${paymentId}/process`, {});
    expect(processRes.status).toBe(200);
    const processData = await processRes.json();
    expect(processData.data.status).toBe("completed");

    // Step 6: Send notification
    const notifyRes = await post(notificationsHandler, "/notifications", {
      userId,
      type: "order",
      channel: "email",
      title: "Order Confirmed",
      body: `Your order ${orderId} has been paid.`,
    });
    expect(notifyRes.status).toBe(201);
    const notifyData = await notifyRes.json();
    const notificationId = notifyData.data.id;

    // Send the notification
    const sendRes = await post(notificationsHandler, `/notifications/${notificationId}/send`, {});
    expect(sendRes.status).toBe(200);

    // Step 7: Track analytics event
    const trackRes = await post(analyticsHandler, "/analytics/events", {
      eventType: "purchase_completed",
      userId,
      properties: { orderId, amount: 59.98, currency: "USD" },
    });
    expect(trackRes.status).toBe(201);

    // Step 8: Index order in search
    const indexRes = await post(searchHandler, "/search/index", {
      collection: "orders",
      content: { orderId, userId, total: 59.98 },
      text: `order ${orderId} wireless mouse buyer`,
    });
    expect(indexRes.status).toBe(201);

    // Verify: search for the indexed order
    const searchRes = await get(searchHandler, "/search?q=wireless+mouse&collection=orders");
    expect(searchRes.status).toBe(200);
    const searchData = await searchRes.json();
    expect(searchData.data.length).toBeGreaterThan(0);
  });

  test("order status progression workflow", async () => {
    // Create order
    const orderRes = await post(ordersHandler, "/orders", {
      userId: "user-1",
      items: [{ productId: "p-1", name: "Laptop", quantity: 1, unitPrice: 999.99 }],
      currency: "USD",
    });
    const order = await orderRes.json();
    const orderId = order.data.id;

    // Progress: pending → confirmed → processing → shipped → delivered
    const transitions = ["confirmed", "processing", "shipped", "delivered"];
    for (const status of transitions) {
      const res = await patch(ordersHandler, `/orders/${orderId}/status`, { status });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe(status);
    }

    // Verify final state
    const finalRes = await get(ordersHandler, `/orders/${orderId}`);
    const finalData = await finalRes.json();
    expect(finalData.data.status).toBe("delivered");
  });

  test("payment and refund workflow", async () => {
    // Create and process payment
    const payRes = await post(paymentsHandler, "/payments", {
      orderId: "order-1",
      userId: "user-1",
      amount: 150.00,
      currency: "EUR",
      method: "bank_transfer",
    });
    const payment = await payRes.json();
    const paymentId = payment.data.id;

    await post(paymentsHandler, `/payments/${paymentId}/process`, {});

    // Refund
    const refundRes = await post(paymentsHandler, `/payments/${paymentId}/refund`, {});
    expect(refundRes.status).toBe(200);
    const refundData = await refundRes.json();
    expect(refundData.data.status).toBe("refunded");

    // Send refund notification
    const notifyRes = await post(notificationsHandler, "/notifications", {
      userId: "user-1",
      type: "payment",
      channel: "email",
      title: "Refund Processed",
      body: "Your payment of 150.00 EUR has been refunded.",
    });
    expect(notifyRes.status).toBe(201);
  });

  test("analytics funnel with multi-step user journey", async () => {
    const userId = "funnel-user-1";

    // Track user journey events
    const events = [
      { eventType: "page_view", userId, properties: { page: "/products" } },
      { eventType: "add_to_cart", userId, properties: { productId: "p-1" } },
      { eventType: "checkout_start", userId, properties: {} },
      { eventType: "purchase_completed", userId, properties: { amount: 99.99 } },
    ];

    for (const event of events) {
      const res = await post(analyticsHandler, "/analytics/events", event);
      expect(res.status).toBe(201);
    }

    // Check funnel
    const funnelRes = await get(analyticsHandler,
      "/analytics/funnel?steps=page_view,add_to_cart,checkout_start,purchase_completed");
    expect(funnelRes.status).toBe(200);
    const funnelData = await funnelRes.json();
    expect(funnelData.data).toBeDefined();
  });

  test("search across multiple collections", async () => {
    // Index products
    await post(searchHandler, "/search/index", {
      collection: "products",
      content: { name: "Gaming Keyboard" },
      text: "gaming keyboard mechanical rgb backlit",
    });

    // Index users
    await post(searchHandler, "/search/index", {
      collection: "users",
      content: { name: "John Gamer" },
      text: "john gamer pro player esports",
    });

    // Search across all collections
    const allRes = await get(searchHandler, "/search?q=gaming");
    expect(allRes.status).toBe(200);
    const allData = await allRes.json();
    expect(allData.data.length).toBeGreaterThanOrEqual(1);

    // Search specific collection
    const prodRes = await get(searchHandler, "/search?q=gaming&collection=products");
    expect(prodRes.status).toBe(200);
    const prodData = await prodRes.json();
    expect(prodData.data.length).toBe(1);
  });

  test("notification template workflow", async () => {
    // Create template
    const templateRes = await post(notificationsHandler, "/notifications/template", {
      name: "order_confirmation",
      title: "Order {{orderId}} Confirmed",
      body: "Hi {{userName}}, your order {{orderId}} for {{amount}} has been confirmed.",
    });
    expect(templateRes.status).toBe(201);

    // Use template to create notification
    const fromTemplateRes = await post(notificationsHandler, "/notifications/from-template", {
      templateName: "order_confirmation",
      userId: "user-1",
      channel: "email",
      type: "order",
      variables: {
        orderId: "ORD-123",
        userName: "Alice",
        amount: "$59.99",
      },
    });
    expect(fromTemplateRes.status).toBe(201);
    const notif = await fromTemplateRes.json();
    expect(notif.data.title).toBe("Order ORD-123 Confirmed");
    expect(notif.data.body).toContain("Alice");
    expect(notif.data.body).toContain("$59.99");
  });

  test("user activity tracking across services", async () => {
    // Create user
    const userRes = await post(usersHandler, "/users", {
      name: "Active User",
      email: "active@test.com",
      role: "user",
    });
    const userData = await userRes.json();
    const userId = userData.data.id;

    // Log activity
    await post(usersHandler, `/users/${userId}/activity`, { action: "logged_in" });
    await post(usersHandler, `/users/${userId}/activity`, { action: "viewed_products" });
    await post(usersHandler, `/users/${userId}/activity`, { action: "placed_order" });

    // Check activity log
    const activityRes = await get(usersHandler, `/users/${userId}/activity`);
    expect(activityRes.status).toBe(200);
    const activityData = await activityRes.json();
    expect(activityData.data.length).toBe(3);

    // Track same events in analytics
    await post(analyticsHandler, "/analytics/events", {
      eventType: "user_login", userId, properties: {},
    });
    await post(analyticsHandler, "/analytics/events", {
      eventType: "product_view", userId, properties: {},
    });

    // Verify analytics has the events
    const analyticsRes = await get(analyticsHandler, `/analytics/user/${userId}`);
    expect(analyticsRes.status).toBe(200);
    const analyticsData = await analyticsRes.json();
    expect(analyticsData.data.length).toBe(2);
  });

  test("health checks across all services", async () => {
    const checks = [
      { handler: authHandler, path: "/auth/health" },
      { handler: usersHandler, path: "/users/health" },
      { handler: productsHandler, path: "/products/health" },
      { handler: ordersHandler, path: "/orders/health" },
      { handler: paymentsHandler, path: "/payments/health" },
      { handler: notificationsHandler, path: "/notifications/health" },
      { handler: analyticsHandler, path: "/analytics/health" },
      { handler: searchHandler, path: "/search/health" },
    ];

    for (const { handler, path } of checks) {
      const res = await get(handler, path);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    }
  });
});
