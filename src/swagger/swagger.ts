import swaggerJSDoc from "swagger-jsdoc";

const swaggerOptions: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Attendance Mobile App API",
      version: "1.0.0",
      description: "Backend API for attendance mobile app with authentication and RBAC. This API provides endpoints for user authentication, attendance tracking, task management, and user management.",
      contact: {
        name: "API Support",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "access_token",
          description: "JWT token stored in HTTP-only cookie",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              example: "Error message",
            },
            errors: {
              type: "array",
              items: {
                type: "object",
              },
            },
          },
        },
        Success: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
            },
            data: {
              type: "object",
            },
          },
        },
        UserRole: {
          type: "string",
          enum: ["SENIOR", "JUNIOR", "ADMIN"],
        },
        Priority: {
          type: "string",
          enum: ["HIGH", "MEDIUM", "LOW"],
        },
        TaskStatus: {
          type: "string",
          enum: ["TODO", "IN_PROGRESS", "COMPLETED", "REVIEW"],
        },
        AttendanceStatus: {
          type: "string",
          enum: ["PRESENT", "ABSENT", "LATE", "HALF_DAY"],
        },
      },
    },
    tags: [
      {
        name: "Health",
        description: "Health check endpoints",
      },
      {
        name: "Authentication",
        description: "User authentication and authorization endpoints",
      },
      {
        name: "Attendance",
        description: "Attendance tracking endpoints (check-in, check-out, reports)",
      },
      {
        name: "Tasks",
        description: "Task management endpoints",
      },
      {
        name: "Users",
        description: "User management endpoints",
      },
    ],
  },
  apis: ["./src/routes/*.ts", "./src/index.ts"],
};

export const swaggerSpec = swaggerJSDoc(swaggerOptions);
