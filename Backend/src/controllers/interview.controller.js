import { createRequire } from "module";
import generateInterviewReport from "../services/ai.service.js";
import interviewReportModel from "../models/interviewReport.model.js";

/**
 * @description generate new interview report on the basis of user self description, resume pdf and job description.
 */

const require = createRequire(import.meta.url);
const { PDFParse, VerbosityLevel } = require("pdf-parse");

export const generateInterviewReportController = async(req,res) => {
    const { selfDescription = "", jobDescription = "" } = req.body;
    let resumeText = "";

    if (req.file?.buffer) {
        const parser = new PDFParse({
            data: Uint8Array.from(req.file.buffer),
            verbosity: VerbosityLevel.ERRORS
        });

        try {
            const resumeContent = await parser.getText();
            resumeText = resumeContent?.text || "";
        } finally {
            await parser.destroy();
        }
    }

    if (!resumeText.trim() && !selfDescription.trim()) {
        return res.status(400).json({
            success: false,
            message: "Provide either a resume file or self description"
        });
    }

    const interviewReportByAi = await generateInterviewReport({
        resume: resumeText,
        selfDescription,
        jobDescription
    });

    const interviewReport = await interviewReportModel.create({
        user: req.user.id,
        resume: resumeText,
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

/**
 * @description get interview report by interviewId.
 */

export const getReportByIdController = async(req,res) => {
    const { interviewId } = req.params;

    const interviewReport = await interviewReportModel.findOne({ _id: interviewId, user: req.user.id });

    if(!interviewReport){
        return res.status(404).json({
            success: false,
            message: "Interview report not found"
        });
    }

    res.status(200).json({
        success: true,
        message: "Interview report fetched successfully",
        interviewReport
    });
};

/**
 * @description get all interview reports of logged in user.
 */

export const getAllInterviewReport = async(req,res) => {
    const userId = req.user.id;

    const allInterviewReport = await interviewReportModel.find({ user: userId }).sort({ createdAt: -1 }).select("-resume -selfDescription -jobDescription -__v -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan");

    if(!allInterviewReport){
        return res.status(404).json({
            success: false,
            message: "Interview reports not found"
        });
    }

    res.status(200).json({
        success: true,
        message: "Interview reports fetched successfully",
        allInterviewReport
    });
};