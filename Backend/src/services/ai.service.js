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

const FALLBACK_TECHNICAL_QUESTIONS = [
    {
        question: "Can you walk me through a project you're proud of? What was your role, and what was the impact?",
        intention: "To assess communication skills, ownership, and ability to articulate technical contributions.",
        answer: "Choose a recent, relevant project. Use the STAR method (Situation, Task, Action, Result). Start with the project's goal, describe your specific responsibilities, detail the actions you took (mentioning technologies used), and conclude with the positive outcomes or impact of your work. Quantify results if possible (e.g., 'improved performance by 20%')."
    },
    {
        question: "How do you stay updated with new technologies and industry trends?",
        intention: "To gauge proactiveness, passion for technology, and commitment to continuous learning.",
        answer: "Mention a mix of resources like blogs (e.g., Martin Fowler, company engineering blogs), newsletters (e.g., TLDR, JavaScript Weekly), podcasts, and online courses. Give a recent example of a new technology you learned about and how you experimented with it (e.g., a small side project)."
    },
    {
        question: "Describe a challenging technical problem you faced and how you solved it.",
        intention: "To evaluate problem-solving skills, technical depth, and resilience.",
        answer: "Clearly define the problem and its complexity. Explain the process of investigating and diagnosing the issue. Discuss the different solutions you considered and why you chose the final one. Conclude with the resolution and any lessons learned from the experience."
    },
    {
        question: "What are RESTful APIs and why are they important?",
        intention: "To check foundational knowledge of web services and architecture.",
        answer: "Explain that REST (Representational State Transfer) is an architectural style for designing networked applications. Key principles include statelessness, client-server architecture, and a uniform interface. Mention common HTTP methods (GET, POST, PUT, DELETE) and how they correspond to CRUD operations. Emphasize that they are important for scalability, flexibility, and interoperability between different systems on the web."
    },
    {
        question: "Explain the difference between `let`, `const`, and `var` in JavaScript.",
        intention: "To assess understanding of core JavaScript concepts and variable scoping.",
        answer: "Explain that `var` is function-scoped and can be re-declared and updated, which can lead to bugs. `let` is block-scoped, can be updated but not re-declared within the same scope. `const` is also block-scoped, but it cannot be updated or re-declared, making it ideal for values that should not change."
    }
];

const FALLBACK_BEHAVIORAL_QUESTIONS = [
    {
        question: "Tell me about a time you had a conflict with a coworker. How did you handle it?",
        intention: "To assess conflict resolution skills, empathy, and professionalism.",
        answer: "Focus on a professional disagreement, not a personal one. Explain the situation and the different perspectives. Describe the steps you took to understand their viewpoint and work towards a mutually agreeable solution. Emphasize collaboration and a positive outcome."
    },
    {
        question: "How do you handle tight deadlines and high-pressure situations?",
        intention: "To evaluate time management, prioritization, and ability to perform under pressure.",
        answer: "Provide an example of a high-pressure project. Explain how you prioritize tasks, manage your time effectively (e.g., breaking down work), and communicate with stakeholders about progress and potential risks. Show that you can stay calm and focused."
    },
    {
        question: "Describe a time you had to learn a new skill quickly for a project.",
        intention: "To gauge adaptability and a willingness to learn.",
        answer: "Choose a real example where you had to ramp up on a new technology or methodology. Describe the situation, the skill you needed to learn, the resources you used (documentation, tutorials, pair programming), and how you successfully applied the new skill to the project. This shows you are a proactive and resourceful learner."
    },
    {
        question: "Why are you interested in this specific role and our company?",
        intention: "To see if you have done your research and are genuinely interested.",
        answer: "Connect your skills and career goals to the job description. Mention specific aspects of the company that appeal to you, such as their products, culture, or technology stack. This shows you are not just looking for any job, but are specifically interested in this opportunity."
    }
];

const FALLBACK_PREPARATION_PLAN = [
    {
        day: 1,
        focus: "Fundamentals & Company Research",
        tasks: [
            "Review core concepts related to the job description (e.g., data structures, key frameworks).",
            "Thoroughly research the company: its products, mission, and recent news.",
            "Prepare your answer for 'Tell me about yourself', tailoring it to the role."
        ]
    },
    {
        day: 2,
        focus: "Technical Deep Dive & Practice",
        tasks: [
            "Solve 3-5 practice problems related to the company's domain (e.g., on LeetCode or HackerRank).",
            "Review one of your key projects and be prepared to discuss its architecture and your role in detail.",
            "Practice explaining a complex technical concept in simple terms."
        ]
    },
    {
        day: 3,
        focus: "Behavioral & Final Polish",
        tasks: [
            "Prepare 3-4 stories using the STAR method for common behavioral questions.",
            "Draft 3-5 insightful questions to ask the interviewer about the role, team, or company.",
            "Do a full mock interview with a peer or using an online platform."
        ]
    }
];

const FALLBACK_SKILL_GAPS = [
    {
        skill: "Specific Framework Experience",
        severity: "medium",
        description: "While you have foundational knowledge, gaining deeper experience in the specific frameworks mentioned in the job description (e.g., React, Node.js) would be beneficial."
    },
    {
        skill: "Cloud Technologies",
        severity: "low",
        description: "Familiarity with cloud platforms like AWS, Azure, or GCP is increasingly valuable. Consider exploring their basic services."
    }
];


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

    const report = validated.data;

    // Ensure minimum number of questions by adding fallbacks if necessary
    if (report.technicalQuestions.length < 3) {
        const needed = 3 - report.technicalQuestions.length;
        report.technicalQuestions.push(...FALLBACK_TECHNICAL_QUESTIONS.slice(0, needed));
    }

    if (report.behavioralQuestions.length < 2) {
        const needed = 2 - report.behavioralQuestions.length;
        report.behavioralQuestions.push(...FALLBACK_BEHAVIORAL_QUESTIONS.slice(0, needed));
    }

    if (report.preparationPlan.length < 3) {
        const needed = 3 - report.preparationPlan.length;
        report.preparationPlan.push(...FALLBACK_PREPARATION_PLAN.slice(0, needed));
    }

    if (report.skillGaps.length < 1) {
        report.skillGaps.push(...FALLBACK_SKILL_GAPS);
    }

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

    // If all models fail, return a report with fallback questions
    if (lastError) {
        console.error("AI report generation failed for all models, returning fallback report.", lastError);
        return {
            matchScore: computedMatchScore,
            technicalQuestions: FALLBACK_TECHNICAL_QUESTIONS,
            behavioralQuestions: FALLBACK_BEHAVIORAL_QUESTIONS,
            skillGaps: FALLBACK_SKILL_GAPS,
            preparationPlan: FALLBACK_PREPARATION_PLAN,
            title: "Interview Preparation Report"
        };
    }

    const errorMessage = lastError?.message || "Unknown error while generating interview report";
    throw new Error(`AI report generation failed for all models: ${errorMessage}`);
}