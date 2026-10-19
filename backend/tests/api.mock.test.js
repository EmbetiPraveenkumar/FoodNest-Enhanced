jest.mock("mongoose", () => ({
  connection: { readyState: 0 },
  connect: jest.fn(),
}));

const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
};

const mockFoodModel = {
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
};

jest.mock("../models/User", () => {
  const MockUser = jest.fn(function (data) {
    this._id = data._id || "generated-user-id";
    this.fullname = data.fullname;
    this.email = data.email;
    this.password = data.password;
    this.save = jest.fn().mockResolvedValue(this);
  });

  Object.assign(MockUser, mockUserModel);

  return MockUser;
});

jest.mock("../models/Food", () => {
  const MockFood = jest.fn(function (data) {
    this._id = data._id || "generated-item-id";
    this.userId = data.userId;
    this.name = data.name;
    this.category = data.category;
    this.quantity = data.quantity;
    this.expiryDate = data.expiryDate;
    this.status = data.status || "In Stock";
    this.save = jest.fn().mockResolvedValue(this);
  });

  Object.assign(MockFood, mockFoodModel);

  return MockFood;
});

jest.mock("bcryptjs", () => ({
  hash: jest.fn(async (password) => `hashed:${password}`),
  compare: jest.fn(
    async (password, storedPassword) => storedPassword === `hashed:${password}`,
  ),
}));

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn((payload) => `mock-token-for-${payload.email}-${payload.id}`),
  verify: jest.fn(),
}));

const request = require("supertest");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Food = require("../models/Food");
const { app } = require("../server");

describe("FoodNest backend mocked API checks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret-key";

    jwt.verify.mockImplementation((token) => {
      if (token === "valid-alice") {
        return { id: "user-1", email: "alice@example.com" };
      }

      if (token === "valid-bob") {
        return { id: "user-2", email: "bob@example.com" };
      }

      throw new Error("Invalid Token");
    });
  });

  test("registers a new user successfully", async () => {
    User.findOne.mockResolvedValue(null);

    const response = await request(app).post("/api/register").send({
      fullname: "Alice Tester",
      email: "alice@example.com",
      password: "P@ssword123",
    });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Registration Successful");
    expect(User.findOne).toHaveBeenCalledWith({ email: "alice@example.com" });
    expect(bcrypt.hash).toHaveBeenCalledWith("P@ssword123", 10);
    expect(User).toHaveBeenCalled();
    const createdUser = User.mock.instances[0];
    expect(createdUser.password).toBe("hashed:P@ssword123");
  });

  test("rejects duplicate registration for the same email", async () => {
    User.findOne.mockResolvedValue({
      _id: "user-1",
      email: "alice@example.com",
    });

    const response = await request(app).post("/api/register").send({
      fullname: "Alice Tester",
      email: "alice@example.com",
      password: "P@ssword123",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Email already Registered");
  });

  test("logs in a registered user and returns a JWT", async () => {
    User.findOne.mockResolvedValue({
      _id: "user-1",
      fullname: "Alice Tester",
      email: "alice@example.com",
      password: "hashed:correct-password",
    });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue("mock-token-for-alice@example.com-user-1");

    const response = await request(app)
      .post("/api/login")
      .send({ email: "alice@example.com", password: "correct-password" });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Login Successful");
    expect(response.body.token).toBe("mock-token-for-alice@example.com-user-1");
    expect(response.body.user.email).toBe("alice@example.com");
    expect(jwt.sign).toHaveBeenCalledWith(
      { id: "user-1", email: "alice@example.com" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
  });

  test("rejects invalid credentials and missing/invalid tokens", async () => {
    User.findOne.mockResolvedValue({
      _id: "user-1",
      email: "alice@example.com",
      password: "hashed:correct-password",
    });
    bcrypt.compare.mockResolvedValue(false);

    const missingUserResponse = await request(app)
      .post("/api/login")
      .send({ email: "alice@example.com", password: "wrong-password" });

    expect(missingUserResponse.status).toBe(400);
    expect(missingUserResponse.body.message).toBe("Invalid Password");

    const missingTokenResponse = await request(app).get("/api/items");
    expect(missingTokenResponse.status).toBe(401);
    expect(missingTokenResponse.body.message).toBe("Access Denied");

    const invalidTokenResponse = await request(app)
      .get("/api/items")
      .set("Authorization", "Bearer invalid-token");

    expect(invalidTokenResponse.status).toBe(401);
    expect(invalidTokenResponse.body.message).toBe("Invalid Token");
  });

  test("allows authenticated inventory CRUD for the same user", async () => {
    jwt.verify.mockImplementation((token) => {
      if (token === "valid-alice") {
        return { id: "user-1", email: "alice@example.com" };
      }
      throw new Error("Invalid Token");
    });

    const createdItem = {
      _id: "item-1",
      userId: "user-1",
      name: "Apples",
      category: "Fruit",
      quantity: 5,
      expiryDate: "2026-12-31T00:00:00.000Z",
      status: "In Stock",
    };

    Food.mockImplementation(function (data) {
      this._id = data._id || "item-1";
      this.userId = data.userId;
      this.name = data.name;
      this.category = data.category;
      this.quantity = data.quantity;
      this.expiryDate = data.expiryDate;
      this.status = data.status || "In Stock";
      this.save = jest.fn().mockResolvedValue({ ...data, _id: "item-1" });
      return this;
    });

    Food.find.mockResolvedValue([createdItem]);
    Food.findOneAndUpdate.mockResolvedValue({
      ...createdItem,
      quantity: 10,
      status: "Low Stock",
    });
    Food.findOneAndDelete.mockResolvedValue({ ...createdItem });

    const createResponse = await request(app)
      .post("/api/items")
      .set("Authorization", "Bearer valid-alice")
      .send({
        name: "Apples",
        category: "Fruit",
        quantity: 5,
        expiryDate: "2026-12-31T00:00:00.000Z",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.message).toBe("Item Added Successfully");
    const createdFood = Food.mock.instances[0];
    expect(createdFood.userId).toBe("user-1");

    const listResponse = await request(app)
      .get("/api/items")
      .set("Authorization", "Bearer valid-alice");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
    expect(Food.find).toHaveBeenCalledWith({ userId: "user-1" });

    const updateResponse = await request(app)
      .put("/api/items/item-1")
      .set("Authorization", "Bearer valid-alice")
      .send({ quantity: 10, status: "Low Stock" });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.updatedItem.quantity).toBe(10);
    expect(updateResponse.body.updatedItem.status).toBe("Low Stock");
    expect(Food.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "item-1", userId: "user-1" },
      { quantity: 10, status: "Low Stock" },
      { new: true },
    );

    const deleteResponse = await request(app)
      .delete("/api/items/item-1")
      .set("Authorization", "Bearer valid-alice");

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.message).toBe("Item Deleted Successfully");
    expect(Food.findOneAndDelete).toHaveBeenCalledWith({
      _id: "item-1",
      userId: "user-1",
    });
  });

  test("blocks cross-user read, update, and delete access to inventory items", async () => {
    jwt.verify.mockImplementation((token) => {
      if (token === "valid-alice") {
        return { id: "user-1", email: "alice@example.com" };
      }

      if (token === "valid-bob") {
        return { id: "user-2", email: "bob@example.com" };
      }

      throw new Error("Invalid Token");
    });

    const milkItem = {
      _id: "item-1",
      userId: "user-1",
      name: "Milk",
      category: "Dairy",
      quantity: 2,
      expiryDate: "2026-10-28T00:00:00.000Z",
      status: "In Stock",
    };

    Food.find.mockResolvedValueOnce([]).mockResolvedValueOnce([milkItem]);
    Food.findOneAndUpdate.mockResolvedValueOnce(null);
    Food.findOneAndDelete.mockResolvedValueOnce(null);

    const userBListResponse = await request(app)
      .get("/api/items")
      .set("Authorization", "Bearer valid-bob");

    expect(userBListResponse.status).toBe(200);
    expect(userBListResponse.body).toEqual([]);
    expect(Food.find).toHaveBeenLastCalledWith({ userId: "user-2" });

    const unauthorizedUpdateResponse = await request(app)
      .put("/api/items/item-1")
      .set("Authorization", "Bearer valid-bob")
      .send({ quantity: 99 });

    expect(unauthorizedUpdateResponse.status).toBe(404);
    expect(unauthorizedUpdateResponse.body.message).toBe(
      "Item not found or access denied",
    );
    expect(Food.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "item-1", userId: "user-2" },
      { quantity: 99 },
      { new: true },
    );

    const unauthorizedDeleteResponse = await request(app)
      .delete("/api/items/item-1")
      .set("Authorization", "Bearer valid-bob");

    expect(unauthorizedDeleteResponse.status).toBe(404);
    expect(unauthorizedDeleteResponse.body.message).toBe(
      "Item not found or access denied",
    );
    expect(Food.findOneAndDelete).toHaveBeenCalledWith({
      _id: "item-1",
      userId: "user-2",
    });

    const userAListResponse = await request(app)
      .get("/api/items")
      .set("Authorization", "Bearer valid-alice");

    expect(userAListResponse.status).toBe(200);
    expect(userAListResponse.body).toHaveLength(1);
    expect(userAListResponse.body[0].name).toBe("Milk");
    expect(Food.find).toHaveBeenLastCalledWith({ userId: "user-1" });
  });
});
