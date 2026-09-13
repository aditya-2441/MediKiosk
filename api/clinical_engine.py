import os
import json
from typing import List, Optional
from pydantic import BaseModel, Field
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# Automatically detects GROQ_API_KEY from the environment
client = Groq()

class AyushParameters(BaseModel):
    prakriti_clues: List[str] = Field(default_factory=list, description="Vata/Pitta/Kapha physical & mental attributes")
    agni_status: Optional[str] = Field(None, description="Tikshnagni, Mandagni, Vishamagni, or Samagni")
    ahara_vihara: List[str] = Field(default_factory=list, description="Dietary habits, sleep cycle, lifestyle triggers")

class SocratesParameters(BaseModel):
    site: Optional[str] = Field(None, description="Where is the symptom located?")
    onset: Optional[str] = Field(None, description="When and how did it start?")
    character: Optional[str] = Field(None, description="How does it feel?")
    radiation: Optional[str] = Field(None, description="Does the pain spread anywhere?")
    associations: Optional[str] = Field(None, description="Any other associated symptoms?")
    time_course: Optional[str] = Field(None, description="Does it follow any pattern over time?")
    exacerbating_relieving: Optional[str] = Field(None, description="What makes it better or worse?")
    severity: Optional[str] = Field(None, description="How severe is it on a scale of 1-10?")
    medications_allergies: Optional[str] = Field(None, description="Any current medications or allergies?")

class ClinicalState(BaseModel):
    session_id: str
    language: str
    mode: str
    step: int
    chief_complaint: Optional[str] = Field(None)
    socrates: SocratesParameters = Field(default_factory=SocratesParameters)
    ayush: AyushParameters = Field(default_factory=AyushParameters)
    red_flags: List[str] = Field(default_factory=list)
    is_emergency: bool = Field(False)
    next_question: str = Field(description="The next conversational question to ask the patient based on clinical logic.")
    suggested_quick_replies: List[str] = Field(description="2 to 4 short, tap-able reply options for the touch UI.")

def evaluate_intake_step(current_state: ClinicalState, user_input: str) -> ClinicalState:
    schema_json = json.dumps(ClinicalState.model_json_schema())
    
    system_prompt = f"""
    You are MediKiosk's backend clinical intake state machine. Your role is history-taking only; do not provide medical advice or diagnoses.
    You must output valid JSON adhering strictly to this schema:
    {schema_json}
    Do not include markdown formatting, code blocks, or preamble. Return raw JSON only.
    """
    
    user_prompt = f"""
    Current Clinical State:
    {current_state.model_dump_json()}

    Latest Patient Input: "{user_input}"

    Instructions:
    1. Extract clinical facts from the patient's input and update any null fields in SocratesParameters or AyushParameters.
    2. Check for Red Flags (e.g., crushing chest pain radiating to left arm). If present, set is_emergency=True, add to red_flags, and immediately make next_question direct them to emergency triage.
    3. Enforce Strict Multi-Phase Progression & Pacing:
       - Phase 1: Core Symptoms. Ask one symptom question at a time.
       - Phase 2: Chat Termination. YOU MUST STOP ASKING QUESTIONS HERE. The UI will handle document uploads and identity verification on separate screens.
    4. Intake Termination:
       - Once the core symptoms are gathered, set next_question to a concise closing transition: "Thank you. Let's proceed to upload your medical documents."
       - Set suggested_quick_replies to exactly ["Proceed to Documents"] (Translate to "दस्तावेज़ अपलोड पर जाएं" if current_state.language is 'hi').
       - Otherwise, increment the 'step' value by 1 and formulate the next conversational question based on missing parameters.
    5. Language Enforcement:
       - You MUST generate the 'next_question' and all 'suggested_quick_replies' in the language specified by current_state.language.
       - If current_state.language is "hi", use simple, everyday conversational Hindi with uncomplicated vocabulary. Do not use overly complex or academic medical jargon.
    """
    
    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.1,
        response_format={"type": "json_object"}
    )
    
    raw_content = response.choices[0].message.content.strip()
    
    if raw_content.startswith("```"):
        lines = raw_content.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        raw_content = "\n".join(lines).strip()
    
    return ClinicalState.model_validate_json(raw_content)

def generate_soap_note(state: ClinicalState, scanned_doc: Optional[dict] = None) -> str:
    """Takes the final raw JSON state and formatted document data, merging them into a professional clinical SOAP note."""
    
    doc_info = f"\n\nExtracted Medical Document Data:\n{json.dumps(scanned_doc)}" if scanned_doc else "\n\nNo medical documents provided."
    
    prompt = f"""
    Convert the following raw patient data into a clean, professional medical SOAP note (Subjective, Objective, Assessment, Plan).
    Use strict markdown formatting. Make it highly scannable for a busy doctor's dashboard.
    
    Data: {state.model_dump_json()}
    {doc_info}
    """
    
    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": "You are an expert clinical medical scribe."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.1
    )
    return response.choices[0].message.content