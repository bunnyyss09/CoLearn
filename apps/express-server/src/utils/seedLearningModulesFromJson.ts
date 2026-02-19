import fs from "fs/promises";
import path from "path";
import LearningModule, { ILearningModule } from "../models/LearningModule";

const MODULES_JSON_PATH = path.resolve(
  __dirname,
  "../../learning-modules.json"
);

/**
 * Seed / upsert learning modules from a JSON file on server start.
 * The JSON file should look like:
 *
 * {
 *   "modules": [
 *     {
 *       "moduleId": "my-module-id",
 *       "title": "My Module",
 *       "language": "python",
 *       "difficulty": "beginner",
 *       "estimatedTimeMinutes": 30,
 *       "checkpoints": [ ...ICheckpoint fields... ]
 *     }
 *   ]
 * }
 */
export async function seedLearningModulesFromJson(): Promise<void> {
  try {
    const raw = await fs.readFile(MODULES_JSON_PATH, "utf-8");
    const parsed = JSON.parse(raw) as {
      modules?: Partial<ILearningModule>[];
    };

    if (!parsed.modules || !Array.isArray(parsed.modules)) {
      console.warn(
        "[learning-seed] No 'modules' array found in learning-modules.json"
      );
      return;
    }

    for (const mod of parsed.modules) {
      if (!mod.moduleId) continue;
      await LearningModule.updateOne(
        { moduleId: mod.moduleId },
        {
          $set: {
            title: mod.title,
            language: mod.language,
            difficulty: mod.difficulty,
            estimatedTimeMinutes: mod.estimatedTimeMinutes,
            checkpoints: mod.checkpoints ?? [],
          },
        },
        { upsert: true }
      );
    }

    console.log(
      `[learning-seed] Seeded/updated ${parsed.modules.length} learning modules from JSON`
    );
  } catch (err: any) {
    if (err.code === "ENOENT") {
      // File is optional – skip if not present.
      console.warn(
        "[learning-seed] learning-modules.json not found; skipping JSON seed"
      );
      return;
    }
    console.error("[learning-seed] Failed to seed modules from JSON:", err);
  }
}

