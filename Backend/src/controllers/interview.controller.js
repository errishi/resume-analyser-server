import { createRequire } from "module";
import generateInterviewReport from "../services/ai.service.js";
import interviewReportModel from "../models/interviewReport.model.js";

/**
 * @description generate new interview report on the basis of user self description, resume pdf and job description.
 */

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