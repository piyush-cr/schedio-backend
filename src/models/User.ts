import mongoose, { Schema, Document } from "mongoose";
import { EmployeeProfile, UserRole, UserPosition } from "../types";
import bcrypt from "bcrypt";
import { generateRefreshToken, generateToken } from "../utils/auth";
import { IUserMethods } from "../types/user.types";

export interface IUser
  extends Document,
  Omit<EmployeeProfile, "id">,
  IUserMethods {
  _id: mongoose.Types.ObjectId;
  position?: UserPosition;
  fcmToken?: string;
}

const UserSchema = new Schema<IUser>(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^\+[1-9]\d{7,14}$/,

    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(UserRole), // SENIOR | JUNIOR | ADMIN
      required: true,
      index: true,
    },
    /**
     * Position is only relevant for non-ADMIN users.
     * EMPLOYEE = regular employee, INTERN = intern.
     * Admins will have no position set.
     */
    position: {
      type: String,
      enum: Object.values(UserPosition),
      required: false,
      default: undefined,
    },
    teamId: {
      type: String,
      trim: true,
      index: true,
      required: false
    },
    officeLat: {
      type: Number,
      min: -90,
      max: 90,
    },
    officeLng: {
      type: Number,
      min: -180,
      max: 180,
    },
    shiftStart: {
      type: String,
      match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/,

    },


    shiftEnd: {
      type: String,
      match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/,
    },
    fcmToken: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ teamId: 1, role: 1 });


UserSchema.pre("save", async function () {
  // Clear fields for Admin role
  if (this.role === UserRole.ADMIN) {
    this.teamId = undefined;
    this.shiftStart = undefined;
    this.shiftEnd = undefined;
  }

  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});


UserSchema.methods.comparePassword = async function (
  candidatePassword: string
) {
  console.log(candidatePassword, this.password)
  return bcrypt.compare(candidatePassword, this.password);
};


UserSchema.methods.generateAccessToken = function (): string {
  const payload = {
    userId: this._id.toString() as string,
    email: this.email as string,
  };

  return generateToken(payload);
};

UserSchema.methods.generateRefreshToken = function (): string {
  const payload = {
    userId: this._id.toString(),
    email: this.email,
  };
  return generateRefreshToken(payload);
};

export const User = mongoose.model<IUser>("User", UserSchema);
