# Security Notes

This document summarizes the security controls that are confirmed in the current codebase and the limitations that remain.

## Confirmed security controls

### Password hashing

User passwords are hashed before they are stored in MongoDB using `bcryptjs` in `backend/server.js`.

```js
const hashedPassword = await bcrypt.hash(password, 10);
```

This protects stored password values from being kept in plain text.

### JWT authentication

Protected routes use a custom middleware in `backend/middleware/auth.js` to validate bearer tokens.

The middleware checks the `Authorization` header, expects a value in the form `Bearer <token>`, verifies the token using `JWT_SECRET`, and attaches the decoded user identity to `req.user`.

### User-specific inventory security

The backend enforces user ownership when interacting with inventory items. Item reads, updates, and deletes are filtered by `userId` and item ID together.

Examples from `backend/server.js`:

```js
const items = await FoodItem.find({ userId: req.user.id });
```

```js
const updatedItem = await FoodItem.findOneAndUpdate(
  { _id: req.params.id, userId: req.user.id },
  allowedUpdate,
  { new: true },
);
```

This prevents one user from accessing another user's inventory records.

### CORS restrictions

The server uses a CORS allowlist for local development origins and rejects other origins.

```js
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
];
```

This reduces the risk of unapproved cross-origin requests during local development.

### Security headers

The backend configures response headers such as:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`

These headers reduce common browser-side attack vectors and help enforce safer client behavior.

### Rate limiting for auth endpoints

The login and register routes are wrapped with a rate limiter to control repeated requests from the same IP address.

```js
app.use(["/api/login", "/api/register"], authRateLimiter);
```

### Environment variable protection

The repository `.gitignore` includes entries for `.env` files and local build folders, reducing the chance of secret values being committed to source control.

## Security limitations and honest caveats

This project includes basic application-level protections, but it should not be described as a complete production security design. The current implementation does not include a full security review, threat model, or production deployment hardening plan.

Relevant limitations include:

- The frontend route guard is a UI-layer check only; it is not a substitute for backend authorization.
- Validation is present, but this project does not claim to implement a comprehensive validation and sanitization framework beyond the checks in the server.
- Secret management and environment configuration must still be handled carefully in deployment scenarios.
- This project does not include production monitoring, alerting, or incident response policies.

## Safe practices for this project

- Keep `JWT_SECRET` private and unique to each environment.
- Never commit `.env` files or actual credentials to Git.
- Use local or isolated MongoDB test instances for development and testing.
- Treat any missing or invalid bearer token as an auth failure and do not bypass the server-side checks.
- Validate environment variables before starting the backend in production or staging.

## Future hardening recommendations

- Add stronger password policy enforcement and account recovery workflows.
- Expand security testing to include auth edge cases and malformed requests.
- Add deployment-level secrets management, such as environment injection or a managed secret store.
- Review logging, rate limiting, and monitoring before production use.
