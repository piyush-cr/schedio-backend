import mongoose, { Schema } from "mongoose";

const SubTaskSchema = new Schema(
    {
        title: { type: String, required: true, trim: true },

        isCompleted: { type: Boolean, default: false },
        completedAt: { type: Date, default: null },

        assignedToId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        assignedById: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
    },
    { _id: true, timestamps: true }
);


export const SubtaskModel = mongoose.model("subtaskmodel", SubTaskSchema)