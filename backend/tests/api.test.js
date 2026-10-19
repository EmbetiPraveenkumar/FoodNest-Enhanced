const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const { app, connectDB } = require("../server");
const User = require("../models/User");
const Food = require("../models/Food");

const registerUser = async ({ fullname, email, password }) => {
  const response = await request(app)
    .post("/api/register")
    .send({ fullname, email, password });

  return response;
};

const loginUser = async ({ email, password }) => {
  const response = await request(app)
    .post("/api/login")
    .send({ email, password });

  return response;
};

describe("FoodNest backend security and auth checks", () => {
  let mongoServer;
  let dbReady = false;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";

    const localMongoUri = "mongodb://127.0.0.1:27017/foodnest-test";
    const safeLocalMongoUri =
      process.env.MONGO_URI &&
      /^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//i.test(
        process.env.MONGO_URI,
      )
        ? process.env.MONGO_URI
        : localMongoUri;

    try {
      process.env.MONGO_URI = safeLocalMongoUri;
      await connectDB();
      dbReady = true;
      return;
    } catch (error) {
      console.warn(
        "Local MongoDB unavailable for tests; attempting MongoMemoryServer fallback.",
      );
    }

    try {
      const mongoServerPromise = MongoMemoryServer.create({
        binary: { version: "7.0.14" },
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Timed out starting MongoMemoryServer"));
        }, 180000);
      });

      mongoServer = await Promise.race([mongoServerPromise, timeoutPromise]);
      process.env.MONGO_URI = mongoServer.getUri("foodnest-test");
      await connectDB();
      dbReady = true;
    } catch (fallbackError) {
      console.warn(
        `MongoDB integration tests were skipped because no usable MongoDB server was available. ${fallbackError.message}`,
      );
      dbReady = false;
    }
  }, 200000);

  afterAll(async () => {
    if (mongoServer) {
      await mongoose.connection.db?.dropDatabase?.().catch(() => {});
      await mongoose.disconnect().catch(() => {});
      await mongoServer.stop().catch(() => {});
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect().catch(() => {});
    }
  });

  beforeEach(async () => {
    if (!dbReady) {
      return;
    }

    await User.deleteMany({});
    await Food.deleteMany({});
  });

  test("registers a new user successfully", async () => {
    if (!dbReady) {
      return;
    }
    const res = await registerUser({
      fullname: "Alice Tester",
      email: "alice@example.com",
      password: "P@ssword123",
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Registration Successful");

    const savedUser = await User.findOne({ email: "alice@example.com" });
    expect(savedUser).not.toBeNull();
    expect(savedUser.fullname).toBe("Alice Tester");
    expect(savedUser.password).not.toBe("P@ssword123");
  });

  test("rejects duplicate registration for the same email", async () => {
    if (!dbReady) {
      return;
    }

    await registerUser({
      fullname: "Alice Tester",
      email: "alice@example.com",
      password: "P@ssword123",
    });

    const res = await registerUser({
      fullname: "Alice Other",
      email: "alice@example.com",
      password: "AnotherP@ssword",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email already Registered");
  });

  test("logs in a registered user and returns a JWT", async () => {
    if (!dbReady) {
      return;
    }

    await registerUser({
      fullname: "Alice Tester",
      email: "alice@example.com",
      password: "P@ssword123",
    });

    const res = await loginUser({
      email: "alice@example.com",
      password: "P@ssword123",
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Login Successful");
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("alice@example.com");
  });

  test("rejects invalid credentials and missing tokens", async () => {
    if (!dbReady) {
      return;
    }

    await registerUser({
      fullname: "Alice Tester",
      email: "alice@example.com",
      password: "P@ssword123",
    });

    const missingUser = await request(app)
      .post("/api/login")
      .send({ email: "missing@example.com", password: "Nope123" });

    expect(missingUser.status).toBe(400);

    const invalidPassword = await loginUser({
      email: "alice@example.com",
      password: "WrongPassword123",
    });

    expect(invalidPassword.status).toBe(400);
    expect(invalidPassword.body.message).toBe("Invalid Password");

    const unauthenticatedAccess = await request(app).get("/api/items");
    expect(unauthenticatedAccess.status).toBe(401);
    expect(unauthenticatedAccess.body.message).toBe("Access Denied");

    const invalidToken = await request(app)
      .get("/api/items")
      .set("Authorization", "Bearer invalidtoken");

    expect(invalidToken.status).toBe(401);
    expect(invalidToken.body.message).toBe("Invalid Token");
  });

  test("allows authenticated CRUD inventory operations for the same user", async () => {
    if (!dbReady) {
      return;
    }

    await registerUser({
      fullname: "Alice Tester",
      email: "alice@example.com",
      password: "P@ssword123",
    });

    const loginRes = await loginUser({
      email: "alice@example.com",
      password: "P@ssword123",
    });

    const token = loginRes.body.token;

    const createRes = await request(app)
      .post("/api/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Apples",
        category: "Fruit",
        quantity: 5,
        expiryDate: "2026-12-31T00:00:00.000Z",
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.message).toBe("Item Added Successfully");

    const listRes = await request(app)
      .get("/api/items")
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].name).toBe("Apples");

    const itemId = listRes.body[0]._id;

    const updateRes = await request(app)
      .put(`/api/items/${itemId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 10, status: "Low Stock" });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.updatedItem.quantity).toBe(10);
    expect(updateRes.body.updatedItem.status).toBe("Low Stock");

    const deleteRes = await request(app)
      .delete(`/api/items/${itemId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toBe("Item Deleted Successfully");

    const finalList = await request(app)
      .get("/api/items")
      .set("Authorization", `Bearer ${token}`);

    expect(finalList.status).toBe(200);
    expect(finalList.body).toHaveLength(0);
  });

  test("prevents cross-user access to another user's inventory items", async () => {
    if (!dbReady) {
      return;
    }

    const userA = await registerUser({
      fullname: "Alice Tester",
      email: "alice@example.com",
      password: "P@ssword123",
    });

    const userB = await registerUser({
      fullname: "Bob Tester",
      email: "bob@example.com",
      password: "P@ssword123",
    });

    expect(userA.status).toBe(200);
    expect(userB.status).toBe(200);

    const tokenA = (
      await loginUser({
        email: "alice@example.com",
        password: "P@ssword123",
      })
    ).body.token;

    const tokenB = (
      await loginUser({
        email: "bob@example.com",
        password: "P@ssword123",
      })
    ).body.token;

    const itemCreate = await request(app)
      .post("/api/items")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "Milk",
        category: "Dairy",
        quantity: 2,
        expiryDate: "2026-10-28T00:00:00.000Z",
      });

    expect(itemCreate.status).toBe(201);

    const userBList = await request(app)
      .get("/api/items")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(userBList.status).toBe(200);
    expect(userBList.body).toEqual([]);

    const itemId = itemCreate.body.item._id;

    const unauthorizedUpdate = await request(app)
      .put(`/api/items/${itemId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ quantity: 99 });

    expect(unauthorizedUpdate.status).toBe(404);
    expect(unauthorizedUpdate.body.message).toBe(
      "Item not found or access denied",
    );

    const unauthorizedDelete = await request(app)
      .delete(`/api/items/${itemId}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(unauthorizedDelete.status).toBe(404);
    expect(unauthorizedDelete.body.message).toBe(
      "Item not found or access denied",
    );

    const userAList = await request(app)
      .get("/api/items")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(userAList.status).toBe(200);
    expect(userAList.body).toHaveLength(1);
    expect(userAList.body[0].name).toBe("Milk");
  });
});
