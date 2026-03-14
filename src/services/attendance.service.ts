// Re-export attendance service from extracted modules
// This file is kept for backward compatibility during migration
// Controllers should migrate to: import attendanceService from "../services/attendance"
export { default } from "./attendance";
