import { useContext, useEffect } from "react";
import { generateInterviewReport, getAllInterviewReports, getInterviewReportById, downloadInterviewReportPdf } from "../services/interview.api";
import { InterviewContext } from "../interview.context";
import { toast } from "react-toastify";
import { useParams } from "react-router";

function getErrorMessage(error, fallbackMessage) {
    return error?.response?.data?.message || fallbackMessage;
}

export const useInterview = () => {

    const context = useContext(InterviewContext);
    const { interviewId } = useParams();

    if(!context){
        throw new Error("useInterview must be used within an interview provider")
    }

    const {loading, setLoading, report, setReport, reports, setReports} = context;

    const generateReport = async({ selfDescription, jobDescription, resumeFile }) => {
        setLoading(true);
        try {
            const response = await generateInterviewReport(jobDescription, selfDescription, resumeFile);

            setReport(response.interviewReport)
            toast.success("Interview report generated successfully");
            return response.interviewReport;
        } catch (err) {
            toast.error(getErrorMessage(err, "Failed to generate interview report"));
            return null;
        }finally{
            setLoading(false);
        }
    }

    const getReports = async () => {
        setLoading(true);
        try {
            const response = await getAllInterviewReports();
            const reportList = response?.reports || [];
            setReports(reportList);
            // toast.success("Interview Report fetched successfully!", {
            //     toastId: "fetch-interview-reports-success"
            // });
            return reportList;
        } catch (error) {
            toast.error(getErrorMessage(error, "Failed to fetch interview reports"), {
                toastId: "fetch-interview-reports-error"
            });
            return [];
        } finally {
            setLoading(false);
        }
    }

    const getReportById = async (interviewId) => {
        setLoading(true);
        try {
            const response = await getInterviewReportById(interviewId);
            const reportData = response?.interviewReport || null;
            setReport(reportData);
            // toast.success("Interview Report fetched successfully!", {
            //     toastId: "fetch-interview-report-success"
            // });
            return reportData;
        } catch (error) {
            toast.error(getErrorMessage(error, "Failed to fetch interview report"), {
                toastId: "fetch-interview-report-error"
            });
            return null;
        } finally {
            setLoading(false);
        }
    }

    const getResumePdf = async(interviewReportId) => {
        setLoading(true);
        try {
            const pdfBlob = await downloadInterviewReportPdf(interviewReportId);
            
            // Create a temporary anchor element for downloading
            const link = document.createElement('a');
            const url = window.URL.createObjectURL(new Blob([pdfBlob]));
            link.href = url;
            link.download = `resume_${interviewReportId}.pdf`;
            
            // Append to body, click, and remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up the object URL
            window.URL.revokeObjectURL(url);
            
            toast.success("Resume PDF downloaded successfully", {
                toastId: "download-resume-pdf-success"
            });
        } catch (error) {
            toast.error(getErrorMessage(error, "Failed to download resume pdf"), {
                toastId: "download-resume-pdf-error"
            });
        } finally {
            setLoading(false);
        }
    }


    useEffect(()=>{
        if(interviewId){
            getReportById(interviewId);
        }else{
            getReports();
        }
    }, [interviewId]);

    return {
        loading,
        report,
        reports,
        generateReport,
        getReports,
        getReportById,
        getResumePdf
    };

}