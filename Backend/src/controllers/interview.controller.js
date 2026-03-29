import { createRequire } from "module";
import generateInterviewReport from "../services/ai.service.js";
import interviewReportModel from "../models/interviewReport.model.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

export const generateInterviewReportController = async(req,res) => {

    const resumeContent = await (new pdfParse.PDFParse(Uint8Array.from(req.file.buffer))).getText();
    const { selfDescription, jobDescription } = req.body;

    const interviewReportByAi = await generateInterviewReport({
        resume: resumeContent.text,
        selfDescription,
        jobDescription
    });

    const interviewReport = await interviewReportModel.create({
        user: req.user.id,
        resume: resumeContent.text,
        selfDescription,
        jobDescription,
        ...interviewReportByAi
    });

    res.status(201).json({
        success: true,
        message: "Interview report generated successfully",
        interviewReport
    });

}