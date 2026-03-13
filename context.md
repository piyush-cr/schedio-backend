# Attendance App Scenario

## Basic Check-in / Check-out Flow

- The user opens the app and sees:
  - **Check In** button  
  - **Check Out** button  
  - An option to view **weekly attendance history**

- **Geofencing Rule**
  - The user can only check in or check out when they are within **100 meters of the office location**
  - A push notification is sent to the employee's device when they enter the geofence

### Morning Flow (9:00 AM)

- Geofence triggers when the user enters the office area
- User manually clocks in using the app
- The app opens the **front camera** with **face detection**
- Photo is captured **only when the face is centered and recognized**
- While the photo is being taken, the app silently collects:
  - GPS coordinates
  - Timestamp
- Data is instantly synced to the cloud
- User sees a success animation along with **total hours worked for the current week**

### During the Day (9:00 AM – 6:00 PM)

- The app continuously monitors the user's location
- If the user leaves the 100m geofence:
  - The app does **not** auto-checkout
  - The movement can optionally be logged as **"Away"**

### Evening Flow (6:00 PM)

- A scheduled notification (via `AlarmManager`) is triggered:
  > "Workday is over! Don't forget to clock out."

#### Auto-Checkout Logic

- After 6:00 PM, a **Strict Exit Listener** becomes active
- If the user crosses the 100m geofence boundary **after 6 PM**:
  - A background task automatically triggers checkout
  - Checkout is marked as **Auto**

### History View

Employees can see:
- Weekly total hours
- Clock-in and clock-out times
- Status (manual or auto)
- Date-wise records

---

## Data Models

### Attendance Record Model

```kotlin
data class AttendanceRecord(
    val id: String = "",                 // Unique ID (UUID or Firestore Doc ID)
    val userId: String = "",             // Link to the specific employee
    val date: String = "",               // Format: "yyyy-MM-dd"

    // Clock In Data
    val clockInTime: Long? = null,       // Unix Timestamp (milliseconds)
    val clockInLat: Double? = null,
    val clockInLng: Double? = null,
    val clockInImageUrl: String = "",    // Cloud Storage photo URL

    // Clock Out Data
    val clockOutTime: Long? = null,
    val clockOutLat: Double? = null,
    val clockOutLng: Double? = null,
    val isAutoCheckOut: Boolean = false, // Triggered by geofence after 6 PM

    // Calculated Metadata
    val totalWorkMinutes: Long = 0L,     // Calculated on checkout
    val status: AttendanceStatus = AttendanceStatus.PRESENT
)
```

```kotlin
enum class AttendanceStatus {
    PRESENT, ABSENT, LATE, HALF_DAY
}
```

---

### User / Employee Profile

- `employeeId` — Unique identifier for the worker
- `officeLatLng` — Center point for the 100m geofence
- `shiftStart` — e.g. `"09:00"` (used for reminders)
- `shiftEnd` — e.g. `"18:00"` (used for auto-checkout)

---

## Weekly History Models

```kotlin
data class WeeklySummary(
    val weekRange: String,               // e.g., "Jan 05 - Jan 11"
    val totalHoursThisWeek: Double,      // e.g., 42.5
    val dailyLogs: List<AttendanceRecord>,
    val averageClockInTime: String       // Helps HR assess punctuality
)
```

```kotlin
data class DailyLog(
    val date: String,                    // "2026-01-08"
    val dayOfWeek: String,               // "Thursday"
    val checkIn: LogDetail?,
    val checkOut: LogDetail?,
    val totalHours: Double,              // e.g., 8.5
    val workStatus: WorkStatus
)
```

```kotlin
data class LogDetail(
    val time: Long,                      // Unix Timestamp
    val locationName: String,            // Optional office/branch name
    val photoUrl: String?,
    val isAutomatic: Boolean,            // Auto checkout after 6 PM
    val latitude: Double,
    val longitude: Double
)
```

```kotlin
enum class WorkStatus {
    ON_TIME, LATE, ABSENT, INCOMPLETE, HOLIDAY
}
```

---

# Assignment Scenario

## Start of the Day (Senior & Junior)

- Both roles arrive at the office
- App detects location and allows clock-in via Photo + GPS
- **Role-based Experience**
  - Junior sees **"Tasks for Today"**
  - Senior sees **"Team Oversight Dashboard"**

---

## Middle of the Day

### Senior Role

- Senior notices a new project requirement
- Opens **Task Assignment** section
- Creates a task:
  - Example: *"Complete the API documentation"*
  - Sets a deadline
  - Assigns it to a Junior
- Senior can see **live team status**:
  - Who is clocked in
  - Who is outside the office

### Junior Role

- Junior receives a push notification:
  > "New Task Assigned by [Senior Name]"
- Junior can update task status:
  - In Progress
  - Completed

---

## End of the Day (Both Roles)

- Both receive the 6 PM reminder notification
- If they exit the 100m geofence after 6 PM:
  - Auto-checkout logic applies to both

---

## Navigation Structure

- **Junior Tabs**
  - Attendance
  - My Tasks
  - Profile

- **Senior Tabs**
  - Attendance
  - Team Tasks
  - Team Status
  - Profile

---

## Task / Assignment Data Model

```kotlin
data class Task(
    val taskId: String = "",
    val title: String = "",
    val description: String = "",
    val assignedToId: String = "",    // Junior employee ID
    val assignedById: String = "",    // Senior employee ID
    val priority: Priority = Priority.MEDIUM,
    val status: TaskStatus = TaskStatus.TODO,
    val deadline: Long? = null,
    val createdAt: Long = System.currentTimeMillis()
)
```

```kotlin
enum class Priority { HIGH, MEDIUM, LOW }
enum class TaskStatus { TODO, IN_PROGRESS, COMPLETED, REVIEW }
```

---

## User Model Extension

```kotlin
data class EmployeeProfile(
    val employeeId: String,
    val name: String,
    val role: UserRole,          // SENIOR or JUNIOR
    val teamId: String,          // Groups seniors with juniors
    val officeLocation: LatLng   // Shared office location
)
```

```kotlin
enum class UserRole { SENIOR, JUNIOR, ADMIN }
```