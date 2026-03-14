# Phase 4: RUD Layer Boundaries — Enforcement & Migration Plan

## Boundary Rules (Enforceable)

### 1. Routes/Controllers
- **NO DB calls** (no Mongoose imports, no `.find()`, `.aggregate()`, etc.)
- **NO direct CRUD calls** (should call services only)
- **Responsibility**: HTTP orchestration only (request parsing, response formatting, error handling)

### 2. Services (Use-Cases)
- **MUST NOT import from `src/models/*`** (no `User`, `Taskmodel`, `AuditLog`, etc.)
- **MUST NOT call Mongoose APIs** (`.find()`, `.aggregate()`, `.session()`, `.save()`, etc.)
- **CAN import**:
  - CRUD modules from `src/crud/*`
  - Policies/RBAC from `src/policies/*`, `src/rbac/*`
  - Utils from `src/utils/*` (except `transaction.ts` - see below)
  - Shared types from `src/types/*`
- **Type-only imports allowed (transitional)**: `import type { IUser } from "../models/User"` - treat as temporary, migrate types to `src/types/*`

### 3. CRUD (`src/crud/*.crud.ts`)
- **ONLY layer that imports models and performs queries/aggregations**
- **Accepts `session?: ClientSession`** (and any query options) so services remain DB-agnostic
- **Responsibility**: Single-purpose DB operations

### 4. Cross-Cutting Persistence Helpers
- **Audit logs, etc. live in CRUD** (e.g., `auditLog.crud.ts`), NOT in `utils/`
- **`src/utils/transaction.ts` MUST NOT import models** - move `createAuditLogEntry` to CRUD

---

## Concrete Migration Steps

### Step 1: Inventory Violations

Run these commands to identify violations:

```bash
# Find all model imports in services
grep -r "from [\"']\.\.?/models/" src/services/

# Find all Mongoose query calls in services
grep -r "\.find(\|\.aggregate(\|\.findOne(\|\.findById(\|\.save(\|\.session(" src/services/

# Find model imports in utils
grep -r "from [\"']\.\.?/models/" src/utils/
```

**Current violations identified:**

| File | Violation | Severity |
|------|-----------|----------|
| `src/services/task.service.ts` | Imports `Taskmodel`, calls `.find().session()`, `.findOne()`, `.save()` | 🔴 Critical |
| `src/services/admin.service.ts` | Imports `User`, `AuditLog`, calls `.findOne()`, `.findById()`, `.save()`, `AuditLog.create()` | 🔴 Critical |
| `src/services/user.service.ts` | Imports `IUser` type (type-only, transitional) | 🟡 Low (type-only) |
| `src/utils/transaction.ts` | `createAuditLogEntry` imports `AuditLog` model | 🔴 Critical |
| `src/crud/attendance.crud.ts` | `console.log` statements | 🟠 Cleanup |
| `src/crud/user.crud.ts` | `console.log` in `validatePassword`, business logic (`validatePassword`) | 🟠 Cleanup |

---

### Step 2: Create Missing CRUD Modules

#### 2.1 Create `src/crud/auditLog.crud.ts`

**Required functions** (based on current usage):
- `create(data, session?)` - create single audit log
- `createMany(data[], session?)` - bulk create (if needed)

**Type signature**:
```typescript
// src/crud/auditLog.crud.ts
import { ClientSession } from "mongoose";
import { AuditLog, IAuditLog } from "../models/AuditLog";

interface CreateAuditLogInput {
  action: string;
  performedBy: string | mongoose.Types.ObjectId;
  targetUser?: string | mongoose.Types.ObjectId;
  resource?: string;
  resourceId?: string | mongoose.Types.ObjectId;
  metadata?: any;
  ip?: string;
}

async function create(
  data: CreateAuditLogInput,
  session?: ClientSession
): Promise<IAuditLog> {
  const auditData = {
    ...data,
    performedBy: typeof data.performedBy === "string"
      ? new mongoose.Types.ObjectId(data.performedBy)
      : data.performedBy,
    targetUser: data.targetUser
      ? typeof data.targetUser === "string"
        ? new mongoose.Types.ObjectId(data.targetUser)
        : data.targetUser
      : undefined,
    resourceId: data.resourceId
      ? typeof data.resourceId === "string"
        ? new mongoose.Types.ObjectId(data.resourceId)
        : data.resourceId
      : undefined,
  };

  if (session) {
    const [auditLog] = await AuditLog.create([auditData], { session });
    return auditLog;
  } else {
    return await AuditLog.create(auditData);
  }
}

export default { create };
```

---

### Step 3: Move DB Operations from Services to CRUD

#### 3.1 `task.service.ts` → `task.crud.ts`

**Current service DB operations to extract:**

| Operation | Current Code | Target CRUD Function |
|-----------|--------------|---------------------|
| Duplicate check | `Taskmodel.find({ $or: orConditions }).session(session)` | `findDuplicateCheck(orConditions, session)` |
| Parent task fetch | `Taskmodel.findOne(filter)` | `findOne(filter, session)` (already exists) |
| Subtask push + save | `parentTask.subTasks.push(...); await parentTask.save()` | `pushSubtask(taskId, subtaskData, session)` |
| Subtask update | `task.subTasks.id(subTaskId); ...; await task.save()` | `updateSubtask(taskId, subTaskId, updateData, session)` |

**New CRUD functions to add:**

```typescript
// src/crud/task.crud.ts

// 1. Duplicate check (for createTask)
async function findDuplicateCheck(
  orConditions: any[],
  session?: ClientSession
): Promise<any[]> {
  const query = Taskmodel.find({ $or: orConditions });
  if (session) query.session(session);
  return query.lean();
}

// 2. Push subtask (atomic update)
async function pushSubtask(
  taskId: string,
  subtaskData: {
    title: string;
    assignedToId: string | mongoose.Types.ObjectId;
    assignedById: string | mongoose.Types.ObjectId;
  },
  session?: ClientSession
): Promise<any | null> {
  const update = {
    $push: {
      subTasks: {
        title: subtaskData.title,
        assignedToId: typeof subtaskData.assignedToId === "string"
          ? new mongoose.Types.ObjectId(subtaskData.assignedToId)
          : subtaskData.assignedToId,
        assignedById: typeof subtaskData.assignedById === "string"
          ? new mongoose.Types.ObjectId(subtaskData.assignedById)
          : subtaskData.assignedById,
      }
    }
  };

  const options: any = { new: true, runValidators: true };
  if (session) options.session = session;

  return await Taskmodel.findOneAndUpdate(
    { _id: taskId },
    update,
    options
  ).lean();
}

// 3. Update subtask by ID
async function updateSubtask(
  taskId: string,
  subTaskId: string,
  updateData: {
    title?: string;
    isCompleted?: boolean;
  },
  session?: ClientSession
): Promise<any | null> {
  const update: any = {};

  if (updateData.title) {
    update.$set = { ...update.$set, "subTasks.$[sub].title": updateData.title };
  }

  if (typeof updateData.isCompleted === "boolean") {
    update.$set = {
      ...update.$set,
      "subTasks.$[sub].isCompleted": updateData.isCompleted,
      "subTasks.$[sub].completedAt": updateData.isCompleted ? new Date() : null,
    };
  }

  const options: any = {
    new: true,
    runValidators: true,
    arrayFilters: [{ "sub._id": subTaskId }],
  };
  if (session) options.session = session;

  return await Taskmodel.findOneAndUpdate(
    { _id: taskId, "subTasks._id": subTaskId },
    update,
    options
  ).lean();
}

// Export updated taskCrud
const taskCrud = {
  create,
  findWithFilter,
  countWithFilter,
  findOne,
  updateOne,
  deleteOne,
  findDuplicateCheck,
  pushSubtask,
  updateSubtask,
};

export default taskCrud;
```

**Service refactoring pattern:**

```typescript
// BEFORE (task.service.ts)
const tasks = await Taskmodel.find({ $or: orConditions }).session(session);
if (tasks[0]) {
  throw new Error("Task with similar title or description already exists");
}

// AFTER
const duplicates = await taskCrud.findDuplicateCheck(orConditions, session);
if (duplicates.length > 0) {
  throw new Error("Task with similar title or description already exists");
}
```

```typescript
// BEFORE
parentTask.subTasks.push({ ... });
await parentTask.save();

// AFTER
const updatedTask = await taskCrud.pushSubtask(taskId, subtaskData, session);
if (!updatedTask) {
  throw new Error("Parent task not found");
}
```

---

#### 3.2 `admin.service.ts` → CRUD migration

**Current service DB operations to extract:**

| Operation | Current Code | Target CRUD Function |
|-----------|--------------|---------------------|
| User existence check | `User.findOne({ $or: [...] })` | `findOneByEmailOrEmployeeId(email, employeeId)` (userCrud) |
| User fetch | `User.findById(userId)` | `findById(userId)` (already exists) |
| User save | `user.save()` | `updateById(userId, updates)` (already exists) |
| AuditLog.create | `AuditLog.create({...})` | `auditLogCrud.create(...)` (new) |
| User.find with pagination | `User.find(filter).skip().limit()` | `findManyPaginated(filter, options)` (already exists) |
| User.countDocuments | `User.countDocuments(filter)` | `count(filter)` (already exists) |

**New CRUD function to add to `user.crud.ts`:**

```typescript
// src/crud/user.crud.ts

async function findOneByEmailOrEmployeeId(
  email?: string,
  employeeId?: string
): Promise<IUser | null> {
  const query: any = {};
  if (email) query.email = email;
  if (employeeId) query.employeeId = employeeId;
  
  if (Object.keys(query).length === 0) {
    return null;
  }

  return await User.findOne(query);
}

async function updatePassword(
  userId: string,
  newPassword: string,
  session?: ClientSession
): Promise<IUser | null> {
  const update = { password: newPassword };
  const options: any = { new: true, runValidators: true };
  if (session) options.session = session;

  return await User.findByIdAndUpdate(userId, update, options);
}

// Export updated userCrud
const userCrud = {
  create,
  findById,
  findByEmail,
  findByEmployeeId,
  findMany,
  updateById,
  updatePassword,  // <-- updated with session support
  deleteById,
  validatePassword,
  findUsersForAttendance,
  findUserById,
  findManyPaginated,
  count,
  findOneByEmailOrEmployeeId,  // <-- new
};

export default userCrud;
```

**Service refactoring pattern:**

```typescript
// BEFORE (admin.service.ts)
const existingUser = await User.findOne({
  $or: [{ email: data.email }, { employeeId: data.employeeId }],
});

// AFTER
const existingUser = await userCrud.findOneByEmailOrEmployeeId(
  data.email,
  data.employeeId
);
```

```typescript
// BEFORE
user.password = newPassword;
await user.save();

// AFTER
await userCrud.updatePassword(userId, newPassword, session);
```

```typescript
// BEFORE
await AuditLog.create({
  action: "USER_CREATED",
  performedBy: adminId,
  targetUser: user._id,
  metadata: { role: user.role, teamId: user.teamId },
});

// AFTER
await auditLogCrud.create({
  action: "USER_CREATED",
  performedBy: adminId,
  targetUser: user._id,
  metadata: { role: user.role, teamId: user.teamId },
}, session);
```

---

### Step 4: Clean Up `src/utils/transaction.ts`

**Current issue**: `createAuditLogEntry` imports `AuditLog` model directly.

**Solution**: Move to `auditLog.crud.ts` and update imports.

```typescript
// BEFORE (src/utils/transaction.ts)
export async function createAuditLogEntry(
  data: { ... },
  session?: ClientSession
) {
  const { AuditLog } = await import("../models/AuditLog");
  // ... implementation
}

// AFTER
// Remove createAuditLogEntry from transaction.ts entirely
// Import from auditLogCrud in services:
import auditLogCrud from "../crud/auditLog.crud";

// Usage in services:
await auditLogCrud.create({ ... }, session);
```

---

### Step 5: Session Plumbing Checklist

Ensure every CRUD function used in transactions accepts `session?: ClientSession`:

| CRUD Module | Function | Needs Session? | Status |
|-------------|----------|----------------|--------|
| `task.crud.ts` | `create` | ✅ Yes | ✅ Done |
| `task.crud.ts` | `findWithFilter` | ✅ Yes | ✅ Done |
| `task.crud.ts` | `findOne` | ✅ Yes | ✅ Done |
| `task.crud.ts` | `updateOne` | ✅ Yes | ✅ Done |
| `task.crud.ts` | `deleteOne` | ✅ Yes | ✅ Done |
| `task.crud.ts` | `findDuplicateCheck` | ✅ Yes | ✅ Add |
| `task.crud.ts` | `pushSubtask` | ✅ Yes | ✅ Add |
| `task.crud.ts` | `updateSubtask` | ✅ Yes | ✅ Add |
| `user.crud.ts` | `create` | ❌ No | - |
| `user.crud.ts` | `findById` | ❌ No | - |
| `user.crud.ts` | `updateById` | ❌ No | 🟠 Add |
| `user.crud.ts` | `updatePassword` | ✅ Yes | ✅ Add |
| `user.crud.ts` | `findOneByEmailOrEmployeeId` | ❌ No | - |
| `auditLog.crud.ts` | `create` | ✅ Yes | ✅ Add |
| `attendance.crud.ts` | `create` | ✅ Yes | ✅ Done |
| `attendance.crud.ts` | `updateById` | ✅ Yes | ✅ Done |
| `attendance.crud.ts` | `findOneAndUpdate` | ✅ Yes | ✅ Done |

---

### Step 6: Standardize CRUD Outputs

**Decision**: **CRUD returns lean objects** (`.lean()`) for reads, **documents for writes** (if you need `.save()` later - but you shouldn't).

**Better pattern**: CRUD returns **plain objects** for everything (`.lean()`).

**Why**:
- Services map/enrich data anyway
- Easier to mock in tests
- No Mongoose document overhead
- Consistent serialization

**Alignment needed**:

| CRUD Module | Current Behavior | Target |
|-------------|------------------|--------|
| `task.crud.ts` | `.lean()` on reads | ✅ Already correct |
| `user.crud.ts` | Returns documents | 🟠 Change to `.lean()` |
| `attendance.crud.ts` | Returns documents | 🟠 Change to `.lean()` |
| `attendanceStats.crud.ts` | Returns document | 🟠 Change to `.lean()` |

**Example fix**:

```typescript
// BEFORE (user.crud.ts)
async function findById(userId: string): Promise<IUser | null> {
  return User.findById(userId);
}

// AFTER
async function findById(userId: string): Promise<IUser | null> {
  return User.findById(userId).lean();
}
```

---

### Step 7: Remove Debug Logs

**Files with `console.log`**:

| File | Location | Action |
|------|----------|--------|
| `src/crud/attendance.crud.ts` | `findMany`, `findByUserIdAndDate` | Remove |
| `src/crud/user.crud.ts` | `validatePassword` | Remove |
| `src/services/admin.service.ts` | `createUserByAdmin` | Remove |

---

## Phase 4: Enforcement Checklist

### Linting Rules (Add to ESLint)

```javascript
// eslint.config.js - Add custom rule (or use no-restricted-imports)
{
  rules: {
    // Prevent services from importing models
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/models/*'],
            message: 'Services must not import models directly. Use CRUD modules instead.',
          },
        ],
      },
    ],
  }
}
```

### Manual Verification

- [ ] `src/services/task.service.ts` - no model imports, uses `taskCrud` only
- [ ] `src/services/admin.service.ts` - no model imports, uses `userCrud` + `auditLogCrud`
- [ ] `src/services/user.service.ts` - remove type-only import (migrate `IUser` to `src/types/`)
- [ ] `src/utils/transaction.ts` - no `createAuditLogEntry`, no model imports
- [ ] All CRUD functions in transaction paths accept `session?: ClientSession`
- [ ] All CRUD read functions return `.lean()` objects
- [ ] No `console.log` in production code

---

## Phase 5: Cleanup Checklist

### 5.1 Remove Monolith Aggregator

**Current**: `attendance.service.ts` (if it exists as a large aggregator)

**Action**: Convert to `index.ts` re-exporter only:

```typescript
// src/services/attendance/index.ts
export { checkIn, checkOut, getAttendanceHistory } from "./attendance.service";
```

### 5.2 Swagger Documentation Extraction

**Option A (Minimal Change)**: Move JSDoc to `src/docs/*.swagger.ts`

```typescript
// src/docs/attendance.swagger.ts
/**
 * @swagger
 * /api/attendance/check-in:
 *   post:
 *     tags: [Attendance]
 *     summary: Check in for the day
 *     ...
 */
```

Update `src/swagger/swagger.ts`:

```typescript
apis: ["./src/routes/*.ts", "./src/docs/*.ts", "./src/index.ts"],
```

**Option B (Cleanest)**: OpenAPI YAML files

```yaml
# src/docs/openapi/attendance.yaml
/attendance/check-in:
  post:
    tags: [Attendance]
    summary: Check in for the day
    ...
```

```typescript
// src/swagger/swagger.ts
apis: ["./src/docs/openapi/*.yaml"],
```

---

## Migration Gotchas

### 1. Session Propagation

**Rule**: Every query inside `executeWithTransaction` MUST receive `session`.

```typescript
// WRONG - runs outside transaction
await Taskmodel.findOne({ _id: taskId });  // ❌ No session!

// CORRECT
await Taskmodel.findOne({ _id: taskId }).session(session);  // ✅
```

### 2. Mixed CRUD + Model Calls

**Danger**: If services still do `Model.findOne().session(session)` while other ops use CRUD, it's easy to forget `session`.

**Solution**: **Services NEVER import models**. Period.

### 3. `create()` + Session Semantics

```typescript
// Single doc
const [doc] = await Model.create([doc], { session });  // ✅ Array form

// Multiple docs
const docs = await Model.create([doc1, doc2], { session });  // ✅
```

### 4. Uniqueness / "Already Checked In" Logic

**Problem**: Two concurrent check-ins can both pass pre-check and race at insert.

**Solution**: Use atomic update patterns:

```typescript
// ✅ Atomic guard at DB level
const updated = await Attendance.findOneAndUpdate(
  { userId, date, clockInTime: { $exists: false } },  // Guard in query
  { clockInTime: new Date() },
  { new: true }
);

if (!updated) {
  throw new Error("Already checked in today");
}
```

### 5. Retry Logic & Idempotency

**Rule**: CRUD functions must be **idempotent under retries**.

**Danger**: Side effects (notifications, audit logs) inside transactions may duplicate on retry.

**Solution**:
- Do external side effects **after commit**
- Or: enqueue outbox records inside transaction, publish later

```typescript
// ✅ Correct pattern
const result = await executeWithTransaction(async (session) => {
  // All DB ops with session
  const task = await taskCrud.create(taskData, session);
  await auditLogCrud.create(auditData, session);
  return task;
});

// Side effects AFTER commit
if (user.fcmToken) {
  await queueNotification({ ... });  // ✅ Outside transaction
}
```

### 6. Standalone Mongo Fallback

**Rule**: `executeWithTransaction` falls back to running without session if transactions aren't supported.

**Implication**: CRUD functions must handle `session?: ClientSession` gracefully:

```typescript
async function create(data: any, session?: ClientSession) {
  if (session) {
    const [doc] = await Model.create([data], { session });
    return doc;
  } else {
    return await Model.create(data);
  }
}
```

---

## Target CRUD API Surface

### `taskCrud`

```typescript
{
  create(data, session?),
  findWithFilter(filter, options),
  countWithFilter(filter, session?),
  findOne(filter, session?),
  updateOne(filter, data, session?),
  deleteOne(filter, session?),
  findDuplicateCheck(orConditions, session?),
  pushSubtask(taskId, subtaskData, session?),
  updateSubtask(taskId, subTaskId, updateData, session?),
}
```

### `userCrud`

```typescript
{
  create(data),
  findById(id),
  findByEmail(email),
  findByEmployeeId(employeeId),
  findOneByEmailOrEmployeeId(email?, employeeId?),
  findMany(filter),
  findManyPaginated(filter, options),
  count(filter),
  updateById(id, updates, session?),
  updatePassword(id, newPassword, session?),
  deleteById(id),
  validatePassword(email, password),
  findUsersForAttendance(role, teamId?),
  findUserById(id),
}
```

### `auditLogCrud` (new)

```typescript
{
  create(data, session?),
}
```

### `attendanceCrud`

```typescript
{
  findMany(filter),
  findManyPaginated(filter, options),
  findById(id),
  findByUserIdAndDate(userId, date, session?),
  findOne(filter, session?),
  findOneAndUpdate(filter, update, options),
  create(data, session?),
  updateById(id, update, session?),
  updateByUserIdAndDate(userId, date, update),
  deleteById(id),
  deleteByUserIdAndDate(userId, date),
  count(filter),
  findOpenAttendances(date),
  findAllOpenAttendances(),
  getSummary(filter),
}
```

### `attendanceStatsCrud`

```typescript
{
  createOrUpdate(userId, type, filterKeys, statsData),
  findDailyStats(userId, date),
  findWeeklyStats(userId, startDate),
  findMonthlyStats(userId, startDate),
}
```

---

## Execution Order

1. **Create `auditLog.crud.ts`** (new module)
2. **Add new functions to `task.crud.ts`** (`findDuplicateCheck`, `pushSubtask`, `updateSubtask`)
3. **Add new functions to `user.crud.ts`** (`findOneByEmailOrEmployeeId`, `updatePassword` with session)
4. **Update `user.crud.ts`** to return `.lean()` on reads
5. **Update `attendance.crud.ts`** to return `.lean()` on reads
6. **Remove `createAuditLogEntry` from `transaction.ts`**
7. **Refactor `admin.service.ts`** to use CRUD only
8. **Refactor `task.service.ts`** to use CRUD only
9. **Remove `console.log` statements**
10. **Add ESLint rule** to prevent future violations
11. **Run tests** to verify behavior
12. **Phase 5**: Swagger extraction (optional)
