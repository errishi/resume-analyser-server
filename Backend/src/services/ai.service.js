import dotenv from "dotenv";
dotenv.config();


import OpenAI from "openai";
import * as z from "zod"
import { zodToJsonSchema } from "zod-to-json-schema";

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// Updated to use your specific NVIDIA model
const MODEL_CANDIDATES = [
    "nvidia/llama3-chatqa-1.5-8b"
];

// Updated to initialize the NVIDIA OpenAI-compatible client
function getAiClient() {
    const apiKey = process.env.NVIDIA_API_KEY?.trim();

    if (!apiKey) {
        throw new Error("Missing NVIDIA_API_KEY in .env");
    }

    return new OpenAI({
        apiKey,
        baseURL: 'https://integrate.api.nvidia.com/v1',
    });
}

const interviewReportSchema = z.object({
    matchScore: z.number().min(0).max(100).describe("A score between 0 and 100 indicating how well the candidate's profile matches the job describe"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question with specific guidance")
    })).min(5).describe("5-6 technical questions for interview"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The behavioral question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question with specific guidance")
    })).min(3).describe("3-4 behavioral questions for interview"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum(["low", "medium", "high", "Low", "Medium", "High"]).describe("Severity level").transform(val => val.toLowerCase())
    })).min(2).describe("2-5 skill gaps identified in candidate profile"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("Day number in preparation plan"),
        focus: z.string().describe("Main focus of this day"),
        tasks: z.array(z.string()).describe("Tasks for this day")
    })).min(3).describe("Preparation plan"),
    title: z.string().describe("Job title for which report is generated"),
});

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
    const status = error?.status || error?.error?.code || error?.status;
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
    } catch (error) {
        console.error("Failed to parse AI response as JSON. Raw response:");
        console.error(payload);
        throw new Error("AI response was not valid JSON");
    }

    const validated = interviewReportSchema.safeParse(parsed);
    if (!validated.success) {
        console.error("Schema validation failed. AI response:");
        console.error(JSON.stringify(parsed, null, 2));
        throw new Error(`AI response did not match schema: ${validated.error.message}`);
    }

    const report = validated.data;

    return report;
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

// Updated with the streaming implementation and parameters from your snippet
async function generateWithRetries(ai, { model, prompt, maxAttempts = 3 }) {
    let attempt = 0;

    // We pass the Zod schema directly into the prompt to ensure the NVIDIA model adheres to it.
    const schemaString = JSON.stringify(zodToJsonSchema(interviewReportSchema), null, 2);
    const systemInstructions = `You must respond strictly in valid JSON format matching this JSON schema:\n${schemaString}`;

    while (attempt < maxAttempts) {
        try {
            const completion = await ai.chat.completions.create({
                model: model, // "nvidia/llama3-chatqa-1.5-8b"
                messages: [
                    { role: "user", content: `${systemInstructions}\n\n${prompt}` }
                ],
                temperature: 0.2,
                top_p: 0.7,
                max_tokens: 1024,
                stream: true,
            });

            let fullResponse = "";

            // Accumulate streamed chunks into a full JSON string
            for await (const chunk of completion) {
                const content = chunk.choices[0]?.delta?.content || '';
                fullResponse += content;
            }

            return parseReportFromResponse({ text: fullResponse });
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

    const prompt = `Generate a technical interview report in VALID JSON format.

CRITICAL REQUIREMENTS:
- ALL answers must be 15 words or LESS (very concise)
- Return ONLY valid JSON - no markdown, no explanation
- Generate questions specific to this role and candidate
- Title should be in format: "<Role> - <Key Skill> Interview Preparation" (e.g., "Senior React Developer - Full Stack Interview Preparation")

Resume: ${resume.substring(0, 120)}
Job: ${jobDescription.substring(0, 120)}

Create 6 technical + 4 behavioral questions (each with question, intention, answer fields).

{
  "matchScore": ${Math.round(computedMatchScore)},
  "title": "<Generate a dynamic title based on job role and key technologies>",
  "technicalQuestions": [
    {"question": "<relevant question for their tech stack>", "intention": "<assesses what skill>", "answer": "<15 words max>"},
    {"question": "<relevant question for their tech stack>", "intention": "<assesses what skill>", "answer": "<15 words max>"},
    {"question": "<relevant question for their tech stack>", "intention": "<assesses what skill>", "answer": "<15 words max>"},
    {"question": "<relevant question for their tech stack>", "intention": "<assesses what skill>", "answer": "<15 words max>"},
    {"question": "<relevant question for their tech stack>", "intention": "<assesses what skill>", "answer": "<15 words max>"},
    {"question": "<relevant question for their tech stack>", "intention": "<assesses what skill>", "answer": "<15 words max>"}
  ],
  "behavioralQuestions": [
    {"question": "<relevant behavioral question>", "intention": "<assesses what behavior>", "answer": "<15 words max>"},
    {"question": "<relevant behavioral question>", "intention": "<assesses what behavior>", "answer": "<15 words max>"},
    {"question": "<relevant behavioral question>", "intention": "<assesses what behavior>", "answer": "<15 words max>"},
    {"question": "<relevant behavioral question>", "intention": "<assesses what behavior>", "answer": "<15 words max>"}
  ],
  "skillGaps": [
    {"skill": "<skill needed for role but not in resume>", "severity": "low|medium|high"},
    {"skill": "<skill needed for role but not in resume>", "severity": "low|medium|high"},
    {"skill": "<skill needed for role but not in resume>", "severity": "low|medium|high"}
  ],
  "preparationPlan": [
    {"day": 1, "focus": "<focus area>", "tasks": ["<task>", "<task>", "<task>"]},
    {"day": 2, "focus": "<focus area>", "tasks": ["<task>", "<task>", "<task>"]},
    {"day": 3, "focus": "<focus area>", "tasks": ["<task>", "<task>", "<task>"]}
  ]
}`

    let lastError;

    for (const model of MODEL_CANDIDATES) {
        try {
            return await generateWithRetries(ai, { model, prompt });
        } catch (error) {
            console.error(`Error with model ${model}:`, error.message);
            lastError = error;
        }
    }

    const errorMessage = lastError?.message || "Unknown error while generating interview report";
    throw new Error(`AI report generation failed for all models: ${errorMessage}`);
}