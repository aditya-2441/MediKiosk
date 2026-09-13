"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image"; 
import { useRouter } from "next/navigation"; // <-- ADDED THIS IMPORT
import { 
  AlertTriangle, CheckCircle2, Activity, ArrowRight, RotateCcw, 
  Loader2, Mic, Volume2, Square, Camera, ShieldCheck, Fingerprint, Smartphone, Delete, FileText, LayoutDashboard // <-- ADDED LayoutDashboard
} from "lucide-react";
import axios from "axios";

const translations = {
  en: {
    selectLang: "Select Language", selectOpd: "Select OPD Consultation Type", selectOpdSub: "Touch a department to begin your clinical history",
    allopathy: "Allopathic Medicine", allopathySub: "General OPD", ayush: "Ayurvedic Medicine", ayushSub: "Ministry of Ayush",
    alertTitle: "CRITICAL TRIAGE ALERT", alertSub: "Emergency symptoms detected. Immediate notification sent to the OPD desk.",
    step: "Step", of: "of Intake", touchPrompt: "Touch an answer, or just speak:",
    listening: "Listening... (Will auto-send when you stop)", stopMic: "Stop & Send", processing: "Processing...", send: "Send", 
    docTitle: "Upload Documents", docSub: "Any prescriptions, reports, or bills?", scanDoc: "Open Camera / Upload", skipDoc: "Skip & Continue", uploading: "Scanning Document...",
    verifyTitle: "Identity Verification", verifySub: "Securely link your health records",
    hasAbha: "Do you have an ABHA ID?", yesAbha: "Yes, I have ABHA", noAbha: "No, create/verify using Aadhaar or Phone",
    enterAbha: "Enter your 14-digit ABHA Number", enterAadhaar: "Enter Aadhaar or Phone Number",
    enterOtp: "Enter 6-digit OTP sent to your mobile", verifyBtn: "Verify & Complete", clear: "Clear",
    successTitle: "Verification Successful", successSub: "Your digital token is generated. Generating dashboard summary..."
  },
  hi: {
    selectLang: "भाषा चुनें", selectOpd: "ओपीडी का प्रकार चुनें", selectOpdSub: "शुरू करने के लिए कृपया एक विभाग को छुएं",
    allopathy: "एलोपैथिक चिकित्सा (General)", allopathySub: "सामान्य ओपीडी", ayush: "आयुर्वेदिक चिकित्सा (Ayurveda)", ayushSub: "आयुष मंत्रालय",
    alertTitle: "गंभीर स्थिति अलर्ट (EMERGENCY)", alertSub: "गंभीर लक्षण पाए गए हैं। रिसेप्शन पर तुरंत सूचना भेज दी गई है।",
    step: "चरण", of: "पूरी प्रक्रिया", touchPrompt: "अपना उत्तर चुनें, या बोलकर बताएं:",
    listening: "सुन रहा हूँ... (रुकने पर अपने आप भेज दिया जाएगा)", stopMic: "रोकें और भेजें", processing: "प्रोसेस हो रहा है...", send: "भेजें", 
    docTitle: "दस्तावेज़ अपलोड करें", docSub: "कोई प्रिस्क्रिप्शन, रिपोर्ट या बिल?", scanDoc: "कैमरा खोलें / अपलोड करें", skipDoc: "छोड़ें और आगे बढ़ें", uploading: "दस्तावेज़ स्कैन हो रहा है...",
    verifyTitle: "पहचान सत्यापन", verifySub: "अपने स्वास्थ्य रिकॉर्ड को सुरक्षित रूप से लिंक करें",
    hasAbha: "क्या आपके पास ABHA ID है?", yesAbha: "हाँ, ABHA है", noAbha: "नहीं, आधार या फोन का उपयोग करें",
    enterAbha: "अपना 14-अंकीय ABHA नंबर दर्ज करें", enterAadhaar: "आधार या फोन नंबर दर्ज करें",
    enterOtp: "मोबाइल पर भेजा गया 6-अंकीय OTP दर्ज करें", verifyBtn: "सत्यापित करें और समाप्त करें", clear: "मिटाएं",
    successTitle: "सत्यापन सफल", successSub: "आपका डिजिटल टोकन जनरेट हो गया है। डैशबोर्ड समरी बनाई जा रही है..."
  }
};

interface ClinicalState {
  session_id: string; language: string; mode: string; step: number;
  chief_complaint: string | null; socrates: Record<string, string | null>; ayush: Record<string, any>;
  red_flags: string[]; is_emergency: boolean; next_question: string; suggested_quick_replies: string[];
}

type ScreenState = "LANGUAGE" | "OPD" | "INTAKE" | "DOCUMENTS" | "VERIFICATION" | "SUCCESS";
type VerifyStep = "SELECT" | "INPUT_ABHA" | "INPUT_OTHER" | "OTP";

export default function KioskPage() {
  const router = useRouter(); // <-- ADDED THIS HOOK
  const [screen, setScreen] = useState<ScreenState>("LANGUAGE");
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [state, setState] = useState<ClinicalState | null>(null);
  
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [scannedDocData, setScannedDocData] = useState<any>(null);
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const [verifyStep, setVerifyStep] = useState<VerifyStep>("SELECT");
  const [idNumber, setIdNumber] = useState("");
  const [otp, setOtp] = useState("");

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const silenceTimer = useRef<NodeJS.Timeout | null>(null); 

  const t = translations[lang];

  useEffect(() => {
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis;
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true; 
        recognitionRef.current.interimResults = true;
      }
    }
  }, []);

  useEffect(() => {
    if (state?.next_question && screen === "INTAKE" && synthRef.current) {
      synthRef.current.cancel();
      stopListening();
      setIsSpeaking(true);
      setInputVal("");

      const utterance = new SpeechSynthesisUtterance(state.next_question);
      utterance.lang = lang === "hi" ? "hi-IN" : "en-US";
      utterance.rate = 0.95; 
      
      utterance.onend = () => {
        setIsSpeaking(false);
        startListening(); 
      };

      synthRef.current.speak(utterance);
    }
  }, [state?.next_question, screen]);

  const startListening = () => {
    if (!recognitionRef.current || loading) return;
    
    recognitionRef.current.lang = lang === "hi" ? "hi-IN" : "en-US";
    setInputVal("");
    setIsListening(true);

    recognitionRef.current.onresult = (event: any) => {
      const fullTranscript = Array.from(event.results).map((result: any) => result[0].transcript).join("");
      setInputVal(fullTranscript);

      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => {
        stopListeningAndSend(fullTranscript);
      }, 2000); 
    };

    recognitionRef.current.onerror = () => stopListening();
    recognitionRef.current.onend = () => setIsListening(false);
    try { recognitionRef.current.start(); } catch (e) {}
  };

  const stopListening = () => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (recognitionRef.current) recognitionRef.current.abort();
    setIsListening(false);
  };

  const stopListeningAndSend = (textToSend?: string) => {
    stopListening();
    const finalMessage = typeof textToSend === 'string' ? textToSend : inputVal;
    if (finalMessage.trim()) handleSend(finalMessage);
  };

  const startSession = async (mode: "ALLOPATHY" | "AYUSH") => {
    setLoading(true); setScreen("INTAKE");
    try {
      const res = await axios.post(`/api/intake/init?mode=${mode}&language=${lang}`);
      setState(res.data);
    } catch (err) { setScreen("OPD"); } finally { setLoading(false); }
  };

  const handleSend = async (message: string) => {
    if (message === "Proceed to Documents" || message === "दस्तावेज़ अपलोड पर जाएं") {
      stopListening();
      if (synthRef.current) synthRef.current.cancel();
      setScreen("DOCUMENTS");
      return;
    }

    if (!state || !message.trim() || loading) return;
    
    if (synthRef.current) synthRef.current.cancel();
    stopListening();
    
    setLoading(true);
    try {
      const res = await axios.post("/api/intake/message", { state: state, user_input: message });
      setState(res.data);
      setInputVal("");
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleFileUploadToState = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !state) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post("/api/intake/scan-document", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setScannedDocData(res.data); // Store locally on the frontend
    } catch (err) {
      alert("Failed to scan document.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleNumpad = (num: string, type: "ID" | "OTP") => {
    if (num === "CLEAR") { type === "ID" ? setIdNumber("") : setOtp(""); return; }
    if (num === "BACK") { type === "ID" ? setIdNumber(prev => prev.slice(0, -1)) : setOtp(prev => prev.slice(0, -1)); return; }
    type === "ID" ? setIdNumber(prev => prev + num) : setOtp(prev => prev + num);
  };

  const finalizeVerification = async () => {
    setScreen("SUCCESS");
    try {
      await axios.post("/api/intake/finalize", {
        state: state,
        identity: { type: verifyStep === "INPUT_ABHA" ? "ABHA" : "AADHAAR_OR_PHONE", value: idNumber },
        scanned_doc: scannedDocData // Passes the stored Gemini vision response back to the server
      });
    } catch (error) { console.error("Database sync failed", error); }
  };

  const resetKiosk = () => {
    if (synthRef.current) synthRef.current.cancel();
    stopListening();
    setState(null);
    setInputVal("");
    setIdNumber("");
    setOtp("");
    setScannedDocData(null);
    setVerifyStep("SELECT");
    setScreen("LANGUAGE");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-between p-6 select-none">
      <header className="w-full max-w-5xl flex items-center justify-between border-b border-slate-800 pb-4">
        
        {/* NEW LOGO BLOCK START */}
        <div className="flex items-center gap-4">
          <div className="bg-white/10 p-2 rounded-xl border border-white/20 flex items-center justify-center shadow-inner relative overflow-hidden">
            <Image 
              src="/logo.png" 
              alt="MediKiosk Logo" 
              width={140} 
              height={140} 
              className="object-contain"
              priority 
            />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">MediKiosk</h1>
            <p className="text-sm text-slate-400">ABHA-Integrated Clinical Terminal</p>
          </div>
        </div>
        {/* NEW LOGO BLOCK END */}

        {/* HEADER ACTIONS */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/dashboard')} 
            className="flex items-center gap-2 text-sm font-bold text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-500/30 px-4 py-2 rounded-xl transition-colors border border-blue-500/20"
          >
            <LayoutDashboard size={18}/> Staff Dashboard
          </button>
          
          {screen !== "LANGUAGE" && screen !== "SUCCESS" && (
            <button 
              onClick={resetKiosk} 
              className="flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white bg-slate-800 px-4 py-2 rounded-xl transition-colors border border-slate-700"
            >
              <RotateCcw size={18}/> {lang === 'en' ? 'Restart' : 'रीसेट करें'}
            </button>
          )}
        </div>
      </header>

      <main className="w-full max-w-5xl flex-1 flex flex-col justify-center my-8">
        
        {screen === "LANGUAGE" && (
          <div className="text-center space-y-12">
            <h2 className="text-5xl font-extrabold text-white">Choose Language <br/><span className="text-4xl text-slate-400 mt-4 block">भाषा चुनें</span></h2>
            <div className="flex flex-col sm:flex-row gap-8 justify-center max-w-3xl mx-auto">
              <button onClick={() => { setLang("en"); setScreen("OPD"); }} className="flex-1 py-16 bg-blue-600 hover:bg-blue-500 rounded-3xl text-4xl font-bold shadow-2xl transition-all border-4 border-blue-400/30">English</button>
              <button onClick={() => { setLang("hi"); setScreen("OPD"); }} className="flex-1 py-16 bg-emerald-600 hover:bg-emerald-500 rounded-3xl text-4xl font-bold shadow-2xl transition-all border-4 border-emerald-400/30">हिंदी</button>
            </div>
          </div>
        )}

        {screen === "OPD" && (
          <div className="text-center space-y-10 animate-in fade-in zoom-in duration-300">
            <div className="space-y-4">
              <h2 className="text-5xl font-extrabold text-white">{t.selectOpd}</h2>
              <p className="text-2xl text-slate-400">{t.selectOpdSub}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6">
              <button onClick={() => startSession("ALLOPATHY")} disabled={loading} className="p-10 bg-blue-600 hover:bg-blue-500 rounded-3xl shadow-2xl transition-all text-left flex flex-col justify-between h-72 border-4 border-blue-400/30">
                <span className="text-xl font-bold tracking-wider uppercase text-blue-200">{t.allopathySub}</span>
                <span className="text-5xl font-extrabold text-white leading-tight">{t.allopathy}</span>
              </button>
              <button onClick={() => startSession("AYUSH")} disabled={loading} className="p-10 bg-emerald-700 hover:bg-emerald-600 rounded-3xl shadow-2xl transition-all text-left flex flex-col justify-between h-72 border-4 border-emerald-400/30">
                <span className="text-xl font-bold tracking-wider uppercase text-emerald-200">{t.ayushSub}</span>
                <span className="text-5xl font-extrabold text-white leading-tight">{t.ayush}</span>
              </button>
            </div>
          </div>
        )}

        {screen === "INTAKE" && state && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {state.is_emergency && (
              <div className="bg-red-600/30 border-4 border-red-500 rounded-2xl p-8 flex items-start gap-6 animate-pulse">
                <AlertTriangle className="h-12 w-12 text-red-400 shrink-0"/>
                <div>
                  <h3 className="text-3xl font-extrabold text-red-200">{t.alertTitle}</h3>
                  <p className="text-xl text-red-100 mt-2">{t.alertSub}</p>
                </div>
              </div>
            )}

            <div className={`border-2 rounded-3xl p-10 shadow-2xl bg-slate-800 border-slate-700 relative overflow-hidden`}>
              {isSpeaking && <div className="absolute top-8 right-8 flex items-center gap-2 text-blue-400 bg-blue-400/10 px-4 py-2 rounded-full animate-pulse"><Volume2 size={24}/></div>}
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-wider text-blue-400">
                  {t.step} {state.step} {t.of}
                </span>
              </div>

              <div className="flex items-start gap-6 mt-6">
                <p className="text-4xl font-semibold text-white leading-normal">{state.next_question}</p>
              </div>
            </div>

            {(state.suggested_quick_replies?.length ?? 0) > 0 && (
              <div className="space-y-4">
                <p className="text-lg text-slate-400 font-bold">{t.touchPrompt}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {state.suggested_quick_replies.map((reply, idx) => (
                    <button key={idx} disabled={loading || isSpeaking} onClick={() => handleSend(reply)} className="p-6 bg-slate-800 hover:bg-slate-700 active:bg-blue-600 disabled:opacity-50 border-2 border-slate-700 rounded-2xl text-left font-bold text-2xl text-slate-100 transition-colors flex items-center justify-between">
                      <span>{reply}</span>
                      <ArrowRight className="text-slate-400" size={28}/>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 flex flex-col items-center">
              <div className="w-full flex items-center justify-center min-h-[80px]">
                {loading ? (
                  <div className="flex items-center gap-3 text-slate-400 text-xl font-bold">
                    <Loader2 className="animate-spin h-8 w-8"/> {t.processing}
                  </div>
                ) : isListening ? (
                  <div className="flex items-center gap-6 w-full max-w-2xl bg-emerald-400/10 p-2 rounded-full border border-emerald-400/20">
                    <div className="flex items-center gap-4 text-emerald-400 text-xl font-bold pl-6 flex-1">
                      <div className="relative flex h-5 w-5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-5 w-5 bg-emerald-500"></span>
                      </div>
                      {t.listening}
                    </div>
                    <button onClick={() => stopListeningAndSend()} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-4 rounded-full font-bold transition-all shadow-lg">
                      <Square fill="currentColor" size={20}/> {t.stopMic}
                    </button>
                  </div>
                ) : !isSpeaking && (
                  <button onClick={startListening} className="flex items-center gap-3 text-slate-400 text-xl font-bold hover:text-white bg-slate-800 px-6 py-4 rounded-full border border-slate-700 transition-colors">
                    <Mic size={24}/> Tap to speak manually
                  </button>
                )}
              </div>

              <div className="w-full flex gap-4 mt-6 opacity-50 focus-within:opacity-100 transition-opacity">
                <input
                  type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleSend(inputVal); }}
                  placeholder="..." disabled={loading || isSpeaking || isListening}
                  className="flex-1 bg-slate-800 border-2 border-slate-700 rounded-2xl px-6 py-4 text-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                />
                <button onClick={() => handleSend(inputVal)} disabled={loading || !inputVal.trim() || isListening} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xl px-8 py-4 rounded-2xl transition-all">
                  {t.send}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 3.5: Dedicated Document Upload Screen */}
        {screen === "DOCUMENTS" && (
          <div className="max-w-3xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
            <FileText className="w-20 h-20 text-blue-500 mx-auto mb-6"/>
            <h2 className="text-4xl font-extrabold text-white mb-4">{t.docTitle}</h2>
            <p className="text-xl text-slate-400 mb-10">{t.docSub}</p>

            <div className="flex flex-col gap-6 items-center">
              <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleFileUploadToState} />
              
              <button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={isUploading || scannedDocData !== null} 
                className="w-full p-10 bg-slate-800 hover:bg-slate-700 rounded-3xl border-2 border-slate-700 flex items-center justify-center gap-4 transition-all disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="animate-spin w-10 h-10 text-blue-400"/> : <Camera className="w-12 h-12 text-blue-400"/>}
                <span className="text-3xl font-bold text-white">{isUploading ? t.uploading : t.scanDoc}</span>
              </button>

              {scannedDocData && (
                <div className="w-full p-6 bg-emerald-500/20 border-2 border-emerald-500/50 rounded-2xl flex items-center justify-center gap-4 text-emerald-400 animate-in zoom-in duration-300">
                  <CheckCircle2 className="w-10 h-10"/>
                  <span className="text-2xl font-bold">Document Processed Successfully</span>
                </div>
              )}

              <button 
                onClick={() => setScreen("VERIFICATION")} 
                className={`mt-8 px-12 py-5 font-bold rounded-full text-2xl transition-colors ${
                  scannedDocData 
                    ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg border-2 border-blue-400/30" 
                    : "bg-transparent border-2 border-slate-600 hover:bg-slate-800 text-slate-300"
                }`}
              >
                {scannedDocData ? "Proceed to Next Step" : t.skipDoc}
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 4: Numpad Identity Verification */}
        {screen === "VERIFICATION" && (
          <div className="max-w-3xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-4 mb-10">
              <ShieldCheck className="w-20 h-20 text-blue-500 mx-auto"/>
              <h2 className="text-4xl font-extrabold text-white">{t.verifyTitle}</h2>
              <p className="text-xl text-slate-400">{t.verifySub}</p>
            </div>

            {verifyStep === "SELECT" && (
              <div className="space-y-6">
                <p className="text-2xl font-bold text-center mb-8">{t.hasAbha}</p>
                <button onClick={() => setVerifyStep("INPUT_ABHA")} className="w-full p-8 bg-slate-800 hover:bg-slate-700 rounded-3xl border-2 border-slate-700 flex items-center gap-6 transition-all text-left group">
                  <div className="bg-blue-500/20 p-4 rounded-full text-blue-400 group-hover:bg-blue-500/30"><Fingerprint size={32}/></div>
                  <span className="text-3xl font-bold text-white">{t.yesAbha}</span>
                </button>
                <button onClick={() => setVerifyStep("INPUT_OTHER")} className="w-full p-8 bg-slate-800 hover:bg-slate-700 rounded-3xl border-2 border-slate-700 flex items-center gap-6 transition-all text-left group">
                  <div className="bg-emerald-500/20 p-4 rounded-full text-emerald-400 group-hover:bg-emerald-500/30"><Smartphone size={32}/></div>
                  <span className="text-3xl font-bold text-white">{t.noAbha}</span>
                </button>
              </div>
            )}

            {(verifyStep === "INPUT_ABHA" || verifyStep === "INPUT_OTHER" || verifyStep === "OTP") && (
              <div className="bg-slate-800 p-8 rounded-3xl border-2 border-slate-700 shadow-2xl">
                <p className="text-xl font-bold text-slate-300 text-center mb-6">
                  {verifyStep === "INPUT_ABHA" ? t.enterAbha : verifyStep === "INPUT_OTHER" ? t.enterAadhaar : t.enterOtp}
                </p>
                
                <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl p-6 text-center text-4xl font-mono tracking-[0.25em] text-white mb-8 h-24 flex items-center justify-center">
                  {verifyStep === "OTP" ? (otp || "____") : (idNumber || "____")}
                </div>

                <div className="grid grid-cols-3 gap-4 mb-8">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <button key={num} onClick={() => handleNumpad(num.toString(), verifyStep === "OTP" ? "OTP" : "ID")} className="bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-2xl py-6 text-3xl font-bold transition-colors">
                      {num}
                    </button>
                  ))}
                  <button onClick={() => handleNumpad("CLEAR", verifyStep === "OTP" ? "OTP" : "ID")} className="bg-slate-800 border-2 border-slate-700 hover:bg-red-500/20 hover:text-red-400 rounded-2xl py-6 text-xl font-bold transition-colors">
                    {t.clear}
                  </button>
                  <button onClick={() => handleNumpad("0", verifyStep === "OTP" ? "OTP" : "ID")} className="bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-2xl py-6 text-3xl font-bold transition-colors">
                    0
                  </button>
                  <button onClick={() => handleNumpad("BACK", verifyStep === "OTP" ? "OTP" : "ID")} className="bg-slate-800 border-2 border-slate-700 hover:bg-slate-700 rounded-2xl py-6 flex items-center justify-center text-slate-300 transition-colors">
                    <Delete size={32}/>
                  </button>
                </div>

                <button 
                  onClick={() => verifyStep === "OTP" ? finalizeVerification() : setVerifyStep("OTP")}
                  disabled={verifyStep === "OTP" ? otp.length < 4 : idNumber.length < 10}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-700 text-white font-extrabold text-2xl py-6 rounded-2xl transition-colors shadow-lg"
                >
                  {verifyStep === "OTP" ? t.verifyBtn : "Get OTP"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* SCREEN 5: Success & DB Sync */}
        {screen === "SUCCESS" && (
          <div className="text-center space-y-6 animate-in zoom-in duration-500 flex flex-col items-center justify-center h-[60vh]">
            <div className="bg-emerald-500/20 p-8 rounded-full border-[6px] border-emerald-500 shadow-[0_0_60px_rgba(16,185,129,0.3)]">
              <CheckCircle2 className="w-32 h-32 text-emerald-400"/>
            </div>
            <h2 className="text-5xl font-extrabold text-white mt-8">{t.successTitle}</h2>
            <p className="text-2xl text-slate-400">{t.successSub}</p>
            <div className="mt-10 flex gap-4 text-emerald-400 bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-xl">
              <Loader2 className="animate-spin w-8 h-8"/>
              <span className="text-xl font-bold">Syncing with Dashboard & Database...</span>
            </div>
            <button onClick={resetKiosk} className="mt-12 text-slate-400 underline decoration-slate-600 hover:text-white transition-colors">Start New Patient Session</button>
          </div>
        )}
      </main>
    </div>
  );
}