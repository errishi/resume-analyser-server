import { GoogleGenAI } from "@google/genai"
import * as z from "zod"
import { zodToJsonSchema } from "zod-to-json-schema";

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MODEL_CANDIDATES = [
    process.env.GEMINI_MODEL?.trim(),
    "gemini-3-flash-preview",
    "gemini-2.0-flash"
].filter(Boolean);

function getAiClient() {
    const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENAI_API_KEY?.trim();

    if (!apiKey) {
        throw new Error("Missing GEMINI_API_KEY in .env");
    }

    return new GoogleGenAI({
        apiKey,
        vertexai: false,
        apiVersion: "v1beta"
    });
}


const interviewReportSchema = z.object({
    matchScore: z.number().min(0).max(100).describe("A score between 0 and 100 indicating how well the candidate's profile matches the job describe"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).min(3).describe("Generate exactly 3-5 technical questions that can be asked in the interview along with their intention and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The behavioral question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).min(2).describe("Generate exactly 2-3 behavioral questions that can be asked in the interview along with their intention and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum([ "low", "medium", "high" ]).describe("The severity of this skill gap, i.e. how important is this skill for the job and how much it can impact the candidate's chances")
    })).min(1).describe("Generate 2-5 skill gaps identified in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day in the preparation plan, e.g. data structures, system design, mock interviews etc."),
        tasks: z.array(z.string()).describe("List of tasks to be done on this day to follow the preparation plan, e.g. read a specific book or article, solve a set of problems, watch a video etc.")
    })).min(3).describe("Generate a day-wise preparation plan with at least 3 days, each with focused tasks for interview preparation"),
    title: z.string().describe("The title of the job for which the interview report is generated"),
});

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
    const status = error?.status || error?.error?.code;
    return RETRYABLE_STATUS_CODES.has(status);
}

function parseReportFromResponse(response) {
    const payload = response?.text;

    if (typeof payload !== "string" || !payload.trim()) {
        throw new Error("AI returned empty response text");
    }

    let parsed;
    try {
        parsed = JSON.parse(payload);
    } catch {
        throw new Error("AI response was not valid JSON");
    }

    const validated = interviewReportSchema.safeParse(parsed);
    if (!validated.success) {
        throw new Error(`AI response did not match schema: ${validated.error.message}`);
    }

    return validated.data;
}

function toPlainText(value) {
    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    if (Array.isArray(value)) {
        return value.map((item) => toPlainText(item)).filter(Boolean).join(" ");
    }

    if (value && typeof value === "object") {
        return Object.values(value).map((item) => toPlainText(item)).filter(Boolean).join(" ");
    }

    return "";
}

function normalizeAndTokenize(text) {
    const normalizedText = toPlainText(text);

    if (!normalizedText) {
        return [];
    }

    const stopWords = new Set([
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he", "in", "is", "it", "its",
        "of", "on", "or", "that", "the", "to", "was", "were", "will", "with", "you", "your"
    ]);

    return normalizedText
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !stopWords.has(token));
}

function calculateMatchScore({ resume, selfDescription, jobDescription }) {
    const jobTokens = normalizeAndTokenize(jobDescription);
    const resumeTokens = normalizeAndTokenize(resume);
    const selfTokens = normalizeAndTokenize(selfDescription);
    const candidateTokens = [...resumeTokens, ...selfTokens];

    if (jobTokens.length === 0 || candidateTokens.length === 0) {
        return 0;
    }

    const jobSet = new Set(jobTokens);

    const overlapRatio = (candidateTokens) => {
        if (candidateTokens.length === 0) {
            return 0;
        }

        const uniqueCandidate = new Set(candidateTokens);
        let overlapCount = 0;

        for (const token of uniqueCandidate) {
            if (jobSet.has(token)) {
                overlapCount += 1;
            }
        }

        return overlapCount / jobSet.size;
    };

    const resumeOverlap = overlapRatio(resumeTokens);
    const selfOverlap = overlapRatio(selfTokens);

    const weightedOverlap = (resumeOverlap * 0.7) + (selfOverlap * 0.3);

    const uniqueCandidateCount = new Set(candidateTokens).size;
    const depthScore = Math.min(1, uniqueCandidateCount / 80);

    // Base score comes from profile completeness; overlap contributes most of the score.
    const score = 15 + (weightedOverlap * 75) + (depthScore * 10);
    const percentageScore = Math.round(score);

    return Math.max(0, Math.min(100, percentageScore));
}

async function generateWithRetries(ai, { model, prompt, maxAttempts = 3 }) {
    let attempt = 0;

    while (attempt < maxAttempts) {
        try {
            const response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: zodToJsonSchema(interviewReportSchema),
                }
            });

            return parseReportFromResponse(response);
        } catch (error) {
            attempt += 1;

            if (!isRetryableError(error) || attempt >= maxAttempts) {
                throw error;
            }

            await sleep(attempt * 1000);
        }
    }

    throw new Error("Failed to generate report after retries");
}

export default async function generateInterviewReport({ resume, selfDescription, jobDescription }) {
    const computedMatchScore = calculateMatchScore({ resume, selfDescription, jobDescription });
    const ai = getAiClient();

    const prompt = `You are an expert interview coach. Generate a comprehensive interview preparation report for a candidate.

IMPORTANT REQUIREMENTS:
1. Return ONLY valid JSON that strictly follows the required schema.
2. Generate MULTIPLE items for each array field:
   - technicalQuestions: Generate 5-10 questions (not just 1)
   - behavioralQuestions: Generate 4-8 questions (not just 1)
   - skillGaps: Generate 2-5 skill gaps (not just 1)
   - preparationPlan: Generate at least 3 days with detailed tasks
3. matchScore: Base it on the keyword overlap (${computedMatchScore}) but adjust within +/- 10 based on evidence in the candidate data.
4. Each question must have a detailed answer with specific guidance.
5. Each skill gap must have appropriate severity (low/medium/high).
6. Each preparation day must have 3-5 concrete tasks.

Candidate Details (JSON):
Resume: ${JSON.stringify(resume, null, 2)}
Self Description: ${JSON.stringify(selfDescription, null, 2)}
Job Description: ${JSON.stringify(jobDescription, null, 2)}

Generate comprehensive, detailed interview preparation based on the above candidate information.`

    let lastError;

    for (const model of MODEL_CANDIDATES) {
        try {
            return await generateWithRetries(ai, { model, prompt });
        } catch (error) {
            lastError = error;
        }
    }

    const errorMessage = lastError?.message || "Unknown error while generating interview report";
    throw new Error(`AI report generation failed for all models: ${errorMessage}`);
}