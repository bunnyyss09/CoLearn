import UserLearningProfile from '../models/UserLearningProfile';

/**
 * Error categories for classification
 */
const ERROR_PATTERNS = {
  syntax: [
    /SyntaxError/i,
    /unexpected token/i,
    /missing.*[;:,{}()\[\]]/i,
    /invalid syntax/i,
    /unterminated string/i,
    /expected.*[;:,{}()\[\]]/i,
  ],
  logic: [
    /infinite loop/i,
    /stack overflow/i,
    /maximum.*exceeded/i,
    /wrong.*answer/i,
    /incorrect.*output/i,
  ],
  runtime: [
    /ReferenceError/i,
    /TypeError/i,
    /undefined is not/i,
    /null.*reference/i,
    /cannot read property/i,
    /is not defined/i,
    /NameError/i,
    /AttributeError/i,
  ],
  indexing: [
    /index.*out.*bounds/i,
    /IndexError/i,
    /ArrayIndexOutOfBoundsException/i,
    /list index out of range/i,
  ],
  types: [
    /type.*error/i,
    /cannot.*convert/i,
    /invalid.*type/i,
    /unexpected.*type/i,
  ],
};

/**
 * Topic patterns to extract from user questions
 */
const TOPIC_PATTERNS: { topic: string; patterns: RegExp[] }[] = [
  { topic: 'loops', patterns: [/\bloop/i, /\bfor\b/i, /\bwhile\b/i, /\biterat/i] },
  { topic: 'functions', patterns: [/\bfunction/i, /\bdef\b/i, /\breturn/i, /\bparameter/i, /\bargument/i] },
  { topic: 'arrays', patterns: [/\barray/i, /\blist/i, /\bindex/i, /\belement/i] },
  { topic: 'strings', patterns: [/\bstring/i, /\btext/i, /\bcharacter/i, /\bsubstring/i] },
  { topic: 'conditionals', patterns: [/\bif\b/i, /\belse/i, /\bcondition/i, /\bboolean/i] },
  { topic: 'variables', patterns: [/\bvariable/i, /\bassign/i, /\bdeclare/i] },
  { topic: 'debugging', patterns: [/\berror/i, /\bbug/i, /\bdebug/i, /\bfix/i, /\bwrong/i, /\bfail/i] },
  { topic: 'recursion', patterns: [/\brecurs/i, /\bbase.*case/i] },
  { topic: 'objects', patterns: [/\bobject/i, /\bclass/i, /\bmethod/i, /\bproperty/i, /\bdict/i] },
  { topic: 'input/output', patterns: [/\binput/i, /\boutput/i, /\bread/i, /\bprint/i, /\bwrite/i] },
];

/**
 * Classifies an error message into categories
 */
export function classifyError(errorMessage: string): { category: string; description: string } {
  for (const [category, patterns] of Object.entries(ERROR_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(errorMessage)) {
        return {
          category,
          description: getErrorDescription(category, errorMessage),
        };
      }
    }
  }
  return { category: 'general', description: 'General programming error' };
}

function getErrorDescription(category: string, errorMessage: string): string {
  const descriptions: Record<string, string> = {
    syntax: 'Syntax/formatting issues',
    logic: 'Logic or algorithmic errors',
    runtime: 'Runtime/undefined variable errors',
    indexing: 'Array/list indexing problems',
    types: 'Type-related issues',
    general: 'General programming error',
  };
  return descriptions[category] || 'Unknown error type';
}

/**
 * Extracts topics from a user's question
 */
export function extractTopics(question: string): string[] {
  const topics: string[] = [];
  
  for (const { topic, patterns } of TOPIC_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(question)) {
        if (!topics.includes(topic)) {
          topics.push(topic);
        }
        break;
      }
    }
  }
  
  return topics;
}

/**
 * Gets or creates a user's learning profile
 */
export async function getOrCreateProfile(userId: string): Promise<any> {
  let profile = await UserLearningProfile.findOne({ userId });
  
  if (!profile) {
    profile = new UserLearningProfile({
      userId,
      weaknesses: [],
      strengths: [],
      metrics: {
        totalAiQuestions: 0,
        totalCodeSubmissions: 0,
        totalTestFailures: 0,
        totalTestPasses: 0,
        topicsAskedAbout: [],
      },
      recentErrors: [],
      learningPace: 'unknown',
    });
    await profile.save();
  }
  
  return profile;
}

/**
 * Records a user asking the AI a question and extracts relevant topics
 */
export async function recordAiInteraction(
  userId: string,
  question: string,
  code?: string
): Promise<void> {
  try {
    const profile = await getOrCreateProfile(userId);
    const topics = extractTopics(question);
    
    // Record each topic found
    for (const topic of topics) {
      (profile as any).recordTopicAsked(topic);
    }
    
    // If no specific topic found, record as "general"
    if (topics.length === 0) {
      (profile as any).recordTopicAsked('general');
    }
    
    await profile.save();
  } catch (error) {
    console.error('Error recording AI interaction:', error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Records a code submission result (error or success)
 */
export async function recordCodeSubmission(
  userId: string,
  output: string,
  language: string,
  isError: boolean
): Promise<void> {
  try {
    const profile = await getOrCreateProfile(userId);
    profile.metrics.totalCodeSubmissions += 1;
    
    if (isError && output) {
      const { category, description } = classifyError(output);
      (profile as any).recordWeakness(category, description, output.substring(0, 200));
      (profile as any).recordError(category, output.substring(0, 500), language);
    }
    
    await profile.save();
  } catch (error) {
    console.error('Error recording code submission:', error);
  }
}

/**
 * Records test results from learning checkpoints
 */
export async function recordTestResult(
  userId: string,
  passed: boolean,
  checkpointTitle?: string
): Promise<void> {
  try {
    const profile = await getOrCreateProfile(userId);
    
    if (passed) {
      profile.metrics.totalTestPasses += 1;
    } else {
      profile.metrics.totalTestFailures += 1;
      
      // Record as a weakness if test failed
      if (checkpointTitle) {
        (profile as any).recordWeakness('checkpoint-failure', `Failed: ${checkpointTitle}`);
      }
    }
    
    // Update learning pace based on failure rate
    const total = profile.metrics.totalTestFailures + profile.metrics.totalTestPasses;
    if (total >= 5) {
      const failRate = profile.metrics.totalTestFailures / total;
      if (failRate > 0.5) {
        profile.learningPace = 'slow';
      } else if (failRate < 0.2) {
        profile.learningPace = 'fast';
      } else {
        profile.learningPace = 'average';
      }
    }
    
    await profile.save();
  } catch (error) {
    console.error('Error recording test result:', error);
  }
}

/**
 * Gets the AI context summary for a user
 */
export async function getUserAiContext(userId: string): Promise<string> {
  try {
    const profile = await UserLearningProfile.findOne({ userId });
    if (!profile) {
      return '';
    }
    return (profile as any).getAiContextSummary();
  } catch (error) {
    console.error('Error getting user AI context:', error);
    return '';
  }
}

/**
 * Gets full profile data for display
 */
export async function getUserProfileData(userId: string): Promise<{
  weaknesses: { category: string; description: string; occurrences: number }[];
  strengths: string[];
  metrics: {
    totalAiQuestions: number;
    totalTestFailures: number;
    totalTestPasses: number;
    topTopics: { topic: string; count: number }[];
  };
  learningPace: string;
  recentErrors: { errorType: string; timestamp: Date }[];
} | null> {
  try {
    const profile = await UserLearningProfile.findOne({ userId });
    if (!profile) {
      return null;
    }
    
    return {
      weaknesses: profile.weaknesses
        .sort((a: { occurrences: number }, b: { occurrences: number }) => b.occurrences - a.occurrences)
        .slice(0, 10)
        .map((w: { category: string; description: string; occurrences: number }) => ({
          category: w.category,
          description: w.description,
          occurrences: w.occurrences,
        })),
      strengths: profile.strengths,
      metrics: {
        totalAiQuestions: profile.metrics.totalAiQuestions,
        totalTestFailures: profile.metrics.totalTestFailures,
        totalTestPasses: profile.metrics.totalTestPasses,
        topTopics: (profile.metrics.topicsAskedAbout || [])
          .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
          .slice(0, 5),
      },
      learningPace: profile.learningPace,
      recentErrors: profile.recentErrors.slice(0, 5).map((e: { errorType: string; timestamp: Date }) => ({
        errorType: e.errorType,
        timestamp: e.timestamp,
      })),
    };
  } catch (error) {
    console.error('Error getting user profile data:', error);
    return null;
  }
}

/** Codes for teacher-facing check-in suggestions (room owner only). */
export type TeachingCheckInHintCode =
  | 'slow_pace'
  | 'low_test_pass_rate'
  | 'low_room_engagement'
  | 'frequent_help_seeking';

export interface LearnerTeachingRow {
  userId: string;
  userName: string;
  learningPace: string;
  testPassRatePercent: number | null;
  testsRunTotal: number;
  topFocusCategory: string | null;
  lifetimeAiQuestions: number;
  roomChatMessages: number;
  roomAiQuestions: number;
  suggestCheckIn: boolean;
  checkInHints: TeachingCheckInHintCode[];
}

/**
 * Build per-learner teaching signals for everyone in a learning room.
 * Uses global learning profile + this room's chat/AI activity only.
 */
export async function buildLearnerTeachingRows(
  memberIds: string[],
  idToName: Map<string, string>,
  activity: {
    chatByUser: Map<string, number>;
    aiByUser: Map<string, number>;
    anyMemberActivity: boolean;
  }
): Promise<LearnerTeachingRow[]> {
  const rows: LearnerTeachingRow[] = [];
  const multiMember = memberIds.length > 1;

  for (const userId of memberIds) {
    const profile = await UserLearningProfile.findOne({ userId }).lean();
    const fails = profile?.metrics?.totalTestFailures ?? 0;
    const passes = profile?.metrics?.totalTestPasses ?? 0;
    const testsTotal = fails + passes;
    const passRate =
      testsTotal > 0 ? Math.round((100 * passes) / testsTotal) : null;

    let topCat: string | null = null;
    const weaknesses = profile?.weaknesses as
      | { category: string; occurrences: number }[]
      | undefined;
    if (weaknesses?.length) {
      const sorted = [...weaknesses].sort(
        (a, b) => b.occurrences - a.occurrences
      );
      topCat = sorted[0]?.category ?? null;
    }

    const pace = profile?.learningPace ?? 'unknown';
    const lifetimeAi = profile?.metrics?.totalAiQuestions ?? 0;
    const roomChat = activity.chatByUser.get(String(userId)) || 0;
    const roomAi = activity.aiByUser.get(String(userId)) || 0;

    const hints: TeachingCheckInHintCode[] = [];
    if (pace === 'slow') hints.push('slow_pace');
    if (testsTotal >= 3 && passRate !== null && passRate < 50) {
      hints.push('low_test_pass_rate');
    }
    if (
      multiMember &&
      activity.anyMemberActivity &&
      roomChat === 0 &&
      roomAi === 0
    ) {
      hints.push('low_room_engagement');
    }
    if (roomAi >= 6 && passRate !== null && passRate < 60 && testsTotal >= 2) {
      hints.push('frequent_help_seeking');
    }

    rows.push({
      userId,
      userName: idToName.get(String(userId)) || userId,
      learningPace: pace,
      testPassRatePercent: passRate,
      testsRunTotal: testsTotal,
      topFocusCategory: topCat,
      lifetimeAiQuestions: lifetimeAi,
      roomChatMessages: roomChat,
      roomAiQuestions: roomAi,
      suggestCheckIn: hints.length > 0,
      checkInHints: hints,
    });
  }

  return rows;
}
