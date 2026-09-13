"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import Image from "next/image"; // <-- Added Image import
import { 
  Activity, Clock, AlertCircle, CheckCircle, Search, 
  User, Stethoscope, FileText, Fingerprint, Camera, ShieldCheck 
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

export default function DoctorDashboard() {
  const [encounters, setEncounters] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchEncounters = async () => {
    try {
      const res = await axios.get("http://localhost:8000/api/encounters");
      setEncounters(res.data.data);
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch patients", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEncounters();
    const interval = setInterval(fetchEncounters, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-200 p-6 flex flex-col font-sans">
      
      {/* HEADER - Glassmorphism Navbar */}
      <header className="w-full flex items-center justify-between bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl mb-6">
        
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
            <h1 className="text-2xl font-bold text-white tracking-wide">MediKiosk Command Center</h1>
            <p className="text-sm text-blue-300 font-medium tracking-wider uppercase">Active OPD Queue</p>
          </div>
        </div>
        {/* NEW LOGO BLOCK END */}

        <div className="flex items-center gap-4 bg-slate-900/50 border border-slate-700/50 px-4 py-2 rounded-full">
          <Search className="text-slate-400 h-5 w-5" />
          <input 
            type="text" 
            placeholder="Search ABHA or ID..." 
            className="bg-transparent border-none outline-none text-slate-200 placeholder-slate-500"
          />
        </div>
      </header>

      {/* MAIN CONTENT GRID */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
        
        {/* LEFT PANEL: Patient Queue */}
        <div className="lg:col-span-1 bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="text-slate-400" /> Waiting Room
            </h2>
            <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
              {encounters.length} Patients
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
            {loading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/5 rounded-2xl"></div>)}
              </div>
            ) : encounters.length === 0 ? (
              <div className="text-center text-slate-500 mt-10">Queue is empty.</div>
            ) : (
              encounters.map((patient) => (
                <button 
                  key={patient._id}
                  onClick={() => setSelectedPatient(patient)}
                  className={`w-full text-left p-5 rounded-2xl transition-all duration-300 border ${
                    selectedPatient?._id === patient._id 
                      ? "bg-blue-500/20 border-blue-400/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]" 
                      : "bg-white/5 border-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-white text-lg flex items-center gap-2">
                      <User size={18} className="text-blue-400"/> {patient.department} OPD
                    </span>
                    <span className="text-xs font-medium text-slate-400">
                      {new Date(patient.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-300">
                    <Fingerprint size={14} className="text-emerald-400" />
                    <span className="font-mono tracking-wider">{patient.patient_identity.id_value || "Pending ID"}</span>
                  </div>
                  {patient.is_emergency && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20 w-max">
                      <AlertCircle size={14} /> Triage Alert
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Clinical Details */}
        <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl overflow-y-auto relative custom-scrollbar">
          {!selectedPatient ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
              <Stethoscope size={64} className="opacity-20" />
              <p className="text-xl font-medium">Select a patient from the queue to view clinical details.</p>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Patient Meta Header */}
              <div className="flex justify-between items-start mb-8 pb-8 border-b border-white/10">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                    Patient Token: {selectedPatient._id.slice(-6).toUpperCase()}
                    {selectedPatient.is_emergency && <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">EMERGENCY</span>}
                  </h2>
                  <div className="flex gap-4 text-sm font-medium">
                    <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20">
                      <ShieldCheck size={16}/> {selectedPatient.patient_identity.id_type}: {selectedPatient.patient_identity.id_value}
                    </span>
                    <span className="flex items-center gap-1.5 text-blue-400 bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/20">
                      <Activity size={16}/> {selectedPatient.department}
                    </span>
                  </div>
                </div>
                <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-900/20">
                  <CheckCircle size={20} /> Mark as Consulted
                </button>
              </div>

              {/* Red Flags / Emergency Banner */}
              {selectedPatient.raw_clinical_data.red_flags?.length > 0 && (
                <div className="mb-8 bg-red-500/10 border-2 border-red-500/30 rounded-2xl p-6">
                  <h3 className="text-red-400 font-bold text-lg mb-3 flex items-center gap-2">
                    <AlertCircle /> Critical Red Flags Identified
                  </h3>
                  <ul className="list-disc list-inside text-red-200 space-y-1">
                    {selectedPatient.raw_clinical_data.red_flags.map((flag: string, i: number) => (
                      <li key={i}>{flag}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* The AI Generated SOAP Note */}
              <div className="mb-8">
                <h3 className="text-xl font-bold text-slate-300 flex items-center gap-2 mb-4">
                  <FileText className="text-blue-400" /> Clinical SOAP Note
                </h3>
                <div className="bg-slate-900/60 border border-slate-700/50 rounded-3xl p-8 shadow-inner">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      h2: ({node, ...props}) => <h2 className="text-2xl font-extrabold text-blue-400 mt-8 mb-4 border-b border-slate-700/50 pb-2" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-xl font-bold text-slate-200 mt-6 mb-3" {...props} />,
                      p: ({node, ...props}) => <p className="text-slate-300 leading-relaxed mb-4" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-bold text-white tracking-wide" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 text-slate-300 space-y-2 mb-6 marker:text-blue-500" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 text-slate-300 space-y-2 mb-6 marker:text-blue-500" {...props} />,
                      li: ({node, ...props}) => <li className="pl-1" {...props} />,
                      table: ({node, ...props}) => (
                        <div className="overflow-x-auto mb-8 rounded-xl border border-slate-700/50 shadow-sm bg-slate-800/20">
                          <table className="w-full text-left border-collapse" {...props} />
                        </div>
                      ),
                      th: ({node, ...props}) => <th className="bg-slate-800/80 text-blue-300 font-bold p-4 border-b border-slate-700 uppercase tracking-wider text-sm" {...props} />,
                      td: ({node, ...props}) => <td className="p-4 border-b border-slate-700/50 text-slate-300 align-top" {...props} />,
                      hr: ({node, ...props}) => <hr className="border-slate-700/50 my-8" {...props} />
                    }}
                  >
                    {selectedPatient.doctor_summary}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Scanned Document Data (If Any) */}
              {selectedPatient.scanned_document && (
                <div>
                  <h3 className="text-xl font-bold text-slate-300 flex items-center gap-2 mb-4">
                    <Camera className="text-purple-400" /> Scanned Document Extraction
                  </h3>
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-6">
                    <p className="text-purple-200 font-bold mb-2">Type: {selectedPatient.scanned_document.document_type}</p>
                    <p className="text-slate-300 mb-4">{selectedPatient.scanned_document.summary}</p>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-bold text-purple-400 uppercase tracking-wider mb-2">Key Findings</h4>
                        <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
                          {selectedPatient.scanned_document.key_findings.map((finding: string, i: number) => <li key={i}>{finding}</li>)}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-purple-400 uppercase tracking-wider mb-2">Medications</h4>
                        <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
                          {selectedPatient.scanned_document.medications.map((med: string, i: number) => <li key={i}>{med}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}