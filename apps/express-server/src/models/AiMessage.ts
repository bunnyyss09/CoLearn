import mongoose, { Schema, Document } from 'mongoose';

export interface IAiMessage extends Document {
  roomId: string;
  sender: 'user' | 'ai';
  text: string;
  /** Present when sender === 'user'; used for room activity stats. */
  userId?: string;
  /**
   * Optional display name of the user who asked the question.
   * Present when sender === 'user'.
   */
  userName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiMessageSchema: Schema = new Schema(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    sender: {
      type: String,
      required: true,
      enum: ['user', 'ai'],
    },
    text: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: false,
      ref: "User",
      index: true,
    },
    userName: {
      type: String,
      required: false,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying by roomId and timestamp
AiMessageSchema.index({ roomId: 1, createdAt: 1 });

export default mongoose.model<IAiMessage>('AiMessage', AiMessageSchema);

