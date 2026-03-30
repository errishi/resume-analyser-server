import express from "express";
import { authUser } from "../middlewares/auth.middleware.js";
import { generateInterviewReportController, getAllInterviewReport, getReportByIdController } from "../controllers/interview.controller.js";
import upload from "../middlewares/file.middleware.js";

const interviewRouter = express.Router();

/**
 * @route POST /api/interview/
 * @description generate new interview report on the basis of user self description, resume pdf and job description.
 * @access private
 */

interviewRouter.post('/', authUser, upload.single("resume"), generateInterviewReportController);

/**
 * @route GET /api/interview/report/:interviewId
 * @description get interview report by interviewId.
 * @access private
 */

interviewRouter.get('/report/:interviewId', authUser, getReportByIdController);

/**
 * GET /api/interview/
 * @description get all interview reports of logged in user.
 * @access private
 */

interviewRouter.get("/", authUser, getAllInterviewReport);

export default interviewRouter;