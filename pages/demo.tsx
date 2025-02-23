import { AnimatePresence, motion } from "framer-motion";
import { RadioGroup } from "@headlessui/react";
import { v4 as uuid } from "uuid";
import Link from "next/link";
import { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import Header from "@/components/Header";
import ReactMarkdown from 'react-markdown';
   

const questions = [
  {
    id: 1,
    name: "Behavioral",
    description: "From LinkedIn, Amazon, Adobe",
    difficulty: "Easy",
  },
  {
    id: 2,
    name: "Technical",
    description: "From Google, Meta, and Apple",
    difficulty: "Medium",
  },
];

const interviewers = [
  {
    id: "John",
    name: "John",
    description: "Software Engineering",
    level: "L3",
  },
  {
    id: "Richard",
    name: "Richard",
    description: "Product Management",
    level: "L5",
  },
  {
    id: "Sarah",
    name: "Sarah",
    description: "Other",
    level: "L7",
  },
];

const ffmpeg = createFFmpeg({
  // corePath: `http://localhost:3000/ffmpeg/dist/ffmpeg-core.js`,
  // I've included a default import above (and files in the public directory), but you can also use a CDN like this:
  corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
  log: true,
});

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function DemoPage() {
  const [selected, setSelected] = useState(questions[0]);
  const [selectedInterviewer, setSelectedInterviewer] = useState(
    interviewers[0]
  );
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const webcamRef = useRef<Webcam | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [seconds, setSeconds] = useState(150);
  const [videoEnded, setVideoEnded] = useState(false);
  const [recordingPermission, setRecordingPermission] = useState(true);
  const [cameraLoaded, setCameraLoaded] = useState(false);
  const vidRef = useRef<HTMLVideoElement>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Processing");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [generatedFeedback, setGeneratedFeedback] = useState("");

  useEffect(() => {
    setIsDesktop(window.innerWidth >= 768);
  }, []);
  const handleDataAvailable = useCallback(
    ({ data }: BlobEvent) => {
      if (data.size > 0) {
        setRecordedChunks((prev) => prev.concat(data));
      }
    },
    [] // No dependencies needed as it only uses setRecordedChunks which is stable
  );
  useEffect(() => {
    if (videoEnded) {
      const element = document.getElementById("startTimer");
      if (element) {
        element.style.display = "flex";
      }
  
      setCapturing(true);
      setIsVisible(false);
  
      mediaRecorderRef.current = new MediaRecorder(
        webcamRef?.current?.stream as MediaStream
      );
      mediaRecorderRef.current.addEventListener(
        "dataavailable",
        handleDataAvailable
      );
      mediaRecorderRef.current.start();
    }
  }, [videoEnded, handleDataAvailable]);

  const handleStartCaptureClick = useCallback(() => {
    const startTimer = document.getElementById("startTimer");
    if (startTimer) {
      startTimer.style.display = "none";
    }
  
    if (vidRef.current) {
      vidRef.current.play();
    }
  }, []); // No dependencies needed as it only uses DOM manipulation and vidRef

  

  const handleStopCaptureClick = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    setCapturing(false);
  }, []); // Only depends on mediaRecorderRef which is stable

  useEffect(() => {
    let timer: any = null;
    if (capturing) {
      timer = setInterval(() => {
        setSeconds((prevSeconds) => {
          if (prevSeconds === 0) {
            handleStopCaptureClick();
            setCapturing(false);
            return 0;
          }
          return prevSeconds - 1;
        });
      }, 1000);
    }
    return () => {
      clearInterval(timer);
    };
  }, [capturing, handleStopCaptureClick]); // Add proper dependencies

  const handleDownload = async () => {
    if (!recordedChunks.length) return;
    
    try {
      setSubmitting(true);
      setStatus("Processing");
      setGeneratedFeedback("");
      
      // Create video blob
      const file = new Blob(recordedChunks, { type: 'video/webm' });
      const unique_id = uuid();
  
      // Load and process with FFmpeg
      try {
        if (!ffmpeg.isLoaded()) {
          await ffmpeg.load();
        }
  
        ffmpeg.FS("writeFile", `${unique_id}.webm`, await fetchFile(file));
        await ffmpeg.run(
          "-i",
          `${unique_id}.webm`,
          "-vn",
          "-acodec",
          "libmp3lame",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-f",
          "mp3",
          `${unique_id}.mp3`
        );
  
        const fileData = ffmpeg.FS("readFile", `${unique_id}.mp3`);
        const output = new File([fileData.buffer], `${unique_id}.mp3`, {
          type: "audio/mp3",
        });
  
        // Clean up FFmpeg memory
        ffmpeg.FS("unlink", `${unique_id}.webm`);
        ffmpeg.FS("unlink", `${unique_id}.mp3`);
  
        // Prepare form data for transcription
        const formData = new FormData();
        formData.append("file", output, `${unique_id}.mp3`);
        formData.append("model", "whisper-1");
  
        // Get the appropriate question based on selection
        const question = selected.name === "Behavioral"
          ? `Tell me about yourself. Why don't you walk me through your resume?`
          : selectedInterviewer.name === "John"
          ? "What is a Hash Table, and what is the average case and worst case time for each of its operations?"
          : selectedInterviewer.name === "Richard"
          ? "Uber is looking to expand its product line. Talk me through how you would approach this problem."
          : "You have a 3-gallon jug and 5-gallon jug, how do you measure out exactly 4 gallons?";
  
        setStatus("Transcribing");
  
        // Transcribe audio
        const upload = await fetch(
          `/api/transcribe?question=${encodeURIComponent(question)}`,
          {
            method: "POST",
            body: formData,
          }
        );
  
        const results = await upload.json();
  
        if (!upload.ok) {
          throw new Error(results.error || 'Transcription failed');
        }
  
        setIsSuccess(true);
        setTranscript(results.transcript || results.error || 'No transcript generated');
  
        await new Promise(resolve => setTimeout(resolve, 800));
        setCompleted(true);
  
        // Only proceed if we have a transcript
        if (results.transcript?.length > 0) {
          const currentDateTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
          
          const prompt = `
  Interview Question: ${question}
  Transcript: ${results.transcript}
  
  ${selected.name === "Behavioral"
    ? "Please provide feedback on the candidate's response, focusing on:\n1. Use of STAR or PAR framework\n2. Communication clarity\n3. Relevance to the question\n4. Areas for improvement"
    : "Please provide feedback on the candidate's response, focusing on:\n1. Technical accuracy\n2. Communication clarity\n3. Problem-solving approach\n4. Areas for improvement"}
  
  Feedback on the candidate's response:`;
  
          const response = await fetch("/api/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ prompt }),
          });
  
          if (!response.ok) {
            throw new Error('Failed to generate feedback');
          }
  
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('No response body');
          }
  
          try {
            const decoder = new TextDecoder();
            while (true) {
              const { value, done } = await reader.read();
              
              if (done) break;
              
              if (value) {
                const text = decoder.decode(value, { stream: true });
                setGeneratedFeedback(prev => prev + text);
              }
            }
          } catch (error) {
            console.error('Stream error:', error);
            setGeneratedFeedback(prev => 
              prev + '\n\nError: Connection lost while generating feedback. Please try again.'
            );
          } finally {
            reader.releaseLock();
          }
        }
      } catch (error) {
        console.error('Processing error:', error);
        setIsSuccess(false);
        setTranscript('Error processing recording. Please try again.');
        setGeneratedFeedback('');
      }
    } catch (error) {
      console.error('Error:', error);
      setIsSuccess(false);
      setTranscript('An error occurred. Please try again.');
      setGeneratedFeedback('');
    } finally {
      setSubmitting(false);
      setTimeout(() => setRecordedChunks([]), 1500);
    }
  };
  function restartVideo() {
    setRecordedChunks([]);
    setVideoEnded(false);
    setCapturing(false);
    setIsVisible(true);
    setSeconds(150);
  }

  const videoConstraints = isDesktop
    ? { width: 1280, height: 720, facingMode: "user" }
    : { width: 480, height: 640, facingMode: "user" };

  const handleUserMedia = () => {
    setTimeout(() => {
      setLoading(false);
      setCameraLoaded(true);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#FCFCFC]">
  <Header />
  <div className="pt-16"></div><AnimatePresence>
      {step === 3 ? (
        <div className="w-full min-h-screen flex flex-col px-4 pt-2 pb-8 md:px-8 md:py-2 bg-[#FCFCFC] relative overflow-x-hidden">
         
          {completed ? (
            <div className="w-full flex flex-col max-w-[1080px] mx-auto mt-[10vh] overflow-y-auto pb-8 md:pb-12">
              <motion.div
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.35, ease: [0.075, 0.82, 0.165, 1] }}
                className="relative md:aspect-[16/9] w-full max-w-[1080px] overflow-hidden bg-[#1D2B3A] rounded-lg ring-1 ring-gray-900/5 shadow-md flex flex-col items-center justify-center"
              >
                <video
                  className="w-full h-full rounded-lg"
                  controls
                  crossOrigin="anonymous"
                  autoPlay
                >
                  <source
                    src={URL.createObjectURL(
                      new Blob(recordedChunks, { type: "video/mp4" })
                    )}
                    type="video/mp4"
                  />
                </video>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.5,
                  duration: 0.15,
                  ease: [0.23, 1, 0.82, 1],
                }}
                className="flex flex-col md:flex-row items-center mt-2 md:mt-4 md:justify-between space-y-1 md:space-y-0"
              >
                <div className="flex flex-row items-center space-x-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4 text-[#407BBF] shrink-0"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                    />
                  </svg>
                  <p className="text-[14px] font-normal leading-[20px] text-[#1a2b3b]">
                    Video is not stored on our servers, and will go away as soon
                    as you leave the page.
                  </p>
                </div>
               
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.5,
                  duration: 0.15,
                  ease: [0.23, 1, 0.82, 1],
                }}
                className="mt-8 flex flex-col"
              >
                <div>
                  <h2 className="text-xl font-semibold text-left text-[#1D2B3A] mb-2">
                    Transcript
                  </h2>
                  <p className="prose prose-sm max-w-none">
                    {transcript.length > 0
                      ? transcript
                      : "Don't think you said anything. Want to try again?"}
                  </p>
                </div>
                <div className="mt-8">
   
  
  <h2 className="text-xl font-semibold text-left text-[#1D2B3A] mb-2">
    Feedback
  </h2>
  <div className="mt-4 text-base rounded-lg border border-[#EEEEEE] bg-[#FAFAFA] p-6 leading-7 text-gray-900 min-h-[100px]">
    <ReactMarkdown
      components={{
        p: ({ children }) => (
          <p className="text-gray-800 mb-4">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900">{children}</strong>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-4 my-2">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-4 my-2">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-gray-800 mb-1">{children}</li>
        ),
      }}
    >
      {generatedFeedback}
    </ReactMarkdown>
  </div>
</div>
              </motion.div>
            </div>
          ) : (
            <div className="h-full w-full items-center flex flex-col mt-[10vh]">
              {recordingPermission ? (
                <div className="w-full flex flex-col max-w-[1080px] mx-auto justify-center">
                  <h2 className="text-2xl font-semibold text-left text-[#1D2B3A] mb-2">
                    {selected.name === "Behavioral"
                      ? `Tell me about yourself. Why don${`’`}t you walk me through your resume?`
                      : selectedInterviewer.name === "John"
                      ? "What is a Hash Table, and what is the average case and worst case time for each of its operations?"
                      : selectedInterviewer.name === "Richard"
                      ? "Uber is looking to expand its product line. Talk me through how you would approach this problem."
                      : "You have a 3-gallon jug and 5-gallon jug, how do you measure out exactly 4 gallons?"}
                  </h2>
                  <span className="text-[14px] leading-[20px] text-[#1a2b3b] font-normal mb-4">
                    Asked by top companies like Google, Facebook and more
                  </span>
                  <motion.div
                    initial={{ y: -20 }}
                    animate={{ y: 0 }}
                    transition={{
                      duration: 0.35,
                      ease: [0.075, 0.82, 0.965, 1],
                    }}
                    className="relative aspect-[16/9] w-full max-w-[1080px] overflow-hidden bg-[#1D2B3A] rounded-lg ring-1 ring-gray-900/5 shadow-md"
                  >
                    {!cameraLoaded && (
                      <div className="text-white absolute top-1/2 left-1/2 z-20 flex items-center">
                        <svg
                          className="animate-spin h-4 w-4 text-white mx-auto my-0.5"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth={3}
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      </div>
                    )}
                    <div className="relative z-10 h-full w-full rounded-lg">
                      <div className="absolute top-5 lg:top-10 left-5 lg:left-10 z-20">
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-800">
                          {new Date(seconds * 1000).toISOString().slice(14, 19)}
                        </span>
                      </div>
                      {isVisible && ( // If the video is visible (on screen) we show it
                        <div className="block absolute top-[10px] sm:top-[20px] lg:top-[40px] left-auto right-[10px] sm:right-[20px] md:right-10 h-[80px] sm:h-[140px] md:h-[180px] aspect-video rounded z-20">
                          <div className="h-full w-full aspect-video rounded md:rounded-lg lg:rounded-xl">
                            <video
                              id="question-video"
                              onEnded={() => setVideoEnded(true)}
                              controls={false}
                              ref={vidRef}
                              playsInline
                              className="h-full object-cover w-full rounded-md md:rounded-[12px] aspect-video"
                              crossOrigin="anonymous"
                            >
                              <source
                                src={
                                  selectedInterviewer.name === "John"
                                    ? selected.name === "Behavioral"
                                      ? "https://liftoff-public.s3.amazonaws.com/DemoInterviewMale.mp4"
                                      : "https://liftoff-public.s3.amazonaws.com/JohnTechnical.mp4"
                                    : selectedInterviewer.name === "Richard"
                                    ? selected.name === "Behavioral"
                                      ? "https://liftoff-public.s3.amazonaws.com/RichardBehavioral.mp4"
                                      : "https://liftoff-public.s3.amazonaws.com/RichardTechnical.mp4"
                                    : selectedInterviewer.name === "Sarah"
                                    ? selected.name === "Behavioral"
                                      ? "https://liftoff-public.s3.amazonaws.com/BehavioralSarah.mp4"
                                      : "https://liftoff-public.s3.amazonaws.com/SarahTechnical.mp4"
                                    : selected.name === "Behavioral"
                                    ? "https://liftoff-public.s3.amazonaws.com/DemoInterviewMale.mp4"
                                    : "https://liftoff-public.s3.amazonaws.com/JohnTechnical.mp4"
                                }
                                type="video/mp4"
                              />
                            </video>
                          </div>
                        </div>
                      )}
                      <Webcam
                        mirrored
                        audio
                        muted
                        ref={webcamRef}
                        videoConstraints={videoConstraints}
                        onUserMedia={handleUserMedia}
                        onUserMediaError={(error) => {
                          setRecordingPermission(false);
                        }}
                        className="absolute z-10 min-h-[100%] min-w-[100%] h-auto w-auto object-cover"
                      />
                    </div>
                    {loading && (
                      <div className="absolute flex h-full w-full items-center justify-center">
                        <div className="relative h-[112px] w-[112px] rounded-lg object-cover text-[2rem]">
                          <div className="flex h-[112px] w-[112px] items-center justify-center rounded-[0.5rem] bg-[#4171d8] !text-white">
                            Loading...
                          </div>
                        </div>
                      </div>
                    )}

                    {cameraLoaded && (
                      <div className="absolute bottom-0 left-0 z-50 flex h-[82px] w-full items-center justify-center">
                        {recordedChunks.length > 0 ? (
                          <>
                            {isSuccess ? (
                              <button
                                className="cursor-disabled group rounded-full min-w-[140px] px-4 py-2 text-[13px] font-semibold group inline-flex items-center justify-center text-sm text-white duration-150 bg-green-500 hover:bg-green-600 hover:text-slate-100 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 active:scale-100 active:bg-green-800 active:text-green-100"
                                style={{
                                  boxShadow:
                                    "0px 1px 4px rgba(27, 71, 13, 0.17), inset 0px 0px 0px 1px #5fc767, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                                }}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-5 w-5 mx-auto"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <motion.path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 0.5 }}
                                  />
                                </svg>
                              </button>
                            ) : (
                              <div className="flex flex-row gap-2">
                                {!isSubmitting && (
                                  <button
                                    onClick={() => restartVideo()}
                                    className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-white text-[#1E2B3A] hover:[linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), #0D2247] no-underline flex gap-x-2  active:scale-95 scale-100 duration-75"
                                  >
                                    Restart
                                  </button>
                                )}
                                <button
                                  onClick={handleDownload}
                                  disabled={isSubmitting}
                                  className="group rounded-full min-w-[140px] px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#1E2B3A] text-white hover:[linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), #0D2247] no-underline flex  active:scale-95 scale-100 duration-75  disabled:cursor-not-allowed"
                                  style={{
                                    boxShadow:
                                      "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #061530, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                                  }}
                                >
                                  <span>
                                    {isSubmitting ? (
                                      <div className="flex items-center justify-center gap-x-2">
                                        <svg
                                          className="animate-spin h-5 w-5 text-slate-50 mx-auto"
                                          xmlns="http://www.w3.org/2000/svg"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                        >
                                          <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth={3}
                                          ></circle>
                                          <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                          ></path>
                                        </svg>
                                        <span>{status}</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center gap-x-2">
                                        <span>Process transcript</span>
                                        <svg
                                          className="w-5 h-5"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          xmlns="http://www.w3.org/2000/svg"
                                        >
                                          <path
                                            d="M13.75 6.75L19.25 12L13.75 17.25"
                                            stroke="white"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                          <path
                                            d="M19 12H4.75"
                                            stroke="white"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                        </svg>
                                      </div>
                                    )}
                                  </span>
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="absolute bottom-[6px] md:bottom-5 left-5 right-5">
                            <div className="lg:mt-4 flex flex-col items-center justify-center gap-2">
                              {capturing ? (
                                <div
                                  id="stopTimer"
                                  onClick={handleStopCaptureClick}
                                  className="flex h-10 w-10 flex-col items-center justify-center rounded-full bg-transparent text-white hover:shadow-xl ring-4 ring-white  active:scale-95 scale-100 duration-75 cursor-pointer"
                                >
                                  <div className="h-5 w-5 rounded bg-red-500 cursor-pointer"></div>
                                </div>
                              ) : (
                                <button
                                  id="startTimer"
                                  onClick={handleStartCaptureClick}
                                  className="flex h-8 w-8 sm:h-8 sm:w-8 flex-col items-center justify-center rounded-full bg-red-500 text-white hover:shadow-xl ring-4 ring-white ring-offset-gray-500 ring-offset-2 active:scale-95 scale-100 duration-75"
                                ></button>
                              )}
                              <div className="w-12"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div
                      className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 text-5xl text-white font-semibold text-center"
                      id="countdown"
                    ></div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.5,
                      duration: 0.15,
                      ease: [0.23, 1, 0.82, 1],
                    }}
                    className="flex flex-row space-x-1 mt-4 items-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-4 h-4 text-[#407BBF]"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                      />
                    </svg>
                    <p className="text-[14px] font-normal leading-[20px] text-[#1a2b3b]">
                      Video is not stored on our servers, it is solely used for
                      transcription.
                    </p>
                  </motion.div>
                </div>
              ) : (
                <div className="w-full flex flex-col max-w-[1080px] mx-auto justify-center">
                  <motion.div
                    initial={{ y: 20 }}
                    animate={{ y: 0 }}
                    transition={{
                      duration: 0.35,
                      ease: [0.075, 0.82, 0.165, 1],
                    }}
                    className="relative md:aspect-[16/9] w-full max-w-[1080px] overflow-hidden bg-[#1D2B3A] rounded-lg ring-1 ring-gray-900/5 shadow-md flex flex-col items-center justify-center"
                  >
                    <p className="text-white font-medium text-lg text-center max-w-3xl">
                      Camera permission is denied. We don{`'`}t store your
                      attempts anywhere, but we understand not wanting to give
                      us access to your camera. Try again by opening this page
                      in an incognito window {`(`}or enable permissions in your
                      browser settings{`)`}.
                    </p>
                  </motion.div>
                  <div className="flex flex-row space-x-4 mt-8 justify-end">
                    <button
                      onClick={() => setStep(1)}
                      className="group max-w-[200px] rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#f5f7f9] text-[#1E2B3A] no-underline active:scale-95 scale-100 duration-75"
                      style={{
                        boxShadow: "0 1px 1px #0c192714, 0 1px 3px #0c192724",
                      }}
                    >
                      Restart demo
                    </button>
                   
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col md:flex-row w-full md:overflow-hidden">
          
          <div className="w-full min-h-[60vh] md:w-1/2 md:h-screen flex flex-col px-4 pt-2 pb-8 md:px-0 md:py-2 bg-[#FCFCFC] justify-center">
            <div className="h-full w-full items-center justify-center flex flex-col">
              {step === 1 ? (
                <motion.div
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -40 }}
                  key="step-1"
                  transition={{
                    duration: 0.95,
                    ease: [0.165, 0.84, 0.44, 1],
                  }}
                  className="max-w-lg mx-auto px-4 lg:px-0"
                ><h1>AI Interview Feedback Generator</h1>
                  <h2 className="text-4xl font-bold text-[#1E2B3A]">
                    Select a question type
                  </h2>
                  <p className="text-[14px] leading-[20px] text-[#1a2b3b] font-normal my-4">
                    We have hundreds of questions from top tech companies.
                    Choose a type to get started.
                  </p>
                  <div>
                    <RadioGroup value={selected} onChange={setSelected}>
                      <RadioGroup.Label className="sr-only">
                        Server size
                      </RadioGroup.Label>
                      <div className="space-y-4">
                        {questions.map((question) => (
                          <RadioGroup.Option
                            key={question.name}
                            value={question}
                            className={({ checked, active }) =>
                              classNames(
                                checked
                                  ? "border-transparent"
                                  : "border-gray-300",
                                active
                                  ? "border-blue-500 ring-2 ring-blue-200"
                                  : "",
                                "relative cursor-pointer rounded-lg border bg-white px-6 py-4 shadow-sm focus:outline-none flex justify-between"
                              )
                            }
                          >
                            {({ active, checked }) => (
                              <>
                                <span className="flex items-center">
                                  <span className="flex flex-col text-sm">
                                    <RadioGroup.Label
                                      as="span"
                                      className="font-medium text-gray-900"
                                    >
                                      {question.name}
                                    </RadioGroup.Label>
                                    <RadioGroup.Description
                                      as="span"
                                      className="text-gray-500"
                                    >
                                      <span className="block">
                                        {question.description}
                                      </span>
                                    </RadioGroup.Description>
                                  </span>
                                </span>
                                <RadioGroup.Description
                                  as="span"
                                  className="flex text-sm ml-4 mt-0 flex-col text-right items-center justify-center"
                                >
                                  <span className=" text-gray-500">
                                    {question.difficulty === "Easy" ? (
                                      <svg
                                        className="h-full w-[16px]"
                                        viewBox="0 0 22 25"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                      >
                                        <rect
                                          y="13.1309"
                                          width="6"
                                          height="11"
                                          rx="1"
                                          fill="#4E7BBA"
                                        />
                                        <rect
                                          x="8"
                                          y="8.13086"
                                          width="6"
                                          height="16"
                                          rx="1"
                                          fill="#E1E1E1"
                                        />
                                        <rect
                                          x="16"
                                          y="0.130859"
                                          width="6"
                                          height="24"
                                          rx="1"
                                          fill="#E1E1E1"
                                        />
                                      </svg>
                                    ) : (
                                      <svg
                                        className="h-full w-[16px]"
                                        viewBox="0 0 22 25"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                      >
                                        <rect
                                          y="13.1309"
                                          width="6"
                                          height="11"
                                          rx="1"
                                          fill="#4E7BBA"
                                        />
                                        <rect
                                          x="8"
                                          y="8.13086"
                                          width="6"
                                          height="16"
                                          rx="1"
                                          fill="#4E7BBA"
                                        />
                                        <rect
                                          x="16"
                                          y="0.130859"
                                          width="6"
                                          height="24"
                                          rx="1"
                                          fill="#E1E1E1"
                                        />
                                      </svg>
                                    )}
                                  </span>
                                  <span className="font-medium text-gray-900">
                                    {question.difficulty}
                                  </span>
                                </RadioGroup.Description>
                                <span
                                  className={classNames(
                                    active ? "border" : "border-2",
                                    checked
                                      ? "border-blue-500"
                                      : "border-transparent",
                                    "pointer-events-none absolute -inset-px rounded-lg"
                                  )}
                                  aria-hidden="true"
                                />
                              </>
                            )}
                          </RadioGroup.Option>
                        ))}
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="flex gap-[15px] justify-end mt-8">
                    <div>
                      <Link
                        href="/"
                        className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#f5f7f9] text-[#1E2B3A] no-underline active:scale-95 scale-100 duration-75"
                        style={{
                          boxShadow: "0 1px 1px #0c192714, 0 1px 3px #0c192724",
                        }}
                      >
                        Back to home
                      </Link>
                    </div>
                    <div>
                      <button
                        onClick={() => {
                          setStep(2);
                        }}
                        className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#1E2B3A] text-white hover:[linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), #0D2247] no-underline flex gap-x-2  active:scale-95 scale-100 duration-75"
                        style={{
                          boxShadow:
                            "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #061530, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                        }}
                      >
                        <span> Continue </span>
                        <svg
                          className="w-5 h-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M13.75 6.75L19.25 12L13.75 17.25"
                            stroke="#FFF"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M19 12H4.75"
                            stroke="#FFF"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : step === 2 ? (
                <motion.div
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -40 }}
                  key="step-2"
                  transition={{
                    duration: 0.95,
                    ease: [0.165, 0.84, 0.44, 1],
                  }}
                  className="max-w-lg mx-auto px-4 lg:px-0"
                >
                  <h2 className="text-4xl font-bold text-[#1E2B3A]">
                    And an interviewer
                  </h2>
                  <p className="text-[14px] leading-[20px] text-[#1a2b3b] font-normal my-4">
                    Choose whoever makes you feel comfortable. You can always
                    try again with another one.
                  </p>
                  <div>
                    <RadioGroup
                      value={selectedInterviewer}
                      onChange={setSelectedInterviewer}
                    >
                      <RadioGroup.Label className="sr-only">
                        Server size
                      </RadioGroup.Label>
                      <div className="space-y-4">
                        {interviewers.map((interviewer) => (
                          <RadioGroup.Option
                            key={interviewer.name}
                            value={interviewer}
                            className={({ checked, active }) =>
                              classNames(
                                checked
                                  ? "border-transparent"
                                  : "border-gray-300",
                                active
                                  ? "border-blue-500 ring-2 ring-blue-200"
                                  : "",
                                "relative cursor-pointer rounded-lg border bg-white px-6 py-4 shadow-sm focus:outline-none flex justify-between"
                              )
                            }
                          >
                            {({ active, checked }) => (
                              <>
                                <span className="flex items-center">
                                  <span className="flex flex-col text-sm">
                                    <RadioGroup.Label
                                      as="span"
                                      className="font-medium text-gray-900"
                                    >
                                      {interviewer.name}
                                    </RadioGroup.Label>
                                    <RadioGroup.Description
                                      as="span"
                                      className="text-gray-500"
                                    >
                                      <span className="block">
                                        {interviewer.description}
                                      </span>
                                    </RadioGroup.Description>
                                  </span>
                                </span>
                                <RadioGroup.Description
                                  as="span"
                                  className="flex text-sm ml-4 mt-0 flex-col text-right items-center justify-center"
                                >
                                  <span className=" text-gray-500">
                                    <svg
                                      className="w-[28px] h-full"
                                      viewBox="0 0 38 30"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <g filter="url(#filter0_d_34_25)">
                                        <g clipPath="url(#clip0_34_25)">
                                          <mask
                                            id="mask0_34_25"
                                            style={{ maskType: "luminance" }}
                                            maskUnits="userSpaceOnUse"
                                            x="3"
                                            y="1"
                                            width="32"
                                            height="24"
                                          >
                                            <rect
                                              x="3"
                                              y="1"
                                              width="32"
                                              height="24"
                                              fill="white"
                                            />
                                          </mask>
                                          <g mask="url(#mask0_34_25)">
                                            <path
                                              fillRule="evenodd"
                                              clipRule="evenodd"
                                              d="M3 1H35V25H3V1Z"
                                              fill="#F7FCFF"
                                            />
                                            <path
                                              fillRule="evenodd"
                                              clipRule="evenodd"
                                              d="M3 15.6666V17.6666H35V15.6666H3Z"
                                              fill="#E31D1C"
                                            />
                                            <path
                                              fillRule="evenodd"
                                              clipRule="evenodd"
                                              d="M3 19.3334V21.3334H35V19.3334H3Z"
                                              fill="#E31D1C"
                                            />
                                            <path
                                              fillRule="evenodd"
                                              clipRule="evenodd"
                                              d="M3 8.33337V10.3334H35V8.33337H3Z"
                                              fill="#E31D1C"
                                            />
                                            <path
                                              fillRule="evenodd"
                                              clipRule="evenodd"
                                              d="M3 23V25H35V23H3Z"
                                              fill="#E31D1C"
                                            />
                                            <path
                                              fillRule="evenodd"
                                              clipRule="evenodd"
                                              d="M3 12V14H35V12H3Z"
                                              fill="#E31D1C"
                                            />
                                            <path
                                              fillRule="evenodd"
                                              clipRule="evenodd"
                                              d="M3 1V3H35V1H3Z"
                                              fill="#E31D1C"
                                            />
                                            <path
                                              fillRule="evenodd"
                                              clipRule="evenodd"
                                              d="M3 4.66663V6.66663H35V4.66663H3Z"
                                              fill="#E31D1C"
                                            />
                                            <rect
                                              x="3"
                                              y="1"
                                              width="20"
                                              height="13"
                                              fill="#2E42A5"
                                            />
                                            <path
                                              fillRule="evenodd"
                                              clipRule="evenodd"
                                              d="M4.72221 3.93871L3.99633 4.44759L4.2414 3.54198L3.59668 2.96807H4.43877L4.7212 2.229L5.05237 2.96807H5.77022L5.20619 3.54198L5.42455 4.44759L4.72221 3.93871ZM8.72221 3.93871L7.99633 4.44759L8.2414 3.54198L7.59668 2.96807H8.43877L8.7212 2.229L9.05237 2.96807H9.77022L9.20619 3.54198L9.42455 4.44759L8.72221 3.93871ZM11.9963 4.44759L12.7222 3.93871L13.4245 4.44759L13.2062 3.54198L13.7702 2.96807H13.0524L12.7212 2.229L12.4388 2.96807H11.5967L12.2414 3.54198L11.9963 4.44759ZM16.7222 3.93871L15.9963 4.44759L16.2414 3.54198L15.5967 2.96807H16.4388L16.7212 2.229L17.0524 2.96807H17.7702L17.2062 3.54198L17.4245 4.44759L16.7222 3.93871ZM3.99633 8.44759L4.72221 7.93871L5.42455 8.44759L5.20619 7.54198L5.77022 6.96807H5.05237L4.7212 6.229L4.43877 6.96807H3.59668L4.2414 7.54198L3.99633 8.44759ZM8.72221 7.93871L7.99633 8.44759L8.2414 7.54198L7.59668 6.96807H8.43877L8.7212 6.229L9.05237 6.96807H9.77022L9.20619 7.54198L9.42455 8.44759L8.72221 7.93871ZM11.9963 8.44759L12.7222 7.93871L13.4245 8.44759L13.2062 7.54198L13.7702 6.96807H13.0524L12.7212 6.229L12.4388 6.96807H11.5967L12.2414 7.54198L11.9963 8.44759ZM16.7222 7.93871L15.9963 8.44759L16.2414 7.54198L15.5967 6.96807H16.4388L16.7212 6.229L17.0524 6.96807H17.7702L17.2062 7.54198L17.4245 8.44759L16.7222 7.93871ZM3.99633 12.4476L4.72221 11.9387L5.42455 12.4476L5.20619 11.542L5.77022 10.9681H5.05237L4.7212 10.229L4.43877 10.9681H3.59668L4.2414 11.542L3.99633 12.4476ZM8.72221 11.9387L7.99633 12.4476L8.2414 11.542L7.59668 10.9681H8.43877L8.7212 10.229L9.05237 10.9681H9.77022L9.20619 11.542L9.42455 12.4476L8.72221 11.9387ZM11.9963 12.4476L12.7222 11.9387L13.4245 12.4476L13.2062 11.542L13.7702 10.9681H13.0524L12.7212 10.229L12.4388 10.9681H11.5967L12.2414 11.542L11.9963 12.4476ZM16.7222 11.9387L15.9963 12.4476L16.2414 11.542L15.5967 10.9681H16.4388L16.7212 10.229L17.0524 10.9681H17.7702L17.2062 11.542L17.4245 12.4476L16.7222 11.9387ZM19.9963 4.44759L20.7222 3.93871L21.4245 4.44759L21.2062 3.54198L21.7702 2.96807H21.0524L20.7212 2.229L20.4388 2.96807H19.5967L20.2414 3.54198L19.9963 4.44759ZM20.7222 7.93871L19.9963 8.44759L20.2414 7.54198L19.5967 6.96807H20.4388L20.7212 6.229L21.0524 6.96807H21.7702L21.2062 7.54198L21.4245 8.44759L20.7222 7.93871ZM19.9963 12.4476L20.7222 11.9387L21.4245 12.4476L21.2062 11.542L21.7702 10.9681H21.0524L20.7212 10.229L20.4388 10.9681H19.5967L20.2414 11.542L19.9963 12.4476ZM6.72221 5.93871L5.99633 6.44759L6.2414 5.54198L5.59668 4.96807H6.43877L6.7212 4.229L7.05237 4.96807H7.77022L7.20619 5.54198L7.42455 6.44759L6.72221 5.93871ZM9.99633 6.44759L10.7222 5.93871L11.4245 6.44759L11.2062 5.54198L11.7702 4.96807H11.0524L10.7212 4.229L10.4388 4.96807H9.59668L10.2414 5.54198L9.99633 6.44759ZM14.7222 5.93871L13.9963 6.44759L14.2414 5.54198L13.5967 4.96807H14.4388L14.7212 4.229L15.0524 4.96807H15.7702L15.2062 5.54198L15.4245 6.44759L14.7222 5.93871ZM5.99633 10.4476L6.72221 9.93871L7.42455 10.4476L7.20619 9.54198L7.77022 8.96807H7.05237L6.7212 8.229L6.43877 8.96807H5.59668L6.2414 9.54198L5.99633 10.4476ZM10.7222 9.93871L9.99633 10.4476L10.2414 9.54198L9.59668 8.96807H10.4388L10.7212 8.229L11.0524 8.96807H11.7702L11.2062 9.54198L11.4245 10.4476L10.7222 9.93871ZM13.9963 10.4476L14.7222 9.93871L15.4245 10.4476L15.2062 9.54198L15.7702 8.96807H15.0524L14.7212 8.229L14.4388 8.96807H13.5967L14.2414 9.54198L13.9963 10.4476ZM18.7222 5.93871L17.9963 6.44759L18.2414 5.54198L17.5967 4.96807H18.4388L18.7212 4.229L19.0524 4.96807H19.7702L19.2062 5.54198L19.4245 6.44759L18.7222 5.93871ZM17.9963 10.4476L18.7222 9.93871L19.4245 10.4476L19.2062 9.54198L19.7702 8.96807H19.0524L18.7212 8.229L18.4388 8.96807H17.5967L18.2414 9.54198L17.9963 10.4476Z"
                                              fill="#F7FCFF"
                                            />
                                          </g>
                                          <rect
                                            x="3"
                                            y="1"
                                            width="32"
                                            height="24"
                                            fill="url(#paint0_linear_34_25)"
                                            style={{ mixBlendMode: "overlay" }}
                                          />
                                        </g>
                                        <rect
                                          x="3.5"
                                          y="1.5"
                                          width="31"
                                          height="23"
                                          rx="1.5"
                                          stroke="black"
                                          strokeOpacity="0.1"
                                          style={{ mixBlendMode: "multiply" }}
                                        />
                                      </g>
                                      <defs>
                                        <filter
                                          id="filter0_d_34_25"
                                          x="0"
                                          y="0"
                                          width="38"
                                          height="30"
                                          filterUnits="userSpaceOnUse"
                                          colorInterpolationFilters="sRGB"
                                        >
                                          <feFlood
                                            floodOpacity="0"
                                            result="BackgroundImageFix"
                                          />
                                          <feColorMatrix
                                            in="SourceAlpha"
                                            type="matrix"
                                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                                            result="hardAlpha"
                                          />
                                          <feOffset dy="2" />
                                          <feGaussianBlur stdDeviation="1.5" />
                                          <feColorMatrix
                                            type="matrix"
                                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"
                                          />
                                          <feBlend
                                            mode="normal"
                                            in2="BackgroundImageFix"
                                            result="effect1_dropShadow_34_25"
                                          />
                                          <feBlend
                                            mode="normal"
                                            in="SourceGraphic"
                                            in2="effect1_dropShadow_34_25"
                                            result="shape"
                                          />
                                        </filter>
                                        <linearGradient
                                          id="paint0_linear_34_25"
                                          x1="19"
                                          y1="1"
                                          x2="19"
                                          y2="25"
                                          gradientUnits="userSpaceOnUse"
                                        >
                                          <stop
                                            stopColor="white"
                                            stopOpacity="0.7"
                                          />
                                          <stop offset="1" stopOpacity="0.3" />
                                        </linearGradient>
                                        <clipPath id="clip0_34_25">
                                          <rect
                                            x="3"
                                            y="1"
                                            width="32"
                                            height="24"
                                            rx="2"
                                            fill="white"
                                          />
                                        </clipPath>
                                      </defs>
                                    </svg>
                                  </span>
                                  <span className="font-medium text-gray-900">
                                    EN
                                  </span>
                                </RadioGroup.Description>
                                <span
                                  className={classNames(
                                    active ? "border" : "border-2",
                                    checked
                                      ? "border-blue-500"
                                      : "border-transparent",
                                    "pointer-events-none absolute -inset-px rounded-lg"
                                  )}
                                  aria-hidden="true"
                                />
                              </>
                            )}
                          </RadioGroup.Option>
                        ))}
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="flex gap-[15px] justify-end mt-8">
                    <div>
                      <button
                        onClick={() => setStep(1)}
                        className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#f5f7f9] text-[#1E2B3A] no-underline active:scale-95 scale-100 duration-75"
                        style={{
                          boxShadow: "0 1px 1px #0c192714, 0 1px 3px #0c192724",
                        }}
                      >
                        Previous step
                      </button>
                    </div>
                    <div>
                      <button
                        onClick={() => {
                          setStep(3);
                        }}
                        className="group rounded-full px-4 py-2 text-[13px] font-semibold transition-all flex items-center justify-center bg-[#1E2B3A] text-white hover:[linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), #0D2247] no-underline flex gap-x-2  active:scale-95 scale-100 duration-75"
                        style={{
                          boxShadow:
                            "0px 1px 4px rgba(13, 34, 71, 0.17), inset 0px 0px 0px 1px #061530, inset 0px 0px 0px 2px rgba(255, 255, 255, 0.1)",
                        }}
                      >
                        <span> Continue </span>
                        <svg
                          className="w-5 h-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M13.75 6.75L19.25 12L13.75 17.25"
                            stroke="#FFF"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M19 12H4.75"
                            stroke="#FFF"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <p>Step 3</p>
              )}
            </div>
          </div>
           
        </div>
      )}
    </AnimatePresence>
    </div>
  );
}
