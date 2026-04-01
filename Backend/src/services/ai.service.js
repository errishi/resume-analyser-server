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
    skillGroups: z.array(z.string()).optional(),
    projects: z.array(z.object({
        title: z.string(),
        details: z.array(z.string())
    })).optional(),
    education: z.array(z.object({
        degree: z.string(),
        institution: z.string(),
        year: z.string()
    })),
    linkedin: z.string().optional(),
    github: z.string().optional()
});

async function enrichResumeWithAI(ai, { originalResume, resumeData, jobDescription, model }) {
    try {
        const enrichPrompt = `You are a professional resume writer. Enhance and improve this resume data to make it more compelling while PRESERVING all original information.

Original Resume:
${originalResume}

Current Extracted Data:
${JSON.stringify(resumeData, null, 2)}

Job Description:
${jobDescription}

Task: Return ONLY valid JSON with the SAME structure but with IMPROVED content:
1. Enhance achievement descriptions with metrics/numbers where possible
2. Add relevant technical details that match the job description
3. Keep all original information - don't remove anything
4. Make descriptions more professional and impactful
5. Add 1-2 more achievements per experience if available in original resume
6. Extract any projects mentioned and organize them

Return ONLY the improved JSON in this exact format:
{
  "fullName": "name",
  "jobTitle": "title",
  "email": "email",
  "phone": "phone",
  "summary": "enhanced professional summary",
  "experience": [{...more detailed achievements...}],
  "skills": [list],
  "skillGroups": ["Languages", "Frameworks/Libraries"],
  "projects": [{"title": "name", "details": ["achievement"]}],
  "education": [{...}],
  "linkedin": "url if found",
  "github": "url if found"
}`;

        const completion = await ai.chat.completions.create({
            model: model,
            messages: [
                { role: "user", content: enrichPrompt }
            ],
            temperature: 0.3,
            top_p: 0.7,
            max_tokens: 2048,
            stream: true,
        });

        let fullResponse = "";
        for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || '';
            fullResponse += content;
        }

        const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn("Could not enrich resume - using original data");
            return resumeData;
        }

        const enrichedData = JSON.parse(jsonMatch[0]);
        const validated = resumeExtractSchema.safeParse(enrichedData);
        
        if (!validated.success) {
            console.warn("Enriched data validation failed - using original");
            return resumeData;
        }

        console.log("✓ Resume enriched successfully");
        return validated.data;
    } catch (error) {
        console.warn("Resume enrichment failed - using original data:", error.message);
        return resumeData;
    }
}

function buildHtmlFromResume(data) {
    const escapeHtml = (str) => {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;' };
        return str.replace(/[&<>"']/g, m => map[m]);
    };

    const formatLink = (text, href) => {
        if (!href) return escapeHtml(text);
        return `<a href="${escapeHtml(href)}" style="color: #0066cc; text-decoration: none;">${escapeHtml(text)}</a>`;
    };

    const sectionHeader = (title) => `
        <h2 style="font-size: 0.875rem; font-weight: bold; margin: 14px 0 8px 0; padding-bottom: 4px; border-bottom: 2px solid #000; text-transform: uppercase; letter-spacing: 0.7px; font-family: Calibri, Arial, sans-serif;">
            ${title}
        </h2>`;

    // Professional Summary Section
    const summaryHtml = data.summary ? `
        ${sectionHeader('PROFESSIONAL SUMMARY')}
        <p style="font-size: 0.8rem; line-height: 1.6; margin-bottom: 12px; text-align: justify;">
            ${escapeHtml(data.summary)}
        </p>
    ` : '';

    // Education Section
    const educationHtml = (data.education || []).length > 0 ? `
        ${sectionHeader('EDUCATION')}
        <div style="margin-bottom: 12px;">
            ${(data.education || []).map(edu => `
                <div style="margin-bottom: 6px; font-size: 0.8rem; line-height: 1.5;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 1px;">
                        <strong style="font-weight: 600; font-size: 0.8rem;">${escapeHtml(edu.institution)}</strong>
                        <span style="color: #666; font-size: 0.75rem;">${escapeHtml(edu.year)}</span>
                    </div>
                    <div style="color: #555; font-size: 0.75rem;">${escapeHtml(edu.degree)}</div>
                </div>
            `).join('')}
        </div>
    ` : '';

    // Projects Section
    const projectsHtml = (data.projects || []).length > 0 ? `
        ${sectionHeader('PROJECTS')}
        <div style="margin-bottom: 12px;">
            ${(data.projects || []).map(proj => `
                <div style="margin-bottom: 8px;">
                    <div style="font-weight: 600; font-size: 0.8rem; margin-bottom: 2px;">
                        ${proj.link ? formatLink(escapeHtml(proj.title), proj.link) : escapeHtml(proj.title)}
                    </div>
                    <ul style="margin: 2px 0 6px 0; padding-left: 16px; font-size: 0.75rem; line-height: 1.5;">
                        ${(proj.details || []).slice(0, 3).map(d => `
                            <li style="margin-bottom: 1px;">
                                ${escapeHtml(d)}
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `).join('')}
        </div>
    ` : '';

    // Experience Section
    const experienceHtml = (data.experience || []).length > 0 ? `
        ${sectionHeader('EXPERIENCE')}
        <div style="margin-bottom: 12px;">
            ${(data.experience || []).map(exp => `
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px;">
                        <div style="flex: 1;">
                            <strong style="font-weight: 600; font-size: 0.8rem;">${escapeHtml(exp.company)} – ${escapeHtml(exp.title)}</strong>
                        </div>
                        <span style="font-size: 0.75rem; color: #666; white-space: nowrap; margin-left: 10px;">${escapeHtml(exp.duration)}</span>
                    </div>
                    <ul style="margin: 3px 0 0 0; padding-left: 16px; font-size: 0.75rem; line-height: 1.5;">
                        ${(exp.details || []).slice(0, 4).map(d => `
                            <li style="margin-bottom: 1px;">
                                ${escapeHtml(d)}
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `).join('')}
        </div>
    ` : '';

    // Technical Skills Section
    const skillsHtml = (data.skills || []).length > 0 ? `
        ${sectionHeader('TECHNICAL SKILLS')}
        <div style="margin-bottom: 12px; font-size: 0.8rem; line-height: 1.7;">
            ${(data.skillGroups && data.skillGroups.length > 0) ? 
                (data.skillGroups || []).map((group, idx) => `
                    <div style="margin-bottom: 4px;">
                        <strong style="font-weight: 600; font-size: 0.8rem;">${escapeHtml(group)}:</strong>
                        <span style="font-size: 0.75rem; color: #333;">${escapeHtml(data.skills[idx] || '')}</span>
                    </div>
                `).join('') :
                `<div style="font-size: 0.75rem; line-height: 1.8;">
                    ${(data.skills || []).map(skill => `
                        <div style="margin-bottom: 2px;">• ${escapeHtml(skill)}</div>
                    `).join('')}
                </div>`
            }
        </div>
    ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Resume - ${escapeHtml(data.fullName)}</title>
    <style>
        * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
        }
        
        body { 
            font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
            font-size: 0.8rem;
            line-height: 1.4;
            color: #000;
            background: #fff;
            padding: 28px 35px;
            width: 8.5in;
            height: 11in;
            margin: 0 auto;
        }
        
        .resume-header {
            text-align: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #000;
        }
        
        .full-name {
            font-size: 1.6rem;
            font-weight: bold;
            letter-spacing: 1px;
            margin-bottom: 2px;
            line-height: 1.2;
        }
        
        .job-title {
            font-size: 0.875rem;
            color: #555;
            font-weight: 500;
            margin-bottom: 4px;
        }
        
        .location {
            font-size: 0.75rem;
            color: #666;
            margin-bottom: 4px;
        }
        
        .contact-info {
            font-size: 0.7rem;
            color: #333;
            word-spacing: 2px;
        }
        
        .contact-divider {
            color: #999;
            margin: 0 4px;
        }
        
        .contact-link {
            color: #0066cc;
            text-decoration: none;
        }
        
        .contact-link:hover {
            text-decoration: underline;
        }
        
        h2 {
            font-size: 0.875rem;
            font-weight: bold;
            margin: 12px 0 6px 0;
            padding-bottom: 4px;
            border-bottom: 2px solid #000;
            text-transform: uppercase;
            letter-spacing: 0.7px;
        }
        
        .section {
            margin-bottom: 10px;
        }
        
        .section p {
            font-size: 0.8rem;
            line-height: 1.6;
            text-align: justify;
            margin-bottom: 8px;
        }
        
        .entry {
            margin-bottom: 8px;
        }
        
        .entry-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 2px;
            gap: 10px;
        }
        
        .entry-title {
            font-weight: 600;
            font-size: 0.8rem;
            flex: 1;
        }
        
        .entry-date {
            font-size: 0.75rem;
            color: #666;
            white-space: nowrap;
            flex-shrink: 0;
        }
        
        .entry-subtitle {
            font-size: 0.75rem;
            color: #555;
            margin-bottom: 2px;
        }
        
        ul {
            margin: 2px 0 0 0;
            padding-left: 16px;
            list-style-position: inside;
        }
        
        li {
            font-size: 0.75rem;
            line-height: 1.5;
            margin-bottom: 1px;
        }
        
        .skill-group {
            margin-bottom: 3px;
            font-size: 0.75rem;
            line-height: 1.6;
        }
        
        .skill-category {
            font-weight: 600;
            font-size: 0.8rem;
            display: inline-block;
            margin-right: 8px;
            min-width: 110px;
        }
        
        a {
            color: #0066cc;
            text-decoration: none;
        }
        
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <!-- Header -->
    <div class="resume-header">
        <div class="full-name">${escapeHtml(data.fullName)}</div>
        <div class="job-title">${escapeHtml(data.jobTitle)}</div>
        ${data.location ? `<div class="location">${escapeHtml(data.location)}</div>` : ''}
        <div class="contact-info">
            ${escapeHtml(data.email)}
            <span class="contact-divider">|</span>
            ${escapeHtml(data.phone)}
            ${data.linkedin ? `<span class="contact-divider">|</span> <a href="${escapeHtml(data.linkedin)}" class="contact-link">LinkedIn</a>` : ''}
            ${data.github ? `<span class="contact-divider">|</span> <a href="${escapeHtml(data.github)}" class="contact-link">Github</a>` : ''}
        </div>
    </div>

    <!-- Professional Summary -->
    ${summaryHtml}

    <!-- Skills Section (place skills early for better A4 fit) -->
    ${skillsHtml}

    <!-- Projects Section -->
    ${projectsHtml}

    <!-- Experience Section -->
    ${experienceHtml}

    <!-- Education Section -->
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
            
            // Enrich resume content with AI while preserving original data
            console.log("Enriching resume content with AI context...");
            const enrichedData = await enrichResumeWithAI(ai, {
                originalResume: resume,
                resumeData: resumeData,
                jobDescription: jobDescription,
                model: model
            });
            
            const html = buildHtmlFromResume(enrichedData);
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