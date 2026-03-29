import express from "express";
import { authUser } from "../middlewares/auth.middleware.js";
import { generateInterviewReportController } from "../controllers/interview.controller.js";
import upload from "../middlewares/file.middleware.js";

const interviewRouter = express.Router();

/**
 * @route POST /api/interview/
 * @description generate new interview report on the basis of user self description, resume pdf and job description.
 * @access private
 */

interviewRouter.post('/', authUser, upload.single("resume"), generateInterviewReportController);

export default interviewRouter;