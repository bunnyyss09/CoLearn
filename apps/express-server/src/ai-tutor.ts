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
 * Builds the tutor prompt using string concatenation only.
 * User-supplied text must never be embedded in JS template literals — content like
 * `${foo}` in their code or markdown would be evaluated and throw ReferenceError.
 */
function constructUserQuery(data: AiTutorData): string {
    const parts: string[] = [baseSystemPrompt, "", modeInstructions(data.aiMode)];

    if (data.userLearningContext) {
        parts.push(
            "",
            "--- LEARNER PROFILE (use this to personalize your help) ---",
            data.userLearningContext,
            "-----------------------------------------------------------"
        );
    }

    if (data.moduleTitle || data.moduleSummary) {
        parts.push(
            "",
            "Current learning module: " + (data.moduleTitle || "N/A")
        );
        if (data.moduleSummary) {
            parts.push("Module context:", data.moduleSummary);
        }
    }

    if (data.checkpointTitle) {
        parts.push(
            "",
            "Current checkpoint:",
            "Title: " + data.checkpointTitle,
            "Type: " + (data.checkpointType || "unknown"),
            "Description:",
            data.checkpointDescription || "No detailed description provided."
        );
    }

    const lang = data.language;
    const codeBlock = "```" + lang + "\n" + data.code + "\n```";
    const inputBlock =
        "```\n" + (data.input ?? "No input provided.") + "\n```";
    const outputBlock =
        "```\n" + (data.output ?? "No output yet.") + "\n```";

    parts.push(
        "",
        "Here is the current situation:",
        "Student name: " + (data.userName || "Student"),
        "Language: " + lang,
        "Code:",
        codeBlock,
        "Input given to the code:",
        inputBlock,
        "Output from the code:",
        outputBlock,
        "",
        "My question is: " + data.userQuery
    );

    return parts.join("\n");
}

const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";

/**
 * Calls the Gemini API to get an AI-generated tutor response.
 * @param data The necessary context for the AI.
 * @returns A promise that resolves to the AI's text response.
 */
export async function getAiTutorResponse(data: AiTutorData): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured in environment variables.");
    }
    const ai = new GoogleGenerativeAI(apiKey);
    let userQuery: string;
    try {
        userQuery = constructUserQuery(data);
    } catch (e) {
        console.error("constructUserQuery failed:", e);
        throw new Error("Failed to build the tutor prompt from the request.");
    }

    async function tryModel(modelName: string): Promise<string> {
        const model = ai.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(userQuery);
        const response = result.response;
        const aiResponseText = response.text();

        if (!aiResponseText) {
            console.error("AI response was empty:", response);
            return "Sorry, I couldn't generate a helpful response right now. The AI might be having an issue.";
        }
        return aiResponseText;
    }

    try {
        return await tryModel(PRIMARY_MODEL);
    } catch (primaryErr) {
        console.error(`Error with model ${PRIMARY_MODEL}:`, primaryErr);
        try {
            return await tryModel(FALLBACK_MODEL);
        } catch (fallbackErr) {
            console.error(`Error with model ${FALLBACK_MODEL}:`, fallbackErr);
            return "Sorry, the AI tutor is temporarily unavailable. Please try again later.";
        }
    }
}
