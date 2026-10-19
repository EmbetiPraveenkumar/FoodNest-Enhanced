import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import homebg from "../assets/homebg.png";

function Home() {
  const [foods, setFoods] = useState([]);

  const API_URL = import.meta.env.VITE_API_URL || "";

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("token");

    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchFoods = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/items`, {
        headers: getAuthHeaders(),
      });

      setFoods(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error(
        "Failed to fetch food items:",
        error.response?.data?.message || error.message,
      );
      setFoods([]);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    void fetchFoods();
  }, [fetchFoods]);

  const totalFoods = foods.length;

  const totalQuantity = foods.reduce((sum, food) => {
    const quantity = Number(food?.quantity);
    return Number.isFinite(quantity) ? sum + quantity : sum;
  }, 0);

  const getSafeDate = (value) => {
    if (!value) return null;

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const getDayStart = (date) => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  };

  const today = getDayStart(new Date());

  const expiringSoonItems = foods.filter((food) => {
    const expiry = getSafeDate(food?.expiryDate);
    if (!expiry) return false;

    const expiryDate = getDayStart(expiry);
    const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

    return diffDays >= 0 && diffDays <= 7;
  });

  const expiredItems = foods.filter((food) => {
    const expiry = getSafeDate(food?.expiryDate);
    if (!expiry) return false;

    return getDayStart(expiry) < today;
  });

  const totalExpiringSoon = expiringSoonItems.length;
  const expiredItemsCount = expiredItems.length;

  return (
    <div className="container-fluid vh-90 overflow-hidden px-0 m-0 mx-auto">
      <div className="row align-items-center" style={{ height: "55vh" }}>
        <div className="col-md-6 text-center">
          <h5 className="text-success">Welcome to FoodNest</h5>

          <h1 className="fw-bold mb-0">Manage Food Smarter,</h1>

          <h1 className="text-success fw-bold">Live Healthier</h1>

          <p className="text-muted">
            Track your food items, monitor expiry dates, and reduce food waste
            with ease.
          </p>

          <Link to="/courses" className="btn btn-success px-4">
            Food Dashboard
          </Link>
        </div>

        <div className="col-md-6 text-center">
          <img
            className="img-fluid"
            style={{
              maxHeight: "45vh",
              objectFit: "contain",
            }}
            src={homebg}
            alt="FoodNest"
          />
        </div>
      </div>

      <div className="container">
        <div className="row g-3">
          <div className="col-md-3">
            <div
              className="card border-0 shadow-sm h-100 rounded-4"
              style={{ background: "#d9e4ef" }}
            >
              <div className="card-body text-center">
                <h6>Total Food Items</h6>
                <h3 className="text-primary fw-bold">{totalFoods}</h3>
                <p className="text-muted small mb-0">
                  All items in your inventory
                </p>
              </div>
            </div>
          </div>

          <div className="col-md-3">
            <div
              className="card border-0 shadow-sm h-100 rounded-4"
              style={{ background: "#c3e3cd" }}
            >
              <div className="card-body text-center">
                <h6>Total Quantity</h6>
                <h3 className="text-success fw-bold">{totalQuantity}</h3>
                <p className="text-muted small mb-0">
                  Units across all inventory items
                </p>
              </div>
            </div>
          </div>

          <div className="col-md-3">
            <div
              className="card border-0 shadow-sm h-100 rounded-4"
              style={{ background: "#f3e8bd" }}
            >
              <div className="card-body text-center">
                <h6>Expiring Soon</h6>
                <h3 className="text-warning fw-bold">{totalExpiringSoon}</h3>
                <p className="text-muted small mb-0">
                  Items expiring in next 7 days
                </p>
              </div>
            </div>
          </div>

          <div className="col-md-3">
            <div
              className="card border-0 shadow-sm h-100 rounded-4"
              style={{ background: "#e9bebe" }}
            >
              <div className="card-body text-center">
                <h6>Expired Items</h6>
                <h3 className="text-danger fw-bold">{expiredItemsCount}</h3>
                <p className="text-muted small mb-0">Items already expired</p>
              </div>
            </div>
          </div>
        </div>

        <div className="row g-3 mt-2">
          <div className="col-lg-6">
            <div className="alert alert-warning border-0 shadow-sm rounded-4 mb-0">
              <h6 className="fw-bold text-warning-emphasis mb-3">
                Expiring Within 7 Days
              </h6>

              {expiringSoonItems.length > 0 ? (
                <ul className="mb-0 ps-3">
                  {expiringSoonItems.map((food) => (
                    <li key={food._id || food.name}>
                      <strong>{food.name || "Unnamed item"}</strong> —{" "}
                      {food.expiryDate
                        ? new Date(food.expiryDate).toLocaleDateString()
                        : "No expiry date"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-0 text-muted">No items are expiring soon.</p>
              )}
            </div>
          </div>

          <div className="col-lg-6">
            <div className="alert alert-danger border-0 shadow-sm rounded-4 mb-0">
              <h6 className="fw-bold text-danger-emphasis mb-3">
                Already Expired
              </h6>

              {expiredItems.length > 0 ? (
                <ul className="mb-0 ps-3">
                  {expiredItems.map((food) => (
                    <li key={food._id || food.name}>
                      <strong>{food.name || "Unnamed item"}</strong> —{" "}
                      {food.expiryDate
                        ? new Date(food.expiryDate).toLocaleDateString()
                        : "No expiry date"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-0 text-muted">No expired items.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
