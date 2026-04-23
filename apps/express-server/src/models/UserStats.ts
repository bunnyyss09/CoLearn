import mongoose, { Schema, Document } from "mongoose";

export interface IActivityPoint {
  at: Date;
  problemsSolved: number;
}

export interface IUserStats extends Document {
  userId: string;
  problemsSolved: number;
  topicsCovered: string[];
  streak: number;
  badges: string[];
  timeSpentSeconds: number;
  weakTopics: string[];
  lastActivityDate: string | null;
  activityPoints: IActivityPoint[];
  createdAt: Date;
  updatedAt: Date;
}

const UserStatsSchema: Schema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    problemsSolved: { type: Number, default: 0 },
    topicsCovered: { type: [String], default: [] },
    streak: { type: Number, default: 0 },
    badges: { type: [String], default: [] },
    timeSpentSeconds: { type: Number, default: 0 },
    weakTopics: { type: [String], default: [] },
    lastActivityDate: { type: String, default: null },
    activityPoints: {
      type: [
        {
          at: { type: Date, required: true },
          problemsSolved: { type: Number, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model<IUserStats>("UserStats", UserStatsSchema);
