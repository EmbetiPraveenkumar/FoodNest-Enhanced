# API Reference

This document describes the API routes confirmed in the current implementation of the backend server. The endpoints below are the ones currently defined in `backend/server.js` and are the source of truth for the project.

## Base URL

- Local backend: `http://localhost:3000`
- Frontend origin: typically `http://localhost:5173`

## Authentication

Protected routes expect a bearer token in the `Authorization` header:

```http
Authorization: Bearer <jwt-token>
```

The backend validates the token in `backend/middleware/auth.js` and reads the user identity from `req.user`.

## Common response patterns

- `200 OK`: successful request
- `201 Created`: item created successfully
- `400 Bad Request`: invalid input or invalid credentials
- `401 Unauthorized`: missing or invalid token
- `404 Not Found`: user or item not found
- `500 Internal Server Error`: unexpected backend failure

## Endpoints

### GET /

Returns a simple server health message.

Request:

```http
GET /
```

Response:

```json
"Backend server is running"
```

---

### POST /api/register

Creates a new user account.

Request body:

```json
{
  "fullname": "Alice Tester",
  "email": "alice@example.com",
  "password": "P@ssword123"
}
```

Validation:

- `fullname` must be at least 2 characters
- `email` must match a valid email format
- `password` must be at least 8 characters

Success response:

```json
{
  "message": "Registration Successful"
}
```

Error responses:

- `400` if validation fails or email already exists
- `500` if registration fails unexpectedly

---

### POST /api/login

Authenticates a user and returns a JWT token.

Request body:

```json
{
  "email": "alice@example.com",
  "password": "P@ssword123"
}
```

Success response:

```json
{
  "message": "Login Successful",
  "token": "jwt-token-example",
  "user": {
    "id": "user-id",
    "fullname": "Alice Tester",
    "email": "alice@example.com"
  }
}
```

Error responses:

- `400` if email or password is invalid
- `500` on login failure

---

### PUT /api/change-password

Updates the authenticated user's password.

Authentication: required

Request body:

```json
{
  "newPassword": "NewPassword123"
}
```

Success response:

```json
{
  "message": "Password Changed Successfully"
}
```

Error responses:

- `400` for weak or empty password value
- `401` for missing or invalid token
- `404` if the user cannot be found
- `500` on unexpected failure

---

### POST /api/items

Creates a new food item for the logged-in user.

Authentication: required

Request body:

```json
{
  "name": "Apples",
  "category": "Fruit",
  "quantity": 5,
  "expiryDate": "2026-12-31T00:00:00.000Z",
  "status": "In Stock"
}
```

Validation:

- `name` required, minimum 2 characters
- `category` required, minimum 2 characters
- `quantity` must be a non-negative integer
- `expiryDate` must be a valid date

Success response:

```json
{
  "message": "Item Added Successfully",
  "item": {
    "_id": "item-id",
    "userId": "user-id",
    "name": "Apples",
    "category": "Fruit",
    "quantity": 5,
    "expiryDate": "2026-12-31T00:00:00.000Z",
    "status": "In Stock"
  }
}
```

Error responses:

- `400` for invalid data
- `401` for missing or invalid token
- `500` on save failure

---

### GET /api/items

Returns all food items belonging to the authenticated user.

Authentication: required

Success response:

```json
[
  {
    "_id": "item-id",
    "userId": "user-id",
    "name": "Apples",
    "category": "Fruit",
    "quantity": 5,
    "expiryDate": "2026-12-31T00:00:00.000Z",
    "status": "In Stock"
  }
]
```

Error responses:

- `401` for missing or invalid token
- `500` for fetch failure

---

### PUT /api/items/:id

Updates an item owned by the authenticated user.

Authentication: required

Request body example:

```json
{
  "quantity": 10,
  "status": "Low Stock"
}
```

Success response:

```json
{
  "message": "Item Updated Successfully",
  "updatedItem": {
    "_id": "item-id",
    "userId": "user-id",
    "quantity": 10,
    "status": "Low Stock"
  }
}
```

Error responses:

- `400` for invalid quantity or empty status
- `401` for missing or invalid token
- `404` if the item is not found or access is denied
- `500` if the update fails

---

### DELETE /api/items/:id

Deletes a food item owned by the authenticated user.

Authentication: required

Success response:

```json
{
  "message": "Item Deleted Successfully"
}
```

Error responses:

- `401` for missing or invalid token
- `404` if the item does not exist or belongs to another user
- `500` if deletion fails

---

### GET /api/profile

Fetches the authenticated user's profile without the password field.

Authentication: required

Success response:

```json
{
  "_id": "user-id",
  "fullname": "Alice Tester",
  "email": "alice@example.com",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-02T00:00:00.000Z"
}
```

Error responses:

- `401` for missing or invalid token
- `404` if the user is not found
- `500` on unexpected server failure

---

### PUT /api/update-profile

Updates the current user's full name.

Authentication: required

Request body:

```json
{
  "fullname": "Alice Updated"
}
```

Success response:

```json
{
  "message": "Profile Updated Successfully",
  "user": {
    "_id": "user-id",
    "fullname": "Alice Updated"
  }
}
```

Error responses:

- `400` if the full name is empty or too short
- `401` for missing or invalid token
- `404` if the user cannot be found
- `500` on unexpected backend failure

## Notes

- The backend enforces user ownership for inventory operations.
- The `Authorization` header must include a valid Bearer token.
- The inventory routes are all guarded by the JWT middleware in `backend/server.js`.
- The standalone router in `backend/routes/foodRoutes.js` exists in the repository, but the server currently defines and mounts the inventory routes directly in `backend/server.js`.
