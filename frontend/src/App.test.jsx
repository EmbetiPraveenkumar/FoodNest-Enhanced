import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axios from "axios";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Courses from "./pages/Courses";

vi.mock("axios");

describe("FoodNest frontend behavior", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("VITE_API_URL", "http://localhost:4000");
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test("ProtectedRoute redirects when no token exists", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  test("ProtectedRoute renders protected content when a token exists", () => {
    localStorage.setItem("token", "valid-token");

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  test("Login succeeds and stores auth data", async () => {
    const user = userEvent.setup();
    axios.post.mockResolvedValue({
      data: {
        message: "Login Successful",
        token: "abc123",
        user: {
          id: "u1",
          fullname: "Alice Tester",
          email: "alice@example.com",
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/home" element={<div>Home page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(
      screen.getByPlaceholderText("Enter your email"),
      "alice@example.com",
    );
    await user.type(
      screen.getByPlaceholderText("Enter password"),
      "P@ssword123",
    );
    await user.click(screen.getByRole("button", { name: /^Login$/i }));

    await waitFor(() => {
      expect(localStorage.getItem("token")).toBe("abc123");
      expect(localStorage.getItem("user")).toContain("alice@example.com");
    });

    expect(screen.getByText("Home page")).toBeInTheDocument();
    expect(window.alert).toHaveBeenCalledWith("Login Successful");
  });

  test("Login failure shows an error alert", async () => {
    const user = userEvent.setup();
    axios.post.mockRejectedValue({
      response: {
        data: {
          message: "Invalid Email or Password",
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(
      screen.getByPlaceholderText("Enter your email"),
      "bob@example.com",
    );
    await user.type(
      screen.getByPlaceholderText("Enter password"),
      "wrong-password",
    );
    await user.click(screen.getByRole("button", { name: /^login$/i }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith("Invalid Email or Password");
    });
  });

  test("Dashboard summary calculations use mocked inventory data", async () => {
    const now = new Date();
    const soon = new Date(now);
    soon.setDate(now.getDate() + 3);
    const expired = new Date(now);
    expired.setDate(now.getDate() - 2);
    const future = new Date(now);
    future.setDate(now.getDate() + 20);

    axios.get.mockResolvedValue({
      data: [
        { _id: "1", name: "Milk", quantity: 8, expiryDate: soon.toISOString() },
        {
          _id: "2",
          name: "Bread",
          quantity: 3,
          expiryDate: expired.toISOString(),
        },
        {
          _id: "3",
          name: "Apples",
          quantity: 12,
          expiryDate: future.toISOString(),
        },
      ],
    });

    localStorage.setItem("token", "valid-token");

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Total Food Items")).toBeInTheDocument();
    });

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getAllByText("1")).toHaveLength(2);
  });

  test("Inventory CSV export includes escaped commas, quotes, and newlines", async () => {
    const now = new Date();
    const later = new Date(now);
    later.setDate(now.getDate() + 20);

    axios.get.mockResolvedValue({
      data: [
        {
          _id: "1",
          name: 'Tomato, "Heirloom"\nFresh',
          category: "Fruit & Veg",
          quantity: 6,
          expiryDate: later.toISOString(),
          status: "In Stock",
        },
      ],
    });

    localStorage.setItem("token", "valid-token");

    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => "blob:url");
    const revokeObjectURLSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(
      <MemoryRouter>
        <Courses />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Food Inventory")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /export inventory csv/i }),
    );

    await waitFor(() => {
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    const blob = createObjectURLSpy.mock.calls[0][0];
    const csvText = await blob.text();

    expect(csvText).toContain("Food Name,Category,Quantity,Expiry Date,Status");
    expect(csvText).toContain('"Tomato, ""Heirloom""\nFresh"');
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:url");
  });
});
