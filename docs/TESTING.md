# Testing Guide

This project includes both backend and frontend automated tests. The current test coverage reflects the code that is actually present in the repository and the constraints of the environment.

## Backend tests

### Command

```powershell
cd backend
npm test
```

This runs the Jest suite configured in `backend/jest.config.js`.

### Mocked backend suite

The project includes a mocked backend test file at `backend/tests/api.mock.test.js`.

This suite validates:

- user registration
- duplicate email rejection
- login success and failure
- JWT validation and token-less requests
- inventory creation and retrieval
- cross-user access prevention for inventory items

The suite uses mocked database operations and mocked `bcryptjs` / `jsonwebtoken` behavior. It is useful for verifying route logic and auth flow without requiring a live database.

### Database-backed test suite

The file `backend/tests/api.test.js` is a MongoDB-backed integration test suite intended to run with `mongodb-memory-server`.

This suite was not confirmed as passing in the current environment because MongoDB Memory Server could not start with the required binary in this machine. The test file explicitly treats this as an environment issue and does not indicate a safe fallback to a production database.

### Confirmed result

The mocked backend suite was confirmed to pass in the earlier verification run with the following result:

- 1 test suite passed
- 6 tests passed

## Frontend tests

### Command

```powershell
cd frontend
npm test
```

This runs the Vitest suite configured by `frontend/vite.config.js`.

### Confirmed result

The frontend test suite was confirmed to pass in the earlier verification run with the following result:

- 1 test suite passed
- 6 tests passed

## Notes and safe testing guidance

- Do not use production MongoDB credentials or a live database for local test execution.
- Prefer isolated local or disposable MongoDB instances for database-backed tests.
- Mocked backend tests validate behavior without a database connection, but they are not a replacement for real integration tests.
- If MongoMemoryServer fails to start, treat that as an environment issue and fix the local runtime or test environment rather than bypassing the database-safe requirement.

## Suggested future improvements

- Add a stable local database test strategy for CI and developer machines
- Increase route coverage for profile updates and password changes
- Add frontend UI tests for error states and empty inventory scenarios
- Expand automated checks for CSV export and expiry logic
