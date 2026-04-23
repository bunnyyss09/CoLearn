import mongoose, { Schema, Document } from 'mongoose';

/**
 * Tracks an individual weakness or area needing improvement.
 */
interface WeaknessEntry {
  category: string;        // e.g., "syntax", "logic", "loops", "functions", "arrays"
  description: string;     // Brief description of the issue
  occurrences: number;     // How many times this has been observed
  lastSeen: Date;
  examples?: string[];     // Recent examples (limit to last 3)
}

/**
 * Tracks interaction patterns for a user.
 */
interface InteractionMetrics {
  totalAiQuestions: number;
  totalCodeSubmissions: number;
  totalTestFailures: number;
  totalTestPasses: number;
  avgTimePerCheckpoint?: number;  // In seconds
  topicsAskedAbout: { topic: string; count: number }[];
}

export type LearningStyleHint = 'unknown' | 'prefers_scaffolding' | 'prefers_brief';

export interface IPastMistake {
  topic: string;
  summary: string;
  at: Date;
}

export interface IUserLearningProfile extends Document {
  userId: string;
  weaknesses: WeaknessEntry[];
  strengths: string[];            // Areas where user performs well
  strongTopics: string[];
  pastMistakes: IPastMistake[];
  learningStyle: LearningStyleHint;
  metrics: InteractionMetrics;
  recentErrors: {                 // Last few errors for context
    errorType: string;
    errorMessage: string;
    language: string;
    timestamp: Date;
  }[];
  learningPace: 'fast' | 'average' | 'slow' | 'unknown';
  lastUpdated: Date;
  createdAt: Date;
}

const WeaknessEntrySchema = new Schema({
  category: { type: String, required: true },
  description: { type: String, required: true },
  occurrences: { type: Number, default: 1 },
  lastSeen: { type: Date, default: Date.now },
  examples: [{ type: String }],
}, { _id: false });

const UserLearningProfileSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    weaknesses: {
      type: [WeaknessEntrySchema],
      default: [],
    },
    strengths: {
      type: [String],
      default: [],
    },
    strongTopics: {
      type: [String],
      default: [],
    },
    pastMistakes: [{
      topic: { type: String, required: true },
      summary: { type: String, required: true },
      at: { type: Date, default: Date.now },
    }],
    learningStyle: {
      type: String,
      enum: ['unknown', 'prefers_scaffolding', 'prefers_brief'] as const,
      default: 'unknown',
    },
    metrics: {
      totalAiQuestions: { type: Number, default: 0 },
      totalCodeSubmissions: { type: Number, default: 0 },
      totalTestFailures: { type: Number, default: 0 },
      totalTestPasses: { type: Number, default: 0 },
      avgTimePerCheckpoint: { type: Number },
      topicsAskedAbout: [{
        topic: { type: String },
        count: { type: Number, default: 1 },
      }],
    },
    recentErrors: [{
      errorType: { type: String },
      errorMessage: { type: String },
      language: { type: String },
      timestamp: { type: Date, default: Date.now },
    }],
    learningPace: {
      type: String,
      enum: ['fast', 'average', 'slow', 'unknown'],
      default: 'unknown',
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Helper method to add or update a weakness
UserLearningProfileSchema.methods.recordWeakness = function(
  category: string,
  description: string,
  example?: string
) {
  const existing = this.weaknesses.find((w: WeaknessEntry) => 
    w.category === category && w.description === description
  );
  
  if (existing) {
    existing.occurrences += 1;
    existing.lastSeen = new Date();
    if (example) {
      existing.examples = existing.examples || [];
      existing.examples.unshift(example);
      existing.examples = existing.examples.slice(0, 3); // Keep last 3
    }
  } else {
    this.weaknesses.push({
      category,
      description,
      occurrences: 1,
      lastSeen: new Date(),
      examples: example ? [example] : [],
    });
  }
  
  this.lastUpdated = new Date();
};

// Helper method to record a topic the user asked about
UserLearningProfileSchema.methods.recordTopicAsked = function(topic: string) {
  if (!this.metrics.topicsAskedAbout) {
    this.metrics.topicsAskedAbout = [];
  }
  
  const existing = this.metrics.topicsAskedAbout.find(
    (t: { topic: string; count: number }) => t.topic.toLowerCase() === topic.toLowerCase()
  );
  
  if (existing) {
    existing.count += 1;
  } else {
    this.metrics.topicsAskedAbout.push({ topic, count: 1 });
  }
  
  this.metrics.totalAiQuestions += 1;
  this.lastUpdated = new Date();
};

// Helper to record an error
UserLearningProfileSchema.methods.recordError = function(
  errorType: string,
  errorMessage: string,
  language: string
) {
  this.recentErrors.unshift({
    errorType,
    errorMessage,
    language,
    timestamp: new Date(),
  });
  
  // Keep only last 10 errors
  this.recentErrors = this.recentErrors.slice(0, 10);
  this.lastUpdated = new Date();
};

// Get a summary for AI context
UserLearningProfileSchema.methods.getAiContextSummary = function(): string {
  const topWeaknesses = this.weaknesses
    .sort((a: WeaknessEntry, b: WeaknessEntry) => b.occurrences - a.occurrences)
    .slice(0, 5);
  
  const topTopics = (this.metrics.topicsAskedAbout || [])
    .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
    .slice(0, 5);
  
  let summary = '';
  
  if (topWeaknesses.length > 0) {
    summary += `Areas needing attention: ${topWeaknesses.map((w: WeaknessEntry) => 
      `${w.category} (${w.description}, seen ${w.occurrences}x)`
    ).join('; ')}. `;
  }
  
  if (topTopics.length > 0) {
    summary += `Frequently asks about: ${topTopics.map((t: { topic: string; count: number }) => 
      `${t.topic} (${t.count}x)`
    ).join(', ')}. `;
  }
  
  if (this.learningPace !== 'unknown') {
    summary += `Learning pace: ${this.learningPace}. `;
  }
  
  const failRate = this.metrics.totalTestFailures + this.metrics.totalTestPasses > 0
    ? Math.round((this.metrics.totalTestFailures / (this.metrics.totalTestFailures + this.metrics.totalTestPasses)) * 100)
    : null;
  
  if (failRate !== null && failRate > 40) {
    summary += `Test failure rate: ${failRate}% - may need extra support. `;
  }

  if (this.strongTopics && this.strongTopics.length > 0) {
    summary += `Relatively strong in: ${this.strongTopics.slice(0, 5).join(', ')}. `;
  }

  if (this.pastMistakes && this.pastMistakes.length > 0) {
    const recent = this.pastMistakes
      .slice()
      .sort((a: IPastMistake, b: IPastMistake) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 5);
    summary += `Recent struggle areas: ${recent
      .map((m: IPastMistake) => `${m.topic}: ${m.summary}`)
      .join('; ')}. `;
  }

  if (this.learningStyle && this.learningStyle !== 'unknown') {
    summary += `Style hint: ${this.learningStyle.replace(/_/g, ' ')} — adjust explanation length accordingly. `;
  }
  
  return summary || 'No learning profile data yet.';
};

UserLearningProfileSchema.methods.recordPastMistake = function (
  topic: string,
  summary: string
) {
  if (!this.pastMistakes) this.pastMistakes = [];
  this.pastMistakes.unshift({ topic, summary: summary.slice(0, 200), at: new Date() });
  this.pastMistakes = this.pastMistakes.slice(0, 15);
  this.lastUpdated = new Date();
};

export default mongoose.model<IUserLearningProfile>('UserLearningProfile', UserLearningProfileSchema);
