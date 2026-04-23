import mongoose, { Schema, Document } from "mongoose";

export interface ISessionNote extends Document {
  noteId: string;
  roomId: string;
  content: string;
  createdBy: string;
  lastEditedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const SessionNoteSchema: Schema = new Schema(
  {
    noteId: { type: String, required: true, unique: true, index: true },
    roomId: { type: String, required: true, index: true },
    content: { type: String, default: "" },
    createdBy: { type: String, required: true },
    lastEditedBy: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<ISessionNote>("SessionNote", SessionNoteSchema);
