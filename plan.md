Schedio Backend Refactoring Plan
This document outlines a comprehensive plan to refactor the Schedio backend project (Node.js/Express). The goal is to improve code modularity, strictly adhere to clean architecture principles, and enhance overall maintainability.

1. Current Issues
Massive Services: Files like 
attendance.service.ts
 are extremely large (~1,500 lines of code). This violates the Single Responsibility Principle (SRP) and makes the code difficult to maintain and test.
Controller Responsibilities: Controllers are handling request validation directly. While usable, it clutters the controller logic and mixes transport-layer concerns with validation.
High Coupling: High coupling exists between specific business logic flows within single service endpoints.
Fat Route Files: Some route files (like 
attendance.routes.ts
) contain extensive Swagger documentation mixed with route definitions, leading to large file sizes (~650 lines).
2. Proposed Architecture Improvements
A. Service Decomposition
Split large, monolithic service files into smaller, use-case specific files.

Current Structure: 
attendance.service.ts
 contains check-in, check-out, weekly/monthly reports, user stats, etc.
Proposed Structure: Break into a modular directory structure under src/services/attendance/:
src/services/attendance/checkIn.service.ts
src/services/attendance/checkOut.service.ts
src/services/attendance/weeklyReport.service.ts
src/services/attendance/monthlyReport.service.ts
src/services/attendance/userStats.service.ts
Create an 
index.ts
 in src/services/attendance/ to export the grouped methods, maintaining the existing attendanceService interface for the controllers during the transition.
B. Validation Middleware
Move Zod validation out of the controllers and into reusable middleware. This keeps the controllers clean and focused strictly on HTTP request/response orchestration.

Example implementation for src/middleware/validate.ts:

typescript
import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
export const validateRequest = (schema: AnyZodObject) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors,
        });
      }
      return res.status(400).json({ success: false, message: "Invalid request data" });
    }
  };
Route Setup:

typescript
import { validateRequest } from '../middleware/validate';
import { checkInSchema } from '../validations/attendance.validations';
router.post(
  '/check-in',
  authenticate,
  requireSeniorOrJunior,
  upload.fields([{ name: "photo", maxCount: 1 }]),
  validateRequest(checkInSchema),
  attendanceController.checkIn
);
C. Controller Thinning
Controllers should adhere to the following strict responsibilities:

Extract and sanitize data from the request (req.body, req.query, req.params, req.user).
Call the appropriate Service/Use-case function, passing only plain objects/primitives.
Handle errors (via try/catch or an async wrapper) and send appropriate HTTP responses. Crucial: Ensure services never import or accept req or res objects as parameters.
D. Consistent Repository (CRUD) Layer
The src/crud directory exists (e.g., 
attendance.crud.ts
). Ensure all direct database interactions (Mongoose calls) happen exclusively within this layer.

Services should call CRUD functions instead of interacting with models directly (e.g., avoid Attendance.findOne() in services; use attendanceCrud.findAttendance() instead).
Mocking the CRUD layer in tests is much easier than mocking Mongoose models.
E. Swagger Documentation Extraction (Optional but recommended)
To reduce the size of route files and improve readability, consider extracting Swagger JSDoc comments into separate files or using a YAML/JSON file for all API documentation.

Alternative: Move Swagger comments to the controller functions instead of the route definitions, or create a specific docs/ folder to host attendance.swagger.ts.
3. Recommended Execution Phases
Phase 1: Validation and Controllers
Implement validateRequest middleware.
Update controllers (e.g., 
attendance.controller.ts
) to remove Zod .parse() logic and rely on the new middleware.
Ensure controllers only pass necessary data to services (removing any lingering req object passes, though the current 
attendance.controller.ts
 looks mostly okay in this regard except for req.file handling).
Phase 2: Service Extraction - Part 1 (The easy ones)
Extract simple read operations (e.g., 
getTodayAttendance
, 
getAttendanceByDate
) into their own files (src/services/attendance/getToday.service.ts).
Update 
attendance.service.ts
 to re-export these functions so imports in the controller don't break immediately.
Phase 3: Service Extraction - Part 2 (Complex Logic)
Extract 
checkIn
 and 
checkOut
 logic into src/services/attendance/checkIn.service.ts and src/services/attendance/checkOut.service.ts.
Extract complex reporting logic (
getWeeklyAttendance
, 
getMonthlyAttendance
) into dedicated service files.
Phase 4: CRUD Enforcement
Review all newly separated service files. Ensure no Mongoose models are imported directly into the services.
If a service queries Mongoose directly, move that query to the corresponding file in src/crud/ and update the service to call the CRUD method.
Phase 5: Cleanup
Remove the old, monolithic 
attendance.service.ts
 file (or turn it exclusively into an 
index.ts
 aggregator).
Ensure all tests are passing.