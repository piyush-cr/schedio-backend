# Authenticated Routes

The following routes require a valid access token. They are protected using the `authenticate` middleware in the Express application.

## Auth (`/api/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/auth/me` | Get current user profile |
| `POST` | `/api/auth/logout` | Logout user |

## Users (`/api/users`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users/:userId` | Get user by ID | Admin/Seniors (team)/Self |
| `GET` | `/api/users/team/status` | Get team attendance status | Admin/Seniors |
| `POST` | `/api/users/fcm-token` | Register FCM token | Any authenticated user |

## Attendance (`/api/attendance`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/attendance/check-in` | Check in for attendance | Senior/Junior |
| `POST` | `/api/attendance/check-out` | Check out from attendance | Senior/Junior |
| `GET` | `/api/attendance/weekly` | Get weekly attendance report | Senior/Junior |
| `GET` | `/api/attendance/monthly` | Get monthly attendance report | Senior/Junior |
| `GET` | `/api/attendance/today` | Get today's attendance record | Senior/Junior |
| `GET` | `/api/attendance/day` | Get attendance record for specific day| Senior/Junior |
| `GET` | `/api/attendance/users` | Get users for attendance view | Admin/Senior |
| `GET` | `/api/attendance/user/:userId`| Get user attendance details | Admin/Senior |

## Tasks (`/api/tasks`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/tasks/` | Create a task | Admin/Senior |
| `GET` | `/api/tasks/` | Get tasks | Any authenticated user |
| `GET` | `/api/tasks/:taskId` | Get task by ID | Any authenticated user |
| `PATCH` | `/api/tasks/:taskId` | Update task | Any authenticated user |
| `DELETE` | `/api/tasks/:taskId` | Delete task | Admin/Senior |

## Admin (`/api/admin`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/admin/users` | Create a new user | Admin |
| `GET` | `/api/admin/users` | Get all users | Admin |
| `GET` | `/api/admin/users/:userId`| Get user by ID | Admin |
| `PATCH` | `/api/admin/users/:userId/password` | Change user password | Admin |
| `PATCH` | `/api/admin/users/:userId/updateUser` | Update user details | Admin |
| `DELETE` | `/api/admin/users/:userId` | Delete user | Admin |
| `POST` | `/api/admin/logout` | Logout admin user | Admin |

> **Note**: Routes such as `/api/auth/login`, `/api/auth/refresh`, and `/api/jobs/test`, as well as the `/health` and `/api-docs` endpoints, do **not** require an access token.
