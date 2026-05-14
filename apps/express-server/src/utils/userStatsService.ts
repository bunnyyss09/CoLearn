import UserStats from "../models/UserStats";

const BADGE_BEGINNER = "beginner_solver";
const BADGE_DEDICATED = "dedicated_learner";
const BADGE_STREAK3 = "streak_3";
const BADGE_STREAK7 = "streak_7";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function evaluateBadges(s: {
  problemsSolved: number;
  timeSpentSeconds: number;
  streak: number;
}): string[] {
  const next = new Set<string>();
  if (s.problemsSolved >= 10) next.add(BADGE_BEGINNER);
  if (s.timeSpentSeconds >= 3600) next.add(BADGE_DEDICATED);
  if (s.streak >= 3) next.add(BADGE_STREAK3);
  if (s.streak >= 7) next.add(BADGE_STREAK7);
  return Array.from(next);
}

export async function getOrCreateUserStats(userId: string) {
  let doc = await UserStats.findOne({ userId });
  if (!doc) {
    doc = await UserStats.create({ userId });
  }
  return doc;
}

/**
 * Called after a test run in a learning room.
 */
export async function recordStatsAfterTestRun(
  userId: string,
  opts: {
    allPassed: boolean;
    topicLabel: string;
  }
): Promise<void> {
  const doc = await getOrCreateUserStats(userId);
  const today = todayIsoDate();
  const topic = opts.topicLabel.trim().slice(0, 120);
  if (topic) {
    if (!doc.topicsCovered.includes(topic)) {
      doc.topicsCovered = [...doc.topicsCovered, topic].slice(-50);
    }
    if (opts.allPassed) {
      doc.problemsSolved += 1;
    } else {
      if (!doc.weakTopics.includes(topic)) {
        doc.weakTopics = [...doc.weakTopics, topic].slice(-20);
      }
    }
  } else if (opts.allPassed) {
    doc.problemsSolved += 1;
  }

  doc.timeSpentSeconds += 45;

  if (doc.lastActivityDate === today) {
    /* already counted a learning day today */
  } else if (doc.lastActivityDate === yesterdayIsoDate()) {
    doc.streak = (doc.streak || 0) + 1;
    doc.lastActivityDate = today;
  } else {
    doc.streak = 1;
    doc.lastActivityDate = today;
  }

  const ap = doc.activityPoints || [];
  const last = ap[ap.length - 1];
  const now = new Date();
  if (!last || now.getTime() - new Date(last.at).getTime() > 36e5) {
    doc.activityPoints = [...ap, { at: now, problemsSolved: doc.problemsSolved }].slice(-90);
  } else {
    const copy = [...ap];
    copy[copy.length - 1] = { at: now, problemsSolved: doc.problemsSolved };
    doc.activityPoints = copy.slice(-90);
  }

  doc.badges = evaluateBadges({
    problemsSolved: doc.problemsSolved,
    timeSpentSeconds: doc.timeSpentSeconds,
    streak: doc.streak,
  });

  await doc.save();
}

export async function getUserStatsPayload(userId: string) {
  const doc = await getOrCreateUserStats(userId);
  return {
    userId: doc.userId,
    problemsSolved: doc.problemsSolved,
    topicsCovered: doc.topicsCovered,
    streak: doc.streak,
    badges: doc.badges,
    timeSpent: doc.timeSpentSeconds,
    weakTopics: doc.weakTopics,
    lastActivityDate: doc.lastActivityDate,
    progressOverTime: (doc.activityPoints || []).map((p) => ({
      at: p.at,
      problemsSolved: p.problemsSolved,
    })),
  };
}
