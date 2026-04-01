import dotenv, { config } from "dotenv";
dotenv.config();


import OpenAI from "openai";
import * as z from "zod"
import { zodToJsonSchema } from "zod-to-json-schema";
import puppeteer from 'puppeteer';

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// NVIDIA models optimized for JSON generation (ordered by capability)
const MODEL_CANDIDATES = [
    "meta/llama3-70b-instruct",      // Best at JSON following
    "meta/llama3-8b-instruct",       // Good alternative
    "nvidia/mistral-7b-instruct-v0.2" // Fallback
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

export const generatePdfFromHtml = async (htmlContent) => {
    const browser = await puppeteer.launch({
        headless: "new",
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent);
    const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
    });
    await browser.close();
    return pdf;
};


const resumeExtractSchema = z.object({
    fullName: z.string(),
    jobTitle: z.string(),
    email: z.string(),
    phone: z.string(),
    summary: z.string(),
    experience: z.array(z.object({
        title: z.string(),
        company: z.string(),
        duration: z.string(),
        details: z.array(z.string())
    })),
    skills: z.array(z.string()),
    education: z.array(z.object({
        degree: z.string(),
        institution: z.string(),
        year: z.string()
    }))
});

function buildHtmlFromResume(data) {
    const escapeHtml = (str) => {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;' };
        return str.replace(/[&<>"']/g, m => map[m]);
    };

    const experienceHtml = (data.experience || []).length > 0 ? `
        <h2 style="font-size: 16px; font-weight: bold; margin: 25px 0 15px 0; padding-bottom: 8px; border-bottom: 2px solid #333;">WORK EXPERIENCE</h2>
        ${(data.experience || []).map(exp => `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px;">
                    <div style="font-weight: bold; font-size: 14px;">${escapeHtml(exp.company)}</div>
                    <div style="font-size: 12px; color: #555;">${escapeHtml(exp.duration)}</div>
                </div>
                <div style="font-style: italic; color: #555; margin-bottom: 8px;">${escapeHtml(exp.title)}</div>
                <ul style="margin: 5px 0; padding-left: 20px; font-size: 13px;">
                    ${(exp.details || []).map(d => `<li style="margin-bottom: 5px;">${escapeHtml(d)}</li>`).join('')}
                </ul>
            </div>
        `).join('')}
    ` : '';

    const educationHtml = (data.education || []).length > 0 ? `
        <h2 style="font-size: 16px; font-weight: bold; margin: 25px 0 15px 0; padding-bottom: 8px; border-bottom: 2px solid #333;">EDUCATION</h2>
        ${(data.education || []).map(edu => `
            <div style="margin-bottom: 12px;">
                <div style="font-weight: bold; font-size: 13px;">${escapeHtml(edu.degree)}</div>
                <div style="font-size: 12px; color: #555;">${escapeHtml(edu.institution)} (${escapeHtml(edu.year)})</div>
            </div>
        `).join('')}
    ` : '';

    const skillsHtml = (data.skills || []).length > 0 ? `
        <h2 style="font-size: 16px; font-weight: bold; margin: 25px 0 15px 0; padding-bottom: 8px; border-bottom: 2px solid #333;">TECHNICAL SKILLS</h2>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px;">
            ${(data.skills || []).map(skill => `
                <span style="display: inline-block; padding: 6px 12px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 3px; font-size: 12px; color: #333;">
                    ${escapeHtml(skill)}
                </span>
            `).join('')}
        </div>
    ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Resume - ${escapeHtml(data.fullName)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            background: white;
            padding: 40px;
            font-size: 14px;
        }
        .header {
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #333;
        }
        .name {
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 5px;
            color: #000;
        }
        .title {
            font-size: 16px;
            color: #444;
            margin-bottom: 10px;
        }
        .contact {
            font-size: 12px;
            color: #666;
        }
        h2 { margin-top: 25px; }
        p { margin: 10px 0; line-height: 1.5; }
        ul { margin: 10px 0; }
        li { margin-bottom: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="name">${escapeHtml(data.fullName)}</div>
        <div class="title">${escapeHtml(data.jobTitle)}</div>
        <div class="contact">${escapeHtml(data.email)} | ${escapeHtml(data.phone)}</div>
    </div>

    <div style="margin-bottom: 25px;">
        <h2 style="font-size: 16px; font-weight: bold; margin: 0 0 10px 0; padding-bottom: 8px; border-bottom: 2px solid #333;">PROFESSIONAL SUMMARY</h2>
        <p style="font-size: 13px; line-height: 1.6;">${escapeHtml(data.summary)}</p>
    </div>

    ${skillsHtml}
    ${experienceHtml}
    ${educationHtml}
</body>
</html>`;
}

async function extractResumeDataWithRetries(ai, { model, prompt, maxAttempts = 3 }) {
    let attempt = 0;

    while (attempt < maxAttempts) {
        try {
            const completion = await ai.chat.completions.create({
                model: model,
                messages: [
                    { role: "user", content: prompt }
                ],
                temperature: 0.1,
                top_p: 0.5,
                max_tokens: 1024,
                stream: true,
            });

            let fullResponse = "";

            for await (const chunk of completion) {
                const content = chunk.choices[0]?.delta?.content || '';
                fullResponse += content;
            }

            if (!fullResponse.trim()) {
                throw new Error("AI returned empty response");
            }

            console.log(`[Model: ${model}] Response:`, fullResponse.substring(0, 300));

            let parsed;
            try {
                const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    throw new Error("No JSON found");
                }
                parsed = JSON.parse(jsonMatch[0]);
                
                // Check if JSON has actual content
                if (Object.keys(parsed).length === 0) {
                    throw new Error("Empty JSON object returned");
                }
            } catch (error) {
                console.error("Parse error:", error.message);
                throw new Error("Invalid JSON");
            }

            // Build resume data with extracted values
            const resumeData = {
                fullName: (parsed.fullName || parsed.name || "").trim() || "Professional",
                jobTitle: (parsed.jobTitle || parsed.title || "").trim() || "Candidate",
                email: (parsed.email || "").trim() || "email@example.com",
                phone: (parsed.phone || "").trim() || "+1234567890",
                summary: (parsed.summary || "").trim() || "Skilled professional with extensive experience",
                experience: Array.isArray(parsed.experience) ? 
                    parsed.experience.filter(exp => exp && exp.title && exp.company).map(exp => ({
                        title: (exp.title || "").trim(),
                        company: (exp.company || "").trim(),
                        duration: (exp.duration || "").trim() || "Current",
                        details: Array.isArray(exp.details) ? exp.details.filter(d => d) : ["Contributed to projects"]
                    })) : [],
                skills: Array.isArray(parsed.skills) ? 
                    parsed.skills.filter(s => s).map(s => (s || "").trim()) : ["Communication", "Problem Solving", "Teamwork"],
                education: Array.isArray(parsed.education) ? 
                    parsed.education.filter(edu => edu && edu.degree && edu.institution).map(edu => ({
                        degree: (edu.degree || "").trim(),
                        institution: (edu.institution || "").trim(),
                        year: (edu.year || "").trim() || "2020"
                    })) : []
            };

            const validated = resumeExtractSchema.safeParse(resumeData);
            if (!validated.success) {
                throw new Error("Schema validation failed");
            }

            console.log("✓ Resume data extracted successfully");
            return validated.data;
        } catch (error) {
            attempt += 1;
            console.error(`Attempt ${attempt}/${maxAttempts} - ${model}: ${error.message}`);
            if (attempt >= maxAttempts) {
                throw error;
            }
            await sleep(attempt * 1000);
        }
    }

    throw new Error("Failed to extract resume data");
}

export const generateResumePdf = async({ resume, selfDescription, jobDescription }) => {
    // Validate inputs
    if (!resume || resume.trim().length === 0) {
        throw new Error("Resume text is required. Please provide actual resume content.");
    }

    if (!jobDescription || jobDescription.trim().length === 0) {
        throw new Error("Job description is required.");
    }

    const ai = getAiClient();

    const prompt = `You are a resume parser. Extract the following information from the resume and return ONLY a JSON object.

JSON FORMAT (required):
{
  "fullName": "candidate's full name",
  "jobTitle": "${jobDescription.substring(0, 50)}",
  "email": "email@example.com or extracted email",
  "phone": "phone number if available",
  "summary": "2-3 line professional summary",
  "experience": [
    {
      "title": "job title",
      "company": "company name",
      "duration": "start-end dates",
      "details": ["major accomplishment or responsibility"]
    }
  ],
  "skills": ["technical skill 1", "technical skill 2", "technical skill 3"],
  "education": [
    {
      "degree": "Bachelor of Science",
      "institution": "University Name",
      "year": "2020"
    }
  ]
}

INSTRUCTIONS:
1. Extract data from the resume below
2. Return ONLY valid JSON - NO explanations or additional text
3. If a field is missing, use reasonable defaults
4. skills array must have at least 3 items
5. experience array must have at least 1 item

RESUME TEXT:
${resume}

Output only the JSON object:`;

    let lastError;

    for (const model of MODEL_CANDIDATES) {
        try {
            console.log(`\nTrying model: ${model}`);
            const resumeData = await extractResumeDataWithRetries(ai, { model, prompt });
            
            const html = buildHtmlFromResume(resumeData);
            const pdfBuffer = await generatePdfFromHtml(html);
            console.log(`✓ PDF generated successfully with model: ${model}`);
            return pdfBuffer;
        } catch (error) {
            console.error(`✗ Failed with ${model}:`, error.message);
            lastError = error;
        }
    }

    console.error("All models failed. Last error:", lastError?.message);
    throw new Error(`PDF generation failed: ${lastError?.message || "Unknown error"}`);
}