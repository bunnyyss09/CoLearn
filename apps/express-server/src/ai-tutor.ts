import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Defines the structure for the data sent to the AI service.
 * The extra optional fields are used to scope and constrain the AI
 * when we are inside a structured learning checkpoint.
 */
export interface AiTutorData {
    userQuery: string;
    language: string;
    code: string;
    input?: string;
    output?: string;
    userName?: string;
    checkpointType?: string;
    checkpointTitle?: string;
    checkpointDescription?: string;
    aiMode?: string;
    /** Learning module title for context */
    moduleTitle?: string;
    /** Learning module summary (e.g. checkpoint list or short overview) for context */
    moduleSummary?: string;
    /** User learning profile context - weaknesses, frequent topics, pace */
    userLearningContext?: string;
}

// System prompt to guide the AI's behavior
const baseSystemPrompt = `You are an expert programming tutor. Your goal is to help students learn by guiding them to the solution, not giving it away.
Analyze the user's code, their provided input, and the resulting output.
Provide hints, ask leading questions, and explain concepts.
Do not write the correct code for them unless they are completely stuck and explicitly ask for the solution.
Keep your responses concise and encouraging.
When a user's name is provided, address them by name so they know you're replying to them. In a shared room, multiple learners may ask; always say who you're addressing (e.g. "Hi Sarah, ...") when multiple people are in the conversation.

IMPORTANT: If learner context is provided (their weaknesses, frequently asked topics, or learning pace), use it to:
- Give extra attention and clearer explanations for their known weak areas
- Be more patient and provide more step-by-step guidance if they have a slow learning pace
- Recognize patterns in their mistakes and proactively address common issues
- Offer encouragement when they struggle with areas they've had trouble with before`;

function modeInstructions(aiMode?: string): string {
    switch (aiMode) {
        case "socratic":
            return "Mode: Socratic. Ask guiding questions; do not give direct answers. Help the student reason step by step.";
        case "hint":
            return "Mode: Hint. Give small, incremental hints. Do not reveal the full solution unless the student is truly stuck.";
        case "review":
            return "Mode: Review. Review the student's explanation or code for clarity and correctness. Give constructive feedback.";
        case "summarizer":
            return "Mode: Summarizer. Summarize what was learned and reinforce key concepts. Keep it brief.";
        default:
            return "Mode: General tutor. Balance hints with explanations; encourage the student to think.";
    }
}

/**
 * Constructs the full prompt for the AI based on the user's code and question.
 * Includes module summary, checkpoint context, and input/output for learning modules.
 */
function constructUserQuery(data: AiTutorData): string {
    const moduleContext = (data.moduleTitle || data.moduleSummary)
        ? `
Current learning module: ${data.moduleTitle || "N/A"}
${data.moduleSummary ? `Module context:\n${data.moduleSummary}\n` : ""}`
        : "";

    const checkpointContext = data.checkpointTitle
        ? `
Current checkpoint:
Title: ${data.checkpointTitle}
Type: ${data.checkpointType || "unknown"}
Description:
${data.checkpointDescription || "No detailed description provided."}
`
        : "";

    const learnerContext = data.userLearningContext
        ? `
--- LEARNER PROFILE (use this to personalize your help) ---
${data.userLearningContext}
-----------------------------------------------------------
`
        : "";

    return `${baseSystemPrompt}

${modeInstructions(data.aiMode)}
${learnerContext}
${moduleContext}
${checkpointContext}

Here is the current situation:
Student name: ${data.userName || "Student"}
Language: ${data.language}
Code:
\`\`\`${data.language}
${data.code}
\`\`\`
Input given to the code:
\`\`\`
${data.input ?? "No input provided."}
\`\`\`
Output from the code:
\`\`\`
${data.output ?? "No output yet."}
\`\`\`

My question is: ${data.userQuery}
`;
}

/**
 * Calls the Gemini API to get an AI-generated tutor response.
 * @param data The necessary context for the AI.
 * @returns A promise that resolves to the AI's text response.
 */
export async function getAiTutorResponse(data: AiTutorData): Promise<string> {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured in environment variables.");
    }
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const userQuery = constructUserQuery(data);

    try {
        const result = await model.generateContent(userQuery);
        const response = await result.response;
        const aiResponseText = response.text();
        
        if (!aiResponseText) {
            console.error("AI response was empty:", response);
            return "Sorry, I couldn't generate a helpful response right now. The AI might be having an issue.";
        }

        return aiResponseText;

    } catch (error) {
        console.error("Error in getAiTutorResponse:", error);
        return "Sorry, the AI tutor is temporarily unavailable. Please try again later.";
    }
}