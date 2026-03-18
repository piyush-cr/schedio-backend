# Backend Attendance Mobile App API

A TypeScript-based backend API for an attendance tracking mobile application with authentication and role-based access control (RBAC).

## Features

- ✅ **Authentication System**
  - User registration with role assignment (SENIOR, JUNIOR, ADMIN)
  - JWT-based login with access and refresh tokens
  - Token refresh endpoint
  - Password hashing with bcrypt

- ✅ **Role-Based Access Control (RBAC)**
  - Three roles: ADMIN, SENIOR, JUNIOR
  - Middleware for role-based route protection
  - Resource-level access control

- ✅ **API Endpoints**
  - Authentication routes (register, login, refresh, profile)
  - Attendance routes (check-in, check-out, weekly history)
  - Task management routes (create, update, assign tasks)
  - User management routes (team status, user profiles)

## Project Structure

```
src/
├── index.ts                 # Main server entry point
├── types/
│   └── index.ts            # TypeScript types and interfaces
├── models/
│   └── User.ts             # User data model (in-memory for MVP)
├── utils/
│   └── auth.ts             # Authentication utilities (JWT, password hashing)
├── middleware/
│   ├── auth.ts             # Authentication middleware
│   └── rbac.ts             # Role-based access control middleware
└── routes/
    ├── auth.routes.ts       # Authentication endpoints
    ├── attendance.routes.ts # Attendance endpoints
    ├── task.routes.ts      # Task management endpoints
    └── user.routes.ts      # User management endpoints
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (copy from `.env.example`):
```bash
PORT=3000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production
JWT_REFRESH_EXPIRES_IN=30d
```

## Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

The server will start on `http://localhost:3000`

## Testing

The project includes comprehensive test suites using Jest and Supertest.

### Run Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Structure
- `src/__tests__/routes/` - API route tests
- `src/__tests__/middleware/` - Middleware tests (auth, RBAC)
- `src/__tests__/utils/` - Utility function tests
- `src/__tests__/models/` - Data model tests
- `src/__tests__/helpers/` - Test helper functions

### Test Coverage
The test suite covers:
- ✅ Authentication (register, login, refresh, profile)
- ✅ Authorization middleware (JWT verification)
- ✅ RBAC middleware (role-based access control)
- ✅ Attendance routes (check-in, check-out, weekly history)
- ✅ Task routes (CRUD operations with role restrictions)
- ✅ User routes (team management, user profiles)
- ✅ Auth utilities (password hashing, token generation)
- ✅ User model operations

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and get tokens
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user profile (requires auth)

### Attendance

- `POST /api/attendance/check-in` - Clock in (requires auth, SENIOR/JUNIOR)
- `POST /api/attendance/check-out` - Clock out (requires auth, SENIOR/JUNIOR)
- `GET /api/attendance/weekly` - Get weekly attendance history
- `GET /api/attendance/today` - Get today's attendance status

### Tasks

- `POST /api/tasks` - Create a task (requires auth, SENIOR)
- `GET /api/tasks` - Get all tasks (filtered by role)
- `GET /api/tasks/:taskId` - Get task by ID
- `PATCH /api/tasks/:taskId` - Update task status
- `DELETE /api/tasks/:taskId` - Delete task (requires auth, SENIOR)

### Users

- `GET /api/users` - Get all users (requires auth, SENIOR/ADMIN)
- `GET /api/users/:userId` - Get user by ID
- `GET /api/users/team/status` - Get team status (requires auth, SENIOR)

## Role Permissions

### ADMIN
- Full access to all endpoints
- Can manage all users and tasks

### SENIOR
- Can create and assign tasks to Juniors
- Can view team status and attendance
- Can access team members' data
- Can check in/out

### JUNIOR
- Can view and update assigned tasks
- Can check in/out
- Can view own attendance history
- Cannot access other users' data

## Example API Usage

### Register a User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "employeeId": "EMP001",
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "JUNIOR",
  "teamId": "team1",
  "officeLat": 28.7041,
  "officeLng": 77.1025,
  "shiftStart": "09:00",
  "shiftEnd": "18:00"
}
```

### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

### Check In (with authentication)
```bash
POST /api/attendance/check-in
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "latitude": 28.7041,
  "longitude": 77.1025
}
```

## Notes

- Currently using in-memory storage for MVP (data will be lost on server restart)
- File storage for images is not implemented yet
- Geofencing validation is stubbed (needs implementation)
- Database integration is pending (ready for PostgreSQL/MongoDB)

## Next Steps

1. Integrate a database (PostgreSQL or MongoDB)
2. Implement geofencing validation (100m radius check)
3. Add file storage for check-in images
4. Implement attendance record persistence
5. Add push notification service
6. Add real-time features (WebSockets)
