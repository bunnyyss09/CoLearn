import 'dotenv/config';
import { config } from "dotenv";
import path from "path";

// Load .env: monorepo root (from apps/express-server/src or dist) and cwd as fallback
config({ path: path.resolve(__dirname, "../../../.env") });
config({ path: path.resolve(process.cwd(), ".env") });
import express from "express";
import { createClient } from "redis";
import cors from "cors";
import { getAiTutorResponse } from "./ai-tutor";
import { connectToDatabase } from "./db/connection";
import ChatMessage from "./models/Chat";
import Room from "./models/Room";
import User from "./models/User";
import Code from "./models/Code";
import Notes from "./models/Notes";
import AiMessage from "./models/AiMessage";
import LearningModule from "./models/LearningModule";
import LearningProgress from "./models/LearningProgress";
import { v4 as uuidv4 } from "uuid";
import { generateToken, authenticateToken, AuthRequest } from "./utils/auth";
import learningRouter, { ensureDefaultLearningModules } from "./routes/learning";
import { seedLearningModulesFromJson } from "./utils/seedLearningModulesFromJson";
import {
  recordAiInteraction,
  getUserAiContext,
  getUserProfileData,
  buildLearnerTeachingRows,
} from "./utils/learningProfileService";
import { aggregateRoomMemberActivity } from "./utils/roomActivity";

const ROOM_DISPLAY_NAME_MAX = 80;

function sanitizeRoomDisplayName(raw: unknown): string | undefined {
  if (raw == null || typeof raw !== "string") return undefined;
  const t = raw.trim().slice(0, ROOM_DISPLAY_NAME_MAX);
  return t.length > 0 ? t : undefined;
}

const app = express();
app.use(express.json());

const corsOrigin = process.env.CORS_ORIGIN?.trim();
app.use(
  cors(
    corsOrigin && corsOrigin.length > 0
      ? { origin: corsOrigin.split(",").map((o) => o.trim()).filter(Boolean) }
      : {}
  )
);

const redisUrl = process.env.REDIS_URL?.trim();
const redisClient = redisUrl ? createClient({ url: redisUrl }) : createClient();

redisClient.on("error", (err) => console.log("Redis Client Error", err));

// Authentication routes
app.post("/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Missing required fields: name, email, password" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long" });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    // Generate user ID
    const userId = uuidv4();

    // Create new user
    const user = new User({
      _id: userId,
      name,
      email,
      password,
    });

    await user.save();

    // Generate token
    const token = generateToken({ userId: String(user._id), email: user.email });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error("Error signing up:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

app.post("/auth/signin", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate token
    const token = generateToken({ userId: String(user._id), email: user.email });

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error signing in:", error);
    res.status(500).json({ error: "Failed to sign in" });
  }
});

app.get("/auth/verify", authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error verifying token:", error);
    res.status(500).json({ error: "Failed to verify token" });
  }
});

app.post('/ai-tutor', async (req, res) => {
  const {
    userQuery,
    language,
    code,
    input,
    output,
    roomId,
    userName,
    userId,  // Optional: for tracking learning profile
    checkpointType,
    checkpointTitle,
    checkpointDescription,
    aiMode,
    moduleTitle,
    moduleSummary,
  } = req.body;
  const query = typeof userQuery === "string" ? userQuery.trim() : "";
  const lang = typeof language === "string" ? language.trim() : "";
  const codeText = typeof code === "string" ? code : "";
  if (!query || !lang) {
    return res
      .status(400)
      .json({ error: "Missing required fields: userQuery or language." });
  }
  try {
      // Get user learning context if userId is provided (never fail the tutor if profile DB hiccups)
      let userLearningContext = '';
      if (userId != null && String(userId).trim() !== "") {
        try {
          await recordAiInteraction(String(userId), query, codeText);
          userLearningContext = await getUserAiContext(String(userId));
        } catch (profileErr) {
          console.error("AI tutor: learning profile step failed (continuing without profile):", profileErr);
        }
      }

      const aiResponseText = await getAiTutorResponse({
        userQuery: query,
        language: lang,
        code: codeText,
        input: input ?? "",
        output: output ?? "",
        userName,
        checkpointType,
        checkpointTitle,
        checkpointDescription,
        aiMode,
        moduleTitle,
        moduleSummary,
        userLearningContext,
      });
      
      // Save user message and AI response to database if roomId is provided (public room AI chat)
      if (roomId) {
        try {
          const userMessage = new AiMessage({
            roomId,
            sender: "user",
            text: query,
            userName: userName ?? undefined,
            userId: userId ? String(userId) : undefined,
          });
          await userMessage.save();

          const aiMessage = new AiMessage({
            roomId,
            sender: 'ai',
            text: aiResponseText,
          });
          await aiMessage.save();
        } catch (dbError) {
          console.error("Error saving AI messages to database:", dbError);
          // Don't fail the request if DB save fails
        }
      }
      
      res.status(200).json({ aiResponseText });

  } catch (error) {
      console.error("AI Tutor endpoint failed:", error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("GEMINI_API_KEY")) {
        return res.status(503).json({ error: msg });
      }
      res.status(500).json({
        error:
          "An internal server error occurred while processing the AI request. Check the server logs for details.",
      });
  }
});

app.post("/submit", async (req, res) => {
  const { code, language, roomId, input, sessionId } = req.body;
  const submissionId = `submission-${Date.now()}-${roomId}`;

  console.log(`Received submission from room ${roomId}`);

  try {
    await redisClient.lPush(
      "problems",
      JSON.stringify({ code, language, roomId, submissionId, input, sessionId })
    );
    console.log(
      `Submission pushed to Redis for: ${roomId}  and problem id: ${submissionId}`
    );
    const room = await Room.findOne({ roomId });
    if (room) {
      await Code.findOneAndUpdate(
        { codeId: room.codeId },
        { sourceCode: code, language }
      );
    }
    res.status(200).send("Submission received and stored");
  } catch (error) {
    console.log(error);
    res.status(500).send("Failed to store submission");
  }
});

// Mount learning routes (modules, learning rooms, checkpoints)
app.use("/learning", learningRouter);

// Chat endpoints
app.post("/chat/send", async (req, res) => {
  const { chatId, userId, userName, message } = req.body;

  if (!chatId || !userId || !userName || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const chatMessage = new ChatMessage({
      chatId,
      userId,
      userName,
      message,
      timestamp: new Date(),
    });

    await chatMessage.save();
    res.status(200).json({ success: true, message: chatMessage });
  } catch (error) {
    console.error("Error saving chat message:", error);
    res.status(500).json({ error: "Failed to save chat message" });
  }
});

app.get("/chat/:chatId", async (req, res) => {
  const { chatId } = req.params;
  const { limit = 50 } = req.query;

  try {
    const messages = await ChatMessage.find({ chatId })
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .exec();

    res.status(200).json({ messages: messages.reverse() });
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    res.status(500).json({ error: "Failed to fetch chat messages" });
  }
});

// Room management endpoints
app.post("/room/create", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId, displayName: displayNameRaw } = req.body;
  const displayName = sanitizeRoomDisplayName(displayNameRaw);

  if (!roomId) {
    return res.status(400).json({ error: "Missing roomId" });
  }

  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get authenticated user
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const ownerId = String(user._id);

    // Check if room already exists
    let room = await Room.findOne({ roomId });
    if (room) {
      // Add owner to members if not already there
      if (!room.members.includes(ownerId)) {
        room.members.push(ownerId);
        await room.save();
      }
      return res.status(200).json({ room, isNew: false });
    }

    // Create new room with associated entities
    const chatId = uuidv4();
    const notesId = uuidv4();
    const codeId = uuidv4();

    // Create Code
    const code = new Code({
      codeId,
      roomId,
      sourceCode: "// Write your code here...",
      language: "javascript",
    });
    await code.save();

    // Create Notes
    const notes = new Notes({
      notesId,
      roomId,
      content: "",
    });
    await notes.save();

    // Create Room
    room = new Room({
      roomId,
      ...(displayName ? { displayName } : {}),
      ownerId,
      members: [ownerId],
      chatId,
      notesId,
      codeId,
    });
    await room.save();

    res.status(200).json({ room, isNew: true });
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

app.post("/room/join", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: "Missing roomId" });
  }

  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get authenticated user
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = String(user._id);

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Add user to members if not already there
    if (!room.members.includes(userId)) {
      room.members.push(userId);
      await room.save();
    }

    // If room has a learning module, create progress for the user if not exists
    if (room.moduleId) {
      const existingProgress = await LearningProgress.findOne({ roomId, moduleId: room.moduleId, userId });
      if (!existingProgress) {
        const module = await LearningModule.findOne({ moduleId: room.moduleId });
        if (module) {
          const checkpointStatuses = module.checkpoints.map(cp => ({
            checkpointId: cp.checkpointId,
            status: 'pending'
          }));
          const progress = new LearningProgress({
            roomId,
            moduleId: room.moduleId,
            userId,
            currentCheckpointIndex: 0,
            checkpointStatuses
          });
          await progress.save();
        }
      }
    }

    res.status(200).json({ room });
  } catch (error) {
    console.error("Error joining room:", error);
    res.status(500).json({ error: "Failed to join room" });
  }
});

// Get all rooms for the authenticated user
app.get("/rooms/my", authenticateToken, async (req: AuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const rooms = await Room.find({ members: req.user.userId }).sort({ createdAt: -1 });
    // Include ownerId in response
    const roomsWithOwner = rooms.map(room => ({
      roomId: room.roomId,
      displayName: room.displayName,
      ownerId: room.ownerId,
      members: room.members,
    }));
    res.status(200).json({ rooms: roomsWithOwner });
  } catch (error) {
    console.error("Error fetching user rooms:", error);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

app.use("/learning", learningRouter);

app.get("/room/:roomId", async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.status(200).json({ room });
  } catch (error) {
    console.error("Error fetching room:", error);
    res.status(500).json({ error: "Failed to fetch room" });
  }
});

// Get detailed room info with member names and module details
app.get("/room/:roomId/details", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check if user is a member
    if (!req.user || !room.members.includes(req.user.userId)) {
      return res.status(403).json({ error: "You are not a member of this room" });
    }

    // Get member names
    const memberUsers = await User.find({ _id: { $in: room.members } }).select('_id name');
    const memberNames = room.members.map(memberId => {
      const memberUser = memberUsers.find(u => u._id === memberId);
      return memberUser ? memberUser.name : memberId;
    });

    // Get owner name
    const ownerUser = memberUsers.find(u => u._id === room.ownerId);
    const ownerName = ownerUser ? ownerUser.name : room.ownerId;

    // Get module info if learning room
    let moduleName, moduleDescription, totalCheckpoints;
    if (room.isLearningRoom && room.moduleId) {
      const moduleInfo = await LearningModule.findOne({ moduleId: room.moduleId });
      if (moduleInfo) {
        moduleName = moduleInfo.title;
        moduleDescription = `${moduleInfo.difficulty} • ${moduleInfo.estimatedTimeMinutes} min • ${moduleInfo.language}`;
        totalCheckpoints = moduleInfo.checkpoints.length;
      }
    }

    res.status(200).json({
      room: {
        roomId: room.roomId,
        displayName: room.displayName,
        ownerId: room.ownerId,
        ownerName,
        members: room.members,
        memberNames,
        isLearningRoom: room.isLearningRoom || false,
        moduleId: room.moduleId,
        moduleName,
        moduleDescription,
        currentCheckpointIndex: room.currentCheckpointIndex || 0,
        totalCheckpoints,
        createdAt: room.createdAt,
      }
    });
  } catch (error) {
    console.error("Error fetching room details:", error);
    res.status(500).json({ error: "Failed to fetch room details" });
  }
});

/** Integer percentages that sum to 100 (largest remainder method). */
function scoresToPercents(scores: number[]): number[] {
  const total = scores.reduce((a, b) => a + b, 0);
  if (total === 0) return scores.map(() => 0);
  const exact = scores.map((s) => (100 * s) / total);
  const floors = exact.map((x) => Math.floor(x));
  let rem = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) floors[order[k].i]++;
  return floors;
}

// Room activity stats (chat + AI tutor attribution) for dashboard
app.get("/room/:roomId/stats", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.params;
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (!room.members.includes(req.user.userId)) {
      return res.status(403).json({ error: "You are not a member of this room" });
    }

    const activity = await aggregateRoomMemberActivity(room);
    const { idToName, chatByUser, aiByUser } = activity;

    const CHAT_W = 1;
    const AI_W = 2;
    const memberIds = [...room.members];
    const scores = memberIds.map((mid) => {
      const chat = chatByUser.get(String(mid)) || 0;
      const ai = aiByUser.get(String(mid)) || 0;
      return chat * CHAT_W + ai * AI_W;
    });
    const percents = scoresToPercents(scores);

    const contributions = memberIds.map((mid, i) => ({
      userId: mid,
      userName: idToName.get(String(mid)) || mid,
      chatMessages: chatByUser.get(String(mid)) || 0,
      aiQuestions: aiByUser.get(String(mid)) || 0,
      activityScore: scores[i],
      contributionPercent: percents[i],
    }));

    const codeDoc = await Code.findOne({ codeId: room.codeId })
      .select("language updatedAt")
      .lean();

    res.status(200).json({
      summary: {
        totalChatMessages: activity.totalChatMessages,
        totalAiQuestions: activity.totalAiUserMessages,
        memberCount: room.members.length,
        language: codeDoc?.language || "javascript",
        lastActivityAt: activity.lastActivityAt?.toISOString() ?? null,
        codeLastUpdatedAt: codeDoc?.updatedAt?.toISOString() ?? null,
        hasLoggedActivity: scores.some((s) => s > 0),
      },
      contributions,
      weights: { chatMessage: CHAT_W, aiQuestion: AI_W },
    });
  } catch (error) {
    console.error("Error fetching room stats:", error);
    res.status(500).json({ error: "Failed to fetch room stats" });
  }
});

// Teaching cohort view: room owner only, learning rooms only. Supportive signals for check-ins — not grades.
app.get(
  "/room/:roomId/teaching-insights",
  authenticateToken,
  async (req: AuthRequest, res) => {
    const { roomId } = req.params;
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const room = await Room.findOne({ roomId });
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }
      if (room.ownerId !== req.user.userId) {
        return res
          .status(403)
          .json({ error: "Only the room owner can view teaching insights." });
      }
      if (!room.isLearningRoom) {
        return res.status(400).json({
          error: "Teaching insights are only available for learning rooms.",
        });
      }

      const activity = await aggregateRoomMemberActivity(room);
      const learners = await buildLearnerTeachingRows(
        [...room.members],
        activity.idToName,
        {
          chatByUser: activity.chatByUser,
          aiByUser: activity.aiByUser,
          anyMemberActivity: activity.anyMemberActivity,
        }
      );

      const checkInSuggestedCount = learners.filter((l) => l.suggestCheckIn)
        .length;

      let sharedCheckpointIndex = room.currentCheckpointIndex ?? 0;
      let moduleCompleted = false;
      if (room.moduleId) {
        const mod = await LearningModule.findOne({ moduleId: room.moduleId })
          .select("checkpoints")
          .lean();
        const n = mod?.checkpoints?.length ?? 0;
        if (n > 0) {
          const raw = room.currentCheckpointIndex ?? 0;
          moduleCompleted = raw >= n;
          sharedCheckpointIndex = Math.min(raw, n - 1);
        }
      }

      res.status(200).json({
        disclaimer:
          "These are automated, privacy-preserving signals (no raw answers or code). Use them for supportive check-ins, not grading.",
        sharedCheckpointIndex,
        moduleCompleted,
        summary: {
          memberCount: room.members.length,
          checkInSuggestedCount,
          anyRoomActivity: activity.anyMemberActivity,
        },
        learners,
      });
    } catch (error) {
      console.error("Error fetching teaching insights:", error);
      res.status(500).json({ error: "Failed to fetch teaching insights" });
    }
  }
);

// Delete a room (only owner can delete)
app.delete("/room/:roomId", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.params;

  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check if user is the owner
    if (room.ownerId !== req.user.userId) {
      return res.status(403).json({ error: "Only the room owner can delete the room" });
    }

    // Delete associated entities
    await Code.deleteOne({ codeId: room.codeId });
    await Notes.deleteOne({ notesId: room.notesId });
    await ChatMessage.deleteMany({ chatId: room.chatId });
    await AiMessage.deleteMany({ roomId: room.roomId });

    // Delete the room
    await Room.deleteOne({ roomId });

    res.status(200).json({ message: "Room deleted successfully" });
  } catch (error) {
    console.error("Error deleting room:", error);
    res.status(500).json({ error: "Failed to delete room" });
  }
});

// Update room display name (owner only)
app.patch("/room/:roomId", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.params;

  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!Object.prototype.hasOwnProperty.call(req.body, "displayName")) {
    return res.status(400).json({ error: "Missing displayName" });
  }
  const { displayName: displayNameRaw } = req.body;
  if (typeof displayNameRaw !== "string") {
    return res.status(400).json({ error: "displayName must be a string" });
  }

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (room.ownerId !== req.user.userId) {
      return res.status(403).json({ error: "Only the room owner can rename the room" });
    }

    const cleaned = sanitizeRoomDisplayName(displayNameRaw);

    if (cleaned) {
      room.displayName = cleaned;
    } else {
      room.set("displayName", undefined);
    }
    await room.save();

    res.status(200).json({
      room: {
        roomId: room.roomId,
        displayName: room.displayName,
        ownerId: room.ownerId,
        members: room.members,
      },
    });
  } catch (error) {
    console.error("Error updating room:", error);
    res.status(500).json({ error: "Failed to update room" });
  }
});

// Get all room data (code, language, AI messages, chat)
app.get("/room/:roomId/data", async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Fetch code
    const code = await Code.findOne({ codeId: room.codeId });
    
    // Fetch AI messages
    const aiMessages = await AiMessage.find({ roomId })
      .sort({ createdAt: 1 })
      .exec();

    // Fetch chat messages
    const chatMessages = await ChatMessage.find({ chatId: room.chatId })
      .sort({ timestamp: 1 })
      .limit(50)
      .exec();

    res.status(200).json({
      code: code?.sourceCode || "// Write your code here...",
      language: code?.language || "javascript",
      aiMessages: aiMessages.map(msg => ({
        sender: msg.sender,
        text: msg.text,
        userName: msg.userName,
        userId: msg.userId,
      })),
      chatMessages: chatMessages.map(msg => ({
        userId: msg.userId,
        userName: msg.userName,
        message: msg.message,
        timestamp: msg.timestamp,
      })),
    });
  } catch (error) {
    console.error("Error fetching room data:", error);
    res.status(500).json({ error: "Failed to fetch room data" });
  }
});

// Get code for a room
app.get("/code/:roomId", async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const code = await Code.findOne({ codeId: room.codeId });
    if (!code) {
      return res.status(404).json({ error: "Code not found" });
    }

    res.status(200).json({ code });
  } catch (error) {
    console.error("Error fetching code:", error);
    res.status(500).json({ error: "Failed to fetch code" });
  }
});

// Update code for a room
app.put("/code/:roomId", async (req, res) => {
  const { roomId } = req.params;
  const { sourceCode, language } = req.body;

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const code = await Code.findOneAndUpdate(
      { codeId: room.codeId },
      { sourceCode, language },
      { new: true }
    );

    res.status(200).json({ code });
  } catch (error) {
    console.error("Error updating code:", error);
    res.status(500).json({ error: "Failed to update code" });
  }
});

// Get user's learning profile
app.get("/learning-profile/:userId", authenticateToken, async (req: AuthRequest, res) => {
  const { userId } = req.params;

  // Ensure user can only access their own profile (or we could allow admins)
  if (!req.user || req.user.userId !== userId) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const profileData = await getUserProfileData(userId);
    
    if (!profileData) {
      return res.status(200).json({
        message: "No learning data yet",
        profile: {
          weaknesses: [],
          strengths: [],
          metrics: {
            totalAiQuestions: 0,
            totalTestFailures: 0,
            totalTestPasses: 0,
            topTopics: [],
          },
          learningPace: 'unknown',
          recentErrors: [],
        }
      });
    }

    res.status(200).json({ profile: profileData });
  } catch (error) {
    console.error("Error fetching learning profile:", error);
    res.status(500).json({ error: "Failed to fetch learning profile" });
  }
});

// Get learning insights/summary for a user (simpler endpoint for quick display)
app.get("/learning-profile/:userId/summary", authenticateToken, async (req: AuthRequest, res) => {
  const { userId } = req.params;

  if (!req.user || req.user.userId !== userId) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const summary = await getUserAiContext(userId);
    res.status(200).json({ 
      summary: summary || "Keep learning! Your profile will build up as you interact with the AI tutor and complete exercises."
    });
  } catch (error) {
    console.error("Error fetching learning summary:", error);
    res.status(500).json({ error: "Failed to fetch learning summary" });
  }
});

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Express Server Listening on port ${PORT}`);
});

async function main() {
  try {
    await connectToDatabase();
    await redisClient.connect();

    // Seed initial learning modules once database is available.
    await ensureDefaultLearningModules();
    // Optionally load / upsert additional modules from JSON definition.
    await seedLearningModulesFromJson();

    console.log("Redis Client Connected");
  } catch (error) {
    console.log("Failed to connect to services", error);
  }
}

main();
