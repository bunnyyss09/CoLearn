/**
 * Learning module backend: APIs for modules, learning rooms, checkpoints, and test runs.
 *
 * APIs:
 *   GET  /learning/modules                    - List available modules (summaries)
 *   GET  /learning/modules/:moduleId            - Get one module with full checkpoints
 *   POST /learning/room/create                 - Create/bind learning room (body: roomId, moduleId)
 *   GET  /learning/room/:roomId/state           - Get room + module + current user progress
 *   POST /learning/room/:roomId/run-tests      - Run current checkpoint tests (body: code?)
 *   POST /learning/room/:roomId/checkpoints/:checkpointId/complete - Mark complete (body: code?)
 *   POST /learning/room/:roomId/checkpoints/:checkpointId/explain  - Submit explanation
 *   POST /learning/room/:roomId/next           - Advance to next checkpoint (body: code?)
 *   POST /learning/room/:roomId/previous       - Go to previous checkpoint
 *
 * Example module: "loops-beginners" (Python loops with test cases on fix-code and write-code).
 */

import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import LearningModule, { ICheckpoint, ILearningModule } from "../models/LearningModule";
import LearningProgress, { CheckpointStatus } from "../models/LearningProgress";
import Room from "../models/Room";
import Code from "../models/Code";
import Notes from "../models/Notes";
import User from "../models/User";
import { authenticateToken, AuthRequest } from "../utils/auth";
import { runCodeWithInput, normalizeOutput } from "../utils/runCode";
import { recordTestResult } from "../utils/learningProfileService";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeForComparison } = require("../utils/outputNormalization");
const router = Router();

export async function ensureDefaultLearningModules(): Promise<void> {
  const existing = await LearningModule.findOne({ moduleId: "loops-beginners" });
  if (existing) return;

  const checkpoints: ICheckpoint[] = [
    {
      checkpointId: "loops-1-predict-output",
      title: "Predict simple loop output",
      type: "predict-output",
      summary: "Mentally trace a basic for-loop and predict its output.",
      description:
        "Look at the code below and, **without running it**, work together to predict exactly what will be printed.\n\nFocus on understanding how the loop variable changes and how many times the body executes.",
      starterCode: `# Python
for i in range(1, 4):
    print("Loop:", i)
`,
      readOnlyCode: true,
      expectedOutput: `Loop: 1
Loop: 2
Loop: 3`,
      requirePeerReview: false,
      aiMode: "socratic",
    },
    {
      checkpointId: "loops-2-fix-code",
      title: "Fix an off-by-one error",
      type: "fix-code",
      summary: "Debug a loop that runs too many or too few times.",
      description:
        "The following loop is supposed to print the numbers 1 through 5, one per line. Work together to identify the bug and fix it.\n\nDiscuss **why** the bug happens before changing the code.",
      starterCode: `# Python
for i in range(0, 6):
    print(i)
`,
      readOnlyCode: false,
      testCases: [{ input: "", expectedOutput: "1\n2\n3\n4\n5" }],
      requirePeerReview: false,
      aiMode: "hint",
    },
    {
      checkpointId: "loops-3-write-code",
      title: "Write your own loop",
      type: "write-code",
      summary: "Collaboratively write a loop from scratch.",
      description:
        "Write a loop that prints all even numbers from 2 to 10.\n\nTry to:\n- Decide together on the loop bounds\n- Choose a good variable name\n- Keep the code readable and consistent",
      starterCode: `# Python
# TODO: print all even numbers from 2 to 10
`,
      readOnlyCode: false,
      testCases: [{ input: "", expectedOutput: "2\n4\n6\n8\n10" }],
      requirePeerReview: false,
      aiMode: "hint",
    },
    {
      checkpointId: "loops-4-explain",
      title: "Explain loops in your own words",
      type: "explain-to-unlock",
      summary: "Explain how loops work before moving on.",
      description:
        "One learner should write a short explanation (3–5 sentences) of **how a basic for-loop works** in Python.\n\nOthers can add comments or suggest improvements. The AI guide will review the explanation for clarity and basic correctness. Only then will the next checkpoint unlock.",
      readOnlyCode: true,
      aiMode: "review",
    },
    {
      checkpointId: "loops-5-reflection",
      title: "Reflection: what did you learn?",
      type: "reflection",
      summary: "Capture personal takeaways from this module.",
      description:
        "Each learner should write a short reflection (2–4 sentences) about what they learned about loops, and what still feels confusing.\n\nBe honest; this is for your future self and your peers.",
      readOnlyCode: true,
      aiMode: "summarizer",
    },
  ];

  await LearningModule.create({
    moduleId: "loops-beginners",
    title: "Loops for Beginners",
    description: "Learn the basics of for and while loops through hands-on coding exercises.",
    language: "python",
    difficulty: "beginner",
    estimatedTimeMinutes: 25,
    tags: ["basics", "control-flow", "iteration"],
    prerequisites: [],
    checkpoints,
  } as Partial<ILearningModule>);
}

router.get("/modules", async (_req, res) => {
  try {
    const modules = await LearningModule.find(
      {},
      "moduleId title description language difficulty estimatedTimeMinutes tags prerequisites"
    ).lean();
    res.status(200).json({ modules });
  } catch (error) {
    console.error("Error fetching learning modules:", error);
    res.status(500).json({ error: "Failed to fetch learning modules" });
  }
});

router.get("/modules/:moduleId", async (req, res) => {
  const { moduleId } = req.params;
  try {
    const module = await LearningModule.findOne({ moduleId }).lean();
    if (!module) return res.status(404).json({ error: "Module not found" });
    res.status(200).json({ module });
  } catch (error) {
    console.error("Error fetching learning module:", error);
    res.status(500).json({ error: "Failed to fetch learning module" });
  }
});

router.post("/room/create", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId, moduleId, forceSwitch } = req.body;
  if (!roomId || !moduleId) {
    return res.status(400).json({ error: "Missing roomId or moduleId" });
  }
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const module = await LearningModule.findOne({ moduleId });
    if (!module) return res.status(404).json({ error: "Module not found" });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const ownerId = String(user._id);

    let room = await Room.findOne({ roomId });
    let needsModuleUpdate = false;
    if (room) {
      const existingModuleId = room.moduleId != null ? String(room.moduleId).trim() : null;
      const requestedModuleId = String(module.moduleId).trim();
      if (room.isLearningRoom && existingModuleId && existingModuleId !== requestedModuleId) {
        if (!forceSwitch) {
          // Return error with current module info so frontend can prompt
          const currentModule = await LearningModule.findOne({ moduleId: existingModuleId });
          return res.status(409).json({ 
            error: "Room is already a learning room for a different module",
            code: "MODULE_CONFLICT",
            currentModuleId: existingModuleId,
            currentModuleTitle: currentModule?.title || existingModuleId
          });
        }
        // forceSwitch = true: Switch to new module
        // Delete old progress for all users in this room for the old module
        await LearningProgress.deleteMany({ roomId, moduleId: existingModuleId });
        needsModuleUpdate = true; // Force update to new module
      }
      const needsModuleBinding = !room.isLearningRoom || !existingModuleId || needsModuleUpdate;
      if (needsModuleBinding) {
        room.isLearningRoom = true;
        room.moduleId = module.moduleId;
        room.currentCheckpointIndex = 0;
        await room.save();
        const firstCheckpoint = module.checkpoints[0];
        if (firstCheckpoint) {
          await Code.findOneAndUpdate(
            { codeId: room.codeId },
            {
              sourceCode: firstCheckpoint.starterCode ?? "# Python\n# Learning room code.\n",
              language: module.language,
            }
          );
        }
      }
      if (!room.members.includes(ownerId)) {
        room.members.push(ownerId);
        await room.save();
      }
    } else {
      const chatId = uuidv4();
      const notesId = uuidv4();
      const codeId = uuidv4();
      await Code.create({
        codeId,
        roomId,
        sourceCode: module.checkpoints[0]?.starterCode ?? "# Python\n# Learning room code.\n",
        language: module.language,
      });
      await Notes.create({ notesId, roomId, content: "" });
      const newRoom = await Room.create({
        roomId,
        ownerId,
        members: [ownerId],
        chatId,
        notesId,
        codeId,
        isLearningRoom: true,
        moduleId: module.moduleId,
        currentCheckpointIndex: 0,
      });
      room = Array.isArray(newRoom) ? newRoom[0] : newRoom;
    }

    const roomIdVal = room!.roomId;
    const existingProgress = await LearningProgress.findOne({
      roomId: roomIdVal,
      moduleId: module.moduleId,
      userId: ownerId,
    });
    if (!existingProgress) {
      await LearningProgress.create({
        roomId: roomIdVal,
        moduleId: module.moduleId,
        userId: ownerId,
        currentCheckpointIndex: 0,
        checkpoints: module.checkpoints.map((cp, index) => ({
          checkpointId: cp.checkpointId,
          status: (index === 0 ? "in_progress" : "pending") as CheckpointStatus,
        })),
      });
    }

    res.status(200).json({
      room: {
        roomId: room!.roomId,
        ownerId: room!.ownerId,
        members: room!.members,
        isLearningRoom: room!.isLearningRoom,
        moduleId: room!.moduleId,
        currentCheckpointIndex: room!.currentCheckpointIndex ?? 0,
      },
      module: {
        moduleId: module.moduleId,
        title: module.title,
        language: module.language,
        difficulty: module.difficulty,
        estimatedTimeMinutes: module.estimatedTimeMinutes,
        checkpoints: module.checkpoints,
      },
    });
  } catch (error) {
    console.error("Error creating learning room:", error);
    res.status(500).json({ error: "Failed to create learning room" });
  }
});

router.post("/room/:roomId/run-tests", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.params;
  const { code: codeOverride } = req.body;
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const room = await Room.findOne({ roomId });
    if (!room || !room.isLearningRoom || !room.moduleId) {
      return res.status(404).json({ error: "Learning room not found" });
    }
    const module = await LearningModule.findOne({ moduleId: room.moduleId });
    if (!module) return res.status(404).json({ error: "Module not found for room" });

    const currentIndex = room.currentCheckpointIndex ?? 0;
    const checkpoint = module.checkpoints[currentIndex];
    if (!checkpoint) return res.status(400).json({ error: "No current checkpoint" });

    const testCases = (checkpoint as any).testCases as Array<{ input: string; expectedOutput: string }> | undefined;
    if (!testCases || testCases.length === 0) {
      return res.status(200).json({ allPassed: true, results: [], message: "No test cases for this checkpoint." });
    }

    let code = codeOverride;
    if (code === undefined) {
      const codeDoc = await Code.findOne({ codeId: room.codeId });
      code = codeDoc?.sourceCode ?? "";
    }
    const language = module.language;
    const results: Array<{ input: string; expectedOutput: string; actualOutput: string; passed: boolean }> = [];
    for (const { input, expectedOutput } of testCases) {
      const actualRaw = await runCodeWithInput(code, language, input ?? "");
      const actualOutput = normalizeForComparison(actualRaw);
      const expectedNormalized = normalizeForComparison(expectedOutput);
      results.push({
        input: input ?? "",
        expectedOutput: expectedNormalized,
        actualOutput,
        passed: actualOutput === expectedNormalized,
      }); 
    }
    const allPassed = results.every((r) => r.passed);
    
    // Track test results for user learning profile
    try {
      await recordTestResult(req.user.userId, allPassed, checkpoint.title);
    } catch (trackError) {
      console.error("Error tracking test result:", trackError);
      // Don't fail the request if tracking fails
    }
    
    res.status(200).json({ allPassed, results });
  } catch (error) {
    console.error("Error running tests:", error);
    res.status(500).json({ error: "Failed to run tests" });
  }
});

router.get("/room/:roomId/state", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.params;
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const room = await Room.findOne({ roomId });
    if (!room || !room.isLearningRoom || !room.moduleId) {
      return res.status(404).json({ error: "Learning room not found" });
    }
    const module = await LearningModule.findOne({ moduleId: room.moduleId });
    if (!module) return res.status(404).json({ error: "Module not found for room" });

    const progress = await LearningProgress.findOne({
      roomId: room.roomId,
      moduleId: module.moduleId,
      userId: req.user.userId,
    });

    res.status(200).json({
      room: {
        roomId: room.roomId,
        ownerId: room.ownerId,
        members: room.members,
        isLearningRoom: room.isLearningRoom,
        moduleId: room.moduleId,
        currentCheckpointIndex: room.currentCheckpointIndex ?? 0,
      },
      module,
      progress,
    });
  } catch (error) {
    console.error("Error fetching learning room state:", error);
    res.status(500).json({ error: "Failed to fetch learning room state" });
  }
});

function runTestsForCheckpoint(
  code: string,
  language: string,
  testCases: Array<{ input: string; expectedOutput: string }>
): Promise<Array<{ input: string; expectedOutput: string; actualOutput: string; passed: boolean }>> {
  return (async () => {
    const results: Array<{ input: string; expectedOutput: string; actualOutput: string; passed: boolean }> = [];
    for (const { input, expectedOutput } of testCases) {
      const actualRaw = await runCodeWithInput(code, language, input ?? "");
      const actualOutput = normalizeForComparison(actualRaw);
      const expectedNormalized = normalizeForComparison(expectedOutput);
      results.push({
        input: input ?? "",
        expectedOutput: expectedNormalized,
        actualOutput,
        passed: actualOutput === expectedNormalized,
      });
    }
    return results;
  })();
}

router.post(
  "/room/:roomId/checkpoints/:checkpointId/complete",
  authenticateToken,
  async (req: AuthRequest, res) => {
    const { roomId, checkpointId } = req.params;
    const { code: codeOverride } = req.body;
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    try {
      const room = await Room.findOne({ roomId });
      if (!room || !room.isLearningRoom || !room.moduleId) {
        return res.status(404).json({ error: "Learning room not found" });
      }
      const module = await LearningModule.findOne({ moduleId: room.moduleId });
      if (!module) return res.status(404).json({ error: "Module not found for room" });

      const checkpoint = module.checkpoints.find((cp) => cp.checkpointId === checkpointId);
      if (!checkpoint) return res.status(404).json({ error: "Checkpoint not found" });

      const testCases = (checkpoint as any).testCases as Array<{ input: string; expectedOutput: string }> | undefined;
      if (testCases && testCases.length > 0) {
        let code = codeOverride;
        if (code === undefined) {
          const codeDoc = await Code.findOne({ codeId: room.codeId });
          code = codeDoc?.sourceCode ?? "";
        }
        const results = await runTestsForCheckpoint(code, module.language, testCases);
        const allPassed = results.every((r) => r.passed);
        if (!allPassed) {
          return res.status(400).json({
            error: "All test cases must pass before completing this checkpoint.",
            allPassed: false,
            results,
          });
        }
      }

      const progress = await LearningProgress.findOneAndUpdate(
        {
          roomId: room.roomId,
          moduleId: module.moduleId,
          userId: req.user.userId,
          "checkpoints.checkpointId": checkpointId,
        },
        { $set: { "checkpoints.$.status": "completed" } },
        { new: true }
      );
      if (!progress) return res.status(404).json({ error: "Progress not found for this checkpoint" });
      res.status(200).json({ progress });
    } catch (error) {
      console.error("Error completing checkpoint:", error);
      res.status(500).json({ error: "Failed to complete checkpoint" });
    }
  }
);

router.post(
  "/room/:roomId/checkpoints/:checkpointId/explain",
  authenticateToken,
  async (req: AuthRequest, res) => {
    const { roomId, checkpointId } = req.params;
    const { explanation } = req.body;
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!explanation || typeof explanation !== "string") {
      return res.status(400).json({ error: "Missing explanation" });
    }
    try {
      const room = await Room.findOne({ roomId });
      if (!room || !room.isLearningRoom || !room.moduleId) {
        return res.status(404).json({ error: "Learning room not found" });
      }
      const module = await LearningModule.findOne({ moduleId: room.moduleId });
      if (!module) return res.status(404).json({ error: "Module not found for room" });
      const checkpoint = module.checkpoints.find((cp) => cp.checkpointId === checkpointId);
      if (!checkpoint || checkpoint.type !== "explain-to-unlock") {
        return res.status(400).json({ error: "Checkpoint is not explain-to-unlock" });
      }
      const progress = await LearningProgress.findOneAndUpdate(
        {
          roomId: room.roomId,
          moduleId: module.moduleId,
          userId: req.user.userId,
          "checkpoints.checkpointId": checkpointId,
        },
        {
          $set: {
            "checkpoints.$.explanationText": explanation,
            "checkpoints.$.explanationAccepted": null,
            "checkpoints.$.status": "in_progress",
          },
        },
        { new: true }
      );
      res.status(200).json({ accepted: null, feedback: null, progress });
    } catch (error) {
      console.error("Error saving explanation:", error);
      res.status(500).json({ error: "Failed to save explanation" });
    }
  }
);

router.post("/room/:roomId/next", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.params;
  const { code: codeOverride } = req.body;
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const room = await Room.findOne({ roomId });
    if (!room || !room.isLearningRoom || !room.moduleId) {
      return res.status(404).json({ error: "Learning room not found" });
    }
    const module = await LearningModule.findOne({ moduleId: room.moduleId });
    if (!module) return res.status(404).json({ error: "Module not found for room" });

    const currentIndex = room.currentCheckpointIndex ?? 0;
    if (currentIndex >= module.checkpoints.length) {
      return res.status(400).json({ error: "Module already completed" });
    }

    const currentCp = module.checkpoints[currentIndex];
    const testCases = (currentCp as any).testCases as Array<{ input: string; expectedOutput: string }> | undefined;
    if (testCases && testCases.length > 0) {
      let code = codeOverride;
      if (code === undefined) {
        const codeDoc = await Code.findOne({ codeId: room.codeId });
        code = codeDoc?.sourceCode ?? "";
      }
      const results = await runTestsForCheckpoint(code, module.language, testCases);
      const allPassed = results.every((r) => r.passed);
      if (!allPassed) {
        return res.status(400).json({
          error: "All test cases must pass before moving to the next checkpoint.",
          allPassed: false,
          results,
        });
      }
    }

    room.currentCheckpointIndex = Math.min(currentIndex + 1, module.checkpoints.length - 1);
    await room.save();
    await LearningProgress.updateMany(
      { roomId: room.roomId, moduleId: module.moduleId },
      { $set: { currentCheckpointIndex: room.currentCheckpointIndex } }
    );
    res.status(200).json({ room: { roomId: room.roomId, currentCheckpointIndex: room.currentCheckpointIndex } });
  } catch (error) {
    console.error("Error advancing to next checkpoint:", error);
    res.status(500).json({ error: "Failed to advance checkpoint" });
  }
});

router.post("/room/:roomId/previous", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.params;
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const room = await Room.findOne({ roomId });
    if (!room || !room.isLearningRoom || !room.moduleId) {
      return res.status(404).json({ error: "Learning room not found" });
    }
    const module = await LearningModule.findOne({ moduleId: room.moduleId });
    if (!module) return res.status(404).json({ error: "Module not found for room" });

    const currentIndex = room.currentCheckpointIndex ?? 0;
    if (currentIndex <= 0) return res.status(400).json({ error: "Already at the first checkpoint" });

    room.currentCheckpointIndex = currentIndex - 1;
    await room.save();
    await LearningProgress.updateMany(
      { roomId: room.roomId, moduleId: module.moduleId },
      { $set: { currentCheckpointIndex: room.currentCheckpointIndex } }
    );
    res.status(200).json({ room: { roomId: room.roomId, currentCheckpointIndex: room.currentCheckpointIndex } });
  } catch (error) {
    console.error("Error moving to previous checkpoint:", error);
    res.status(500).json({ error: "Failed to move to previous checkpoint" });
  }
});

export default router;
