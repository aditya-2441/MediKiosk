import os
import uuid
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load environment variables FIRST so os.getenv can see them
load_dotenv()

# Import your clinical engine tools
from clinical_engine import ClinicalState, evaluate_intake_step, generate_soap_note
from document_parser import parse_medical_document, DocumentExtractionResult

app = FastAPI(title="MediKiosk Clinical Gateway")

# Allow requests from Next.js dev server on both localhost and 127.0.0.1
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MONGODB SETUP ---
# Connects to MongoDB Atlas using the URI in your .env file
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
db_client = AsyncIOMotorClient(MONGO_URI)
db = db_client.medikiosk_db
encounters_collection = db.encounters

# --- REQUEST SCHEMAS ---
class IntakeMessageRequest(BaseModel):
    state: ClinicalState
    user_input: str

class IdentityInfo(BaseModel):
    type: str
    value: str

class FinalizeRequest(BaseModel):
    state: ClinicalState
    identity: IdentityInfo
    scanned_doc: Optional[dict] = None

# --- API ROUTES ---

@app.get("/")
def root():
    return {"status": "online", "system": "MediKiosk Gateway"}

@app.post("/api/intake/init")
def initialize_intake(mode: str = "ALLOPATHY", language: str = "en"):
    session_id = f"kiosk-{uuid.uuid4().hex[:8]}"
    
    # Set localized initial prompt and options based on the language toggle
    if language == "hi":
        initial_question = "नमस्ते, आज आप अस्पताल किस मुख्य समस्या के लिए आए हैं?"
        quick_replies = [
            "बुखार / सर्दी",
            "सीने में दर्द",
            "पेट दर्द",
            "जोड़ों का दर्द",
            "पाचन समस्या"
        ]
    else:
        initial_question = "What primary symptoms or health concerns brought you to the hospital today?"
        quick_replies = [
            "Fever / Cold",
            "Chest Pain",
            "Abdominal Pain",
            "Joint Pain",
            "Digestive Issues"
        ]
    
    initial_state = ClinicalState(
        session_id=session_id,
        mode=mode,
        language=language,
        step=1,
        next_question=initial_question,
        suggested_quick_replies=quick_replies
    )
    return initial_state

@app.post("/api/intake/message")
def process_intake_message(payload: IntakeMessageRequest):
    try:
        updated_state = evaluate_intake_step(payload.state, payload.user_input)
        return updated_state
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Clinical engine evaluation failed: {str(e)}"
        )

@app.post("/api/intake/scan-document", response_model=DocumentExtractionResult)
async def upload_and_parse_document(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a valid image file (JPEG, PNG, WebP)."
        )
    
    try:
        image_bytes = await file.read()
        extraction_result = await parse_medical_document(image_bytes, file.content_type)
        return extraction_result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Medical document parsing failed: {str(e)}"
        )

@app.post("/api/intake/finalize")
async def finalize_and_save_encounter(payload: FinalizeRequest):
    """Generates the SOAP note and saves the full record to MongoDB for the Dashboard."""
    try:
        # 1. Ask Groq to summarize the JSON state and scanned documents into a professional SOAP Note
        soap_note = generate_soap_note(payload.state, payload.scanned_doc)
        
        # 2. Build the final database document
        encounter_record = {
            "session_id": payload.state.session_id,
            "patient_identity": {
                "id_type": payload.identity.type,
                "id_value": payload.identity.value 
            },
            "timestamp": datetime.utcnow(),
            "department": payload.state.mode,
            "is_emergency": payload.state.is_emergency,
            "raw_clinical_data": payload.state.model_dump(),
            "scanned_document": payload.scanned_doc,
            "doctor_summary": soap_note,
            "status": "WAITING_FOR_DOCTOR"
        }
        
        # 3. Save asynchronously to MongoDB
        await encounters_collection.insert_one(encounter_record)
        
        return {"status": "success", "message": "Encounter saved to Dashboard"}
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to finalize encounter: {str(e)}"
        )

# --- NEW DASHBOARD ROUTE ---
@app.get("/api/encounters")
async def get_encounters():
    """Fetches all patient encounters for the Doctor's Dashboard."""
    try:
        # Fetch the latest 50 encounters, sorted by newest first
        cursor = encounters_collection.find().sort("timestamp", -1)
        encounters = await cursor.to_list(length=50)
        
        # MongoDB ObjectIds are not JSON serializable by default, so we convert them to strings
        for encounter in encounters:
            encounter["_id"] = str(encounter["_id"])
            
        return {"status": "success", "data": encounters}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch encounters: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)