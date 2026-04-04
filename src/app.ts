import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import attendanceRoutes from "./routes/attendance.routes";
import taskRoutes from "./routes/task.routes";
import userRoutes from "./routes/user.routes";
import adminRoutes from "./routes/admin.routes";
import jobRoutes from "./routes/job.routes";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger/swagger";
import path from "path";
import morgan from "morgan";
import { logger } from "./utils/logger";
import { ApiError } from "./utils/ApiError";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler";
import compression from "compression";


const app = express();

app.use(helmet());
app.use(cookieParser());
app.use(cors({
    // origin: "https://attendance-app-fontend.vercel.app",
    origin:"https://q6303qc1-3000.inc1.devtunnels.ms",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use(
    morgan("combined", {
        stream: {
            write: (message) => logger.info(message.trim()),
        },
    })
);

app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
        success: true,
        message: "Server is running",
        timestamp: new Date().toISOString(),
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/jobs", jobRoutes);

app.use((_req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
    });
});
app.use(errorHandler)
app.use((err: ApiError, req: Request, res: Response, _next: NextFunction) => {
    logger.error({
      message: err.message,
      stack: err.stack,
      route: req.originalUrl,
      method: req.method,
      // @ts-ignore
      user: req.user?.userId || "unauthorized",
    });
  
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Internal server error",
      ...(err.errors && err.errors.length > 0 && { errors: err.errors }),
      ...(process.env.NODE_ENV === "development" && { error: err.message }),
    });
  });

export default app;