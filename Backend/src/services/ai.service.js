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

function inferTitle(jobDescription) {
    if (jobDescription && typeof jobDescription === "object" && !Array.isArray(jobDescription)) {
        const explicitTitle = toPlainText(jobDescription.title).trim();
        const company = toPlainText(jobDescription.company).trim();

        if (explicitTitle && company) {
            return `${company} - ${explicitTitle}`;
        }

        if (explicitTitle) {
            return explicitTitle;
        }
    }

    const jobDescriptionText = toPlainText(jobDescription);

    if (!jobDescriptionText) {
        return "Interview Preparation Report";
    }

    const firstNonEmptyLine = jobDescriptionText
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean);

    return firstNonEmptyLine || "Interview Preparation Report";
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

function buildFallbackReport({ resume, selfDescription, jobDescription }) {
    const computedMatchScore = calculateMatchScore({ resume, selfDescription, jobDescription });

    const fallback = {
        matchScore: computedMatchScore,
        technicalQuestions: [
            {
                question: "Walk me through one project from your resume and explain the core technical decisions.",
                intention: "To evaluate depth of understanding, architecture choices, and ownership.",
                answer: "Explain project context, key constraints, chosen stack, trade-offs, and measurable outcomes. Focus on decisions you made and why they were optimal."
            },
            {
                question: "How do you optimize database queries for performance? Provide a real example.",
                intention: "To assess knowledge of database optimization, indexing, and query analysis.",
                answer: "Discuss indexing strategies, query optimization, profiling tools, and a concrete example from your experience showing measurable improvements in response time."
            },
            {
                question: "Explain your approach to designing scalable REST APIs.",
                intention: "To evaluate understanding of API design principles, scalability, and best practices.",
                answer: "Cover versioning, pagination, caching strategies, authentication, rate limiting, and documentation. Reference specific frameworks or tools you've used."
            },
            {
                question: "How do you handle errors and logging in production systems?",
                intention: "To assess production readiness and debugging practices.",
                answer: "Discuss logging levels, structured logging, monitoring dashboards, alerting systems, and how you trace issues in production environments."
            }
        ],
        behavioralQuestions: [
            {
                question: "Tell me about a challenging situation you handled and what you learned.",
                intention: "To assess problem solving, communication, and growth mindset.",
                answer: "Use STAR format: Situation, Task, Action, Result. Focus on your specific actions, the impact, and concrete lessons learned that improved your skills."
            },
            {
                question: "How do you approach learning new technologies when faced with an unfamiliar tech stack?",
                intention: "To evaluate adaptability, learning ability, and initiative.",
                answer: "Describe your learning process: research, documentation, hands-on experiments, asking for help when needed. Provide an example of successfully adopting a new tool or framework."
            },
            {
                question: "Describe a time you received critical feedback and how you responded.",
                intention: "To assess receptiveness to feedback, humility, and continuous improvement.",
                answer: "Show how you accepted feedback, analyzed it constructively, implemented changes, and improved as a result. Demonstrate growth mindset."
            }
        ],
        skillGaps: [
            {
                skill: "Specific implementation details could not be fully assessed due to report generation limitations",
                severity: "medium"
            },
            {
                skill: "Advanced system design and architecture patterns at scale",
                severity: "medium"
            },
            {
                skill: "Specialized domain knowledge relevant to the role",
                severity: "low"
            }
        ],
        preparationPlan: [
            {
                day: 1,
                focus: "Review role fundamentals and resume projects",
                tasks: [
                    "Thoroughly read the job description and map each requirement to your experience",
                    "Review your top 2-3 projects with detailed notes on architecture, trade-offs, and impact",
                    "Prepare 2-3 project stories using STAR format, highlighting technical depth and leadership",
                    "Write down 5 questions to ask the interviewers"
                ]
            },
            {
                day: 2,
                focus: "Master technical fundamentals and system design basics",
                tasks: [
                    "Review core data structures (arrays, linked lists, trees, graphs, hash tables) with 5 implementation problems each",
                    "Study algorithm analysis (time/space complexity) with 10 LeetCode medium problems",
                    "Walk through 2 system design problems relevant to the role (e.g., API design, database scaling, microservices)",
                    "Review design patterns used in the company's tech stack"
                ]
            },
            {
                day: 3,
                focus: "Solidify behavioral and communication skills",
                tasks: [
                    "Practice 3-5 behavioral question responses using STAR format, focusing on clarity and impact",
                    "Prepare stories highlighting: overcoming challenges, learning quickly, collaboration, and leadership",
                    "Mock interview with a peer or mentor, getting feedback on communication and technical depth",
                    "Refine and practice your elevator pitch (who you are, what excites you about this role)"
                ]
            },
            {
                day: 4,
                focus: "Advanced problem-solving and edge cases",
                tasks: [
                    "Solve 10 hard-level LeetCode problems or company-specific coding challenges",
                    "Practice thinking aloud: solve problems while explaining your approach",
                    "Study handling of edge cases, error conditions, and trade-offs in your solutions",
                    "Review scalability concerns: caching, load balancing, database optimization"
                ]
            }
        ],
        title: inferTitle(jobDescription)
    };

    const validated = interviewReportSchema.safeParse(fallback);
    if (!validated.success) {
        throw new Error(`Fallback report schema validation failed: ${validated.error.message}`);
    }

    return validated.data;
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

    let ai;
    try {
        ai = getAiClient();
    } catch (error) {
        return buildFallbackReport({ resume, selfDescription, jobDescription });
    }

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

    const errors = [];

    for (const model of MODEL_CANDIDATES) {
        try {
            return await generateWithRetries(ai, { model, prompt });
        } catch (error) {
            errors.push(error);
        }
    }

    return buildFallbackReport({ resume, selfDescription, jobDescription });
}