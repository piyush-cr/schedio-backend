## Updates

### Delete User API
- Added admin-only delete user endpoint: `DELETE /api/admin/users/:userId`.
- Implemented service/controller/route wiring with self-delete and admin-delete guards.
- Added audit logging for user deletions.
- Updated Postman collections to include Delete User (full and test).

### Attendance Total Work Hours
- Added `totalWorkHours` alongside `totalWorkMinutes` in attendance responses.
- Format is `<hours> <minutes>` (example: `2 05`).
- Applied across today, date, weekly logs, monthly logs, logs list, checkout, and auto-checkout responses.
