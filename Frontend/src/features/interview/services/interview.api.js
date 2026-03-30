import axios from "axios";

const api = axios.create({
    baseURL: 'http://localhost:7000',
    withCredentials: true
});

/**
 * @description generate new interview report on the basis of user self description, resume pdf and job description.
 */

export const generateInterviewReport = async (jobDescription, selfDescription, resumeFile) => {
    const formData = new FormData();

    formData.append("jobDescription", jobDescription);
    formData.append("selfDescription", selfDescription);
    formData.append("resume", resumeFile);

    const response = await api.post(`/api/interview/`, formData, {
        headers: {
            "Content-Type": "multipart/form-data"
        }
    });

    return response.data;
};

/**
 * @description get interview report by interviewId.
 */

export const getInterviewReportById = async(interviewId) => {
    const response = await api.get(`/api/report/interview/${interviewId}`);

    return response.data;
};

/**
 * @description get all interview reports of logged in user.
 */

export const getAllInterviewReports = async() => {
    const response = await api.get(`/api/interview/`);

    return response.data;
}