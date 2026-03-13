Goals





Add new role: Introduce an intern value in the global UserRole type/enum with behavior equivalent to an existing employee/user role.



Extend user schema: Add a required phone number field to the user model with E.164 validation (e.g. +15551234567).



Propagate changes: Update related TypeScript types, validation, middleware, and API handlers so intern and phone are handled consistently everywhere.

High-level steps

1) Update shared types and enums





Locate role definitions: In your types (likely [src/types/index.ts](d:/attendance-webapp/backend-attendance-app/src/types/index.ts) or similar), find the UserRole enum or union used in User.ts and add INTERN / "intern".



Match employee behavior: Wherever permissions/logic branch on UserRole (e.g. auth middleware, access-control helpers, or services), ensure UserRole.INTERN is treated the same as your current employee/user role (not like ADMIN).



Extend profile type: In the EmployeeProfile type imported into User.ts, add a phone: string field so IUser picks it up as part of the profile data.

2) Extend the Mongoose User model





Add phone to schema: In [src/models/User.ts](d:/attendance-webapp/backend-attendance-app/src/models/User.ts), add a phone field to UserSchema:





type: String



required: true



unique: true or indexed if you need to query by phone (decide based on your needs)



match regex to approximate E.164 (e.g. /^\+[1-9]\d{7,14}$/)



Keep admin behavior: Do not clear phone for admins in the pre-save hook—only teamId, shiftStart, and shiftEnd should remain admin-specific.



Update any compound indexes: If you anticipate frequent phone lookups, consider adding UserSchema.index({ phone: 1 });.

3) Update DTOs / request validation





Auth & user creation: Find request DTOs/schemas for signup/create-user endpoints (for example in [src/routes/auth.ts](d:/attendance-webapp/backend-attendance-app/src/routes/auth.ts), [src/controllers/user.controller.ts](d:/attendance-webapp/backend-attendance-app/src/controllers/user.controller.ts), or validation middleware files):





Add phone as a required string field with E.164 validation.



Allow role to accept intern in any role-related validation (e.g. Zod/Joi/Yup schemas, manual checks).



Update update-profile endpoints: For updateUser, updateProfile, or similar APIs, include phone in allowed updatable fields (or keep immutable if that’s a security requirement you prefer).

4) Update controllers, services, and middleware





Controllers/services: In user and auth controllers/services (e.g. [src/controllers/auth.controller.ts](d:/attendance-webapp/backend-attendance-app/src/controllers/auth.controller.ts), [src/services/user.service.ts](d:/attendance-webapp-backend-attendance-app/src/services/user.service.ts)):





Ensure phone is read from request bodies and passed into User.create / User.update.



Ensure responses that serialize a user (e.g. getMe, getUser, listUsers) include phone where appropriate.



For any APIs that create or update a user's position (for example, assigning/changing team, shift, or other position-related fields), require the authenticated user's role to be either employee or intern—this should not be controlled by any separate position type attribute.



Authorization middleware: In any role-checking middleware (e.g. [src/middleware/auth.ts](d:/attendance-webapp/backend-attendance-app/src/middleware/auth.ts)):





Wherever you currently check role === EMPLOYEE or similar, update to allow INTERN as well, e.g. by checking role in {EMPLOYEE, INTERN} or using a helper like isEmployeeLike(role) that includes interns.



Leave existing admin-only logic unchanged.

5) Adjust seeding / bootstrapping (if present)





Seed scripts: If you have seed or test data scripts (e.g. [src/scripts/seed.ts](d:/attendance-webapp/backend-attendance-app/src/scripts/seed.ts)):





Add at least one sample user with role intern and a valid E.164 phone number.



Ensure all seeded users now include phone.

6) Migration / backward compatibility strategy





Existing users without phone:





Decide whether to: (a) temporarily make phone optional at DB level while you backfill, or (b) write a one-off script to populate phone numbers before tightening the schema.



If you choose (a), add runtime validation that blocks new writes without phone while allowing legacy documents missing it.



Client compatibility:





Document for frontend that phone is now a required field on user create/update and that role can now be intern.

7) Testing and verification





Unit/integration tests: Update or add tests for:





Creating a user with role = intern and valid phone.



Failing to create a user with invalid phone or missing phone.



Access control where intern is allowed the same as employees but not admin-only actions.



Manual checks:





Hit signup/create-user APIs with role=intern and verify persistence and returned JSON.



Verify that listing/fetching users returns the new phone field.

Implementation notes





E.164 regex: A practical regex you can use is /^\+[1-9]\d{7,14}$/, ensuring a leading +, non-zero country code, and 8–15 digits total.



Role naming: Prefer a clear naming convention in your UserRole enum (e.g. INTERN = "intern") and ensure all string comparisons use the enum, not raw string literals.

